import { db } from './db'
import type { ID, Syncable } from './types'

export const uid = (): ID =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const now = () => Date.now()

/** Marca de sync que lleva toda entidad nueva. */
export function stamp<T extends object>(data: T): T & Syncable {
  return { id: uid(), updatedAt: now(), deletedAt: null, ...data } as T & Syncable
}

/** Actualiza tocando updatedAt, que es lo que mira el sync. */
export function touch<T extends object>(patch: T): T & { updatedAt: number } {
  return { ...patch, updatedAt: now() }
}

/** Borrado logico: se conserva la fila para poder propagar el borrado. */
export async function softDelete(
  table: 'routines' | 'routineItems' | 'workouts' | 'workoutExercises' | 'sets' | 'body' | 'exercises',
  id: ID
): Promise<void> {
  await db[table].update(id, { deletedAt: now(), updatedAt: now() } as never)
}

/** Filtro que aplica todo lector: lo borrado no existe. */
export const alive = <T extends Syncable>(rows: T[]): T[] => rows.filter(r => !r.deletedAt)

export function dateKey(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** 0 = lunes ... 6 = domingo (getDay devuelve 0 = domingo). */
export function weekdayIndex(d: Date = new Date()): number {
  return (d.getDay() + 6) % 7
}

export const WEEKDAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
export const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
