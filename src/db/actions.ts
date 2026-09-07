import { db, getSettings } from './db'
import { dateKey, now, stamp, uid } from './repo'
import type {
  BodyEntry, Exercise, ID, ProgressionState, Routine, RoutineItem,
  Workout, WorkoutExercise, WorkoutSet
} from './types'
import { applyEvaluation, emptyProgression, evaluateSession, roundWeight } from '../lib/progression'
import { normalize } from '../lib/stats'
import { displayName } from '../lib/muscles'

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
  const exercise = await db.exercises.get(exerciseId)
  const isCardio = exercise?.tracking === 'cardio'
  const siblings = await db.routineItems.where('routineId').equals(routineId).toArray()

  // Una actividad de cardio es una sola entrada con su duracion, no N series.
  const item = stamp({
    routineId,
    exerciseId,
    order: siblings.filter(i => !i.deletedAt).length,
    targetSets: isCardio ? 1 : settings.defaultSets,
    targetRepsMin: isCardio ? 0 : settings.defaultRepsMin,
    targetRepsMax: isCardio ? 0 : settings.defaultRepsMax,
    restSeconds: isCardio ? 0 : settings.defaultRestSeconds,
    targetDurationMin: isCardio ? 30 : null,
    notes: ''
  }) as RoutineItem
  await db.routineItems.put(item)
  return item.id
}

/**
 * Guarda el calendario semanal de una vez.
 *
 * Las filas tienen id fijo (`wd-0`..`wd-6`), asi que esto es idempotente y da
 * igual cuantas veces se llame. Se escribe entero en lugar de dia a dia para
 * que el editor pueda trabajar sobre un borrador y volcarlo al guardar.
 */
export async function saveSchedule(assignments: Record<number, ID | null>): Promise<void> {
  await db.transaction('rw', db.schedule, async () => {
    for (const [weekday, routineId] of Object.entries(assignments)) {
      await db.schedule.put({
        id: `wd-${weekday}`,
        weekday: Number(weekday),
        routineId: routineId ?? null,
        updatedAt: now(),
        deletedAt: null
      })
    }
  })
}

/** Un ejercicio dentro del borrador del editor de rutinas. */
export interface RoutineDraftItem {
  /** id del item si ya existia; uno nuevo si lo acabas de anadir */
  id: ID
  exerciseId: ID
  targetSets: number
  targetRepsMin: number
  targetRepsMax: number
  restSeconds: number
  targetDurationMin: number | null
  notes: string
}

export interface RoutineDraft {
  name: string
  imageData: string | null
  items: RoutineDraftItem[]
  /** incrementos de progresion tocados desde el editor, por ejercicio */
  increments: Record<ID, number | null>
}

/**
 * Vuelca de golpe el borrador del editor de rutinas.
 *
 * El editor trabaja en local hasta que le das a guardar, asi que aqui hay que
 * reconciliar: lo que ya no esta en el borrador se borra (logicamente, para
 * que el sync futuro lo propague), lo que sigue se actualiza y lo nuevo se
 * crea. El orden se toma de la posicion en la lista, no de lo que hubiera.
 */
export async function saveRoutineDraft(routineId: ID, draft: RoutineDraft): Promise<void> {
  const existing = (await db.routineItems.where('routineId').equals(routineId).toArray())
    .filter(i => !i.deletedAt)
  const kept = new Set(draft.items.map(i => i.id))

  await db.transaction('rw', db.routines, db.routineItems, db.exercises, async () => {
    const routine = await db.routines.get(routineId)
    if (routine) {
      await db.routines.update(routineId, {
        name: draft.name.trim() || routine.name,
        imageData: draft.imageData,
        updatedAt: now()
      })
    }

    for (const item of existing) {
      if (!kept.has(item.id)) {
        await db.routineItems.update(item.id, { deletedAt: now(), updatedAt: now() })
      }
    }

    const byId = new Map(existing.map(i => [i.id, i]))

    for (const [order, item] of draft.items.entries()) {
      const fields = {
        routineId,
        exerciseId: item.exerciseId,
        order,
        targetSets: item.targetSets,
        targetRepsMin: item.targetRepsMin,
        targetRepsMax: item.targetRepsMax,
        restSeconds: item.restSeconds,
        targetDurationMin: item.targetDurationMin,
        notes: item.notes,
        updatedAt: now()
      }

      if (byId.has(item.id)) {
        await db.routineItems.update(item.id, fields)
      } else {
        await db.routineItems.put({ id: item.id, deletedAt: null, ...fields } as RoutineItem)
      }
    }

    for (const [exerciseId, increment] of Object.entries(draft.increments)) {
      await db.exercises.update(exerciseId, { incrementKg: increment, updatedAt: now() })
    }
  })
}

