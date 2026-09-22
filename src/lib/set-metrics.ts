// ---------------------------------------------------------------------------
// Como cuenta cada serie segun su tipo (normal / al fallo / dropset).
//
// Un mismo dato (peso, reps) pesa distinto en intensidad y en estimulo segun
// como la hiciste. Aqui vive esa traduccion, para que el motor de rangos y la
// progresion la compartan y no se descuadren.
// ---------------------------------------------------------------------------

import type { WorkoutSet } from '../db/types'

/**
 * RIR que cuenta para intensidad y progresion.
 *
 * Al fallo (F) y dropset (D) llegan al fallo por definicion, asi que valen
 * RIR 0 aunque no anotes nada en el campo. El resto usa lo que apuntaste
 * (null = sin dato, no se inventa).
 */
export function effectiveRir(set: Pick<WorkoutSet, 'rir' | 'type'>): number | null {
  if (set.type === 'failure' || set.type === 'drop') return 0
  return set.rir ?? null
}

/**
 * Cuanto estimulo aporta una serie, medido en "series efectivas".
 *
 * Un dropset no termina en el fallo: baja el peso (tipicamente 5-10 kg) y sigue,
 * asi que acumula mas trabajo que una serie normal o una al fallo seca. Por eso
 * cuenta como algo mas de una serie para los rangos.
 */
export const DROPSET_STIMULUS = 1.5

export function setStimulus(set: Pick<WorkoutSet, 'type'>): number {
  return set.type === 'drop' ? DROPSET_STIMULUS : 1
}
