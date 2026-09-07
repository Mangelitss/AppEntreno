import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { db } from '../src/db/db.ts'
import { ensureCardioCatalog } from '../src/db/cardio-catalog.ts'
import {
  addExerciseToRoutine, commitWorkout, createRoutine, evaluateWorkout,
  isCardioOnlyRoutine, logCardioWorkout, startWorkout
} from '../src/db/actions.ts'
import { computeStreak } from '../src/lib/streak.ts'
import { fieldsFor, formatCardioDuration, paceLabel } from '../src/lib/cardio.ts'
import { totalVolume } from '../src/lib/stats.ts'

test('cada tipo de actividad pide los campos que le corresponden', () => {
  assert.ok(!fieldsFor('hiit').includes('distance'), 'un HIIT no tiene distancia')
  assert.ok(fieldsFor('distance').includes('distance'), 'una salida en bici si')
  assert.ok(!fieldsFor('sport').includes('distance'), 'un partido de tenis tampoco')
  assert.ok(fieldsFor('sport').includes('kcal'))
  assert.ok(fieldsFor('hiit').includes('avgHr') && fieldsFor('hiit').includes('maxHr'))
})

test('el ritmo se calcula solo y en la unidad de cada deporte', () => {
  // 30 min para 6 km -> 5:00 min/km
  assert.equal(paceLabel(1800, 6, 'pace'), '5:00 min/km')
  // 1 h para 30 km -> 30 km/h
  assert.equal(paceLabel(3600, 30, 'speed'), '30.0 km/h')
  // 30 min para 1,5 km nadando -> 2:00 min/100m
  assert.equal(paceLabel(1800, 1.5, 'pace100'), '2:00 min/100m')
})

test('sin distancia o sin tiempo no se inventa un ritmo', () => {
  assert.equal(paceLabel(1800, null, 'pace'), null)
  assert.equal(paceLabel(null, 6, 'pace'), null)
  assert.equal(paceLabel(1800, 0, 'pace'), null)
  assert.equal(paceLabel(1800, 6, undefined), null, 'un HIIT no tiene ritmo')
})

test('las duraciones se leen de un vistazo', () => {
  assert.equal(formatCardioDuration(2700), '45 min')
  assert.equal(formatCardioDuration(3900), '1h 05m')
  assert.equal(formatCardioDuration(null), '—')
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureCardioCatalog()
})

test('el catalogo de cardio es idempotente y no se duplica', async () => {
  const first = await db.exercises.count()
  await ensureCardioCatalog()
  await ensureCardioCatalog()
  assert.equal(await db.exercises.count(), first)
  assert.ok(first >= 15)

  const bici = await db.exercises.get('cardio-bici')
  assert.equal(bici?.tracking, 'cardio')
  assert.equal(bici?.cardioKind, 'distance')
  assert.equal(bici?.paceStyle, 'speed')
})

test('una actividad de cardio entra en la rutina como una entrada con duracion', async () => {
  const routineId = await createRoutine('Cardio')
  const itemId = await addExerciseToRoutine(routineId, 'cardio-tenis')

  const item = await db.routineItems.get(itemId)
  assert.equal(item?.targetSets, 1, 'una sola entrada, no tres series')
  assert.equal(item?.targetDurationMin, 30)
  assert.equal(item?.restSeconds, 0, 'no hay descanso entre series que no existen')
})

test('al entrenar se crea una sola ficha con la duracion objetivo', async () => {
  const routineId = await createRoutine('Cardio')
  await addExerciseToRoutine(routineId, 'cardio-bici')

  const workoutId = await startWorkout(routineId)
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray()

  assert.equal(sets.length, 1)
  assert.equal(sets[0].durationSec, 30 * 60)
  assert.equal(sets[0].weight, 0)
})

test('el motor de progresion ignora el cardio', async () => {
  const routineId = await createRoutine('Cardio')
  await addExerciseToRoutine(routineId, 'cardio-hiit')

  const workoutId = await startWorkout(routineId)
  const [set] = await db.sets.where('workoutId').equals(workoutId).toArray()
  await db.sets.update(set.id, { durationSec: 1200, kcal: 260, avgHr: 155, maxHr: 178, done: 1 })

  assert.deepEqual(await evaluateWorkout(workoutId), [], 'no propone subir nada')

  await commitWorkout(workoutId)
  assert.equal(await db.progression.count(), 0, 'ni guarda estado de progresion')
})

test('el cardio no ensucia el volumen en kg del entreno', async () => {
  const routineId = await createRoutine('Cardio')
  await addExerciseToRoutine(routineId, 'cardio-carrera')

  const workoutId = await startWorkout(routineId)
  const [set] = await db.sets.where('workoutId').equals(workoutId).toArray()
  await db.sets.update(set.id, { durationSec: 2700, distanceKm: 8, kcal: 520, done: 1 })

  const sets = await db.sets.where('workoutId').equals(workoutId).toArray()
  assert.equal(totalVolume(sets), 0, 'correr 8 km no son kilos levantados')
})

