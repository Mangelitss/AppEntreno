// ---------------------------------------------------------------------------
// Social: lo que habla con Firestore.
//
// Nadie lee los entrenos crudos de nadie. Cada uno publica un resumen de lo
// suyo y sus amigos leen solo eso; quien puede leer que lo deciden las reglas
// de firestore.rules, y aqui solo se escribe lo propio:
//
//   profiles/{uid}           nombre, enlace de la foto y codigo de amigo
//   friendCodes/{codigo}     de quien es cada codigo
//   friendships/{a}_{b}      la solicitud de a para b, pendiente o aceptada
//   users/{uid}/posts/{id}   un post por entreno terminado, con el id del entreno
//   publicStats/{uid}        rangos y actividad, ya calculados
//
// La publicacion va detras del sync y funciona igual que el: mira que ha
// cambiado en la base local desde la ultima vez y solo sube eso. Si falla, no
// toca el estado del sync; guarda su propio error para ensenarlo en Social.
// ---------------------------------------------------------------------------

import type { Firestore } from 'firebase/firestore'
import { db, getProfile, getSocialState, saveSocialState } from './db'
import { cloudErrorEs, getFirestore } from './firebase'
import { dateKey } from './repo'
import { buildWeekMuscleData } from './rank-data'
import { computeMuscleRanks, weekKeyOf } from '../lib/ranks'
import { computeStreak } from '../lib/streak'
import {
  buildPost, friendshipId, generateFriendCode, hashOf, isLink, readFriendship, readPost,
  readProfile, readPublicStats, toPublicStats,
  type Friendship, type Post, type PublicProfile, type PublicStats
} from '../lib/social'

/** Firestore admite 500 operaciones por lote. */
const BATCH_LIMIT = 450

/** Posts que se piden de cada amigo en cada pagina del feed. */
export const FEED_PAGE = 10

async function cloud(): Promise<Firestore> {
  const firestore = await getFirestore()
  if (!firestore) throw new Error('La nube no esta configurada')
  return firestore
}

function errorCode(error: unknown): string {
  return error instanceof Error ? (error as { code?: string }).code ?? '' : ''
}

/** true cuando las reglas no dejan leer algo: casi siempre, que ya no sois amigos. */
export function isPermissionDenied(error: unknown): boolean {
  return errorCode(error) === 'permission-denied'
}

/** Cualquier fallo de Firestore, traducido a algo que se entienda en pantalla. */
export function socialErrorEs(error: unknown): string {
  const raw = error instanceof Error
    ? `${errorCode(error)} ${error.message}`.trim()
    : String(error)
  return cloudErrorEs(raw)
}

// ---------------------------------------------------------------------------
// Publicar lo tuyo
// ---------------------------------------------------------------------------

let publishing: Promise<void> | null = null

/**
 * Publica tu perfil, los posts de los entrenos que hayan cambiado y tus rangos.
 *
 * Lo llama el sync al terminar cada pasada. `fallbackName` es el nombre de la
 * cuenta, para quien aun no ha puesto uno en su perfil.
 */
export function publishSocial(uid: string, fallbackName: string | null): Promise<void> {
  // Dos pasadas a la vez subirian lo mismo dos veces: se comparte la que haya.
  if (publishing) return publishing

  publishing = (async () => {
    try {
      const firestore = await getFirestore()
      if (!firestore) return

      const { since } = await publishProfile(firestore, uid, fallbackName)
      await publishPosts(firestore, uid, since)
      await publishStats(firestore, uid)
      await saveSocialState(uid, { lastError: null, lastPublishedAt: Date.now() })
    } catch (error) {
      console.error('[social] fallo al publicar', error)
      await saveSocialState(uid, { lastError: socialErrorEs(error) })
    } finally {
      publishing = null
    }
  })()

  return publishing
}

/**
 * Tu perfil publico. La primera vez reserva tu codigo de amigo y fija desde
 * cuando se publican tus entrenos: lo anterior a ese momento no sale.
 */
