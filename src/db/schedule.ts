import { db } from './db'
import { now } from './repo'
import type { ScheduleDay } from './types'

/**
 * Deja el calendario con exactamente una fila por dia.
 *
 * Las filas usan id fijo (`wd-0`..`wd-6`) en vez de uuid: asi crearlas es
 * idempotente y da igual cuantas veces se ejecute esto. React en desarrollo
 * monta los efectos dos veces, y con ids aleatorios cada pasada anadia su
 * propia semana entera.
 */
export async function ensureSchedule() {
  const rows = await db.schedule.toArray()

  // Limpieza de duplicados de versiones anteriores: nos quedamos con la fila
  // que tuviera rutina asignada, para no perder lo que ya hubieras montado.
  const byWeekday = new Map<number, ScheduleDay>()
  const extra: string[] = []

  for (const row of rows.sort((a, b) => a.id.localeCompare(b.id))) {
    const kept = byWeekday.get(row.weekday)
    if (!kept) { byWeekday.set(row.weekday, row); continue }
    if (!kept.routineId && row.routineId) {
      byWeekday.set(row.weekday, row)
      extra.push(kept.id)
    } else {
      extra.push(row.id)
    }
  }
  if (extra.length) await db.schedule.bulkDelete(extra)

  for (let weekday = 0; weekday < 7; weekday++) {
    const id = `wd-${weekday}`
    const existing = byWeekday.get(weekday)
    if (existing?.id === id) continue

    const day: ScheduleDay = {
      id,
      weekday,
      routineId: existing?.routineId ?? null,
      updatedAt: now(),
      deletedAt: null
    }
    await db.schedule.put(day)
    if (existing) await db.schedule.delete(existing.id)
  }
}
