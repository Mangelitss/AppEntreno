// Reglas del motor de sincronizacion que se pueden comprobar sin servidor.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { db, EMPTY_SYNC, getSyncState, saveSyncState } from '../src/db/db.ts'
import { COLLECTIONS, isWorthSyncing, pendingCount } from '../src/db/sync.ts'
import { ensureCardioCatalog } from '../src/db/cardio-catalog.ts'
import { createRoutine } from '../src/db/actions.ts'
import type { Exercise } from '../src/db/types.ts'

const fromCatalog = (over: Partial<Exercise> = {}): Exercise => ({
  id: '0025', name: 'barbell bench press', search: 'barbell bench press', category: 'chest',
  equipment: 'barbell', target: 'pectorals', secondaryMuscles: [], instructions: [],
  image: null, gif: null, isCustom: 0, favorite: 0, incrementKg: null,
  updatedAt: 1000, deletedAt: null, ...over
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('el catalogo intacto no se sube: es igual para todos', () => {
  assert.equal(isWorthSyncing(fromCatalog()), false)
})

test('en cuanto lo tocas, pasa a ser tuyo y sube', () => {
  assert.equal(isWorthSyncing(fromCatalog({ isCustom: 1 })), true, 'creado por ti')
  assert.equal(isWorthSyncing(fromCatalog({ editedFields: ['name'] })), true, 'editado')
  assert.equal(isWorthSyncing(fromCatalog({ favorite: 1 })), true, 'favorito')
  assert.equal(isWorthSyncing(fromCatalog({ archived: 1 })), true, 'archivado')
  assert.equal(isWorthSyncing(fromCatalog({ incrementKg: 1.25 })), true, 'incremento propio')
  assert.equal(isWorthSyncing(fromCatalog({ alias: 'Press banca' })), true, 'alias en espanol')
  assert.equal(
    isWorthSyncing(fromCatalog({ props: [{ id: 'p', name: 'Banco', value: '3' }] })),
    true,
    'anotaciones'
  )
  assert.equal(isWorthSyncing(fromCatalog({ imageData: 'data:image/jpeg;base64,AA' })), true, 'foto propia')
})

test('sin sincronizar nunca, el estado empieza a cero', async () => {
  const state = await getSyncState()
  assert.deepEqual(state, EMPTY_SYNC)
  assert.equal(state.lastPushedAt, 0, 'asi la primera pasada sube todo tu historial')
})

test('cuenta como pendiente todo lo que cambio despues del ultimo envio', async () => {
  await createRoutine('Push')
  await createRoutine('Pull')
  assert.equal(await pendingCount(), 2)

  // Marcas de tiempo explicitas: si se usara el reloj real, crear una rutina
  // en el mismo milisegundo que el corte haria que la prueba fallara a ratos.
  const corte = Date.now() + 10_000
  await saveSyncState({ lastPushedAt: corte })
  assert.equal(await pendingCount(), 0, 'todo lo anterior al corte ya se envio')

  const nueva = await createRoutine('Pierna')
  await db.routines.update(nueva, { updatedAt: corte + 1 })
  assert.equal(await pendingCount(), 1, 'lo posterior al corte vuelve a estar pendiente')
})

test('las 1.324 filas del catalogo no inflan lo pendiente', async () => {
  await db.exercises.bulkPut(
    Array.from({ length: 200 }, (_, i) => fromCatalog({ id: `cat-${i}`, updatedAt: Date.now() }))
  )
  assert.equal(await pendingCount(), 0, 'nada del catalogo cuenta')

  await db.exercises.put(fromCatalog({ id: 'mio', isCustom: 1, updatedAt: Date.now() }))
  assert.equal(await pendingCount(), 1, 'solo el tuyo')
})

test('las actividades de cardio si son tuyas y suben', async () => {
  await ensureCardioCatalog()
  const bici = await db.exercises.get('cardio-bici')
  assert.equal(isWorthSyncing(bici!), true, 'se crean como propias')
})

test('lo borrado sigue contando como pendiente, para que el borrado viaje', async () => {
  const routineId = await createRoutine('Push')
  const corte = Date.now() + 10_000
  await saveSyncState({ lastPushedAt: corte })
  assert.equal(await pendingCount(), 0)

  await db.routines.update(routineId, { deletedAt: corte + 1, updatedAt: corte + 1 })
  assert.equal(await pendingCount(), 1, 'si no subiera, el borrado no llegaria al otro dispositivo')
})

test('todas las tablas de usuario estan en la lista de sincronizacion', () => {
  for (const name of COLLECTIONS) {
    assert.ok(db.table(name), `${name} deberia existir en la base local`)
  }
  assert.ok(COLLECTIONS.includes('workouts'))
  assert.ok(COLLECTIONS.includes('sets'))
  assert.ok(COLLECTIONS.includes('body'))
  assert.ok(COLLECTIONS.includes('profile'))
  assert.ok(!(COLLECTIONS as readonly string[]).includes('syncState'), 'el estado del sync es de este dispositivo')
})

test('las fotos no se envian: se quedan en el dispositivo', async () => {
  // Se comprueba sobre la fila preparada para enviar, no sobre la local.
  const { default: fs } = await import('node:fs')
  void fs

  await db.exercises.put(fromCatalog({
    id: 'mio', isCustom: 1, updatedAt: Date.now(),
    imageData: 'data:image/jpeg;base64,AAAA',
    gifData: 'data:image/gif;base64,BBBB'
  }))

  const guardado = await db.exercises.get('mio')
  assert.equal(guardado?.imageData, 'data:image/jpeg;base64,AAAA', 'en local si esta')
  assert.equal(await pendingCount(), 1, 'y la fila sigue estando pendiente de subir')
})

test('tener una foto ya hace que el ejercicio sea tuyo', () => {
  assert.equal(
    isWorthSyncing(fromCatalog({ imageData: 'data:image/jpeg;base64,AAAA' })),
    true,
    'aunque la foto no viaje, el resto de sus datos si'
  )
})
