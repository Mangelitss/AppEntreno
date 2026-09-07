// ---------------------------------------------------------------------------
// Racha de entrenos.
//
// La regla: puedes descansar hasta dos dias seguidos. Al tercer dia sin pisar
// el gimnasio se rompe. Dicho al reves, entre dos entrenos puede haber como
// mucho 3 dias de diferencia.
//
//   L entreno · M descanso · X descanso · J entreno   -> aguanta (hueco de 3)
//   L entreno · M, X, J descanso · V entreno          -> rota (hueco de 4)
//
// Todo se calcula sobre dias naturales, no sobre horas: entrenar a las 23:50 y
// al dia siguiente a las 00:10 son dos dias distintos.
// ---------------------------------------------------------------------------

/** Dias de hueco maximo entre dos entrenos para que la racha siga viva. */
export const MAX_GAP_DAYS = 3

/** Dias que puedes echar la vista atras para registrar un entreno olvidado. */
export const BACKFILL_DAYS = 7

/** Convierte YYYY-MM-DD en numero de dia, para restar fechas sin liarse con horarios de verano. */
export function dayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

export function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(dayNumber(dateKey) * 86_400_000 + days * 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`
}

export interface Streak {
  /** dias distintos entrenados dentro de la racha actual */
  days: number
  /** sigue viva; si es false, days vale 0 */
  alive: boolean
  trainedToday: boolean
  lastDayKey: string | null
  startedOn: string | null
  daysSinceLast: number
  /** dias que te quedan para entrenar antes de perderla; 0 = hoy es el ultimo */
  daysLeft: number
  /** la mejor racha que has tenido nunca, para no perderla de vista */
  best: number
}

const EMPTY: Streak = {
  days: 0, alive: false, trainedToday: false, lastDayKey: null,
  startedOn: null, daysSinceLast: Infinity, daysLeft: 0, best: 0
}

/** Longitud de cada racha del historial, en dias entrenados. */
function runs(sortedDays: number[]): number[][] {
  const result: number[][] = []
  let current: number[] = []
  for (const day of sortedDays) {
    if (current.length === 0 || day - current[current.length - 1] <= MAX_GAP_DAYS) {
      current.push(day)
    } else {
      result.push(current)
      current = [day]
    }
  }
  if (current.length) result.push(current)
  return result
}

export function computeStreak(trainingDayKeys: string[], todayKey: string): Streak {
  const unique = [...new Set(trainingDayKeys)].sort()
  if (unique.length === 0) return EMPTY

  const days = unique.map(dayNumber)
  const today = dayNumber(todayKey)

  // Los dias futuros no cuentan: solo pueden aparecer si se toca el reloj.
  const past = days.filter(day => day <= today)
  if (past.length === 0) return EMPTY

  const all = runs(past)
  const best = Math.max(...all.map(run => run.length))
  const last = all[all.length - 1]
  const lastDay = last[last.length - 1]
  const daysSinceLast = today - lastDay
  const alive = daysSinceLast <= MAX_GAP_DAYS

  const toKey = (day: number) => {
    const date = new Date(day * 86_400_000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`
  }

  return {
    days: alive ? last.length : 0,
    alive,
    trainedToday: daysSinceLast === 0,
    lastDayKey: toKey(lastDay),
    startedOn: alive ? toKey(last[0]) : null,
    daysSinceLast,
    daysLeft: alive ? MAX_GAP_DAYS - daysSinceLast : 0,
    best
  }
}

/** Las fechas validas para registrar un entreno olvidado, de ayer hacia atras. */
export function backfillDates(todayKey: string): string[] {
  return Array.from({ length: BACKFILL_DAYS }, (_, i) => shiftDateKey(todayKey, -(i + 1)))
}
