// ---------------------------------------------------------------------------
// Metricas corporales derivadas.
//
// Ninguna se guarda: todas se calculan a partir del perfil (altura) y del
// registro del dia (peso, cintura, % graso). Asi, si corriges la altura o un
// peso antiguo, todo el historial se recalcula solo y nunca queda descuadrado.
// ---------------------------------------------------------------------------

export interface Band {
  label: string
  tone: 'good' | 'warn' | 'bad' | 'default'
}

/** Indice de masa corporal: peso entre altura al cuadrado. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null
  const meters = heightCm / 100
  return Number((weightKg / (meters * meters)).toFixed(1))
}

export function bmiBand(value: number | null): Band | null {
  if (value === null) return null
  if (value < 18.5) return { label: 'Bajo peso', tone: 'warn' }
  if (value < 25) return { label: 'Normal', tone: 'good' }
  if (value < 30) return { label: 'Sobrepeso', tone: 'warn' }
  return { label: 'Obesidad', tone: 'bad' }
}

/**
 * Ratio cintura/altura. Por debajo de 0,5 se considera saludable.
 * Es mas fiable que el IMC en quien entrena, porque no confunde musculo con grasa.
 */
export function waistToHeight(waistCm: number | null, heightCm: number | null): number | null {
  if (!waistCm || !heightCm || waistCm <= 0 || heightCm <= 0) return null
  return Number((waistCm / heightCm).toFixed(3))
}

export function waistToHeightBand(value: number | null): Band | null {
  if (value === null) return null
  if (value < 0.4) return { label: 'Por debajo de lo habitual', tone: 'warn' }
  if (value < 0.5) return { label: 'Saludable', tone: 'good' }
  if (value < 0.6) return { label: 'Riesgo aumentado', tone: 'warn' }
  return { label: 'Riesgo alto', tone: 'bad' }
}

export interface Composition {
  leanKg: number
  fatKg: number
  /** kg de musculo por metro cuadrado; sirve para comparar entre pesos */
  ffmi: number | null
}

/**
 * Reparto del peso en masa magra y grasa.
 * En una definicion es lo que hay que mirar: el peso solo no distingue si lo
 * que estas perdiendo es grasa o musculo.
 */
export function composition(
  weightKg: number | null,
  bodyFatPct: number | null,
  heightCm: number | null
): Composition | null {
  if (!weightKg || bodyFatPct === null || bodyFatPct < 0 || bodyFatPct >= 100) return null

  const fatKg = Number((weightKg * (bodyFatPct / 100)).toFixed(1))
  const leanKg = Number((weightKg - fatKg).toFixed(1))

  let ffmi: number | null = null
  if (heightCm && heightCm > 0) {
    const meters = heightCm / 100
    ffmi = Number((leanKg / (meters * meters)).toFixed(1))
  }

  return { leanKg, fatKg, ffmi }
}

/** Edad a partir de la fecha de nacimiento, en anos cumplidos. */
export function ageFrom(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  if (!year || !month || !day) return null

  let age = today.getFullYear() - year
  const hasHadBirthday =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day)
  if (!hasHadBirthday) age -= 1

  return age >= 0 && age < 130 ? age : null
}

export function formatRatio(value: number | null): string {
  return value === null ? '—' : value.toFixed(2).replace('.', ',')
}