async function publishProfile(
  firestore: Firestore,
  uid: string,
  fallbackName: string | null
): Promise<{ friendCode: string; since: number }> {
  const { doc, getDoc, setDoc } = await import('firebase/firestore')
  const state = await getSocialState(uid)
  const ref = doc(firestore, 'profiles', uid)

  let { friendCode, since } = state
  if (!friendCode || !since) {
    // Primera vez en este dispositivo: el codigo y la fecha pueden venir de
    // otro movil con la misma cuenta, asi que se mira antes de inventar nada.
    const snapshot = await getDoc(ref)
    const remote = snapshot.exists() ? readProfile(uid, snapshot.data()) : null
    friendCode = remote?.friendCode ?? await claimFriendCode(firestore, uid)
    since = remote?.socialSince ?? Date.now()
    await saveSocialState(uid, { friendCode, since })
  }

  const local = await getProfile()
  const profile = {
    uid,
    displayName: (local.displayName ?? fallbackName)?.trim().slice(0, 60) || null,
    // Solo un enlace. Una foto subida es una data URL y se queda en el movil.
    avatarUrl: isLink(local.avatarUrl) ? local.avatarUrl : null,
    friendCode,
    socialSince: since
  }

  const hash = hashOf(profile)
  if (hash !== state.profileHash) {
    await setDoc(ref, { ...profile, updatedAt: Date.now() })
    await saveSocialState(uid, { profileHash: hash })
  }

  return { friendCode, since }
}

/**
 * Reserva un codigo libre. La transaccion es la que evita que dos personas se
 * queden con el mismo: si al ir a crearlo ya existe, se prueba con otro.
 */
async function claimFriendCode(firestore: Firestore, uid: string): Promise<string> {
  const { doc, runTransaction } = await import('firebase/firestore')

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateFriendCode()
    const ref = doc(firestore, 'friendCodes', code)
    const claimed = await runTransaction(firestore, async tx => {
      if ((await tx.get(ref)).exists()) return false
      tx.set(ref, { uid, createdAt: Date.now() })
      return true
    })
    if (claimed) return code
  }

  throw new Error('No se pudo generar un codigo de amigo libre')
}

export interface PostChange {
  id: string
  /** null = borrar el post */
  post: Post | null
}

/**
 * Que posts hay que escribir o borrar por lo que ha cambiado desde `from`.
 *
 * Un entreno cambia si cambia el, alguno de sus ejercicios o alguna serie, asi
 * que se miran las tres tablas. Los que siguen en curso no se tocan: se
 * publicaran al terminarlos, que es cuando cambia el propio entreno. Y lo
 * terminado antes de `since` no sale nunca.
 */
export async function collectPostChanges(
  from: number,
  since: number
): Promise<{ changes: PostChange[]; highest: number }> {
  const [workouts, links, sets] = await Promise.all([
    db.workouts.where('updatedAt').above(from).toArray(),
    db.workoutExercises.where('updatedAt').above(from).toArray(),
    db.sets.where('updatedAt').above(from).toArray()
  ])

  let highest = from
  const touched = new Set<string>()
  for (const row of workouts) { touched.add(row.id); highest = Math.max(highest, row.updatedAt) }
  for (const row of links) { touched.add(row.workoutId); highest = Math.max(highest, row.updatedAt) }
  for (const row of sets) { touched.add(row.workoutId); highest = Math.max(highest, row.updatedAt) }
  if (touched.size === 0) return { changes: [], highest }

  const exercises = new Map((await db.exercises.toArray()).map(e => [e.id, e]))
  const changes: PostChange[] = []

  for (const id of touched) {
    const workout = await db.workouts.get(id)
    // Sin fila (descartado o historial borrado de golpe) o en curso: nada que hacer.
    if (!workout?.finishedAt || workout.finishedAt < since) continue

    if (workout.deletedAt) {
      changes.push({ id, post: null })
      continue
    }

    const [workoutLinks, workoutSets] = await Promise.all([
      db.workoutExercises.where('workoutId').equals(id).toArray(),
      db.sets.where('workoutId').equals(id).toArray()
    ])
    changes.push({ id, post: buildPost(workout, workoutLinks, workoutSets, exercises) })
  }

  return { changes, highest }
}

