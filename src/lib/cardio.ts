// ---------------------------------------------------------------------------
// Cardio: HIIT, actividades por distancia y deportes.
//
// No todos piden lo mismo. En un HIIT no hay distancia que apuntar, y en una
// salida en bici el ritmo no se teclea: sale de dividir tiempo entre distancia.
// Por eso cada actividad declara que campos tiene sentido rellenar, y la
// pantalla de entreno solo pinta esos.
// ---------------------------------------------------------------------------

export type CardioKind = 'hiit' | 'distance' | 'sport'
export type CardioField = 'duration' | 'distance' | 'kcal' | 'avgHr' | 'maxHr'
/** Como se resume el esfuerzo: min/km, km/h o min/100m (natacion). */
export type PaceStyle = 'pace' | 'speed' | 'pace100'

export const CARDIO_KIND_LABEL: Record<CardioKind, string> = {
  hiit: 'HIIT / intervalos',
  distance: 'Distancia',
  sport: 'Deporte'
}

/** Campos que se piden en cada tipo. Todos son opcionales al rellenar. */
export const CARDIO_FIELDS: Record<CardioKind, CardioField[]> = {
  hiit: ['duration', 'kcal', 'avgHr', 'maxHr'],
  distance: ['duration', 'distance', 'kcal', 'avgHr', 'maxHr'],
  sport: ['duration', 'kcal', 'avgHr', 'maxHr']
}

export const FIELD_LABEL: Record<CardioField, string> = {
  duration: 'Duracion',
  distance: 'Distancia',
  kcal: 'Kcal',
  avgHr: 'FC media',
  maxHr: 'FC max'
}

export const FIELD_UNIT: Record<CardioField, string> = {
  duration: 'min',
  distance: 'km',
  kcal: 'kcal',
  avgHr: 'ppm',
  maxHr: 'ppm'
}

export function fieldsFor(kind: CardioKind | undefined): CardioField[] {
  return CARDIO_FIELDS[kind ?? 'sport']
}

/**
 * Ritmo o velocidad a partir de tiempo y distancia.
 * Devuelve null cuando falta alguno de los dos o la actividad no lo usa.
 */
export function paceLabel(
  durationSec: number | null | undefined,
  distanceKm: number | null | undefined,
  style: PaceStyle | undefined
): string | null {
  if (!style || !durationSec || !distanceKm || durationSec <= 0 || distanceKm <= 0) return null

  if (style === 'speed') {
    const kmh = distanceKm / (durationSec / 3600)
    return `${kmh.toFixed(1)} km/h`
  }

  const perUnit = style === 'pace100'
    ? durationSec / (distanceKm * 10) // por cada 100 m
    : durationSec / distanceKm

  const minutes = Math.floor(perUnit / 60)
  const seconds = Math.round(perUnit % 60)
  const fixed = seconds === 60 ? `${minutes + 1}:00` : `${minutes}:${String(seconds).padStart(2, '0')}`
  return `${fixed} ${style === 'pace100' ? 'min/100m' : 'min/km'}`
}

/** Segundos a "1h 05m" o "45 min", para leerlo de un vistazo. */
export function formatCardioDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}
