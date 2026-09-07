// ---------------------------------------------------------------------------
// Musculos: traduccion del dataset y reparto de una rutina por grupo muscular.
// ---------------------------------------------------------------------------

import type { Exercise, RoutineItem, WorkoutExercise } from '../db/types'

/** El dataset nombra los musculos en ingles; aqui se muestran en espanol. */
const MUSCLE_ES: Record<string, string> = {
  abs: 'Abdominales',
  abductors: 'Abductores',
  adductors: 'Aductores',
  biceps: 'Biceps',
  calves: 'Gemelos',
  'cardiovascular system': 'Cardio',
  delts: 'Hombros',
  forearms: 'Antebrazos',
  glutes: 'Gluteos',
  hamstrings: 'Femoral',
  lats: 'Dorsales',
  'levator scapulae': 'Cuello',
  pectorals: 'Pecho',
  quads: 'Cuadriceps',
  'serratus anterior': 'Serrato',
  spine: 'Lumbares',
  traps: 'Trapecio',
  triceps: 'Triceps',
  'upper back': 'Espalda alta',
  shoulders: 'Hombros',
  chest: 'Pecho',
  back: 'Espalda',
  'lower back': 'Lumbares',
  'hip flexors': 'Flexores de cadera',
  'rear deltoids': 'Deltoides posterior',
  core: 'Core',
  brachialis: 'Braquial',
  obliques: 'Oblicuos',
  rhomboids: 'Romboides',
  'rotator cuff': 'Manguito rotador',
  'wrist extensors': 'Extensores de muneca',
  'wrist flexors': 'Flexores de muneca'
}

export function muscleEs(name: string): string {
  const key = name.trim().toLowerCase()
  return MUSCLE_ES[key] ?? (key.charAt(0).toUpperCase() + key.slice(1))
}

/** Color estable por musculo, para que el mismo grupo se vea igual en toda la app. */
const PALETTE = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6', '#4ade80']

export function muscleColor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export interface MuscleShare {
  muscle: string
  percent: number
  color: string
}

/**
 * Reparto de la carga por grupo muscular.
 *
 * Cada serie aporta 1 punto al musculo principal y 0,4 a cada secundario:
 * los sinergistas trabajan, pero no como el objetivo del ejercicio.
 */
export function muscleDistribution(
  items: Array<{ targetSets: number; exercise: Exercise | undefined }>
): MuscleShare[] {
  const scores = new Map<string, number>()

  for (const { targetSets, exercise } of items) {
    if (!exercise) continue
    const sets = Math.max(1, targetSets)

    const primary = (exercise.target || exercise.category || '').trim()
    if (primary) scores.set(muscleEs(primary), (scores.get(muscleEs(primary)) ?? 0) + sets)

    for (const secondary of exercise.secondaryMuscles ?? []) {
      const label = muscleEs(secondary)
      if (!label) continue
      scores.set(label, (scores.get(label) ?? 0) + sets * 0.4)
    }
  }

  const total = [...scores.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return []

  return [...scores.entries()]
    .map(([muscle, score]) => ({ muscle, percent: Math.round((score / total) * 100), color: muscleColor(muscle) }))
    .filter(s => s.percent >= 1)
    .sort((a, b) => b.percent - a.percent)
}

/**
 * Duracion estimada.
 *
 * En fuerza cada serie son unos 45 s de trabajo mas su descanso. En cardio no
 * hay series que estimar: manda la duracion objetivo de la actividad.
 * Es una estimacion para hacerte una idea, no un cronometro.
 */
type DurationItem = Pick<RoutineItem | WorkoutExercise, 'targetSets' | 'restSeconds'> & {
  targetDurationMin?: number | null
}

export function estimateMinutes(items: DurationItem[]): number {
  const seconds = items.reduce((acc, item) => {
    if (item.targetDurationMin) return acc + item.targetDurationMin * 60
    return acc + item.targetSets * (45 + item.restSeconds)
  }, 0)
  return Math.max(1, Math.round(seconds / 60))
}

/** Nombre a mostrar: el alias en espanol si lo tiene, si no el del dataset. */
export function displayName(exercise: Pick<Exercise, 'name' | 'alias'> | undefined, fallback = ''): string {
  if (!exercise) return fallback
  return exercise.alias?.trim() || exercise.name
}
