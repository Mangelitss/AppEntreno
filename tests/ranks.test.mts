// El sistema de rangos: mide progreso acumulado, no fuerza maxima.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CALIBRATION_WEEKS, DECAY_RATE, MAX_PROGRESS, computeMuscleRanks, consistencyPoints,
  intensityPoints, nextStep, progressPoints, rankLabel, regressionPoints, tierFor,
  weekKeyOf, weeksBetween, type WeekMuscleData
} from '../src/lib/ranks.ts'

const week = (n: number) => `2026-W${String(n).padStart(2, '0')}`

const entry = (n: number, over: Partial<WeekMuscleData> = {}): WeekMuscleData => ({
  weekKey: week(n), muscle: 'biceps', effectiveSets: 10, bestE1rm: 50, intensityRatio: 1, ...over
})

// --- puntuacion ------------------------------------------------------------

test('el progreso va por mejora relativa, no por kilos', () => {
  // +5% en ambos casos, aunque uno sean 2 kg y el otro 5
  assert.equal(progressPoints(42, 40), progressPoints(105, 100))
  assert.equal(progressPoints(42, 40), 30)
})

test('mejorar mas da mas puntos, pero con tope', () => {
  assert.equal(progressPoints(40.4, 40), 6, '+1%')
  assert.equal(progressPoints(44, 40), 60, '+10% llega al tope')
  assert.equal(progressPoints(80, 40), MAX_PROGRESS, 'doblar no da mas que el tope')
})

test('sin superar la referencia no hay puntos de progreso', () => {
  assert.equal(progressPoints(40, 40), 0)
  assert.equal(progressPoints(35, 40), 0)
  assert.equal(progressPoints(50, 0), 0, 'sin referencia todavia no se puede medir')
})

test('la constancia tiene tope para que el volumen basura no cuente', () => {
  assert.equal(consistencyPoints(5), 15)
  assert.equal(consistencyPoints(10), 30)
  assert.equal(consistencyPoints(30), 30, 'treinta series no valen mas que diez')
})

test('la intensidad premia la proporcion cerca del fallo', () => {
  assert.equal(intensityPoints(1), 10)
  assert.equal(intensityPoints(0.5), 5)
  assert.equal(intensityPoints(0), 0)
})

// --- regresion -------------------------------------------------------------

test('una caida pequena no se penaliza: no todo es rendir peor', () => {
  assert.equal(regressionPoints(48, 50, 10), 0, 'un 4% entra en el margen')
  assert.equal(regressionPoints(47.5, 50, 10), 0, 'justo el 5% tampoco')
})

test('una caida grande si resta, y a mas caida mas', () => {
  assert.ok(regressionPoints(45, 50, 10) > 0, 'un 10% ya penaliza')
  assert.ok(regressionPoints(40, 50, 10) > regressionPoints(45, 50, 10))
  assert.equal(regressionPoints(20, 50, 10), 40, 'con tope')
})

test('no se penaliza si apenas entrenaste ese musculo', () => {
  assert.equal(regressionPoints(30, 50, 1), 0, 'una serie suelta no es un dato')
  assert.equal(regressionPoints(30, 50, 0), 0, 'y no aparecer es cosa del decaimiento')
})

// --- escalera --------------------------------------------------------------

test('las divisiones van de III a I dentro de cada rango', () => {
  assert.equal(tierFor(120).tier?.name, 'bronce')
  assert.equal(tierFor(120).division, 3, 'recien entrado es III')
  assert.equal(tierFor(320).division, 1, 'arriba del rango es I')
  assert.equal(tierFor(460).tier?.name, 'plata')
})

test('por debajo del primer umbral no hay rango', () => {
  assert.equal(tierFor(0).tier, null)
  assert.equal(tierFor(99).tier, null)
})

