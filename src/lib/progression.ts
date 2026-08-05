// ---------------------------------------------------------------------------
// Motor de progresion automatica por RIR.
//
// La regla, en una frase: si en un ejercicio llegas al tope del rango de reps
// en todas las series efectivas y ademas te sobraban reps (RIR >= umbral),
// ese dia cuenta como "listo para subir". Cuando eso pasa N sesiones seguidas
// del mismo ejercicio, la proxima vez el peso aparece ya subido.
//
// Pedir dos sesiones seguidas en vez de una evita que un dia bueno te dispare
// la carga y luego te atasques dos semanas.
// ---------------------------------------------------------------------------

import type { Exercise, ProgressionState, Settings, WorkoutSet } from '../db/types'

/** Series que cuentan: las completadas que no son calentamiento. */
export function effectiveSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets
    .filter(s => !s.deletedAt && s.done === 1 && s.type !== 'warmup')
    .sort((a, b) => a.order - b.order)
}

/**
 * Incremento por defecto deducido del equipamiento del dataset.
 * Devuelve 0 para ejercicios donde subir kg no tiene sentido: ahi se progresa
 * sumando repeticiones.
 */
export function defaultIncrement(exercise: Pick<Exercise, 'equipment' | 'category'>): number {
  const eq = (exercise.equipment || '').toLowerCase()
  const cat = (exercise.category || '').toLowerCase()
  const isLeg = cat.includes('legs')

  if (eq.includes('body weight') || eq === 'assisted' || eq.includes('band')) return 0
  if (eq.includes('barbell') || eq.includes('smith')) return isLeg ? 5 : 2.5
  if (eq.includes('dumbbell') || eq.includes('kettlebell')) return 2
  if (eq.includes('cable') || eq.includes('leverage') || eq.includes('sled') || eq.includes('machine')) return 5
  if (eq.includes('weighted')) return 2.5
  return 2.5
}

export function incrementFor(exercise: Exercise): number {
  return exercise.incrementKg ?? defaultIncrement(exercise)
}

export interface Evaluation {
  /** true si esta sesion cuenta para el streak */
  ready: boolean
  /** null si no habia series validas que evaluar */
  evaluated: boolean
  reason: string
  topWeight: number
  minRir: number | null
}

/**
 * Evalua un ejercicio de una sesion concreta.
 * targetReps = tope del rango (doble progresion: primero subes reps, luego kg).
 */
export function evaluateSession(
  sets: WorkoutSet[],
  targetRepsMax: number,
  rirThreshold: number
): Evaluation {
  const eff = effectiveSets(sets)
  if (eff.length === 0) {
    return { ready: false, evaluated: false, reason: 'Sin series completadas', topWeight: 0, minRir: null }
  }

  const topWeight = Math.max(...eff.map(s => s.weight))
  const rirs = eff.map(s => s.rir).filter((r): r is number => r !== null && r !== undefined)
  const minRir = rirs.length ? Math.min(...rirs) : null

  const allHitTarget = eff.every(s => s.reps >= targetRepsMax)
  if (!allHitTarget) {
    return {
      ready: false, evaluated: true, topWeight, minRir,
      reason: `Aun no llegas a ${targetRepsMax} reps en todas las series`
    }
  }

  // Sin RIR anotado no inventamos nada: cumplir el rango de reps ya basta.
  if (minRir === null) {
    return { ready: true, evaluated: true, topWeight, minRir, reason: 'Rango de reps completado' }
  }

  if (minRir < rirThreshold) {
    return {
      ready: false, evaluated: true, topWeight, minRir,
      reason: `Llegaste al rango pero con RIR ${minRir}, aun exige`
    }
  }

  return {
    ready: true, evaluated: true, topWeight, minRir,
    reason: `Rango completado con RIR ${minRir}, sobra margen`
  }
}

export interface ProgressionOutcome {
  state: ProgressionState
  /** kg que se aplicaran la proxima vez (0 si no toca subir) */
  appliedIncrement: number
  appliedReps: number
  message: string
}

/**
 * Aplica el resultado de una sesion al estado acumulado del ejercicio.
 * Se llama al cerrar el entreno, una vez por ejercicio.
 */
export function applyEvaluation(
  prev: ProgressionState,
  evaluation: Evaluation,
  exercise: Exercise,
  settings: Settings,
  workoutId: string
): ProgressionOutcome {
  const state: ProgressionState = { ...prev, lastWorkoutId: workoutId, lastEvaluatedAt: Date.now(), updatedAt: Date.now() }

  if (!evaluation.evaluated) {
    return { state, appliedIncrement: 0, appliedReps: 0, message: '' }
  }

  if (!evaluation.ready) {
    state.streak = 0
    return { state, appliedIncrement: 0, appliedReps: 0, message: evaluation.reason }
  }

  state.streak = prev.streak + 1

  if (settings.autoProgression !== 1 || state.streak < settings.requiredStreak) {
    const left = Math.max(0, settings.requiredStreak - state.streak)
    return {
      state, appliedIncrement: 0, appliedReps: 0,
      message: left > 0
        ? `Listo para subir. ${left} sesion${left === 1 ? '' : 'es'} mas y sube sola`
        : evaluation.reason
    }
  }

  // Toca subir: se acumula para la proxima vez y el contador vuelve a cero.
  const inc = incrementFor(exercise)
  state.streak = 0
  if (inc > 0) {
    state.pendingWeightKg = prev.pendingWeightKg + inc
    return { state, appliedIncrement: inc, appliedReps: 0, message: `Sube ${inc} kg la proxima vez` }
  }
  state.pendingReps = prev.pendingReps + 1
  return { state, appliedIncrement: 0, appliedReps: 1, message: 'Sube 1 repeticion la proxima vez' }
}

export function emptyProgression(exerciseId: string): ProgressionState {
  return {
    id: exerciseId,
    exerciseId,
    streak: 0,
    lastWorkoutId: null,
    lastEvaluatedAt: null,
    pendingWeightKg: 0,
    pendingReps: 0,
    updatedAt: Date.now(),
    deletedAt: null
  }
}

/** Redondeo a un incremento realista de gimnasio. */
export function roundWeight(kg: number, step = 0.5): number {
  return Math.round(kg / step) * step
}
