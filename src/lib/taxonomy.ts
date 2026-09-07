// ---------------------------------------------------------------------------
// Valores validos de grupo muscular, material y musculos.
//
// El dataset guarda estos campos en ingles y en minusculas. Escribirlos a mano
// es la mejor forma de romperlo: "hombro" y "shoulders" son cosas distintas
// para la app, y el ejercicio dejaria de agruparse y de contar en la
// distribucion muscular.
//
// Por eso aqui hay una lista canonica con lo que el dataset usa de verdad. A
// esa lista se le suma lo que haya en tu catalogo, asi que aunque aparezca un
// material que no previmos, seguira estando disponible para el resto.
// ---------------------------------------------------------------------------

/** Grupos (el campo `category` / `body_part` del dataset). */
export const CATEGORIES = [
  'back', 'cardio', 'chest', 'lower arms', 'lower legs',
  'neck', 'shoulders', 'upper arms', 'upper legs', 'waist'
]

/** Material (`equipment`). */
export const EQUIPMENT = [
  'assisted', 'band', 'barbell', 'body weight', 'bosu ball', 'cable', 'dumbbell',
  'elliptical machine', 'ez barbell', 'hammer', 'kettlebell', 'leverage machine',
  'medicine ball', 'olympic barbell', 'resistance band', 'roller', 'rope',
  'skierg machine', 'sled machine', 'smith machine', 'stability ball',
  'stationary bike', 'stepmill machine', 'tire', 'trap bar',
  'upper body ergometer', 'weighted', 'wheel roller'
]

/** Musculos, tanto objetivo como secundarios. */
export const MUSCLES = [
  'abductors', 'abs', 'adductors', 'biceps', 'brachialis', 'calves',
  'cardiovascular system', 'core', 'delts', 'forearms', 'glutes', 'hamstrings',
  'hip flexors', 'lats', 'levator scapulae', 'lower back', 'obliques',
  'pectorals', 'quads', 'rhomboids', 'rotator cuff', 'serratus anterior',
  'spine', 'traps', 'triceps', 'upper back', 'wrist extensors', 'wrist flexors'
]

/** Traduccion de los materiales, solo como pista al elegir. */
const EQUIPMENT_ES: Record<string, string> = {
  assisted: 'Asistido',
  band: 'Goma',
  barbell: 'Barra',
  'body weight': 'Peso corporal',
  'bosu ball': 'Bosu',
  cable: 'Polea',
  dumbbell: 'Mancuerna',
  'elliptical machine': 'Eliptica',
  'ez barbell': 'Barra Z',
  hammer: 'Martillo',
  kettlebell: 'Kettlebell',
  'leverage machine': 'Maquina',
  'medicine ball': 'Balon medicinal',
  'olympic barbell': 'Barra olimpica',
  'resistance band': 'Banda elastica',
  roller: 'Rodillo',
  rope: 'Cuerda',
  'skierg machine': 'SkiErg',
  'sled machine': 'Prensa de trineo',
  'smith machine': 'Multipower',
  'stability ball': 'Fitball',
  'stationary bike': 'Bici estatica',
  'stepmill machine': 'Escaladora',
  tire: 'Rueda',
  'trap bar': 'Barra hexagonal',
  'upper body ergometer': 'Ergometro de brazos',
  weighted: 'Con lastre',
  'wheel roller': 'Rueda abdominal',
  cardio: 'Cardio',
  deporte: 'Deporte'
}

const CATEGORY_ES: Record<string, string> = {
  back: 'Espalda',
  cardio: 'Cardio',
  chest: 'Pecho',
  'lower arms': 'Antebrazos',
  'lower legs': 'Pierna inferior',
  neck: 'Cuello',
  shoulders: 'Hombros',
  'upper arms': 'Brazos',
  'upper legs': 'Pierna',
  waist: 'Core'
}

export function categoryEs(value: string): string {
  return CATEGORY_ES[value.trim().toLowerCase()] ?? ''
}

export function equipmentEs(value: string): string {
  return EQUIPMENT_ES[value.trim().toLowerCase()] ?? ''
}

/**
 * Une la lista canonica con lo que ya exista en el catalogo.
 * Ordena alfabeticamente y quita duplicados y vacios.
 */
export function mergeOptions(canonical: string[], fromCatalog: Iterable<string>): string[] {
  const all = new Set(canonical)
  for (const value of fromCatalog) {
    const clean = value?.trim().toLowerCase()
    if (clean) all.add(clean)
  }
  return [...all].sort()
}
