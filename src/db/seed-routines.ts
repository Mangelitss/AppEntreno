// ---------------------------------------------------------------------------
// Rutinas de ejemplo para probar la app con datos reales.
//
// El catalogo esta en ingles, asi que cada ejercicio se busca por palabras
// clave en vez de por nombre exacto: `must` son los terminos obligatorios,
// `prefer` desempata y `avoid` descarta variantes parecidas. Si aun asi no
// aparece nada (catalogo minimo, sin descargar), se crea un ejercicio propio
// con los mismos datos musculares para que la distribucion siga siendo real.
// ---------------------------------------------------------------------------

import { db, getSettings } from './db'
import { now, uid } from './repo'
import { normalize } from '../lib/stats'
import type { Exercise, Routine, RoutineItem } from './types'

interface ExerciseSpec {
  /** nombre en espanol que se mostrara en la app */
  alias: string
  /** id exacto del catalogo, para las actividades de cardio */
  fixedId?: string
  /** duracion objetivo en minutos, solo cardio */
  durationMin?: number
  must: string[]
  prefer?: string[]
  avoid?: string[]
  /** datos para crear el ejercicio si no esta en el catalogo */
  fallback: { category: string; equipment: string; target: string; secondary: string[] }
  sets: number
  reps: number
  rest: number
}

interface RoutineSpec {
  name: string
  weekday: number | null
  exercises: ExerciseSpec[]
}

const SQUAT_BULGARIAN = (sets: number, reps: number): ExerciseSpec => ({
  alias: 'Sentadilla Bulgara (Mancuerna)',
  must: ['split', 'squat'],
  prefer: ['dumbbell', 'single leg', 'bulgarian'],
  avoid: ['barbell', 'smith'],
  fallback: { category: 'upper legs', equipment: 'dumbbell', target: 'quads', secondary: ['glutes', 'hamstrings'] },
  sets, reps, rest: 120
})

const HIP_THRUST = (sets: number, reps: number): ExerciseSpec => ({
  alias: 'Hip Thrust (Barra Recta)',
  must: ['hip', 'thrust'],
  prefer: ['barbell'],
  avoid: ['single leg', 'band'],
  fallback: { category: 'upper legs', equipment: 'barbell', target: 'glutes', secondary: ['hamstrings'] },
  sets, reps, rest: 150
})

const cardio = (alias: string, fixedId: string, durationMin: number): ExerciseSpec => ({
  alias,
  fixedId,
  durationMin,
  must: ['__cardio__'], // nunca casa con el catalogo: se resuelve por fixedId
  fallback: { category: 'cardio', equipment: 'cardio', target: 'cardiovascular system', secondary: [] },
  sets: 1, reps: 0, rest: 0
})

