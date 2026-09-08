// ---------------------------------------------------------------------------
// Modelo de datos.
//
// Todas las entidades que crea el usuario extienden Syncable: id uuid,
// updatedAt y deletedAt. Eso es lo que permitira enchufar Supabase mas
// adelante sin tocar ni una pantalla: el sync empuja lo que tenga updatedAt
// mayor que el ultimo push, y los borrados son logicos para que se propaguen.
// ---------------------------------------------------------------------------

import type { CardioKind, PaceStyle } from '../lib/cardio'

export type ID = string

/** Propiedad libre que te inventas tu: "Altura asiento" = "4". */
export interface ExerciseProp {
  id: ID
  name: string
  value: string
}

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
  /** nombre en espanol para mostrar; si falta se usa `name` (el del dataset) */
  alias?: string | null
  /** incremento manual en kg; si es null se deduce del equipamiento */
  incrementKg: number | null
  /**
   * Como se registra. 'reps' es lo normal (series, kg y RIR); 'cardio' cambia
   * la ficha entera a duracion, distancia, kcal y pulsaciones.
   */
  tracking?: 'reps' | 'cardio'
  cardioKind?: CardioKind | null
  paceStyle?: PaceStyle | null

  /** Tus propias anotaciones, visibles tambien al entrenar. */
  props?: ExerciseProp[]
  /** Imagen o gif propios en data URL, cuando subes un fichero. Mandan sobre los del dataset. */
  imageData?: string | null
  gifData?: string | null
  /** Archivado: no se borra nada, solo deja de aparecer en buscadores y listas. */
  archived?: 0 | 1
  /**
   * Campos del dataset que has cambiado a mano. Al reimportar el catalogo se
   * usa para saber que no deberia pisarse sin avisarte.
   */
  editedFields?: string[]
}

/** Plantilla de entrenamiento. */
export interface Routine extends Syncable {
  name: string
  notes: string
  order: number
  archived: 0 | 1
  /** portada de la rutina: data URL de una foto subida, o un enlace */
  imageData?: string | null
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
  /** solo en cardio: duracion objetivo, para estimar lo que dura la rutina */
  targetDurationMin?: number | null
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
  /**
   * Solo en entrenos registrados a posteriori: cuanto duro, segun tu.
   * Al cerrarlo, finishedAt sale de aqui y no del reloj.
   */
  plannedDurationMs?: number | null
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
  /** solo en cardio: duracion objetivo de la actividad */
  targetDurationMin?: number | null
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
  // --- solo en ejercicios de cardio ---
  durationSec?: number | null
  distanceKm?: number | null
  kcal?: number | null
  avgHr?: number | null
  maxHr?: number | null
}

/**
 * Datos que casi nunca cambian y no tiene sentido fechar.
 *
 * La altura no es una medida mas: si se guardara en cada registro habria que
 * reescribirla siempre y acabarias con una grafica plana. Aqui vive una sola
 * vez y sirve para calcular el IMC y el ratio cintura/altura de cualquier
 * registro, incluidos los antiguos.
 */
export interface Profile extends Syncable {
  id: 'profile'
  /** como te llamas para ti y, el dia que haya amigos, para ellos */
  displayName: string | null
  /** data URL mientras no haya nube; despues, la URL en Supabase Storage */
  avatarUrl: string | null
  heightCm: number | null
  sex: 'hombre' | 'mujer' | 'otro' | null
  /** YYYY-MM-DD */
  birthDate: string | null
  /** objetivo de peso activo, si lo hay */
  goal?: WeightGoal | null
}

/**
 * Objetivo de peso con plazo opcional.
 *
 * La direccion (perder, ganar o mantener) sale sola de comparar el peso
 * objetivo con el de partida, asi que no se guarda aparte. El peso de partida
 * se congela al fijar el objetivo para que el progreso se mida siempre contra
 * el mismo punto, aunque despues anotes pesos nuevos.
 */
export interface WeightGoal {
  targetWeightKg: number
  /** peso el dia que se fijo el objetivo */
  startWeightKg: number
  /** YYYY-MM-DD en que se fijo */
  startDateKey: string
  /** fecha limite opcional, YYYY-MM-DD */
  targetDateKey: string | null
  createdAt: number
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

/**
 * Marca de por donde iba la sincronizacion.
 *
 * `ownerUid` es la pieza importante: si en este movil entra otra persona, sus
 * datos no pueden mezclarse con los tuyos, asi que al detectar un dueno
 * distinto se limpia la base local antes de bajar nada.
 */
export interface SyncState {
  id: 'sync'
  ownerUid: string | null
  /** ultimo updatedAt propio ya enviado */
  lastPushedAt: number
  /** ultimo updatedAt remoto ya recibido */
  lastPulledAt: number
  lastSyncAt: number | null
  lastError: string | null
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
