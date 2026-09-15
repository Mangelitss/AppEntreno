// ---------------------------------------------------------------------------
// Trabajo por musculo en un rango de fechas.
//
// Es la pieza que comparten los rangos (rank-data) y el modulo de estadisticas:
// como se reparte una serie entre el musculo objetivo y los secundarios, y como
// se agrega ese trabajo por musculo y por grupo. Asi la cuenta de "series por
// musculo" es la misma en toda la app y no se duplica la logica.
// ---------------------------------------------------------------------------

import { db } from '../db/db'
import { epley1RM } from './stats'
import { isRankable, groupOf, MUSCLE_GROUPS } from './muscle-groups'
import type { Exercise } from '../db/types'

/** Lo que aporta una serie a un musculo secundario frente al objetivo. */
export const SECONDARY_WEIGHT = 0.4

export interface MuscleContribution {
  muscle: string
  /** cuanto suma esta serie a ese musculo: 1 el objetivo, 0,4 cada secundario */
  share: number
  /** true solo para el musculo objetivo del ejercicio */
  direct: boolean
}

/** Reparto de una serie de un ejercicio entre su objetivo (1) y sus secundarios (0,4). */
export function muscleContributions(
  exercise: Pick<Exercise, 'target' | 'secondaryMuscles'>
): MuscleContribution[] {
  const out: MuscleContribution[] = []
  if (exercise.target) out.push({ muscle: exercise.target, share: 1, direct: true })
  for (const secondary of exercise.secondaryMuscles ?? []) {
    out.push({ muscle: secondary, share: SECONDARY_WEIGHT, direct: false })
  }
  return out
}

export interface MuscleWork {
  /** series efectivas ponderadas (directas 1, secundarias 0,4) */
  effectiveSets: number
  /** volumen (kg·reps) atribuido a ese musculo, ponderado igual */
  volume: number
  /** mejor 1RM estimado, solo desde el musculo objetivo */
  bestE1rm: number
  /** numero de series en las que aparece, sin ponderar */
  totalSets: number
}

/**
 * Trabajo por musculo entre dos fechas (YYYY-MM-DD, ambas incluidas).
 *
 * Mismos filtros que el motor de rangos: entrenos terminados, series completadas
 * que no son calentamiento, y sin cardio (no hay carga que repartir).
 */
export async function muscleWorkInRange(fromKey: string, toKey: string): Promise<Map<string, MuscleWork>> {
  const workouts = (await db.workouts.toArray()).filter(
    w => !w.deletedAt && w.finishedAt && w.dateKey >= fromKey && w.dateKey <= toKey
  )
  const inRange = new Set(workouts.map(w => w.id))
  if (inRange.size === 0) return new Map()

  const exercises = new Map((await db.exercises.toArray()).map(e => [e.id, e]))
  const sets = (await db.sets.toArray()).filter(
    s => !s.deletedAt && s.done === 1 && s.type !== 'warmup' && inRange.has(s.workoutId)
  )

  const result = new Map<string, MuscleWork>()
  const bump = (muscle: string, share: number, direct: boolean, e1rm: number, volume: number) => {
    if (!isRankable(muscle)) return
    const key = muscle.trim().toLowerCase()
    const w = result.get(key) ?? { effectiveSets: 0, volume: 0, bestE1rm: 0, totalSets: 0 }
    w.effectiveSets += share
    w.totalSets += 1
    w.volume += volume * share
    if (direct) w.bestE1rm = Math.max(w.bestE1rm, e1rm)
    result.set(key, w)
  }

  for (const set of sets) {
    const exercise = exercises.get(set.exerciseId)
    if (!exercise || exercise.tracking === 'cardio') continue
    const e1rm = epley1RM(set.weight, set.reps)
    const volume = set.weight * set.reps
    for (const c of muscleContributions(exercise)) bump(c.muscle, c.share, c.direct, e1rm, volume)
  }
  return result
}

export interface GroupWork {
  id: string
  label: string
  effectiveSets: number
}

/** Suma las series efectivas por grupo muscular (los 6 de MUSCLE_GROUPS), en su orden. */
export function groupWork(perMuscle: Map<string, MuscleWork>): GroupWork[] {
  const totals = new Map<string, number>()
  for (const [muscle, w] of perMuscle) {
    const group = groupOf(muscle)
    if (!group) continue
    totals.set(group.id, (totals.get(group.id) ?? 0) + w.effectiveSets)
  }
  return MUSCLE_GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    effectiveSets: Math.round((totals.get(g.id) ?? 0) * 10) / 10
  }))
}

export interface PeriodSummary {
  workouts: number
  durationMs: number
  volume: number
  sets: number
}

/** Resumen de actividad de un rango: entrenos, duracion, volumen y series. */
export async function periodSummary(fromKey: string, toKey: string): Promise<PeriodSummary> {
  const workouts = (await db.workouts.toArray()).filter(
    w => !w.deletedAt && w.finishedAt && w.dateKey >= fromKey && w.dateKey <= toKey
  )
  const ids = new Set(workouts.map(w => w.id))
  const sets = (await db.sets.toArray()).filter(
    s => !s.deletedAt && s.done === 1 && s.type !== 'warmup' && ids.has(s.workoutId)
  )

  let durationMs = 0
  for (const w of workouts) durationMs += (w.finishedAt ?? 0) - w.startedAt
  let volume = 0
  for (const s of sets) volume += s.weight * s.reps

  return { workouts: workouts.length, durationMs, volume: Math.round(volume), sets: sets.length }
}

/**
 * Escala de calor para t en [0,1]: verde (poco) hasta rojo (mucho), pasando por
 * lima, amarillo y naranja. Se interpola en RGB entre varias paradas para que
 * haya muchos tonos intermedios y el salto verde->rojo sea gradual.
 * t = 0 o sin datos devuelve el gris base del mapa corporal, para que un
 * musculo sin trabajo se vea como en una lamina de anatomia.
 */
const HEAT_STOPS: [number, number, number][] = [
  [22, 163, 74],   // verde
  [101, 163, 13],  // verde lima
  [163, 190, 20],  // lima
  [202, 178, 20],  // amarillo verdoso
  [234, 179, 8],   // amarillo
  [245, 158, 11],  // ambar
  [249, 115, 22],  // naranja
  [239, 88, 50],   // naranja rojizo
  [220, 38, 38]    // rojo
]

export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  if (x <= 0) return '#d4d4d8'
  const seg = x * (HEAT_STOPS.length - 1)
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(seg))
  const f = seg - i
  const a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1]
  const ch = (k: 0 | 1 | 2) => Math.round(a[k] + (b[k] - a[k]) * f)
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`
}