test('siempre se sabe cuanto falta para el siguiente escalon', () => {
  const paso = nextStep(150)
  assert.equal(paso.pointsToNext, 50, 'de 150 a Bronce II hay 50')
  assert.ok(paso.progress > 0 && paso.progress < 1)
})

// --- semanas ---------------------------------------------------------------

test('las semanas ISO se calculan bien y cruzan el ano', () => {
  assert.equal(weekKeyOf(new Date(2026, 7, 25)), '2026-W35')
  assert.equal(weeksBetween('2026-W10', '2026-W13').length, 4)
  assert.ok(weeksBetween('2025-W52', '2026-W02').includes('2026-W01'), 'salta de ano')
})

// --- acumulado -------------------------------------------------------------

test('las primeras semanas calibran en vez de inventarse un rango', () => {
  const [rank] = computeMuscleRanks([entry(10)], week(10))
  assert.equal(rank.tier, 'calibrando')
  assert.equal(rank.division, null, 'no se muestra rango sin referencia')
})

test('entrenando de forma constante se acumulan puntos y se sube', () => {
  const data = Array.from({ length: 12 }, (_, i) => entry(10 + i, { bestE1rm: 50 + i }))
  const [rank] = computeMuscleRanks(data, week(21))

  assert.ok(rank.points > 300, `deberia haber subido, tiene ${rank.points}`)
  assert.equal(rank.weeksTrained, 12)
  assert.notEqual(rank.tier, 'sin-rango')
})

test('estancarse entrenando bien no te baja de rango', () => {
  // Misma marca doce semanas: cero progreso, pero constancia e intensidad siguen
  const data = Array.from({ length: 12 }, (_, i) => entry(10 + i, { bestE1rm: 50 }))
  const [rank] = computeMuscleRanks(data, week(21))

  assert.ok(rank.points >= 12 * 40 * 0.9, 'la constancia sostiene el ritmo')
  assert.equal(rank.weeksIdle, 0)
})

test('dejar de entrenar un musculo si baja el rango', () => {
  const data = Array.from({ length: 12 }, (_, i) => entry(10 + i, { bestE1rm: 50 + i }))

  const activo = computeMuscleRanks(data, week(21))[0]
  const abandonado = computeMuscleRanks(data, week(29))[0] // ocho semanas sin tocarlo

  assert.ok(abandonado.points < activo.points, 'se pierde por abandono')
  assert.equal(abandonado.weeksIdle, 8)

  const esperado = activo.points * Math.pow(1 - DECAY_RATE, 8)
  assert.ok(Math.abs(abandonado.points - esperado) < 5, 'un 8% por semana parada')
})

test('el decaimiento no puede dejarte en negativo', () => {
  const [rank] = computeMuscleRanks([entry(1)], week(52))
  assert.ok(rank.points >= 0)
})

test('un pico aislado no condena el rango durante meses', () => {
  // Un dedazo o un dia irrepetible en la semana 1, y luego 20 semanas normales.
  const data: WeekMuscleData[] = [
    entry(1, { bestE1rm: 100 }),
    ...Array.from({ length: 20 }, (_, i) => entry(2 + i, { bestE1rm: 50 }))
  ]
  const [rank] = computeMuscleRanks(data, week(21))

  // La regresion mira la segunda mejor marca, asi que 50 frente a 50 no penaliza
  // y se sigue sumando constancia e intensidad.
  assert.ok(rank.points > 400, `deberia seguir sumando, tiene ${rank.points}`)
})

test('bajar de verdad si penaliza: hay que haber estado arriba mas de una vez', () => {
  const buenas = Array.from({ length: 6 }, (_, i) => entry(1 + i, { bestE1rm: 100 }))
  const flojas = Array.from({ length: 4 }, (_, i) => entry(7 + i, { bestE1rm: 70 }))

  const soloBuenas = computeMuscleRanks(buenas, week(6))[0]
  const conBajada = computeMuscleRanks([...buenas, ...flojas], week(10))[0]

  const sinPenalizar = soloBuenas.points + 4 * 40
  assert.ok(conBajada.points < sinPenalizar, 'un -30% sostenido resta de verdad')
})

