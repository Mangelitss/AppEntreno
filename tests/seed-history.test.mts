// El historial de prueba tiene que producir datos que ejerciten toda la app.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { before } from 'node:test'
import { db } from '../src/db/db.ts'
import { seedTrainingHistory, clearTrainingHistory } from '../src/db/seed-history.ts'
import { buildWeekMuscleData } from '../src/db/rank-data.ts'
import { computeMuscleRanks, weekKeyOf } from '../src/lib/ranks.ts'
import { computeStreak } from '../src/lib/streak.ts'
import { totalVolume } from '../src/lib/stats.ts'
import { dateKey } from '../src/db/repo.ts'

let report: Awaited<ReturnType<typeof seedTrainingHistory>>

before(async () => {
  await db.delete()
  await db.open()
  // Semilla fija: el mismo historial en cada ejecucion.
  report = await seedTrainingHistory({ weeks: 20, seed: 42 })
})

test('genera meses de entrenos, no cuatro filas sueltas', () => {
  assert.equal(report.weeks, 20)
  assert.ok(report.workouts > 40, `pocos entrenos: ${report.workouts}`)
  assert.ok(report.sets > 400, `pocas series: ${report.sets}`)
  assert.ok(report.cardioSessions > 5, 'tiene que haber cardio')
  assert.ok(report.bodyEntries >= 19, 'un pesaje por semana')
})

test('se salta dias, como una persona real', () => {
  assert.ok(report.skippedDays > 0, 'un historial perfecto no probaria la racha')
})

test('todos los entrenos quedan cerrados y fechados en el pasado', async () => {
  const workouts = await db.workouts.toArray()
  const hoy = dateKey()

  assert.ok(workouts.every(w => w.finishedAt), 'ninguno a medias')
  assert.ok(workouts.every(w => w.dateKey < hoy), 'ninguno en el futuro')
  assert.ok(workouts.every(w => w.finishedAt! > w.startedAt), 'con duracion positiva')
})

test('las series llevan peso, repeticiones y RIR', async () => {
  const sets = (await db.sets.toArray()).filter(s => s.done === 1 && s.weight > 0)
  assert.ok(sets.length > 300)
  assert.ok(sets.every(s => s.reps > 0))
  assert.ok(sets.some(s => s.rir !== null), 'el RIR hace falta para los rangos')
  assert.ok(totalVolume(sets) > 100_000, 'hay volumen de verdad acumulado')
})

test('hay progresion: se levanta mas al final que al principio', async () => {
  const workouts = (await db.workouts.toArray()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const sets = await db.sets.toArray()

  const pesoDe = async (workoutId: string) => {
    const propias = sets.filter(s => s.workoutId === workoutId && s.weight > 0)
    return propias.length ? Math.max(...propias.map(s => s.weight)) : 0
  }

  const primeros = (await Promise.all(workouts.slice(0, 5).map(w => pesoDe(w.id)))).filter(Boolean)
  const ultimos = (await Promise.all(workouts.slice(-5).map(w => pesoDe(w.id)))).filter(Boolean)

  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  assert.ok(media(ultimos) > media(primeros), 'al final se mueve mas peso')
})

test('el motor de progresion deja estado, no solo entrenos', async () => {
  const estados = await db.progression.toArray()
  assert.ok(estados.length > 0, 'commitWorkout tiene que haber pasado de verdad')
})

test('los rangos salen del historial y llegan lejos', async () => {
  const ranks = computeMuscleRanks(await buildWeekMuscleData(), weekKeyOf(new Date()))

  assert.ok(ranks.length >= 8, `pocos musculos con datos: ${ranks.length}`)

  const conRango = ranks.filter(r => r.division !== null)
  assert.ok(conRango.length >= 5, 'la mayoria deberia tener rango tras 20 semanas')
  // Veinte semanas dan para Plata en lo mas entrenado. Oro pide medio ano
  // largo, que es justo lo que se busca: una escalera que dure.
  assert.ok(
    conRango.some(r => ['plata', 'oro', 'platino', 'diamante'].includes(r.tier)),
    `deberia haber alguno alto: ${conRango.map(r => `${r.muscle} ${r.tier}`).join(', ')}`
  )
  assert.ok(
    conRango.every(r => r.tier !== 'elite'),
    'en 20 semanas nadie deberia estar en Elite'
  )
})

test('lo mas entrenado va por delante de lo accesorio', async () => {
  const ranks = computeMuscleRanks(await buildWeekMuscleData(), weekKeyOf(new Date()))
  const porMusculo = new Map(ranks.map(r => [r.muscle, r.points]))

  // Dos dias de pierna a la semana frente a uno de empuje.
  assert.ok(
    (porMusculo.get('quads') ?? 0) > (porMusculo.get('pectorals') ?? 0),
    'el reparto del plan se tiene que notar en los rangos'
  )
})

test('los grupos quedan desiguales, que es lo interesante de mirar', async () => {
  const ranks = computeMuscleRanks(await buildWeekMuscleData(), weekKeyOf(new Date()))
  const puntos = ranks.map(r => r.points)
  assert.ok(Math.max(...puntos) > Math.min(...puntos) * 2, 'unos grupos van por delante de otros')
})

test('la racha se puede calcular y esta viva', async () => {
  const dias = (await db.workouts.toArray()).filter(w => w.finishedAt).map(w => w.dateKey)
  const racha = computeStreak(dias, dateKey())
  assert.ok(racha.best > 3, `la mejor racha deberia ser larga: ${racha.best}`)
})

test('el peso corporal dibuja una serie con la que hacer graficas', async () => {
  const entradas = (await db.body.toArray()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  assert.ok(entradas.length >= 19)
  assert.ok(entradas.every(e => e.weightKg && e.weightKg > 50 && e.weightKg < 120))
  assert.ok(entradas.some(e => Object.keys(e.measurements).length > 0), 'con medidas de vez en cuando')
})

test('el perfil queda relleno para que las metricas tengan altura', async () => {
  const profile = await db.profile.get('profile')
  assert.equal(profile?.heightCm, 178)
  assert.ok(profile?.displayName)
})

test('borrar el historial deja las rutinas en pie', async () => {
  const rutinasAntes = (await db.routines.toArray()).filter(r => !r.deletedAt).length

  await clearTrainingHistory()

  assert.equal(await db.workouts.count(), 0)
  assert.equal(await db.sets.count(), 0)
  assert.equal(await db.body.count(), 0)
  assert.equal((await db.routines.toArray()).filter(r => !r.deletedAt).length, rutinasAntes)
  assert.ok(await db.exercises.count() > 0, 'el catalogo tampoco se toca')
})
