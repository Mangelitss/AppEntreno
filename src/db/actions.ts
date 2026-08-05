import { db, getSettings } from './db'
import { dateKey, now, stamp, uid } from './repo'
import type {
  BodyEntry, Exercise, ID, ProgressionState, Routine, RoutineItem,
  Workout, WorkoutExercise, WorkoutSet
} from './types'
import { applyEvaluation, emptyProgression, evaluateSession, roundWeight } from '../lib/progression'
import { normalize } from '../lib/stats'

// --------------------------------------------------------------------------
// Rutinas
// --------------------------------------------------------------------------

export async function createRoutine(name: string): Promise<ID> {
  const count = await db.routines.count()
  const routine = stamp<Omit<Routine, keyof import('./types').Syncable>>({
    name, notes: '', order: count, archived: 0
  }) as Routine
  await db.routines.put(routine)
  return routine.id
}

export async function addExerciseToRoutine(routineId: ID, exerciseId: ID): Promise<ID> {
  const settings = await getSettings()
  const siblings = await db.routineItems.where('routineId').equals(routineId).toArray()
  const item = stamp({
    routineId,
    exerciseId,
    order: siblings.filter(i => !i.deletedAt).length,
    targetSets: settings.defaultSets,
    targetRepsMin: settings.defaultRepsMin,
    targetRepsMax: settings.defaultRepsMax,
    restSeconds: settings.defaultRestSeconds,
    notes: ''
  }) as RoutineItem
  await db.routineItems.put(item)
  return item.id
}

export async function reorderRoutineItems(routineId: ID, orderedIds: ID[]): Promise<void> {
  await db.transaction('rw', db.routineItems, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.routineItems.update(orderedIds[i], { order: i, updatedAt: now() })
    }
  })
  void routineId
}

export async function duplicateRoutine(routineId: ID): Promise<ID | null> {
  const routine = await db.routines.get(routineId)
  if (!routine) return null
  const items = (await db.routineItems.where('routineId').equals(routineId).toArray()).filter(i => !i.deletedAt)
  const newId = await createRoutine(`${routine.name} (copia)`)
  await db.routineItems.bulkPut(items.map(i => ({ ...i, id: uid(), routineId: newId, updatedAt: now() })))
  return newId
}

// --------------------------------------------------------------------------
// Historial de un ejercicio
// --------------------------------------------------------------------------

export interface LastSession {
  workout: Workout
  sets: WorkoutSet[]
}

/** Ultima sesion terminada en la que hiciste ese ejercicio. */
export async function lastSessionFor(exerciseId: ID, excludeWorkoutId?: ID): Promise<LastSession | null> {
  const links = (await db.workoutExercises.where('exerciseId').equals(exerciseId).toArray())
    .filter(l => !l.deletedAt && l.workoutId !== excludeWorkoutId)
  if (!links.length) return null

  const workouts = (await db.workouts.bulkGet(links.map(l => l.workoutId)))
    .filter((w): w is Workout => !!w && !w.deletedAt && w.finishedAt !== null)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  if (!workouts.length) return null

  const workout = workouts[0]
  const link = links.find(l => l.workoutId === workout.id)!
  const sets = (await db.sets.where('workoutExerciseId').equals(link.id).toArray())
    .filter(s => !s.deletedAt)
    .sort((a, b) => a.order - b.order)
  return { workout, sets }
}

// --------------------------------------------------------------------------
// Entrenamiento
// --------------------------------------------------------------------------

function blankSet(base: Partial<WorkoutSet> & Pick<WorkoutSet, 'workoutId' | 'workoutExerciseId' | 'exerciseId' | 'order'>): WorkoutSet {
  return {
    id: uid(),
    weight: 0,
    reps: 0,
    rir: null,
    type: 'normal',
    done: 0,
    completedAt: null,
    updatedAt: now(),
    deletedAt: null,
    ...base
  } as WorkoutSet
}

/**
 * Arranca un entreno a partir de una rutina (o vacio si routineId es null).
 *
 * Cada serie llega precargada con lo que hiciste la ultima vez, mas el
 * incremento que el motor de progresion tuviera pendiente para ese ejercicio.
 * El pendiente se consume aqui: ya esta aplicado, no debe sumarse dos veces.
 */
