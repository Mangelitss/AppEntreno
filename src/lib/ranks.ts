// ---------------------------------------------------------------------------
// Rangos musculares.
//
// La idea de fondo: esto mide **progreso acumulado**, no fuerza maxima. Un
// novato y alguien con anos entrenando pueden llegar los dos a Diamante,
// porque los puntos de progreso van por mejora relativa: subir el curl de 40 a
// 42 kg vale lo mismo que la sentadilla de 100 a 105.
//
// Cada semana un musculo suma hasta 100 puntos:
//
//   Progreso    0-60  superar tu referencia, segun cuanto la superes en %
//   Constancia  0-30  series efectivas, con tope para que el volumen basura no cuente
//   Intensidad  0-10  proporcion de series cerca del fallo
//
// Y puede restar:
//
//   Regresion   0-40  si rindes por debajo de tu referencia habiendo entrenado
//   Abandono     -8%  de lo acumulado por cada semana sin tocar ese musculo
//
// La referencia no es el record historico sino la ventana de las ultimas 16
// semanas. Es lo que evita que una marca de hace dos anos te persiga para
// siempre y que volver de vacaciones cuente como retroceso permanente.
//
// Y hay dos referencias distintas a proposito, porque miden cosas distintas:
//
//   Para progreso   la mejor marca de la ventana. Superar tu mejor dia es
//                   progreso, y punto.
//   Para regresion  la segunda mejor. Asi un pico aislado, o un dedazo
//                   escribiendo 500 en vez de 50, no te condena semanas: para
//                   considerar que has bajado hay que haber estado arriba de
//                   forma repetida, no una vez.
// ---------------------------------------------------------------------------

export type TierName =
  | 'sin-rango' | 'calibrando' | 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante' | 'elite'

export interface Tier {
  name: TierName
  label: string
  color: string
  /** puntos necesarios para cada division, de III a I */
  thresholds: number[]
}

/** Escalera de rangos. Los umbrales son numeros afinables. */
export const TIERS: Tier[] = [
  { name: 'bronce',   label: 'Bronce',   color: '#c08457', thresholds: [100, 200, 300] },
  { name: 'plata',    label: 'Plata',    color: '#cbd5e1', thresholds: [450, 650, 900] },
  { name: 'oro',      label: 'Oro',      color: '#fbbf24', thresholds: [1200, 1600, 2100] },
  { name: 'platino',  label: 'Platino',  color: '#5eead4', thresholds: [2700, 3400, 4200] },
  { name: 'diamante', label: 'Diamante', color: '#7dd3fc', thresholds: [5100, 6100, 7200] },
  { name: 'elite',    label: 'Elite',    color: '#f472b6', thresholds: [8500, 8500, 8500] }
]

export const SIN_RANGO_COLOR = '#3f3f46'
export const CALIBRANDO_COLOR = '#52525b'

/** Semanas de datos antes de poder medir progreso de verdad. */
export const CALIBRATION_WEEKS = 2
/** Ventana movil que sirve de referencia, en semanas. */
export const REFERENCE_WEEKS = 16
/** Caida por debajo de la referencia que se tolera sin penalizar. */
export const REGRESSION_TOLERANCE = 0.05
/** Perdida semanal de puntos por no tocar el musculo. */
export const DECAY_RATE = 0.08

export const MAX_PROGRESS = 60
export const MAX_CONSISTENCY = 30
export const MAX_INTENSITY = 10
export const MAX_REGRESSION = 40
/** Tope de perdida neta en una sola semana, para que un mal dia no hunda un rango. */
export const MAX_WEEKLY_LOSS = 40

export interface WeekMuscleData {
  /** '2026-W34' */
  weekKey: string
  muscle: string
  /** directas 1, secundarias 0,4 */
  effectiveSets: number
  /** mejor 1RM estimado de la semana en ese musculo; 0 si no aplica */
  bestE1rm: number
  /** proporcion de series efectivas con RIR <= 2 */
  intensityRatio: number
}