/** Item de borrador con los valores por defecto que toquen segun el ejercicio. */
export async function draftItemFor(exerciseId: ID): Promise<RoutineDraftItem | null> {
  const settings = await getSettings()
  const exercise = await db.exercises.get(exerciseId)
  if (!exercise) return null

  const isCardio = exercise.tracking === 'cardio'
  return {
    id: uid(),
    exerciseId,
    targetSets: isCardio ? 1 : settings.defaultSets,
    targetRepsMin: isCardio ? 0 : settings.defaultRepsMin,
    targetRepsMax: isCardio ? 0 : settings.defaultRepsMax,
    restSeconds: isCardio ? 0 : settings.defaultRestSeconds,
    targetDurationMin: isCardio ? 30 : null,
    notes: ''
  }
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
export interface StartOptions {
  /** dia del entreno; por defecto hoy. Se usa al registrar uno olvidado. */
  dateKey?: string
  /** duracion en minutos de un entreno pasado, que no se puede cronometrar */
  durationMinutes?: number
}

export async function startWorkout(routineId: ID | null, options: StartOptions = {}): Promise<ID> {
  const settings = await getSettings()
  const routine = routineId ? await db.routines.get(routineId) : null

  const day = options.dateKey ?? dateKey()
  const isPast = day !== dateKey()
  // Un entreno pasado se ancla a las 12:00 de aquel dia: la hora exacta no la
  // sabemos y asi no se cuela en el dia anterior por husos ni cambios de hora.
  const startedAt = isPast ? new Date(`${day}T12:00:00`).getTime() : now()

  const workout: Workout = {
    id: uid(),
    routineId: routine?.id ?? null,
    routineName: routine?.name ?? 'Entreno libre',
    startedAt,
    finishedAt: null,
    notes: '',
    dateKey: day,
    plannedDurationMs: options.durationMinutes ? options.durationMinutes * 60_000 : null,
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
      exerciseName: displayName(exercise),
      order: index,
      targetSets: item.targetSets,
      targetRepsMin: item.targetRepsMin,
      targetRepsMax: item.targetRepsMax,
      restSeconds: item.restSeconds,
      targetDurationMin: item.targetDurationMin ?? null,
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

    if (exercise.tracking === 'cardio') {
      sets.push(blankSet({
        workoutId: workout.id,
        workoutExerciseId: link.id,
        exerciseId: exercise.id,
        order: 0,
        durationSec: (item.targetDurationMin ?? 30) * 60,
        distanceKm: null,
        kcal: null,
        avgHr: null,
        maxHr: null
      }))
    } else {
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

  const isCardio = exercise.tracking === 'cardio'

  const link: WorkoutExercise = {
    id: uid(),
    workoutId,
    exerciseId,
    exerciseName: displayName(exercise),
    order: siblings.length,
    targetSets: isCardio ? 1 : settings.defaultSets,
    targetRepsMin: isCardio ? 0 : settings.defaultRepsMin,
    targetRepsMax: isCardio ? 0 : settings.defaultRepsMax,
    restSeconds: isCardio ? 0 : settings.defaultRestSeconds,
    targetDurationMin: isCardio ? 30 : null,
    notes: '',
    updatedAt: now(),
    deletedAt: null
  }
  await db.workoutExercises.put(link)

  const previous = await lastSessionFor(exerciseId, workoutId)
  const previousSets = previous?.sets.filter(s => s.type !== 'warmup') ?? []
  const sets: WorkoutSet[] = []

  if (isCardio) {
    sets.push(blankSet({
      workoutId, workoutExerciseId: link.id, exerciseId, order: 0,
      durationSec: 30 * 60
    }))
  } else {
    for (let i = 0; i < link.targetSets; i++) {
      const ref = previousSets[i] ?? previousSets[previousSets.length - 1]
      sets.push(blankSet({
        workoutId, workoutExerciseId: link.id, exerciseId, order: i,
        weight: ref?.weight ?? 0,
        reps: ref?.reps ?? link.targetRepsMin
      }))
    }
  }
  await db.sets.bulkPut(sets)
}

export interface ProgressProposal {
  exerciseId: ID
  exerciseName: string
  /** habia series efectivas que evaluar */
  evaluated: boolean
  /** esta sesion cumple el criterio para subir */
  ready: boolean
  /** la racha ha llegado al limite: toca subir ya */
  willIncrease: boolean
  /** kg propuestos; 0 en ejercicios que progresan en repeticiones */
  increment: number
  repIncrement: number
  topWeight: number
  streak: number
  requiredStreak: number
  message: string
}

interface Computed {
  exercise: Exercise
  previous: ProgressionState
  outcome: ReturnType<typeof applyEvaluation>
  evaluation: ReturnType<typeof evaluateSession>
}

/** Pasa el motor de progresion por cada ejercicio del entreno, sin guardar nada. */
async function computeOutcomes(workoutId: ID): Promise<Computed[]> {
  const settings = await getSettings()
  const links = (await db.workoutExercises.where('workoutId').equals(workoutId).toArray())
    .filter(l => !l.deletedAt)
    .sort((a, b) => a.order - b.order)

  const results: Computed[] = []

  for (const link of links) {
    const exercise = await db.exercises.get(link.exerciseId)
    if (!exercise) continue
    if (exercise.tracking === 'cardio') continue // no hay carga que subir
    const sets = (await db.sets.where('workoutExerciseId').equals(link.id).toArray()).filter(s => !s.deletedAt)
    const evaluation = evaluateSession(sets, link.targetRepsMax, settings.rirThreshold)
    const previous: ProgressionState = (await db.progression.get(exercise.id)) ?? emptyProgression(exercise.id)
    results.push({
      exercise,
      previous,
      evaluation,
      outcome: applyEvaluation(previous, evaluation, exercise, settings, workoutId)
    })
  }

  return results
}

/**
 * Que pasaria al cerrar el entreno. Se llama antes de terminar para poder
 * ensenar las subidas y dejar que las ajustes: el entreno sigue abierto hasta
 * que confirmes con commitWorkout.
 */
export async function evaluateWorkout(workoutId: ID): Promise<ProgressProposal[]> {
  const settings = await getSettings()
  const computed = await computeOutcomes(workoutId)

  return computed.map(({ exercise, evaluation, outcome }) => ({
    exerciseId: exercise.id,
    exerciseName: displayName(exercise),
    evaluated: evaluation.evaluated,
    ready: evaluation.ready,
    willIncrease: outcome.appliedIncrement > 0 || outcome.appliedReps > 0,
    increment: outcome.appliedIncrement,
    repIncrement: outcome.appliedReps,
    topWeight: evaluation.topWeight,
    streak: outcome.state.streak,
    requiredStreak: settings.requiredStreak,
    message: outcome.message
  }))
}

/**
 * Cierra el entreno de verdad.
 *
 * `overrides` lleva los kg que has decidido para cada ejercicio. Un 0 significa
 * "esta vez no": no se sube, pero la racha se queda lista para volver a
 * proponerlo la proxima sesion en vez de empezar de cero. Si cambias la
 * cantidad, se guarda como el incremento por defecto de ese ejercicio.
 */
export async function commitWorkout(
  workoutId: ID,
  overrides: Record<string, number> = {}
): Promise<void> {
  const settings = await getSettings()
  const computed = await computeOutcomes(workoutId)

  for (const { exercise, previous, outcome } of computed) {
    const state = { ...outcome.state }
    const proposed = outcome.appliedIncrement

    if (proposed > 0 && Object.prototype.hasOwnProperty.call(overrides, exercise.id)) {
      const chosen = Math.max(0, overrides[exercise.id])

      if (chosen === 0) {
        state.pendingWeightKg = previous.pendingWeightKg
        state.streak = settings.requiredStreak
      } else {
        state.pendingWeightKg = previous.pendingWeightKg + chosen
        if (chosen !== proposed) {
          await db.exercises.update(exercise.id, { incrementKg: chosen, updatedAt: now() })
        }
      }
    }

    await db.progression.put(state)
  }

  // Un entreno de hoy se cierra con el reloj; uno registrado a posteriori, con
  // la duracion que le hayas dicho.
  const workout = await db.workouts.get(workoutId)
  const finishedAt = workout?.plannedDurationMs
    ? workout.startedAt + workout.plannedDurationMs
    : now()

  await db.workouts.update(workoutId, { finishedAt, updatedAt: now() })
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
// Cardio
// --------------------------------------------------------------------------

export interface CardioLogEntry {
  exerciseId: ID
  durationSec: number | null
  distanceKm: number | null
  kcal: number | null
  avgHr: number | null
  maxHr: number | null
}

/**
 * Registra una sesion de cardio ya terminada.
 *
 * El cardio no se cronometra dentro de la app: sales a rodar y luego cuentas
 * lo que hiciste. Por eso esto no abre un entreno en curso, lo crea ya cerrado
 * a partir de lo que rellenes. Todos los campos menos la duracion son
 * opcionales; se guarda lo que haya y lo demas queda vacio.
 */
export async function logCardioWorkout(params: {
  routineId: ID | null
  routineName?: string
  dateKey?: string
  notes?: string
  entries: CardioLogEntry[]
}): Promise<ID> {
  const entries = params.entries.filter(e => e.exerciseId)
  const day = params.dateKey ?? dateKey()
  const isToday = day === dateKey()

  const totalMs = entries.reduce((acc, e) => acc + (e.durationSec ?? 0) * 1000, 0)
  // Si es de hoy lo colocamos justo antes de ahora; si es de otro dia, al mediodia.
  const startedAt = isToday
    ? Math.max(0, now() - totalMs)
    : new Date(`${day}T12:00:00`).getTime()

  const routine = params.routineId ? await db.routines.get(params.routineId) : null

  const workout: Workout = {
    id: uid(),
    routineId: routine?.id ?? null,
    routineName: routine?.name ?? params.routineName ?? 'Cardio',
    startedAt,
    finishedAt: startedAt + totalMs,
    notes: params.notes ?? '',
    dateKey: day,
    plannedDurationMs: totalMs,
    updatedAt: now(),
    deletedAt: null
  }
  await db.workouts.put(workout)

  for (const [index, entry] of entries.entries()) {
    const exercise = await db.exercises.get(entry.exerciseId)
    if (!exercise) continue

    const link: WorkoutExercise = {
      id: uid(),
      workoutId: workout.id,
      exerciseId: exercise.id,
      exerciseName: displayName(exercise),
      order: index,
      targetSets: 1,
      targetRepsMin: 0,
      targetRepsMax: 0,
      restSeconds: 0,
      targetDurationMin: entry.durationSec ? Math.round(entry.durationSec / 60) : null,
      notes: '',
      updatedAt: now(),
      deletedAt: null
    }
    await db.workoutExercises.put(link)

    await db.sets.put({
      id: uid(),
      workoutId: workout.id,
      workoutExerciseId: link.id,
      exerciseId: exercise.id,
      order: 0,
      weight: 0,
      reps: 0,
      rir: null,
      type: 'normal',
      done: 1,
      completedAt: startedAt + totalMs,
      durationSec: entry.durationSec,
      distanceKm: entry.distanceKm,
      kcal: entry.kcal,
      avgHr: entry.avgHr,
      maxHr: entry.maxHr,
      updatedAt: now(),
      deletedAt: null
    })
  }

  return workout.id
}

/** true si en la rutina no hay nada que levantar: es solo cardio. */
export async function isCardioOnlyRoutine(routineId: ID): Promise<boolean> {
  const items = (await db.routineItems.where('routineId').equals(routineId).toArray())
    .filter(i => !i.deletedAt)
  if (items.length === 0) return false

  const exercises = await db.exercises.bulkGet(items.map(i => i.exerciseId))
  return exercises.every(e => e?.tracking === 'cardio')
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
