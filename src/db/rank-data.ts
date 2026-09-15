// ---------------------------------------------------------------------------
// De tu historial a los datos que necesita el motor de rangos.
//
// Nada de esto se guarda: se recalcula desde los entrenos cada vez, igual que
// el resto de estadisticas. Asi corregir un entreno antiguo arregla tambien
// los rangos, en vez de dejarlos descuadrados para siempre.
// ---------------------------------------------------------------------------

import { db } from './db'
import { epley1RM } from '../lib/stats'
import { isRankable } from '../lib/muscle-groups'
import { muscleContributions } from '../lib/muscle-work'
import { weekKeyOf, type WeekMuscleData } from '../lib/ranks'
import type { Exercise, WorkoutSet } from './types'

interface Bucket {
  effectiveSets: number
  bestE1rm: number
  hardSets: number
  totalSets: number
}

export async function buildWeekMuscleData(): Promise<WeekMuscleData[]> {
  const workouts = (await db.workouts.toArray()).filter(w => !w.deletedAt && w.finishedAt)
  if (workouts.length === 0) return []

  const weekOfWorkout = new Map<string, string>()
  for (const workout of workouts) {
    const [year, month, day] = workout.dateKey.split('-').map(Number)
    weekOfWorkout.set(workout.id, weekKeyOf(new Date(year, month - 1, day)))
  }

  const exercises = new Map((await db.exercises.toArray()).map(e => [e.id, e]))
  const sets = (await db.sets.toArray()).filter(
    s => !s.deletedAt && s.done === 1 && s.type !== 'warmup'
  )

  const buckets = new Map<string, Bucket>()

  const add = (weekKey: string, muscle: string, share: number, set: WorkoutSet, direct: boolean) => {
    if (!isRankable(muscle)) return

    const key = `${weekKey}|${muscle.trim().toLowerCase()}`
    const bucket = buckets.get(key) ?? { effectiveSets: 0, bestE1rm: 0, hardSets: 0, totalSets: 0 }

    bucket.effectiveSets += share
    bucket.totalSets += 1
    if (set.rir !== null && set.rir !== undefined && set.rir <= 2) bucket.hardSets += 1

    // El 1RM estimado solo cuenta desde el musculo objetivo: la marca de un
    // press de banca no es la marca del triceps.
    if (direct) bucket.bestE1rm = Math.max(bucket.bestE1rm, epley1RM(set.weight, set.reps))

    buckets.set(key, bucket)
  }

  for (const set of sets) {
    const weekKey = weekOfWorkout.get(set.workoutId)
    if (!weekKey) continue

    const exercise: Exercise | undefined = exercises.get(set.exerciseId)
    // El cardio no puntua: no hay carga que progresar.
    if (!exercise || exercise.tracking === 'cardio') continue

    for (const c of muscleContributions(exercise)) add(weekKey, c.muscle, c.share, set, c.direct)
  }

  return [...buckets.entries()].map(([key, bucket]) => {
    const [weekKey, muscle] = key.split('|')
    return {
      weekKey,
      muscle,
      effectiveSets: Number(bucket.effectiveSets.toFixed(2)),
      bestE1rm: Number(bucket.bestE1rm.toFixed(1)),
      intensityRatio: bucket.totalSets ? bucket.hardSets / bucket.totalSets : 0
    }
  })
}
