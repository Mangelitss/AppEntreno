// ---------------------------------------------------------------------------
// Sincronizacion con Firestore.
//
// La base local manda: la app lee y escribe siempre en Dexie, y esto va por
// detras subiendo y bajando cambios. Asi el gimnasio sin cobertura sigue
// funcionando igual y la sincronizacion es un anadido, no una dependencia.
//
// Como cada usuario solo edita sus propios datos, no hay conflictos de verdad
// que resolver: gana la escritura mas reciente comparando `updatedAt`. Los
// borrados son logicos (`deletedAt`) justamente para que tambien viajen; si se
// borrara la fila, al sincronizar volveria a aparecer.
// ---------------------------------------------------------------------------

import { db, getSyncState, saveSyncState } from './db'
import { cloudErrorEs, getFirestore } from './firebase'
import type { Exercise, Syncable } from './types'

/** Tablas que viajan a la nube, con el nombre que tienen alli. */
const COLLECTIONS = [
  'exercises', 'routines', 'routineItems', 'schedule', 'workouts',
  'workoutExercises', 'sets', 'body', 'progression', 'profile'
] as const

type CollectionName = (typeof COLLECTIONS)[number]

/** Firestore admite 500 operaciones por lote. */
const BATCH_LIMIT = 450

export interface SyncReport {
  ok: boolean
  pushed: number
  pulled: number
  error?: string
  /** true si se limpio la base porque entro otra persona en este dispositivo */
  reset?: boolean
}

/**
 * Del catalogo solo sube lo que es tuyo.
 *
 * Los 1.324 ejercicios del dataset son identicos para todos y cada movil se
 * los descarga del JSON. Subirlos multiplicaria por nada el numero de
 * documentos, asi que solo viajan los que creaste tu y los que hayas tocado.
 */
function isWorthSyncing(exercise: Exercise): boolean {
  return exercise.isCustom === 1
    || (exercise.editedFields?.length ?? 0) > 0
    || exercise.favorite === 1
    || exercise.archived === 1
    || exercise.incrementKg !== null
    || (exercise.props?.length ?? 0) > 0
    || Boolean(exercise.imageData || exercise.gifData)
    || Boolean(exercise.alias)
}

/** Quita lo que Firestore no admite: `undefined` no es un valor valido. */
function clean<T extends object>(row: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined)
  )
}

// ---------------------------------------------------------------------------
// Imagenes
//
// No se sincronizan. Firebase Storage exige plan de pago, y meterlas en el
// propio documento chocaria con el limite de 1 MiB de Firestore y se pagaria
// en cada lectura. Asi que las fotos que subes se quedan en el dispositivo.
//
// Lo importante es que al bajar un documento no borren las que tengas aqui:
// por eso se quitan al subir y se ignoran al recibir, en vez de viajar vacias.
// ---------------------------------------------------------------------------

/** Campos con foto de cada tabla, los unicos que se quedan en casa. */
const LOCAL_ONLY: Partial<Record<CollectionName, string[]>> = {
  exercises: ['imageData', 'gifData'],
  routines: ['imageData'],
  profile: ['avatarUrl']
}

/** Quita las fotos de una fila antes de enviarla. */
function withoutImages(table: CollectionName, row: Record<string, unknown>): Record<string, unknown> {
  const fields = LOCAL_ONLY[table]
  if (!fields) return row

  const copy = { ...row }
  for (const field of fields) delete copy[field]
  return copy
}

/** Conserva las fotos locales al aplicar lo que llega del servidor. */
function keepingImages<T extends object>(
  table: CollectionName,
  remote: T,
  local: T | undefined
): T {
  const fields = LOCAL_ONLY[table]
  if (!fields || !local) return remote

  const merged = { ...remote } as Record<string, unknown>
  for (const field of fields) {
    const mine = (local as Record<string, unknown>)[field]
    if (mine !== undefined && mine !== null) merged[field] = mine
  }
  return merged as T
}

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

async function push(uid: string, since: number): Promise<{ count: number; highest: number }> {
  const firestore = await getFirestore()
  if (!firestore) return { count: 0, highest: since }

  const { collection, doc, writeBatch } = await import('firebase/firestore')

  let count = 0
  let highest = since

  for (const name of COLLECTIONS) {
    const rows = (await db.table(name).toArray() as Syncable[])
      .filter(row => row.updatedAt > since)
      .filter(row => name !== 'exercises' || isWorthSyncing(row as unknown as Exercise))

    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      const chunk = rows.slice(i, i + BATCH_LIMIT)
      const batch = writeBatch(firestore)

      for (const row of chunk) {
        const prepared = withoutImages(name, clean(row))
        batch.set(doc(collection(firestore, 'users', uid, name), String(row.id)), prepared)
        highest = Math.max(highest, row.updatedAt)
      }

      await batch.commit()
      count += chunk.length
    }
  }

  return { count, highest }
}

