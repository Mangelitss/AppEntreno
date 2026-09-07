// Ciclo completo: entrenar, evaluar, ajustar la subida y confirmar.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { db } from '../src/db/db.ts'
import {
  addExerciseToRoutine, commitWorkout, createRoutine, evaluateWorkout, startWorkout
} from '../src/db/actions.ts'
import { normalize } from '../src/lib/stats.ts'
import type { Exercise } from '../src/db/types.ts'

const BENCH: Exercise = {
  id: 'bench', name: 'barbell bench press', search: normalize('barbell bench press'),
  category: 'chest', equipment: 'barbell', target: 'pectorals', secondaryMuscles: [],
  instructions: [], image: null, gif: null, isCustom: 0, favorite: 0, incrementKg: null,
  updatedAt: 0, deletedAt: null
}

let routineId = ''

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.exercises.put(BENCH)
  routineId = await createRoutine('Push')
  const itemId = await addExerciseToRoutine(routineId, BENCH.id)
  await db.routineItems.update(itemId, { targetSets: 3, targetRepsMin: 8, targetRepsMax: 10 })
})

/** Hace un entreno entero con las mismas reps y RIR en las 3 series. */
async function trainSession(weight: number, reps: number, rir: number) {
  const workoutId = await startWorkout(routineId)
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray()
  for (const set of sets) {
    await db.sets.update(set.id, { weight, reps, rir, done: 1, completedAt: Date.now() })
  }
  return workoutId
}

test('la primera sesion buena solo acumula racha, no sube', async () => {
  const workoutId = await trainSession(60, 10, 3)
  const [proposal] = await evaluateWorkout(workoutId)

  assert.equal(proposal.exerciseName, 'barbell bench press')
  assert.equal(proposal.ready, true)
  assert.equal(proposal.willIncrease, false)
  assert.equal(proposal.increment, 0)
  assert.equal(proposal.streak, 1)
  assert.match(proposal.message, /1 sesion mas/)
})

test('la segunda propone la subida que toca por equipamiento', async () => {
  await commitWorkout(await trainSession(60, 10, 3))
  const second = await trainSession(60, 10, 3)
  const [proposal] = await evaluateWorkout(second)

  assert.equal(proposal.willIncrease, true)
  assert.equal(proposal.increment, 2.5, 'barra en tren superior')
  assert.equal(proposal.topWeight, 60)
})

test('evaluar no guarda nada: el entreno sigue abierto', async () => {
  const workoutId = await trainSession(60, 10, 3)
  await evaluateWorkout(workoutId)
  await evaluateWorkout(workoutId)

  const workout = await db.workouts.get(workoutId)
  assert.equal(workout?.finishedAt, null, 'no se cierra al evaluar')
  assert.equal(await db.progression.count(), 0, 'no se escribe progresion al evaluar')
})

test('puedes bajar el incremento y se recuerda para la proxima', async () => {
  await commitWorkout(await trainSession(60, 10, 3))
  const second = await trainSession(60, 10, 3)

  await commitWorkout(second, { [BENCH.id]: 1 })

  const state = await db.progression.get(BENCH.id)
  assert.equal(state?.pendingWeightKg, 1, 'se guarda lo que elegiste, no los 2,5')

  const exercise = await db.exercises.get(BENCH.id)
  assert.equal(exercise?.incrementKg, 1, 'pasa a ser el incremento por defecto del ejercicio')

  // El siguiente entreno ya llega con el peso subido.
  const third = await startWorkout(routineId)
  const sets = await db.sets.where('workoutId').equals(third).toArray()
  assert.ok(sets.every(s => s.weight === 61), `pesos: ${sets.map(s => s.weight).join()}`)
})

test('con incremento 0 no sube y vuelve a proponerlo la sesion siguiente', async () => {
  await commitWorkout(await trainSession(60, 10, 3))
  await commitWorkout(await trainSession(60, 10, 3), { [BENCH.id]: 0 })

  const state = await db.progression.get(BENCH.id)
  assert.equal(state?.pendingWeightKg, 0, 'no sube')

  const exercise = await db.exercises.get(BENCH.id)
  assert.equal(exercise?.incrementKg, null, 'y no toca el incremento del ejercicio')

  // Sin haber reiniciado la racha, la siguiente sesion buena vuelve a proponerlo.
  const third = await trainSession(60, 10, 3)
  const [proposal] = await evaluateWorkout(third)
  assert.equal(proposal.willIncrease, true)
})

test('una sesion floja no propone nada y explica por que', async () => {
  const workoutId = await trainSession(60, 7, 0)
  const [proposal] = await evaluateWorkout(workoutId)

  assert.equal(proposal.willIncrease, false)
  assert.equal(proposal.ready, false)
  assert.match(proposal.message, /10 reps/)
})

test('confirmar cierra el entreno y lo manda al historial', async () => {
  const workoutId = await trainSession(60, 10, 3)
  await commitWorkout(workoutId)

  const workout = await db.workouts.get(workoutId)
  assert.ok(workout?.finishedAt, 'queda cerrado')
  assert.equal((await db.progression.get(BENCH.id))?.streak, 1)
})

test('un entreno registrado a posteriori guarda su fecha y la duracion que le dices', async () => {
  const workoutId = await startWorkout(routineId, { dateKey: '2026-08-01', durationMinutes: 75 })

  const created = await db.workouts.get(workoutId)
  assert.equal(created?.dateKey, '2026-08-01')
  assert.equal(created?.plannedDurationMs, 75 * 60_000)

  const sets = await db.sets.where('workoutId').equals(workoutId).toArray()
  for (const set of sets) await db.sets.update(set.id, { weight: 60, reps: 10, rir: 3, done: 1 })
  await commitWorkout(workoutId)

  const saved = await db.workouts.get(workoutId)
  assert.ok(saved?.finishedAt)
  assert.equal(
    saved!.finishedAt! - saved!.startedAt,
    75 * 60_000,
    'la duracion es la que dijiste, no la que tardaste en rellenar el formulario'
  )
  assert.equal(new Date(saved!.startedAt).getHours(), 12, 'anclado al mediodia de aquel dia')
})

test('un entreno de hoy se cierra con el reloj, no con una duracion fija', async () => {
  const workoutId = await trainSession(60, 10, 3)
  const before = Date.now()
  await commitWorkout(workoutId)

  const saved = await db.workouts.get(workoutId)
  assert.equal(saved?.plannedDurationMs, null)
  assert.ok(saved!.finishedAt! >= before)
})