export async function startWorkout(routineId: ID | null): Promise<ID> {
  const settings = await getSettings()
  const routine = routineId ? await db.routines.get(routineId) : null

  const workout: Workout = {
    id: uid(),
    routineId: routine?.id ?? null,
    routineName: routine?.name ?? 'Entreno libre',
    startedAt: now(),
    finishedAt: null,
    notes: '',
    dateKey: dateKey(),
    updatedAt: now(),
    deletedAt: null
  }
  await db.workouts.put(workout)

  if (!routine) return workout.id

  const items = (await db.routineItems.where('routineId').equals(routine.id).toArray())
    .filter(i => !i.deletedAt)
    .sort((a, b) => a.order - b.order)

  for (const [index, item] of items.entries()) {
    const exercise = await db.exercises.get(item.exerciseId)
    if (!exercise) continue

    const link: WorkoutExercise = {
      id: uid(),
      workoutId: workout.id,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      order: index,
      targetSets: item.targetSets,
      targetRepsMin: item.targetRepsMin,
      targetRepsMax: item.targetRepsMax,
      restSeconds: item.restSeconds,
      notes: '',
      updatedAt: now(),
      deletedAt: null
    }
    await db.workoutExercises.put(link)

    const previous = await lastSessionFor(exercise.id, workout.id)
    const progression = (await db.progression.get(exercise.id)) ?? emptyProgression(exercise.id)
    const bumpKg = settings.autoProgression === 1 ? progression.pendingWeightKg : 0
    const bumpReps = settings.autoProgression === 1 ? progression.pendingReps : 0

    const previousSets = previous?.sets.filter(s => s.type !== 'warmup') ?? []
    const sets: WorkoutSet[] = []

    for (let i = 0; i < item.targetSets; i++) {
      const ref = previousSets[i] ?? previousSets[previousSets.length - 1]
      const weight = ref ? roundWeight(ref.weight + bumpKg) : 0
      const reps = ref ? Math.max(item.targetRepsMin, ref.reps) : item.targetRepsMin
      sets.push(blankSet({
        workoutId: workout.id,
        workoutExerciseId: link.id,
        exerciseId: exercise.id,
        order: i,
        weight,
        reps: bumpKg > 0 ? item.targetRepsMin : reps + bumpReps
      }))
    }
    await db.sets.bulkPut(sets)

    if (bumpKg > 0 || bumpReps > 0) {
      await db.progression.put({ ...progression, pendingWeightKg: 0, pendingReps: 0, updatedAt: now() })
    }
  }

  return workout.id
}

export async function addSet(workoutExerciseId: ID): Promise<void> {
  const link = await db.workoutExercises.get(workoutExerciseId)
  if (!link) return
  const existing = (await db.sets.where('workoutExerciseId').equals(workoutExerciseId).toArray())
    .filter(s => !s.deletedAt)
    .sort((a, b) => a.order - b.order)
  const last = existing[existing.length - 1]
  await db.sets.put(blankSet({
    workoutId: link.workoutId,
    workoutExerciseId,
    exerciseId: link.exerciseId,
    order: existing.length,
    weight: last?.weight ?? 0,
    reps: last?.reps ?? link.targetRepsMin,
    type: last?.type ?? 'normal'
  }))
}

export async function addExerciseToWorkout(workoutId: ID, exerciseId: ID): Promise<void> {
  const settings = await getSettings()
  const exercise = await db.exercises.get(exerciseId)
  if (!exercise) return
  const siblings = (await db.workoutExercises.where('workoutId').equals(workoutId).toArray()).filter(l => !l.deletedAt)

  const link: WorkoutExercise = {
    id: uid(),
    workoutId,
    exerciseId,
    exerciseName: exercise.name,
    order: siblings.length,
    targetSets: settings.defaultSets,
    targetRepsMin: settings.defaultRepsMin,
    targetRepsMax: settings.defaultRepsMax,
    restSeconds: settings.defaultRestSeconds,
    notes: '',
    updatedAt: now(),
    deletedAt: null
  }
  await db.workoutExercises.put(link)

  const previous = await lastSessionFor(exerciseId, workoutId)
  const previousSets = previous?.sets.filter(s => s.type !== 'warmup') ?? []
  const sets: WorkoutSet[] = []
  for (let i = 0; i < link.targetSets; i++) {
    const ref = previousSets[i] ?? previousSets[previousSets.length - 1]
    sets.push(blankSet({
      workoutId, workoutExerciseId: link.id, exerciseId, order: i,
      weight: ref?.weight ?? 0,
      reps: ref?.reps ?? link.targetRepsMin
    }))
  }
  await db.sets.bulkPut(sets)
}

