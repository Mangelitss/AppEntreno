import type { WorkoutSet } from '../db/types'
import { effectiveSets } from './progression'

/** 1RM estimado (Epley). Sirve para comparar series de distinto rango. */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function setVolume(s: WorkoutSet): number {
  return s.weight * s.reps
}

export function totalVolume(sets: WorkoutSet[]): number {
  return effectiveSets(sets).reduce((acc, s) => acc + setVolume(s), 0)
}

export interface ExercisePR {
  maxWeight: number
  maxReps: number
  best1RM: number
  bestVolume: number
}

export function computePR(sets: WorkoutSet[]): ExercisePR {
  const eff = effectiveSets(sets)
  if (!eff.length) return { maxWeight: 0, maxReps: 0, best1RM: 0, bestVolume: 0 }
  return {
    maxWeight: Math.max(...eff.map(s => s.weight)),
    maxReps: Math.max(...eff.map(s => s.reps)),
    best1RM: Math.max(...eff.map(s => epley1RM(s.weight, s.reps))),
    bestVolume: Math.max(...eff.map(setVolume))
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.0', '')
}

export function formatDateEs(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
