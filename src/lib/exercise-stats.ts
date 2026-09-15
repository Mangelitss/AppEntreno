// ---------------------------------------------------------------------------
// Estadisticas a nivel de ejercicio.
//
// Lo usan tanto Progreso como el modulo de Estadisticas, para no repetir la
// consulta de "los que mas entrenas" en dos sitios.
// ---------------------------------------------------------------------------

import { db } from '../db/db'
import type { Exercise } from '../db/types'

export interface TopExercise {
  exerciseId: string
  /** numero de sesiones distintas en las que aparece */
  sessions: number
  exercise: Exercise
}

/**
 * Los ejercicios que mas veces has entrenado, por numero de sesiones distintas.
 * Se ignoran los borrados y los archivados.
 */
export async function topTrainedExercises(limit = 5): Promise<TopExercise[]> {
  const finished = new Set(
    (await db.workouts.toArray()).filter(w => !w.deletedAt && w.finishedAt).map(w => w.id)
  )
  const links = (await db.workoutExercises.toArray()).filter(l => !l.deletedAt && finished.has(l.workoutId))

  const sessions = new Map<string, Set<string>>()
  for (const l of links) {
    const set = sessions.get(l.exerciseId) ?? new Set<string>()
    set.add(l.workoutId)
    sessions.set(l.exerciseId, set)
  }

  const ranked = [...sessions.entries()]
    .map(([id, s]) => ({ exerciseId: id, sessions: s.size }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit)

  const exs = await Promise.all(ranked.map(r => db.exercises.get(r.exerciseId)))
  return ranked
    .map((r, i) => ({ ...r, exercise: exs[i] }))
    .filter((r): r is TopExercise =>
      !!r.exercise && !r.exercise.deletedAt && r.exercise.archived !== 1)
}
