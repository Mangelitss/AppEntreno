// El editor de rutinas trabaja en local y vuelca todo al guardar.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { db } from '../src/db/db.ts'
import {
  addExerciseToRoutine, createRoutine, draftItemFor, saveRoutineDraft, saveSchedule,
  startWorkout, type RoutineDraftItem
} from '../src/db/actions.ts'
import { ensureCardioCatalog } from '../src/db/cardio-catalog.ts'
import type { Exercise } from '../src/db/types.ts'

const exercise = (id: string, name: string): Exercise => ({
  id, name, search: name, category: 'chest', equipment: 'barbell', target: 'pectorals',
  secondaryMuscles: [], instructions: [], image: null, gif: null,
  isCustom: 0, favorite: 0, incrementKg: null, updatedAt: 0, deletedAt: null
})

let routineId = ''

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureCardioCatalog()
  await db.exercises.bulkPut([exercise('a', 'press banca'), exercise('b', 'remo'), exercise('c', 'fondos')])
  routineId = await createRoutine('Push')
})

/** Estado guardado, en el mismo formato que usa el borrador. */
async function current(): Promise<RoutineDraftItem[]> {
  return (await db.routineItems.where('routineId').equals(routineId).toArray())
    .filter(i => !i.deletedAt)
    .sort((x, y) => x.order - y.order)
    .map(i => ({
      id: i.id, exerciseId: i.exerciseId, targetSets: i.targetSets,
      targetRepsMin: i.targetRepsMin, targetRepsMax: i.targetRepsMax,
      restSeconds: i.restSeconds, targetDurationMin: i.targetDurationMin ?? null, notes: i.notes
    }))
}

test('guardar crea los ejercicios nuevos en el orden de la lista', async () => {
  const a = (await draftItemFor('a'))!
  const b = (await draftItemFor('b'))!

  await saveRoutineDraft(routineId, { name: 'Push', imageData: null, items: [b, a], increments: {} })

  const items = await current()
  assert.deepEqual(items.map(i => i.exerciseId), ['b', 'a'], 'manda la posicion en la lista')
})

test('reordenar en el borrador se refleja al guardar', async () => {
  await addExerciseToRoutine(routineId, 'a')
  await addExerciseToRoutine(routineId, 'b')
  await addExerciseToRoutine(routineId, 'c')

  const items = await current()
  const reordered = [items[2], items[0], items[1]]
  await saveRoutineDraft(routineId, { name: 'Push', imageData: null, items: reordered, increments: {} })

  assert.deepEqual((await current()).map(i => i.exerciseId), ['c', 'a', 'b'])
})

test('lo que quitas del borrador se borra logicamente, no se pierde la fila', async () => {
  await addExerciseToRoutine(routineId, 'a')
  await addExerciseToRoutine(routineId, 'b')

  const items = await current()
  await saveRoutineDraft(routineId, { name: 'Push', imageData: null, items: [items[0]], increments: {} })

  assert.deepEqual((await current()).map(i => i.exerciseId), ['a'])

  const all = await db.routineItems.where('routineId').equals(routineId).toArray()
  assert.equal(all.length, 2, 'la fila sigue ahi para que el sync propague el borrado')
  assert.ok(all.find(i => i.exerciseId === 'b')?.deletedAt, 'marcada como borrada')
})

test('anadir, quitar y editar de una vez se aplica en una sola pasada', async () => {
  await addExerciseToRoutine(routineId, 'a')
  await addExerciseToRoutine(routineId, 'b')

  const items = await current()
  const nuevo = (await draftItemFor('c'))!
  const editado = { ...items[0], targetSets: 5, targetRepsMin: 4, targetRepsMax: 6, notes: 'agarre cerrado' }

  await saveRoutineDraft(routineId, { name: 'Empuje', imageData: null, items: [nuevo, editado], increments: {} })

  const after = await current()
  assert.deepEqual(after.map(i => i.exerciseId), ['c', 'a'])
  assert.equal(after[1].targetSets, 5)
  assert.equal(after[1].notes, 'agarre cerrado')
  assert.equal((await db.routines.get(routineId))?.name, 'Empuje')
})

