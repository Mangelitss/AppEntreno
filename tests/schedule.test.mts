// Verifica que el calendario acaba con exactamente 7 filas, incluso partiendo
// de una base de datos que ya tenia dias duplicados.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db/db.ts'
import { ensureSchedule } from '../src/db/schedule.ts'
import type { ScheduleDay } from '../src/db/types.ts'

const row = (id: string, weekday: number, routineId: string | null): ScheduleDay =>
  ({ id, weekday, routineId, updatedAt: Date.now(), deletedAt: null })

test('deduplica una semana repetida y conserva las rutinas asignadas', async () => {
  // Estado roto: dos pasadas escribieron su propia semana con uuids distintos.
  const broken: ScheduleDay[] = []
  for (let d = 0; d < 7; d++) {
    broken.push(row(`aaa-${d}`, d, null))
    broken.push(row(`bbb-${d}`, d, d === 0 ? 'rutina-push' : null))
  }
  await db.schedule.bulkPut(broken)
  assert.equal(await db.schedule.count(), 14)

  await ensureSchedule()

  const rows = (await db.schedule.toArray()).sort((a, b) => a.weekday - b.weekday)
  assert.equal(rows.length, 7, 'una fila por dia')
  assert.deepEqual(rows.map(r => r.weekday), [0, 1, 2, 3, 4, 5, 6])
  assert.deepEqual(rows.map(r => r.id), ['wd-0', 'wd-1', 'wd-2', 'wd-3', 'wd-4', 'wd-5', 'wd-6'])
  assert.equal(rows[0].routineId, 'rutina-push', 'no se pierde la rutina ya asignada')
})

test('ejecutarlo varias veces no anade filas', async () => {
  await ensureSchedule()
  await ensureSchedule()
  await Promise.all([ensureSchedule(), ensureSchedule()])
  assert.equal(await db.schedule.count(), 7)
})

test('arranque en limpio crea los 7 dias', async () => {
  await db.schedule.clear()
  await ensureSchedule()
  const rows = await db.schedule.toArray()
  assert.equal(rows.length, 7)
  assert.ok(rows.every(r => r.routineId === null))
})