export const SEED_ROUTINES: RoutineSpec[] = [
  {
    name: 'Push',
    weekday: 0,
    exercises: [
      {
        alias: 'Elevaciones Laterales Sentado (Mancuerna)',
        must: ['lateral', 'raise'], prefer: ['dumbbell', 'seated'], avoid: ['cable', 'band', 'leverage'],
        fallback: { category: 'shoulders', equipment: 'dumbbell', target: 'delts', secondary: ['traps'] },
        sets: 2, reps: 15, rest: 75
      },
      {
        alias: 'Press De Hombros Sentado (Mancuerna)',
        must: ['shoulder', 'press'], prefer: ['dumbbell', 'seated'], avoid: ['barbell', 'smith', 'cable', 'arnold'],
        fallback: { category: 'shoulders', equipment: 'dumbbell', target: 'delts', secondary: ['triceps'] },
        sets: 2, reps: 10, rest: 150
      },
      {
        alias: 'Press Frances (Mancuerna)',
        must: ['triceps', 'extension'], prefer: ['dumbbell', 'lying'], avoid: ['cable', 'band', 'one arm'],
        fallback: { category: 'upper arms', equipment: 'dumbbell', target: 'triceps', secondary: [] },
        sets: 1, reps: 12, rest: 90
      },
      {
        alias: 'Press De Banca Inclinado (Mancuerna)',
        must: ['incline', 'press'], prefer: ['dumbbell', 'bench'], avoid: ['barbell', 'smith', 'cable', 'fly'],
        fallback: { category: 'chest', equipment: 'dumbbell', target: 'pectorals', secondary: ['delts', 'triceps'] },
        sets: 2, reps: 10, rest: 150
      }
    ]
  },
  {
    name: 'Pull',
    weekday: 1,
    exercises: [
      {
        alias: 'Remo (Barra Recta)',
        must: ['row'], prefer: ['barbell', 'bent over'], avoid: ['cable', 'dumbbell', 'smith', 'lever', 'upright', 'inverted'],
        fallback: { category: 'back', equipment: 'barbell', target: 'upper back', secondary: ['lats', 'biceps'] },
        sets: 1, reps: 9, rest: 180
      },
      {
        alias: 'Dominada Agarre Prono',
        must: ['pull-up'], prefer: [], avoid: ['assisted', 'weighted', 'band', 'machine', 'close'],
        fallback: { category: 'back', equipment: 'body weight', target: 'lats', secondary: ['biceps', 'upper back'] },
        sets: 2, reps: 10, rest: 150
      },
      {
        alias: 'Remo Unilateral Sentado (Cable)',
        must: ['cable', 'row'], prefer: ['one arm', 'seated'], avoid: ['upright', 'standing'],
        fallback: { category: 'back', equipment: 'cable', target: 'upper back', secondary: ['lats', 'biceps'] },
        sets: 1, reps: 10, rest: 120
      },
      {
        alias: 'Curl Martillo Bilateral (Mancuerna)',
        must: ['hammer', 'curl'], prefer: ['dumbbell'], avoid: ['cable', 'incline', 'one arm', 'seated'],
        fallback: { category: 'upper arms', equipment: 'dumbbell', target: 'biceps', secondary: ['forearms'] },
        sets: 1, reps: 12, rest: 90
      },
      {
        alias: 'Curl Bayesian Unilateral (Polea Baja)',
        must: ['cable', 'curl'], prefer: ['one arm'], avoid: ['hammer', 'preacher', 'lying', 'overhead', 'triceps', 'wrist'],
        fallback: { category: 'upper arms', equipment: 'cable', target: 'biceps', secondary: ['forearms'] },
        sets: 1, reps: 10, rest: 90
      }
    ]
  },
  {
    name: 'Pierna A',
    weekday: 2,
    exercises: [
      {
        alias: 'Sentadilla Barra Alta (Maquina Smith)',
        must: ['smith', 'squat'], prefer: ['full'], avoid: ['split', 'single leg', 'hack'],
        fallback: { category: 'upper legs', equipment: 'smith machine', target: 'quads', secondary: ['glutes', 'hamstrings'] },
        sets: 3, reps: 9, rest: 180
      },
      SQUAT_BULGARIAN(3, 20),
      HIP_THRUST(3, 10),
      {
        alias: 'Curl Femoral Tumbado (Maquina)',
        must: ['leg', 'curl'], prefer: ['lying', 'lever'], avoid: ['seated', 'standing', 'band', 'ball'],
        fallback: { category: 'upper legs', equipment: 'leverage machine', target: 'hamstrings', secondary: ['calves'] },
        sets: 3, reps: 12, rest: 90
      },
      {
        alias: 'Elevacion De Talones De Pie',
        must: ['calf', 'raise'], prefer: ['standing'], avoid: ['seated', 'single leg', 'one leg', 'donkey'],
        fallback: { category: 'lower legs', equipment: 'leverage machine', target: 'calves', secondary: [] },
        sets: 2, reps: 15, rest: 60
      }
    ]
  },
  {
    name: 'Pierna B',
    weekday: 4,
    exercises: [
      {
        alias: 'Sentadilla (Barra Alta)',
        must: ['barbell', 'squat'], prefer: ['full'], avoid: ['smith', 'front', 'jump', 'split', 'single leg', 'sumo'],
        fallback: { category: 'upper legs', equipment: 'barbell', target: 'glutes', secondary: ['quads', 'hamstrings', 'calves'] },
        sets: 2, reps: 15, rest: 180
      },
      SQUAT_BULGARIAN(2, 12),
      HIP_THRUST(1, 12),
      {
        alias: 'Peso Muerto Rumano (Mancuerna)',
        must: ['deadlift'], prefer: ['dumbbell', 'romanian', 'stiff'], avoid: ['barbell', 'smith', 'single leg', 'sumo'],
        fallback: { category: 'upper legs', equipment: 'dumbbell', target: 'hamstrings', secondary: ['glutes', 'spine'] },
        sets: 2, reps: 10, rest: 150
      },
      {
        alias: 'Elevaciones De Talones Unilateral (Mancuerna)',
        must: ['calf', 'raise'], prefer: ['dumbbell', 'single leg', 'one leg'], avoid: ['seated', 'donkey', 'lever'],
        fallback: { category: 'lower legs', equipment: 'dumbbell', target: 'calves', secondary: [] },
        sets: 2, reps: 15, rest: 60
      }
    ]
  },
  {
    name: 'Cardio',
    weekday: 3,
    exercises: [
      cardio('HIIT', 'cardio-hiit', 20),
      cardio('Bicicleta', 'cardio-bici', 45)
    ]
  }
]