test('el nombre vacio no borra el que tenias', async () => {
  await saveRoutineDraft(routineId, { name: '   ', imageData: null, items: [], increments: {} })
  assert.equal((await db.routines.get(routineId))?.name, 'Push')
})

test('la portada se guarda con el resto del borrador', async () => {
  await saveRoutineDraft(routineId, {
    name: 'Push', imageData: 'data:image/jpeg;base64,AAAA', items: [], increments: {}
  })
  assert.equal((await db.routines.get(routineId))?.imageData, 'data:image/jpeg;base64,AAAA')

  await saveRoutineDraft(routineId, { name: 'Push', imageData: null, items: [], increments: {} })
  assert.equal((await db.routines.get(routineId))?.imageData, null, 'y se puede quitar')
})

test('los incrementos tocados desde el editor se aplican al ejercicio', async () => {
  await addExerciseToRoutine(routineId, 'a')
  const items = await current()

  await saveRoutineDraft(routineId, { name: 'Push', items, increments: { a: 1.25 } })
  assert.equal((await db.exercises.get('a'))?.incrementKg, 1.25)
})

test('un ejercicio de cardio entra en el borrador con duracion y sin series', async () => {
  const item = (await draftItemFor('cardio-bici'))!
  assert.equal(item.targetSets, 1)
  assert.equal(item.targetDurationMin, 30)
  assert.equal(item.restSeconds, 0)

  await saveRoutineDraft(routineId, { name: 'Cardio', imageData: null, items: [item], increments: {} })
  assert.equal((await current())[0].targetDurationMin, 30)
})

test('no guardar deja la rutina exactamente como estaba', async () => {
  await addExerciseToRoutine(routineId, 'a')
  const before = await current()

  // Se simula editar el borrador y salir sin guardar: nadie llama a saveRoutineDraft.
  const draft = [{ ...before[0], targetSets: 99 }, (await draftItemFor('b'))!]
  assert.equal(draft.length, 2)

  assert.deepEqual(await current(), before, 'la base de datos no se entera')
})

test('guardar no toca los entrenos ya hechos con esa rutina', async () => {
  await addExerciseToRoutine(routineId, 'a')
  const workoutId = await startWorkout(routineId)
  const linksBefore = await db.workoutExercises.where('workoutId').equals(workoutId).toArray()

  await saveRoutineDraft(routineId, { name: 'Push', imageData: null, items: [], increments: {} })

  const linksAfter = await db.workoutExercises.where('workoutId').equals(workoutId).toArray()
  assert.deepEqual(linksAfter, linksBefore, 'el entreno guarda su propia copia')
})

test('el calendario se guarda entero y de una vez', async () => {
  const otra = await createRoutine('Pull')
  await saveSchedule({ 0: routineId, 1: otra, 2: null, 3: null, 4: null, 5: null, 6: null })

  const rows = (await db.schedule.toArray()).sort((a, b) => a.weekday - b.weekday)
  assert.equal(rows.length, 7, 'una fila por dia, con id fijo')
  assert.deepEqual(rows.map(r => r.id), ['wd-0', 'wd-1', 'wd-2', 'wd-3', 'wd-4', 'wd-5', 'wd-6'])
  assert.equal(rows[0].routineId, routineId)
  assert.equal(rows[1].routineId, otra)
  assert.equal(rows[2].routineId, null)
})

test('reasignar un dia sustituye a la rutina que hubiera', async () => {
  const otra = await createRoutine('Pull')
  await saveSchedule({ 0: routineId, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null })
  await saveSchedule({ 0: otra, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null })

  const lunes = await db.schedule.get('wd-0')
  assert.equal(lunes?.routineId, otra)
  assert.equal((await db.schedule.toArray()).length, 7, 'sigue habiendo 7 dias')
})

test('guardar el calendario dos veces no duplica dias', async () => {
  const week = { 0: routineId, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }
  await saveSchedule(week)
  await saveSchedule(week)
  assert.equal((await db.schedule.toArray()).length, 7)
})