// ---------------------------------------------------------------------------
// Bajada
// ---------------------------------------------------------------------------

async function pull(uid: string, since: number): Promise<{ count: number; highest: number }> {
  const firestore = await getFirestore()
  if (!firestore) return { count: 0, highest: since }

  const { collection, getDocs, query, where } = await import('firebase/firestore')

  let count = 0
  let highest = since

  for (const name of COLLECTIONS) {
    const snapshot = await getDocs(query(
      collection(firestore, 'users', uid, name),
      where('updatedAt', '>', since)
    ))

    const incoming: Syncable[] = []

    for (const document of snapshot.docs) {
      const remote = document.data() as Syncable
      highest = Math.max(highest, remote.updatedAt ?? 0)

      // Gana lo mas reciente. Si lo de aqui es mas nuevo, se queda y ya se
      // subira en el siguiente empujon.
      const local = await db.table(name).get(document.id) as Syncable | undefined
      if (local && local.updatedAt >= remote.updatedAt) continue

      incoming.push(keepingImages(name, { ...remote, id: document.id }, local))
    }

    if (incoming.length > 0) {
      await db.table(name).bulkPut(incoming)
      count += incoming.length
    }
  }

  return { count, highest }
}

// ---------------------------------------------------------------------------
// Sincronizacion completa
// ---------------------------------------------------------------------------

let running: Promise<SyncReport> | null = null

/**
 * Sube lo pendiente y baja lo que falte.
 *
 * Se sube antes de bajar a proposito: si acabas de registrarte, tu historial
 * local sale en la primera pasada porque `lastPushedAt` empieza en cero.
 */
export async function sync(uid: string): Promise<SyncReport> {
  // Dos llamadas a la vez (al entrar y al terminar un entreno, por ejemplo)
  // subirian lo mismo dos veces. Se comparte la que ya este en marcha.
  if (running) return running

  running = (async (): Promise<SyncReport> => {
    try {
      const state = await getSyncState()

      // Otra persona en el mismo dispositivo: sus datos no pueden mezclarse.
      if (state.ownerUid && state.ownerUid !== uid) {
        await wipeLocalData()
        await saveSyncState({ ownerUid: uid, lastPushedAt: 0, lastPulledAt: 0 })
        const fresh = await pull(uid, 0)
        await saveSyncState({ lastPulledAt: fresh.highest, lastSyncAt: Date.now(), lastError: null })
        return { ok: true, pushed: 0, pulled: fresh.count, reset: true }
      }

      const pushed = await push(uid, state.lastPushedAt)
      await saveSyncState({ ownerUid: uid, lastPushedAt: pushed.highest })

      const pulled = await pull(uid, state.lastPulledAt)
      await saveSyncState({
        lastPulledAt: pulled.highest,
        lastSyncAt: Date.now(),
        lastError: null
      })

      return { ok: true, pushed: pushed.count, pulled: pulled.count }
    } catch (error) {
      // El mensaje de pantalla es corto a proposito; el detalle completo va a
      // la consola del navegador, que es donde se puede investigar de verdad.
      console.error('[sync] fallo al sincronizar', error)

      const raw = error instanceof Error
        ? `${(error as { code?: string }).code ?? ''} ${error.message}`.trim()
        : String(error)
      const message = cloudErrorEs(raw)
      await saveSyncState({ lastError: message })
      return { ok: false, pushed: 0, pulled: 0, error: message }
    } finally {
      running = null
    }
  })()

  return running
}

/** Borra los datos del usuario anterior, dejando el catalogo descargado. */
async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', COLLECTIONS.map(name => db.table(name)), async () => {
    for (const name of COLLECTIONS) {
      if (name === 'exercises') {
        // Del catalogo solo se va lo que era del otro usuario.
        const mine = (await db.exercises.toArray()).filter(isWorthSyncing)
        await db.exercises.bulkDelete(mine.map(e => e.id))
        continue
      }
      await db.table(name).clear()
    }
  })
}

/** Cuantos cambios locales estan esperando a subir. */
export async function pendingCount(): Promise<number> {
  const state = await getSyncState()
  let total = 0

  for (const name of COLLECTIONS) {
    const rows = (await db.table(name).toArray() as Syncable[])
      .filter(row => row.updatedAt > state.lastPushedAt)
      .filter(row => name !== 'exercises' || isWorthSyncing(row as unknown as Exercise))
    total += rows.length
  }

  return total
}

export { isWorthSyncing, COLLECTIONS }
