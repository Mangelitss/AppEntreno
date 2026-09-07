// ---------------------------------------------------------------------------
// Historial de prueba.
//
// Genera meses de entrenos pasando por las acciones reales de la app
// (startWorkout, series, commitWorkout) en vez de insertar filas a mano. Es
// mas lento, pero asi los datos salen igual que si los hubieras metido tu, y
// de paso queda ejercitado el motor de progresion.
//
// Lo generado imita a alguien de verdad: progresa, se estanca, tiene una
// semana de descarga, se salta dias sueltos y descuida algun grupo. Con datos
// perfectos los rangos y las graficas no probarian nada.
// ---------------------------------------------------------------------------

import { db, saveProfile } from './db'
import { commitWorkout, logCardioWorkout, startWorkout } from './actions'
import { seedExampleRoutines } from './seed-routines'
import { ensureCardioCatalog } from './cardio-catalog'
import { shiftDateKey } from '../lib/streak'
import { dateKey } from './repo'
import type { Exercise, RoutineItem } from './types'

/** Aleatorio reproducible: la misma semilla da siempre el mismo historial. */
function makeRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Carga inicial verosimil segun el material y el grupo. */
function startingWeight(exercise: Exercise | undefined): number {
  if (!exercise) return 20
  const equipment = (exercise.equipment || '').toLowerCase()
  const isLeg = (exercise.category || '').toLowerCase().includes('legs')

  if (equipment.includes('body weight') || equipment.includes('band')) return 0
  if (equipment.includes('barbell')) return isLeg ? 60 : 35
  if (equipment.includes('smith')) return isLeg ? 50 : 30
  if (equipment.includes('dumbbell') || equipment.includes('kettlebell')) return isLeg ? 16 : 10
  if (equipment.includes('cable') || equipment.includes('leverage') || equipment.includes('machine')) {
    return isLeg ? 45 : 25
  }
  return 20
}

export interface SeedHistoryOptions {
  /** semanas de historial hacia atras */
  weeks?: number
  seed?: number
  /** semana (contando desde el principio) en la que se hace descarga */
  deloadWeek?: number
}

export interface SeedHistoryReport {
  weeks: number
  workouts: number
  sets: number
  cardioSessions: number
  bodyEntries: number
  skippedDays: number
}

