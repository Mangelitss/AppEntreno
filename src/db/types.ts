// ---------------------------------------------------------------------------
// Modelo de datos.
//
// Todas las entidades que crea el usuario extienden Syncable: id uuid,
// updatedAt y deletedAt. Eso es lo que permitira enchufar Supabase mas
// adelante sin tocar ni una pantalla: el sync empuja lo que tenga updatedAt
// mayor que el ultimo push, y los borrados son logicos para que se propaguen.
// ---------------------------------------------------------------------------

export type ID = string

export interface Syncable {
  id: ID
  updatedAt: number // epoch ms
  deletedAt: number | null
}

/** Ejercicio del catalogo (dataset) o creado por ti. */
export interface Exercise extends Syncable {
  name: string
  /** minusculas sin acentos, para busqueda */
  search: string
  category: string
  equipment: string
  target: string
  secondaryMuscles: string[]
  /** instrucciones paso a paso en espanol */
  instructions: string[]
  image: string | null
  gif: string | null
  isCustom: 0 | 1
  favorite: 0 | 1
  /** incremento manual en kg; si es null se deduce del equipamiento */
  incrementKg: number | null
}

/** Plantilla de entrenamiento. */
export interface Routine extends Syncable {
  name: string
  notes: string
  order: number
  archived: 0 | 1
}

/** Un ejercicio dentro de una rutina. */
export interface RoutineItem extends Syncable {
  routineId: ID
  exerciseId: ID
  order: number
  targetSets: number
  targetRepsMin: number
  targetRepsMax: number
  restSeconds: number
  notes: string
}

/** Que rutina toca cada dia. weekday: 0 = lunes ... 6 = domingo. */
export interface ScheduleDay extends Syncable {
  weekday: number
  routineId: ID | null
}

/**
 * Un entrenamiento real. Copia congelada: guarda el nombre de la rutina y de
 * los ejercicios en el momento de hacerlo, para que editar una rutina en marzo
 * no reescriba lo que hiciste en febrero.
 */
export interface Workout extends Syncable {
  routineId: ID | null
  routineName: string
  startedAt: number
  finishedAt: number | null
  notes: string
  dateKey: string // YYYY-MM-DD
}

export interface WorkoutExercise extends Syncable {
  workoutId: ID
  exerciseId: ID
  exerciseName: string
  order: number
  targetSets: number
  targetRepsMin: number
  targetRepsMax: number
  restSeconds: number
  notes: string
}

export type SetType = 'warmup' | 'normal' | 'failure' | 'drop'

export interface WorkoutSet extends Syncable {
  workoutId: ID
  workoutExerciseId: ID
  exerciseId: ID
  order: number
  weight: number
  reps: number
  /** reps en recamara. null = no anotado */
  rir: number | null
  type: SetType
  done: 0 | 1
  completedAt: number | null
}

/** Peso corporal y medidas. */
export interface BodyEntry extends Syncable {
  dateKey: string
  weightKg: number | null
  bodyFat: number | null
  measurements: Record<string, number>
  notes: string
}

/**
 * Estado del motor de progresion, uno por ejercicio.
 * streak = sesiones seguidas en las que cumpliste el criterio para subir.
 */
export interface ProgressionState extends Syncable {
  exerciseId: ID
  streak: number
  lastWorkoutId: ID | null
  lastEvaluatedAt: number | null
  /** kg que se aplicaran la proxima vez que hagas el ejercicio */
  pendingWeightKg: number
  /** reps extra a sugerir (ejercicios de peso corporal) */
  pendingReps: number
}

export interface Settings {
  id: 'settings'
  /** RIR minimo en la ultima serie efectiva para considerar que puedes subir */
  rirThreshold: number
  /** sesiones seguidas cumpliendo el criterio antes de subir de verdad */
  requiredStreak: number
  autoProgression: 0 | 1
  defaultRestSeconds: number
  defaultSets: number
  defaultRepsMin: number
  defaultRepsMax: number
  /** unidad de peso corporal y cargas */
  unit: 'kg' | 'lb'
  catalogVersion: number
}