export interface MuscleRank {
  muscle: string
  points: number
  tier: TierName
  label: string
  color: string
  /** 3, 2 o 1; null si no tiene rango todavia */
  division: number | null
  weeksTrained: number
  /** 0 a 1, lo que llevas hacia la siguiente division */
  progressToNext: number
  pointsToNext: number | null
  weeksIdle: number
}

// ---------------------------------------------------------------------------
// Puntuacion
// ---------------------------------------------------------------------------

/** Puntos por superar la referencia, proporcionales a la mejora relativa. */
export function progressPoints(bestE1rm: number, reference: number): number {
  if (reference <= 0 || bestE1rm <= reference) return 0
  const improvement = (bestE1rm - reference) / reference
  return Math.min(MAX_PROGRESS, Math.round(improvement * 600))
}

/** Puntos por aparecer y hacer series que cuenten, con tope. */
export function consistencyPoints(effectiveSets: number): number {
  return Math.min(MAX_CONSISTENCY, Math.round(effectiveSets * 3))
}

export function intensityPoints(intensityRatio: number): number {
  return Math.round(Math.max(0, Math.min(1, intensityRatio)) * MAX_INTENSITY)
}

/**
 * Penalizacion por rendir por debajo de la referencia.
 *
 * Solo cuenta si de verdad entrenaste el musculo esa semana: si no hay series
 * no hay dato, y castigar la ausencia es cosa del decaimiento, no de esto.
 * Los primeros puntos porcentuales de caida se perdonan porque dormir mal o
 * cambiar de maquina no es rendir peor.
 */
export function regressionPoints(bestE1rm: number, reference: number, effectiveSets: number): number {
  if (reference <= 0 || bestE1rm <= 0 || effectiveSets < 2) return 0

  const drop = (reference - bestE1rm) / reference
  if (drop <= REGRESSION_TOLERANCE) return 0

  return Math.min(MAX_REGRESSION, Math.round((drop - REGRESSION_TOLERANCE) * 400))
}

// ---------------------------------------------------------------------------
// Escalera
// ---------------------------------------------------------------------------

export function tierFor(points: number): { tier: Tier | null; division: number | null } {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const tier = TIERS[i]
    // Las divisiones van de III (menos) a I (mas).
    for (let d = tier.thresholds.length - 1; d >= 0; d--) {
      if (points >= tier.thresholds[d]) {
        return { tier, division: 3 - d }
      }
    }
  }
  return { tier: null, division: null }
}

/** Puntos que faltan para la siguiente division, y cuanto llevas de camino. */
export function nextStep(points: number): { pointsToNext: number | null; progress: number } {
  const steps = TIERS.flatMap(tier => tier.thresholds)
  const previousSteps = [0, ...steps]

  for (let i = 0; i < steps.length; i++) {
    if (points < steps[i]) {
      const from = previousSteps[i]
      const to = steps[i]
      return {
        pointsToNext: to - points,
        progress: to === from ? 0 : (points - from) / (to - from)
      }
    }
  }
  return { pointsToNext: null, progress: 1 }
}

// ---------------------------------------------------------------------------
// Acumulado a lo largo del tiempo
// ---------------------------------------------------------------------------

/** Todas las semanas entre dos claves, incluidas las que no entrenaste. */
export function weeksBetween(from: string, to: string): string[] {
  const weeks: string[] = []
  let current = from
  let guard = 0

  while (current <= to && guard++ < 1000) {
    weeks.push(current)
    current = addWeek(current)
  }
  return weeks
}

export function weekKeyOf(date: Date): string {
  // ISO 8601: la semana 1 es la que contiene el primer jueves del ano.
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - day + 3)

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)

  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function addWeek(weekKey: string): string {
  const [year, week] = weekKey.split('-W').map(Number)
  const monday = mondayOf(year, week)
  monday.setUTCDate(monday.getUTCDate() + 7)
  return weekKeyOf(new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()))
}

