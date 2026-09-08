// ---------------------------------------------------------------------------
// Objetivo de peso.
//
// Todo se mide contra el peso de partida que se congelo al fijar el objetivo,
// no contra el primer registro del historial: asi el porcentaje no cambia solo
// porque anotes un peso viejo. La direccion (perder, ganar, mantener) se deduce
// de comparar objetivo y partida.
// ---------------------------------------------------------------------------

import type { BodyEntry, WeightGoal } from '../db/types'
import { dayNumber, shiftDateKey } from './streak'

export type GoalDirection = 'perder' | 'ganar' | 'mantener'

export function goalDirection(goal: WeightGoal): GoalDirection {
  if (goal.targetWeightKg < goal.startWeightKg) return 'perder'
  if (goal.targetWeightKg > goal.startWeightKg) return 'ganar'
  return 'mantener'
}

export const DIRECTION_LABEL: Record<GoalDirection, string> = {
  perder: 'Perder peso',
  ganar: 'Ganar peso',
  mantener: 'Mantener peso'
}

export interface GoalStats {
  direction: GoalDirection
  /** ultimo peso anotado, o null si no hay ninguno */
  current: number | null
  /** kg totales entre partida y objetivo */
  totalKg: number
  /** kg ya conseguidos en la buena direccion (nunca negativo) */
  doneKg: number
  /** kg que faltan hasta el objetivo */
  remainingKg: number
  /** avance para barras, recortado a 0..100 */
  percent: number
  /** avance real: puede pasar de 100 o ser negativo si vas al reves */
  rawPercent: number
  reached: boolean
  /** dias hasta la fecha limite; null si no hay plazo */
  daysLeft: number | null
  /** donde deberias ir hoy si el avance fuese lineal hasta el plazo */
  onSchedulePercent: number | null
  /** ritmo reciente en kg por semana (con signo) */
  perWeekKg: number | null
  /** fecha estimada de llegada al ritmo actual */
  projectedDateKey: string | null
}

function weightsSorted(entries: BodyEntry[]): { dateKey: string; kg: number }[] {
  return entries
    .filter(e => e.weightKg != null)
    .map(e => ({ dateKey: e.dateKey, kg: e.weightKg as number }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

export function goalStats(goal: WeightGoal, entries: BodyEntry[], todayKey: string): GoalStats {
  const direction = goalDirection(goal)
  const weights = weightsSorted(entries)
  const last = weights[weights.length - 1] ?? null
  const current = last?.kg ?? null

  const span = goal.targetWeightKg - goal.startWeightKg // con signo
  const totalKg = Math.abs(span)

  const rawPercent = current == null ? 0
    : span === 0 ? (Math.abs(current - goal.targetWeightKg) < 0.25 ? 100 : 0)
    : ((current - goal.startWeightKg) / span) * 100
  const percent = Math.max(0, Math.min(100, rawPercent))

  const doneKg = current == null || span === 0 ? 0
    : Math.max(0, (current - goal.startWeightKg) * Math.sign(span))
  const remainingKg = current == null ? totalKg : Math.max(0, Math.abs(goal.targetWeightKg - current))

  const reached = current != null && (
    direction === 'perder' ? current <= goal.targetWeightKg
      : direction === 'ganar' ? current >= goal.targetWeightKg
      : Math.abs(current - goal.targetWeightKg) < 0.25
  )

  // Ritmo: cuanto has cambiado desde la partida hasta el ultimo peso.
  const daysElapsed = dayNumber(last?.dateKey ?? todayKey) - dayNumber(goal.startDateKey)
  const changed = current == null ? 0 : current - goal.startWeightKg
  const perWeekKg = daysElapsed > 0 ? (changed / daysElapsed) * 7 : null

  // Plazo.
  const daysLeft = goal.targetDateKey ? dayNumber(goal.targetDateKey) - dayNumber(todayKey) : null
  let onSchedulePercent: number | null = null
  if (goal.targetDateKey) {
    const totalDays = dayNumber(goal.targetDateKey) - dayNumber(goal.startDateKey)
    const elapsed = dayNumber(todayKey) - dayNumber(goal.startDateKey)
    onSchedulePercent = totalDays > 0 ? Math.max(0, Math.min(100, (elapsed / totalDays) * 100)) : null
  }

  // Proyeccion: a este ritmo, cuando llegarias.
  let projectedDateKey: string | null = null
  if (current != null && perWeekKg && span !== 0 && Math.sign(perWeekKg) === Math.sign(span) && !reached) {
    const weeksNeeded = (goal.targetWeightKg - current) / perWeekKg
    if (weeksNeeded > 0 && Number.isFinite(weeksNeeded)) {
      projectedDateKey = shiftDateKey(todayKey, Math.round(weeksNeeded * 7))
    }
  }

  return {
    direction, current, totalKg, doneKg, remainingKg,
    percent, rawPercent, reached, daysLeft, onSchedulePercent, perWeekKg, projectedDateKey
  }
}

/** Un punto de % de avance por cada registro de peso, para la grafica. */
export function goalSeries(goal: WeightGoal, entries: BodyEntry[]): { dateKey: string; percent: number }[] {
  const span = goal.targetWeightKg - goal.startWeightKg
  if (span === 0) return []
  return weightsSorted(entries).map(w => ({
    dateKey: w.dateKey,
    percent: ((w.kg - goal.startWeightKg) / span) * 100
  }))
}

/** Frase corta sobre si vas adelantado, justo o retrasado respecto al plazo. */
export function goalPace(stats: GoalStats): { label: string; tone: 'good' | 'warn' | 'bad' | 'default' } {
  if (stats.reached) return { label: 'Objetivo cumplido', tone: 'good' }
  if (stats.current == null) return { label: 'Anota tu peso para empezar', tone: 'default' }
  if (stats.rawPercent < 0) return { label: 'De momento vas en direccion contraria', tone: 'bad' }
  if (stats.onSchedulePercent == null) return { label: 'Sin plazo: a tu ritmo', tone: 'default' }
  const diff = stats.rawPercent - stats.onSchedulePercent
  if (diff >= 5) return { label: 'Vas por delante del plan', tone: 'good' }
  if (diff <= -10) return { label: 'Vas por detras del plan', tone: 'bad' }
  return { label: 'Vas en el plan', tone: 'warn' }
}