export interface FinishReport {
  exerciseName: string
  message: string
  ready: boolean
}

/**
 * Cierra el entreno y pasa el motor de progresion por cada ejercicio.
 * Devuelve el resumen para poder ensenarte que sube y que no.
 */
export async function finishWorkout(workoutId: ID): Promise<FinishReport[]> {
  const settings = await getSettings()
  const workout = await db.workouts.get(workoutId)
  if (!workout) return []

  const links = (await db.workoutExercises.where('workoutId').equals(workoutId).toArray())
    .filter(l => !l.deletedAt)
    .sort((a, b) => a.order - b.order)

  const report: FinishReport[] = []

  for (const link of links) {
    const sets = (await db.sets.where('workoutExerciseId').equals(link.id).toArray()).filter(s => !s.deletedAt)
    const exercise = await db.exercises.get(link.exerciseId)
    if (!exercise) continue

    const evaluation = evaluateSession(sets, link.targetRepsMax, settings.rirThreshold)
    const previous: ProgressionState = (await db.progression.get(exercise.id)) ?? emptyProgression(exercise.id)
    const outcome = applyEvaluation(previous, evaluation, exercise, settings, workoutId)

    await db.progression.put(outcome.state)
    if (outcome.message) {
      report.push({ exerciseName: exercise.name, message: outcome.message, ready: evaluation.ready })
    }
  }

  await db.workouts.update(workoutId, { finishedAt: now(), updatedAt: now() })
  return report
}

/** Descarta un entreno a medias sin dejar rastro en el historial. */
export async function discardWorkout(workoutId: ID): Promise<void> {
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    await db.sets.where('workoutId').equals(workoutId).delete()
    await db.workoutExercises.where('workoutId').equals(workoutId).delete()
    await db.workouts.delete(workoutId)
  })
}

export async function activeWorkout(): Promise<Workout | null> {
  const open = (await db.workouts.toArray())
    .filter(w => !w.deletedAt && w.finishedAt === null)
    .sort((a, b) => b.startedAt - a.startedAt)
  return open[0] ?? null
}

// --------------------------------------------------------------------------
// Peso corporal
// --------------------------------------------------------------------------

export async function upsertBodyEntry(patch: Partial<BodyEntry> & { dateKey: string }): Promise<void> {
  const existing = (await db.body.where('dateKey').equals(patch.dateKey).toArray()).filter(b => !b.deletedAt)[0]
  if (existing) {
    await db.body.update(existing.id, { ...patch, updatedAt: now() })
    return
  }
  await db.body.put({
    id: uid(),
    weightKg: null,
    bodyFat: null,
    measurements: {},
    notes: '',
    updatedAt: now(),
    deletedAt: null,
    ...patch
  } as BodyEntry)
}

// --------------------------------------------------------------------------
// Ejercicios propios
// --------------------------------------------------------------------------

export async function createCustomExercise(data: {
  name: string; category: string; equipment: string; target: string
}): Promise<ID> {
  const exercise: Exercise = {
    id: uid(),
    name: data.name,
    search: normalize([data.name, data.target, data.equipment, data.category].join(' ')),
    category: data.category,
    equipment: data.equipment,
    target: data.target,
    secondaryMuscles: [],
    instructions: [],
    image: null,
    gif: null,
    isCustom: 1,
    favorite: 0,
    incrementKg: null,
    updatedAt: now(),
    deletedAt: null
  }
  await db.exercises.put(exercise)
  return exercise.id
}