test('una marca antigua deja de contar al salir de la ventana', () => {
  const data: WeekMuscleData[] = [
    ...Array.from({ length: 3 }, (_, i) => entry(1 + i, { bestE1rm: 100 })),
    ...Array.from({ length: 20 }, (_, i) => entry(4 + i, { bestE1rm: 70 }))
  ]
  const [rank] = computeMuscleRanks(data, week(23))

  // Las primeras semanas penalizan, pero al salir de las 16 la referencia baja
  // a 70 y se vuelve a sumar con normalidad.
  assert.ok(rank.points > 200, `la ventana se renueva, tiene ${rank.points}`)
  assert.equal(rank.weeksIdle, 0)
})

test('cada musculo lleva su propia cuenta', () => {
  const data = [
    ...Array.from({ length: 8 }, (_, i) => entry(10 + i, { muscle: 'biceps', bestE1rm: 40 + i })),
    ...Array.from({ length: 3 }, (_, i) => entry(10 + i, { muscle: 'calves', effectiveSets: 2 }))
  ]
  const ranks = computeMuscleRanks(data, week(17))
  const biceps = ranks.find(r => r.muscle === 'biceps')!
  const gemelos = ranks.find(r => r.muscle === 'calves')!

  assert.ok(biceps.points > gemelos.points, 'lo que entrenas mas va por delante')
  assert.ok(gemelos.weeksIdle > 0, 'y lo abandonado se nota')
})

test('el rango se lee como en los juegos', () => {
  const [rank] = computeMuscleRanks(
    Array.from({ length: 10 }, (_, i) => entry(10 + i, { bestE1rm: 50 + i * 2 })),
    week(19)
  )
  assert.match(rankLabel(rank), /^(BRONCE|PLATA|ORO|PLATINO|DIAMANTE|ELITE) (I|II|III)$/)
})

test('sin datos no hay rangos que mostrar', () => {
  assert.deepEqual(computeMuscleRanks([], week(20)), [])
})

test('la calibracion dura lo que dice la constante', () => {
  const data = Array.from({ length: CALIBRATION_WEEKS }, (_, i) => entry(10 + i))
  const [rank] = computeMuscleRanks(data, week(10 + CALIBRATION_WEEKS - 1))
  assert.notEqual(rank.tier, 'calibrando', 'al completar las semanas ya se puntua')
})

// --- agrupacion ------------------------------------------------------------

test('cada musculo del dataset cae en su grupo', async () => {
  const { groupOf, isRankable, MUSCLE_GROUPS } = await import('../src/lib/muscle-groups.ts')

  assert.equal(groupOf('biceps')?.id, 'brazos')
  assert.equal(groupOf('quads')?.id, 'piernas')
  assert.equal(groupOf('lats')?.id, 'espalda')
  assert.equal(groupOf('pectorals')?.id, 'pecho')
  assert.equal(groupOf('delts')?.id, 'hombros')
  assert.equal(groupOf('abs')?.id, 'abdominales')

  assert.equal(MUSCLE_GROUPS.length, 6)
  assert.equal(groupOf('inventado'), null)
})

test('el sistema cardiovascular no es un musculo y no puntua', async () => {
  const { isRankable } = await import('../src/lib/muscle-groups.ts')
  assert.equal(isRankable('cardiovascular system'), false)
  assert.equal(isRankable('quads'), true)
  assert.equal(isRankable(''), false)
})

test('ningun grupo repite musculos con otro', async () => {
  const { MUSCLE_GROUPS } = await import('../src/lib/muscle-groups.ts')
  const todos = MUSCLE_GROUPS.flatMap(g => g.muscles)
  assert.equal(new Set(todos).size, todos.length, 'un musculo no puede estar en dos grupos')
})
