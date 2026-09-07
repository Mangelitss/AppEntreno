import Dexie, { type Table } from 'dexie'
import type {
  BodyEntry, Exercise, Profile, ProgressionState, Routine, RoutineItem,
  ScheduleDay, Settings, SyncState, Workout, WorkoutExercise, WorkoutSet
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
  profile!: Table<Profile, string>
  syncState!: Table<SyncState, string>

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

    // v2 anade el perfil corporal. Dexie migra solo y no toca lo que ya hubiera.
    this.version(2).stores({ profile: 'id' })

    // v3 anade la marca de sincronizacion.
    this.version(3).stores({ syncState: 'id' })
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

export const EMPTY_PROFILE: Profile = {
  id: 'profile',
  displayName: null,
  avatarUrl: null,
  heightCm: null,
  sex: null,
  birthDate: null,
  updatedAt: 0,
  deletedAt: null
}

export async function getProfile(): Promise<Profile> {
  return (await db.profile.get('profile')) ?? EMPTY_PROFILE
}

export async function saveProfile(patch: Partial<Profile>): Promise<void> {
  const current = await getProfile()
  await db.profile.put({ ...current, ...patch, id: 'profile', updatedAt: Date.now() })
}

export const EMPTY_SYNC: SyncState = {
  id: 'sync',
  ownerUid: null,
  lastPushedAt: 0,
  lastPulledAt: 0,
  lastSyncAt: null,
  lastError: null
}

export async function getSyncState(): Promise<SyncState> {
  return (await db.syncState.get('sync')) ?? EMPTY_SYNC
}

export async function saveSyncState(patch: Partial<SyncState>): Promise<void> {
  const current = await getSyncState()
  await db.syncState.put({ ...current, ...patch, id: 'sync' })
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings' })
}