test('una rutina puede mezclar fuerza y cardio', async () => {
  await db.exercises.put({
    id: 'bench', name: 'barbell bench press', search: 'barbell bench press', category: 'chest',
    equipment: 'barbell', target: 'pectorals', secondaryMuscles: [], instructions: [],
    image: null, gif: null, isCustom: 0, favorite: 0, incrementKg: null,
    updatedAt: 0, deletedAt: null
  })

  const routineId = await createRoutine('Mixta')
  await addExerciseToRoutine(routineId, 'bench')
  await addExerciseToRoutine(routineId, 'cardio-comba')

  const workoutId = await startWorkout(routineId)
  const sets = (await db.sets.where('workoutId').equals(workoutId).toArray())

  const cardioSets = sets.filter(s => s.exerciseId === 'cardio-comba')
  const strengthSets = sets.filter(s => s.exerciseId === 'bench')
  assert.equal(cardioSets.length, 1)
  assert.equal(strengthSets.length, 3, 'la fuerza mantiene sus series')

  for (const set of strengthSets) await db.sets.update(set.id, { weight: 60, reps: 10, rir: 3, done: 1 })
  await db.sets.update(cardioSets[0].id, { durationSec: 600, kcal: 120, done: 1 })

  const proposals = await evaluateWorkout(workoutId)
  assert.equal(proposals.length, 1, 'solo se evalua el ejercicio de fuerza')
  assert.equal(proposals[0].exerciseName, 'barbell bench press')
})

test('registrar cardio crea el entreno ya cerrado, sin pasar por el cronometro', async () => {
  const workoutId = await logCardioWorkout({
    routineId: null,
    dateKey: '2026-08-05',
    entries: [{ exerciseId: 'cardio-bici', durationSec: 45 * 60, distanceKm: 22, kcal: 480, avgHr: 142, maxHr: 168 }]
  })

  const workout = await db.workouts.get(workoutId)
  assert.ok(workout?.finishedAt, 'nace terminado')
  assert.equal(workout!.finishedAt! - workout!.startedAt, 45 * 60 * 1000)
  assert.equal(workout?.routineName, 'Cardio')

  const [set] = await db.sets.where('workoutId').equals(workoutId).toArray()
  assert.equal(set.done, 1)
  assert.equal(set.distanceKm, 22)
  assert.equal(set.kcal, 480)
  assert.equal(set.avgHr, 142)
})

test('con solo la duracion tambien vale: el resto queda vacio', async () => {
  const workoutId = await logCardioWorkout({
    routineId: null,
    entries: [{ exerciseId: 'cardio-tenis', durationSec: 90 * 60, distanceKm: null, kcal: null, avgHr: null, maxHr: null }]
  })

  const [set] = await db.sets.where('workoutId').equals(workoutId).toArray()
  assert.equal(set.durationSec, 5400)
  assert.equal(set.distanceKm, null)
  assert.equal(set.kcal, null)
})

test('una sesion de cardio puede llevar varias actividades', async () => {
  const workoutId = await logCardioWorkout({
    routineId: null,
    entries: [
      { exerciseId: 'cardio-hiit', durationSec: 20 * 60, distanceKm: null, kcal: 260, avgHr: null, maxHr: null },
      { exerciseId: 'cardio-bici', durationSec: 40 * 60, distanceKm: 18, kcal: 400, avgHr: null, maxHr: null }
    ]
  })

  const workout = await db.workouts.get(workoutId)
  assert.equal(workout!.finishedAt! - workout!.startedAt, 60 * 60 * 1000, 'suma las dos duraciones')
  assert.equal((await db.workoutExercises.where('workoutId').equals(workoutId).toArray()).length, 2)
})

test('el cardio registrado cuenta para la racha', async () => {
  await logCardioWorkout({
    routineId: null, dateKey: '2026-08-04',
    entries: [{ exerciseId: 'cardio-carrera', durationSec: 1800, distanceKm: 6, kcal: null, avgHr: null, maxHr: null }]
  })

  const days = (await db.workouts.toArray()).filter(w => w.finishedAt).map(w => w.dateKey)
  const streak = computeStreak(days, '2026-08-05')
  assert.equal(streak.alive, true)
  assert.equal(streak.days, 1)
})

test('una rutina se reconoce como de solo cardio', async () => {
  await db.exercises.put({
    id: 'row', name: 'barbell bent over row', search: 'barbell bent over row', category: 'back',
    equipment: 'barbell', target: 'upper back', secondaryMuscles: [], instructions: [],
    image: null, gif: null, isCustom: 0, favorite: 0, incrementKg: null,
    updatedAt: 0, deletedAt: null
  })

  const soloCardio = await createRoutine('Cardio')
  await addExerciseToRoutine(soloCardio, 'cardio-bici')
  await addExerciseToRoutine(soloCardio, 'cardio-hiit')
  assert.equal(await isCardioOnlyRoutine(soloCardio), true)

  const mixta = await createRoutine('Mixta')
  await addExerciseToRoutine(mixta, 'row')
  await addExerciseToRoutine(mixta, 'cardio-comba')
  assert.equal(await isCardioOnlyRoutine(mixta), false, 'si hay hierro, se entrena en directo')

  const vacia = await createRoutine('Vacia')
  assert.equal(await isCardioOnlyRoutine(vacia), false)
})