export async function seedTrainingHistory(options: SeedHistoryOptions = {}): Promise<SeedHistoryReport> {
  const weeks = options.weeks ?? 20
  const deloadWeek = options.deloadWeek ?? Math.floor(weeks * 0.6)
  const random = makeRandom(options.seed ?? 20260825)

  await ensureCardioCatalog()
  await seedExampleRoutines()

  const routines = (await db.routines.toArray()).filter(r => !r.deletedAt)
  const schedule = (await db.schedule.toArray()).sort((a, b) => a.weekday - b.weekday)
  const exercises = new Map((await db.exercises.toArray()).map(e => [e.id, e]))

  const itemsByRoutine = new Map<string, RoutineItem[]>()
  for (const item of (await db.routineItems.toArray()).filter(i => !i.deletedAt)) {
    itemsByRoutine.set(item.routineId, [...(itemsByRoutine.get(item.routineId) ?? []), item])
  }

  const report: SeedHistoryReport = {
    weeks, workouts: 0, sets: 0, cardioSessions: 0, bodyEntries: 0, skippedDays: 0
  }

  // El lunes de la primera semana del historial.
  const today = new Date()
  const mondayOffset = (today.getDay() + 6) % 7
  const firstMonday = shiftDateKey(dateKey(), -(mondayOffset + weeks * 7))

  let bodyWeight = 78

  for (let week = 0; week < weeks; week++) {
    const isDeload = week === deloadWeek

    for (const day of schedule) {
      if (!day.routineId) continue

      const routine = routines.find(r => r.id === day.routineId)
      if (!routine) continue

      const when = shiftDateKey(firstMonday, week * 7 + day.weekday)
      if (when >= dateKey()) continue

      // Un dia suelto se salta: la vida real tiene imprevistos.
      if (random() < 0.12) { report.skippedDays++; continue }

      const items = (itemsByRoutine.get(routine.id) ?? []).sort((a, b) => a.order - b.order)
      const isCardioRoutine = items.length > 0
        && items.every(i => exercises.get(i.exerciseId)?.tracking === 'cardio')

      if (isCardioRoutine) {
        await logCardioWorkout({
          routineId: routine.id,
          dateKey: when,
          entries: items.map(item => {
            const minutes = item.targetDurationMin ?? 30
            const activity = exercises.get(item.exerciseId)
            const hasDistance = activity?.cardioKind === 'distance'
            return {
              exerciseId: item.exerciseId,
              durationSec: Math.round((minutes + (random() * 10 - 5)) * 60),
              distanceKm: hasDistance ? Number((minutes * 0.32 + random() * 3).toFixed(1)) : null,
              kcal: Math.round(minutes * (8 + random() * 3)),
              avgHr: Math.round(130 + random() * 20),
              maxHr: Math.round(160 + random() * 20)
            }
          })
        })
        report.cardioSessions++
        continue
      }

      const workoutId = await startWorkout(routine.id, {
        dateKey: when,
        durationMinutes: Math.round(45 + random() * 30)
      })

      const sets = (await db.sets.where('workoutId').equals(workoutId).toArray())
        .sort((a, b) => a.order - b.order)

      const updated = sets.map(set => {
        const exercise = exercises.get(set.exerciseId)
        const item = items.find(i => i.exerciseId === set.exerciseId)
        const base = startingWeight(exercise)

        // Progresion que se frena con el tiempo, como en la realidad.
        const growth = 1 + 0.11 * Math.log1p(week * 0.7)
        const noise = 0.97 + random() * 0.06
        const deload = isDeload ? 0.85 : 1

        const step = base >= 40 ? 2.5 : base >= 15 ? 2 : 1
        const weight = base === 0
          ? 0
          : Math.max(step, Math.round((base * growth * noise * deload) / step) * step)

        const min = item?.targetRepsMin ?? 8
        const max = item?.targetRepsMax ?? 10
        const reps = base === 0
          ? Math.round(min + week * 0.3 + random() * 2)
          : Math.round(min + random() * Math.max(0, max - min))

        return {
          ...set,
          weight,
          reps,
          rir: Math.round(random() * 3),
          done: 1 as const,
          completedAt: new Date(`${when}T12:00:00`).getTime()
        }
      })

      await db.sets.bulkPut(updated)
      await commitWorkout(workoutId)

      report.workouts++
      report.sets += updated.length
    }

    // Peso corporal una vez por semana, con tendencia y ruido.
    bodyWeight += (random() - 0.45) * 0.6
    const measureDay = shiftDateKey(firstMonday, week * 7)
    if (measureDay < dateKey()) {
      await db.body.put({
        id: `seed-body-${week}`,
        dateKey: measureDay,
        weightKg: Number(bodyWeight.toFixed(1)),
        bodyFat: Number((17 - week * 0.06 + random() * 0.4).toFixed(1)),
        measurements: week % 4 === 0
          ? {
              pecho: Number((100 + week * 0.12).toFixed(1)),
              cintura: Number((84 - week * 0.06).toFixed(1)),
              brazo: Number((35 + week * 0.05).toFixed(1))
            }
          : {},
        notes: '',
        updatedAt: Date.now(),
        deletedAt: null
      })
      report.bodyEntries++
    }
  }

  await saveProfile({
    displayName: 'Miguel Angel',
    heightCm: 178,
    sex: 'hombre',
    birthDate: '1998-03-10'
  })

  return report
}

/** Borra solo lo que genera esta funcion, dejando rutinas y catalogo. */
export async function clearTrainingHistory(): Promise<void> {
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, db.body, db.progression, async () => {
    await db.sets.clear()
    await db.workoutExercises.clear()
    await db.workouts.clear()
    await db.body.clear()
    await db.progression.clear()
  })
}