/** Puntua un ejercicio del catalogo frente a una especificacion. */
export function scoreMatch(exercise: Pick<Exercise, 'name' | 'search'>, spec: ExerciseSpec): number {
  const haystack = `${exercise.search} ${normalize(exercise.name)}`
  if (!spec.must.every(term => haystack.includes(normalize(term)))) return -1
  if ((spec.avoid ?? []).some(term => haystack.includes(normalize(term)))) return -1

  let score = 10
  for (const term of spec.prefer ?? []) if (haystack.includes(normalize(term))) score += 4
  // A igualdad de terminos, gana el nombre mas corto: suele ser la variante base.
  score -= exercise.name.length * 0.02
  return score
}

export function bestMatch<T extends Pick<Exercise, 'name' | 'search'>>(catalog: T[], spec: ExerciseSpec): T | null {
  let best: T | null = null
  let bestScore = 0
  for (const exercise of catalog) {
    const score = scoreMatch(exercise, spec)
    if (score > bestScore) { best = exercise; bestScore = score }
  }
  return best
}

async function resolveExercise(catalog: Exercise[], spec: ExerciseSpec): Promise<string> {
  if (spec.fixedId) {
    const known = catalog.find(e => e.id === spec.fixedId)
    if (known) return known.id
  }

  const match = bestMatch(catalog, spec)
  if (match) {
    // Le colgamos el nombre en espanol sin tocar el del dataset.
    if (match.alias !== spec.alias) {
      await db.exercises.update(match.id, { alias: spec.alias, updatedAt: now() })
    }
    return match.id
  }

  // No esta en el catalogo: lo creamos propio, reutilizando el de una siembra anterior.
  const existing = catalog.find(e => e.isCustom === 1 && e.alias === spec.alias)
  if (existing) return existing.id

  const exercise: Exercise = {
    id: uid(),
    name: spec.alias,
    alias: spec.alias,
    search: normalize([spec.alias, ...spec.must, spec.fallback.target, spec.fallback.equipment].join(' ')),
    category: spec.fallback.category,
    equipment: spec.fallback.equipment,
    target: spec.fallback.target,
    secondaryMuscles: spec.fallback.secondary,
    instructions: [],
    image: null,
    gif: null,
    isCustom: 1,
    favorite: 0,
    incrementKg: null,
    updatedAt: now(),
    deletedAt: null
  }
  await db.exercises.put(exercise)
  catalog.push(exercise)
  return exercise.id
}

export interface SeedResult {
  created: string[]
  skipped: string[]
  fromCatalog: number
  custom: number
}

/**
 * Crea las rutinas de ejemplo y las asigna a sus dias.
 * Si una rutina con ese nombre ya existe, se salta: puedes ejecutarlo dos veces
 * sin acabar con ocho rutinas.
 */
export async function seedExampleRoutines(): Promise<SeedResult> {
  const settings = await getSettings()
  const catalog = (await db.exercises.toArray()).filter(e => !e.deletedAt)
  const existingNames = new Set(
    (await db.routines.toArray()).filter(r => !r.deletedAt).map(r => r.name.toLowerCase())
  )

  const result: SeedResult = { created: [], skipped: [], fromCatalog: 0, custom: 0 }
  let order = (await db.routines.count())

  for (const spec of SEED_ROUTINES) {
    if (existingNames.has(spec.name.toLowerCase())) {
      result.skipped.push(spec.name)
      continue
    }

    const routine: Routine = {
      id: uid(), name: spec.name, notes: '', order: order++, archived: 0,
      updatedAt: now(), deletedAt: null
    }
    await db.routines.put(routine)

    const items: RoutineItem[] = []
    for (const [index, exerciseSpec] of spec.exercises.entries()) {
      const before = catalog.length
      const exerciseId = await resolveExercise(catalog, exerciseSpec)
      if (catalog.length > before) result.custom++; else result.fromCatalog++

      const isCardio = Boolean(exerciseSpec.durationMin)

      items.push({
        id: uid(),
        routineId: routine.id,
        exerciseId,
        order: index,
        targetSets: exerciseSpec.sets,
        targetRepsMin: exerciseSpec.reps,
        // Rango de 2 reps: primero cierras el rango, luego sube el peso.
        targetRepsMax: isCardio ? 0 : exerciseSpec.reps + 2,
        restSeconds: isCardio ? 0 : (exerciseSpec.rest || settings.defaultRestSeconds),
        targetDurationMin: exerciseSpec.durationMin ?? null,
        notes: '',
        updatedAt: now(),
        deletedAt: null
      })
    }
    await db.routineItems.bulkPut(items)

    if (spec.weekday !== null) {
      await db.schedule.put({
        id: `wd-${spec.weekday}`, weekday: spec.weekday, routineId: routine.id,
        updatedAt: now(), deletedAt: null
      })
    }
    result.created.push(spec.name)
  }

  return result
}
