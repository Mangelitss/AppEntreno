import assert from 'node:assert/strict'
import test from 'node:test'
import { backfillDates, computeStreak, shiftDateKey } from '../src/lib/streak.ts'

const TODAY = '2026-08-05' // miercoles

test('sin entrenos no hay racha', () => {
  const streak = computeStreak([], TODAY)
  assert.equal(streak.days, 0)
  assert.equal(streak.alive, false)
})

test('entrenar hoy por primera vez es racha de 1', () => {
  const streak = computeStreak([TODAY], TODAY)
  assert.equal(streak.days, 1)
  assert.equal(streak.trainedToday, true)
  assert.equal(streak.daysLeft, 3, 'tienes tres dias de margen por delante')
})

test('dias seguidos suman', () => {
  const streak = computeStreak(['2026-08-03', '2026-08-04', '2026-08-05'], TODAY)
  assert.equal(streak.days, 3)
  assert.equal(streak.startedOn, '2026-08-03')
})

test('dos dias de descanso no rompen la racha', () => {
  // entreno lunes, descanso martes y miercoles, entreno jueves
  const streak = computeStreak(['2026-07-27', '2026-07-30'], '2026-07-30')
  assert.equal(streak.days, 2, 'un hueco de 3 dias aguanta')
})

test('tres dias sin entrenar la rompen', () => {
  // entreno lunes, nada martes miercoles jueves, entreno viernes
  const streak = computeStreak(['2026-07-27', '2026-07-31'], '2026-07-31')
  assert.equal(streak.days, 1, 'un hueco de 4 dias empieza racha nueva')
})

test('la racha muere sola aunque no vuelvas a entrenar', () => {
  const viva = computeStreak(['2026-08-02'], TODAY) // hace 3 dias
  assert.equal(viva.alive, true)
  assert.equal(viva.days, 1)
  assert.equal(viva.daysLeft, 0, 'hoy es el ultimo dia para salvarla')

  const muerta = computeStreak(['2026-08-01'], TODAY) // hace 4 dias
  assert.equal(muerta.alive, false)
  assert.equal(muerta.days, 0)
})

test('entrenar dos veces el mismo dia cuenta como un dia', () => {
  const streak = computeStreak([TODAY, TODAY, TODAY], TODAY)
  assert.equal(streak.days, 1)
})

test('se recuerda la mejor racha aunque la actual se haya roto', () => {
  const streak = computeStreak(
    ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-08-05'],
    TODAY
  )
  assert.equal(streak.days, 1, 'la actual empezo hoy')
  assert.equal(streak.best, 4)
})

test('registrar un entreno olvidado devuelve la racha que tenias', () => {
  // Entrenaste hasta el sabado y hoy es miercoles: la racha esta muerta.
  const historial = ['2026-07-30', '2026-08-01']
  assert.equal(computeStreak(historial, TODAY).alive, false)

  // Pero resulta que el lunes si entrenaste y se te olvido apuntarlo.
  const corregido = computeStreak([...historial, '2026-08-03'], TODAY)
  assert.equal(corregido.alive, true)
  assert.equal(corregido.days, 3)
})

test('los dias futuros se ignoran', () => {
  const streak = computeStreak(['2026-08-05', '2026-09-01'], TODAY)
  assert.equal(streak.lastDayKey, TODAY)
})

test('las fechas para rellenar son los 7 dias anteriores', () => {
  const dates = backfillDates(TODAY)
  assert.equal(dates.length, 7)
  assert.equal(dates[0], '2026-08-04', 'empieza por ayer')
  assert.equal(dates[6], '2026-07-29')
  assert.ok(!dates.includes(TODAY), 'hoy no, para eso esta el entreno normal')
})

test('desplazar fechas cruza meses y anos bien', () => {
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDateKey('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDateKey('2024-03-01', -1), '2024-02-29', 'ano bisiesto')
})