async function publishPosts(firestore: Firestore, uid: string, since: number): Promise<void> {
  const state = await getSocialState(uid)
  const { changes, highest } = await collectPostChanges(state.postsAt, since)

  if (changes.length > 0) {
    const { collection, doc, writeBatch } = await import('firebase/firestore')
    const posts = collection(firestore, 'users', uid, 'posts')

    for (let i = 0; i < changes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(firestore)
      for (const change of changes.slice(i, i + BATCH_LIMIT)) {
        const ref = doc(posts, change.id)
        if (change.post) batch.set(ref, change.post); else batch.delete(ref)
      }
      await batch.commit()
    }
  }

  if (highest !== state.postsAt) await saveSocialState(uid, { postsAt: highest })
}

/**
 * Tus rangos y tu actividad, si algo del historial ha cambiado desde la ultima
 * vez. Devuelve null si no hay que recalcular nada.
 */
export async function collectStats(
  from: number,
  rows: number | null,
  previousHash: string | null
): Promise<{ stats: PublicStats; hash: string; highest: number; rows: number } | null> {
  const [workouts, sets, exercises, count] = await Promise.all([
    db.workouts.where('updatedAt').above(from).toArray(),
    db.sets.where('updatedAt').above(from).toArray(),
    db.exercises.where('updatedAt').above(from).toArray(),
    db.workouts.count()
  ])

  let highest = from
  for (const row of [...workouts, ...sets, ...exercises]) highest = Math.max(highest, row.updatedAt)

  // "Borrar historial" vacia las tablas sin dejar filas con fecha: por eso
  // tambien se compara cuantos entrenos hay.
  if (previousHash && highest === from && count === rows) return null

  const today = new Date()
  const week = weekKeyOf(today)
  const ranks = computeMuscleRanks(await buildWeekMuscleData(), week)
  const finished = (await db.workouts.toArray()).filter(w => !w.deletedAt && w.finishedAt)
  const streak = computeStreak(finished.map(w => w.dateKey), dateKey(today))

  const stats = toPublicStats(ranks, week, finished.length, streak)
  return { stats, hash: hashOf(stats), highest, rows: count }
}

async function publishStats(firestore: Firestore, uid: string): Promise<void> {
  const state = await getSocialState(uid)
  const result = await collectStats(state.statsAt, state.statsRows, state.statsHash)
  if (!result) return

  if (result.hash !== state.statsHash) {
    const { doc, setDoc } = await import('firebase/firestore')
    await setDoc(doc(firestore, 'publicStats', uid), { ...result.stats, updatedAt: Date.now() })
  }
  await saveSocialState(uid, { statsAt: result.highest, statsRows: result.rows, statsHash: result.hash })
}

// ---------------------------------------------------------------------------
// Perfiles y codigos
// ---------------------------------------------------------------------------

export async function fetchProfile(uid: string): Promise<PublicProfile | null> {
  const firestore = await cloud()
  const { doc, getDoc } = await import('firebase/firestore')
  const snapshot = await getDoc(doc(firestore, 'profiles', uid))
  return snapshot.exists() ? readProfile(uid, snapshot.data()) : null
}

/** De un codigo a la persona que hay detras, o null si no es de nadie. */
export async function findByCode(code: string): Promise<PublicProfile | null> {
  const firestore = await cloud()
  const { doc, getDoc } = await import('firebase/firestore')
  const owner = await getDoc(doc(firestore, 'friendCodes', code))
  if (!owner.exists()) return null

  const uid = owner.data().uid
  if (typeof uid !== 'string' || !uid) return null
  return (await fetchProfile(uid)) ?? readProfile(uid, { friendCode: code })
}

// ---------------------------------------------------------------------------
// Amistades
// ---------------------------------------------------------------------------

