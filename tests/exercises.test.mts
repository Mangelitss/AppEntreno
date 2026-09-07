// Gestion del catalogo: ediciones a mano, archivado y reimportacion.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { db } from '../src/db/db.ts'
import { countEditedExercises, ensureCatalog } from '../src/db/catalog.ts'
import { ensureCardioCatalog } from '../src/db/cardio-catalog.ts'
import { dataUrlSizeKb } from '../src/lib/image.ts'
import type { Exercise } from '../src/db/types.ts'

const CATALOG_ID = '0025'

/** Simula lo que deja el importador del dataset. */
const fromDataset = (over: Partial<Exercise> = {}): Exercise => ({
  id: CATALOG_ID,
  name: 'barbell bench press',
  search: 'barbell bench press',
  category: 'chest',
  equipment: 'barbell',
  target: 'pectorals',
  secondaryMuscles: ['triceps'],
  instructions: ['Tumbate en el banco.'],
  image: 'images/0025.jpg',
  gif: 'videos/0025.gif',
  isCustom: 0,
  favorite: 0,
  incrementKg: null,
  updatedAt: 0,
  deletedAt: null,
  ...over
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('sin ediciones no hay nada que preguntar al reimportar', async () => {
  await db.exercises.put(fromDataset())
  assert.equal(await countEditedExercises(), 0)
})

test('lo que has creado tu nunca cuenta como edicion del catalogo', async () => {
  await ensureCardioCatalog()
  await db.exercises.put(fromDataset({ id: 'mio', isCustom: 1, editedFields: ['name', 'target'] }))
  assert.equal(await countEditedExercises(), 0, 'solo se pregunta por los del dataset')
})

test('conservando ediciones, el catalogo no pisa lo que cambiaste a mano', async () => {
  await db.exercises.put(fromDataset({
    name: 'Press banca con barra',
    target: 'pecho',
    equipment: 'barra olimpica',
    editedFields: ['name', 'target'],
    favorite: 1,
    incrementKg: 1.25,
    props: [{ id: 'p1', name: 'Altura banco', value: '3' }],
    imageData: 'data:image/jpeg;base64,AAAA',
    archived: 1
  }))
  assert.equal(await countEditedExercises(), 1)

  await ensureCatalog({ preserveEdits: true })
  const after = await db.exercises.get(CATALOG_ID)

  assert.equal(after?.name, 'Press banca con barra', 'el nombre editado aguanta')
  assert.equal(after?.target, 'pecho', 'el musculo editado aguanta')
  assert.equal(after?.favorite, 1)
  assert.equal(after?.incrementKg, 1.25)
  assert.equal(after?.props?.[0].value, '3')
  assert.equal(after?.imageData, 'data:image/jpeg;base64,AAAA')
  assert.equal(after?.archived, 1)
})

test('sin conservar, el catalogo recupera sus datos pero no lo que es tuyo', async () => {
  await db.exercises.put(fromDataset({
    name: 'Press banca con barra',
    editedFields: ['name'],
    favorite: 1,
    props: [{ id: 'p1', name: 'Altura banco', value: '3' }],
    imageData: 'data:image/jpeg;base64,AAAA'
  }))

  await ensureCatalog({ preserveEdits: false })
  const after = await db.exercises.get(CATALOG_ID)

  assert.notEqual(after?.name, 'Press banca con barra', 'el nombre vuelve al del catalogo')
  assert.equal(after?.favorite, 1, 'los favoritos son tuyos, no del dataset')
  assert.equal(after?.props?.[0].value, '3', 'tus anotaciones tampoco se tocan')
  assert.equal(after?.imageData, 'data:image/jpeg;base64,AAAA', 'ni tu imagen')
  assert.deepEqual(after?.editedFields, [], 'y se olvida que estaba editado')
})

test('las actividades de cardio sobreviven a una reimportacion', async () => {
  await ensureCardioCatalog()
  const before = await db.exercises.get('cardio-bici')

  await ensureCatalog({ preserveEdits: true })

  const after = await db.exercises.get('cardio-bici')
  assert.equal(after?.tracking, 'cardio')
  assert.equal(after?.paceStyle, before?.paceStyle)
})

test('archivar no borra nada', async () => {
  await db.exercises.put(fromDataset())
  await db.exercises.update(CATALOG_ID, { archived: 1 })

  const exercise = await db.exercises.get(CATALOG_ID)
  assert.equal(exercise?.archived, 1)
  assert.equal(exercise?.deletedAt, null, 'sigue existiendo, solo esta escondido')
  assert.equal(await db.exercises.count(), 1)
})

test('el tamano de una imagen guardada se estima bien', () => {
  // 4 caracteres base64 son 3 bytes; 4096 caracteres -> ~3 KB
  assert.equal(dataUrlSizeKb('data:image/jpeg;base64,' + 'A'.repeat(4096)), 3)
  assert.equal(dataUrlSizeKb(null), 0)
})