function mondayOf(year: number, week: number): Date {
  const firstThursday = new Date(Date.UTC(year, 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  const firstMonday = new Date(firstThursday)
  firstMonday.setUTCDate(firstThursday.getUTCDate() - firstDay)
  firstMonday.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7)
  return firstMonday
}

/**
 * Recorre las semanas en orden acumulando puntos por musculo.
 *
 * Se recorren tambien las semanas vacias, porque el decaimiento por abandono
 * solo tiene sentido si se cuentan las que no apareciste.
 */
export function computeMuscleRanks(data: WeekMuscleData[], todayWeek: string): MuscleRank[] {
  if (data.length === 0) return []

  const byMuscle = new Map<string, Map<string, WeekMuscleData>>()
  for (const entry of data) {
    const weeks = byMuscle.get(entry.muscle) ?? new Map()
    weeks.set(entry.weekKey, entry)
    byMuscle.set(entry.muscle, weeks)
  }

  const firstWeek = data.map(d => d.weekKey).sort()[0]
  const timeline = weeksBetween(firstWeek, todayWeek)

  const ranks: MuscleRank[] = []

  for (const [muscle, weeks] of byMuscle) {
    let points = 0
    let weeksTrained = 0
    let weeksIdle = 0
    /** mejores marcas recientes, para la referencia movil */
    const recent: Array<{ weekKey: string; e1rm: number }> = []

    for (const weekKey of timeline) {
      const entry = weeks.get(weekKey)

      if (!entry || entry.effectiveSets <= 0) {
        points = Math.max(0, points * (1 - DECAY_RATE))
        weeksIdle++
        continue
      }

      weeksIdle = 0
      weeksTrained++

      // Ventana movil, sin contar la semana en curso.
      const cutoff = timeline.indexOf(weekKey) - REFERENCE_WEEKS
      const window = recent
        .filter(r => timeline.indexOf(r.weekKey) >= cutoff)
        .map(r => r.e1rm)
        .sort((a, b) => b - a)

      const bestReference = window[0] ?? 0
      // La segunda mejor: un pico aislado no basta para decir que has bajado.
      const solidReference = window.length >= 3 ? window[1] : bestReference

      const gained =
        progressPoints(entry.bestE1rm, bestReference)
        + consistencyPoints(entry.effectiveSets)
        + intensityPoints(entry.intensityRatio)

      const lost = regressionPoints(entry.bestE1rm, solidReference, entry.effectiveSets)
      const net = Math.max(-MAX_WEEKLY_LOSS, gained - lost)

      points = Math.max(0, points + net)
      if (entry.bestE1rm > 0) recent.push({ weekKey, e1rm: entry.bestE1rm })
    }

    ranks.push(buildRank(muscle, Math.round(points), weeksTrained, weeksIdle))
  }

  return ranks.sort((a, b) => b.points - a.points)
}

function buildRank(muscle: string, points: number, weeksTrained: number, weeksIdle: number): MuscleRank {
  if (weeksTrained === 0) {
    return {
      muscle, points: 0, tier: 'sin-rango', label: 'Sin rango', color: SIN_RANGO_COLOR,
      division: null, weeksTrained, progressToNext: 0, pointsToNext: null, weeksIdle
    }
  }

  if (weeksTrained < CALIBRATION_WEEKS) {
    return {
      muscle, points, tier: 'calibrando', label: 'Calibrando', color: CALIBRANDO_COLOR,
      division: null, weeksTrained, progressToNext: 0, pointsToNext: null, weeksIdle
    }
  }

  const { tier, division } = tierFor(points)
  const { pointsToNext, progress } = nextStep(points)

  if (!tier) {
    return {
      muscle, points, tier: 'sin-rango', label: 'Sin rango', color: SIN_RANGO_COLOR,
      division: null, weeksTrained, progressToNext: progress, pointsToNext, weeksIdle
    }
  }

  return {
    muscle, points, tier: tier.name, label: tier.label, color: tier.color,
    division, weeksTrained, progressToNext: progress, pointsToNext, weeksIdle
  }
}

export const ROMAN = ['', 'I', 'II', 'III']

export function rankLabel(rank: MuscleRank): string {
  if (rank.division === null) return rank.label
  return `${rank.label.toUpperCase()} ${ROMAN[rank.division]}`
}