export async function sendFriendRequest(me: string, other: string): Promise<void> {
  const firestore = await cloud()
  const { doc, setDoc } = await import('firebase/firestore')
  await setDoc(doc(firestore, 'friendships', friendshipId(me, other)), {
    requesterId: me,
    addresseeId: other,
    status: 'pendiente',
    createdAt: Date.now(),
    acceptedAt: null
  })
}

export async function acceptFriendRequest(friendship: Friendship): Promise<void> {
  const firestore = await cloud()
  const { doc, updateDoc } = await import('firebase/firestore')
  await updateDoc(doc(firestore, 'friendships', friendship.id), {
    status: 'aceptada',
    acceptedAt: Date.now()
  })
}

/** Rechazar, cancelar una enviada o dejar de ser amigos: las tres cosas son borrarla. */
export async function removeFriendship(friendship: Friendship): Promise<void> {
  const firestore = await cloud()
  const { deleteDoc, doc } = await import('firebase/firestore')
  await deleteDoc(doc(firestore, 'friendships', friendship.id))
}

/**
 * Escucha tus amistades en directo: las que pediste tu y las que te pidieron.
 * Son dos consultas porque Firestore no deja preguntar "donde salga yo" de una
 * vez; no se avisa hasta tener las dos, para no ensenar una lista a medias.
 */
export function watchFriendships(
  me: string,
  onChange: (rows: Friendship[]) => void,
  onError: (message: string) => void
): () => void {
  let cancelled = false
  const stops: Array<() => void> = []

  void (async () => {
    const firestore = await getFirestore()
    if (!firestore || cancelled) return
    const { collection, onSnapshot, query, where } = await import('firebase/firestore')
    if (cancelled) return

    const sides = { requesterId: new Map<string, Friendship>(), addresseeId: new Map<string, Friendship>() }
    const loaded = new Set<string>()

    for (const field of ['requesterId', 'addresseeId'] as const) {
      stops.push(onSnapshot(
        query(collection(firestore, 'friendships'), where(field, '==', me)),
        snapshot => {
          const side = sides[field]
          side.clear()
          for (const document of snapshot.docs) side.set(document.id, readFriendship(document.id, document.data()))
          loaded.add(field)
          if (loaded.size === 2) onChange([...sides.requesterId.values(), ...sides.addresseeId.values()])
        },
        error => {
          console.error('[social] fallo al escuchar amistades', error)
          onError(socialErrorEs(error))
        }
      ))
    }
  })()

  return () => {
    cancelled = true
    for (const stop of stops) stop()
  }
}

// ---------------------------------------------------------------------------
// Lo que publican tus amigos
// ---------------------------------------------------------------------------

export interface PostPage {
  posts: Post[]
  /** donde seguir en la pagina siguiente; opaco para quien lo usa */
  cursor: unknown
  exhausted: boolean
}

/** Una pagina de posts de un amigo, de mas nuevo a mas viejo. */
export async function fetchPosts(owner: string, cursor: unknown = null, pageSize = FEED_PAGE): Promise<PostPage> {
  const firestore = await cloud()
  const { collection, getDocs, limit, orderBy, query, startAfter } = await import('firebase/firestore')
  const posts = collection(firestore, 'users', owner, 'posts')

  const snapshot = await getDocs(cursor
    ? query(posts, orderBy('finishedAt', 'desc'), startAfter(cursor), limit(pageSize))
    : query(posts, orderBy('finishedAt', 'desc'), limit(pageSize)))

  const docs = snapshot.docs
  return {
    posts: docs.map(document => readPost(document.id, document.data())),
    cursor: docs.length > 0 ? docs[docs.length - 1] : cursor,
    exhausted: docs.length < pageSize
  }
}

/** Rangos y actividad de un amigo; null si todavia no ha publicado nada. */
export async function fetchPublicStats(uid: string): Promise<PublicStats | null> {
  const firestore = await cloud()
  const { doc, getDoc } = await import('firebase/firestore')
  const snapshot = await getDoc(doc(firestore, 'publicStats', uid))
  return snapshot.exists() ? readPublicStats(snapshot.data()) : null
}
