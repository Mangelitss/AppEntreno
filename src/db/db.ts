import Dexie, { type Table } from 'dexie'
import type {
  BodyEntry, Exercise, ProgressionState, Routine, RoutineItem,
  ScheduleDay, Settings, Workout, WorkoutExercise, WorkoutSet
} from './types'

export class AppEntrenoDB extends Dexie {
  exercises!: Table<Exercise, string>
  routines!: Table<Routine, string>
  routineItems!: Table<RoutineItem, string>
  schedule!: Table<ScheduleDay, string>
  workouts!: Table<Workout, string>
  workoutExercises!: Table<WorkoutExercise, string>
  sets!: Table<WorkoutSet, string>
  body!: Table<BodyEntry, string>
  progression!: Table<ProgressionState, string>
  settings!: Table<Settings, string>

  constructor() {
    super('appentreno')
    this.version(1).stores({
      exercises: 'id, search, category, equipment, target, isCustom, favorite, updatedAt',
      routines: 'id, order, archived, updatedAt',
      routineItems: 'id, routineId, exerciseId, order, updatedAt',
      schedule: 'id, weekday, updatedAt',
      workouts: 'id, startedAt, finishedAt, dateKey, routineId, updatedAt',
      workoutExercises: 'id, workoutId, exerciseId, order, updatedAt',
      sets: 'id, workoutId, workoutExerciseId, exerciseId, order, updatedAt',
      body: 'id, dateKey, updatedAt',
      progression: 'id, exerciseId, updatedAt',
      settings: 'id'
    })
  }
}

export const db = new AppEntrenoDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  rirThreshold: 2,
  requiredStreak: 2,
  autoProgression: 1,
  defaultRestSeconds: 120,
  defaultSets: 3,
  defaultRepsMin: 8,
  defaultRepsMax: 10,
  unit: 'kg',
  catalogVersion: 0
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  if (s) return { ...DEFAULT_SETTINGS, ...s }
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings' })
}
