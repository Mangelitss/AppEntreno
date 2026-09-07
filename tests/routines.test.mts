import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db/db.ts'
import { SEED_ROUTINES, bestMatch, seedExampleRoutines } from '../src/db/seed-routines.ts'
import { estimateMinutes, muscleDistribution, muscleEs } from '../src/lib/muscles.ts'
import { ensureCardioCatalog } from '../src/db/cardio-catalog.ts'
import { normalize } from '../src/lib/stats.ts'
import type { Exercise } from '../src/db/types.ts'

const catalogEntry = (id: string, name: string, extra: Partial<Exercise> = {}): Exercise => ({
  id, name, search: normalize(name), category: '', equipment: '', target: '',
  secondaryMuscles: [], instructions: [], image: null, gif: null,
  isCustom: 0, favorite: 0, incrementKg: null, updatedAt: 0, deletedAt: null, ...extra
})

// Nombres reales tipo dataset, incluyendo variantes parecidas que no queremos.
const CATALOG = [
  catalogEntry('1', 'barbell full squat'),
  catalogEntry('2', 'barbell front squat'),
  catalogEntry('3', 'smith full squat'),
  catalogEntry('4', 'dumbbell single leg split squat'),
  catalogEntry('5', 'barbell hip thrust'),
  catalogEntry('6', 'lever lying leg curl'),
  catalogEntry('7', 'lever seated leg curl'),
  catalogEntry('8', 'dumbbell standing calf raise'),
  catalogEntry('9', 'dumbbell seated calf raise'),
  catalogEntry('10', 'barbell bent over row'),
  catalogEntry('11', 'cable upright row'),
  catalogEntry('12', 'pull-up'),
  catalogEntry('13', 'assisted pull-up'),
  catalogEntry('14', 'cable one arm seated row'),
  catalogEntry('15', 'dumbbell hammer curl'),
  catalogEntry('16', 'cable one arm curl'),
  catalogEntry('17', 'cable hammer curl'),
  catalogEntry('18', 'dumbbell seated lateral raise'),
  catalogEntry('19', 'cable lateral raise'),
  catalogEntry('20', 'dumbbell seated shoulder press'),
  catalogEntry('21', 'barbell seated shoulder press'),
  catalogEntry('22', 'dumbbell lying triceps extension'),
  catalogEntry('23', 'dumbbell incline bench press'),
  catalogEntry('24', 'barbell incline bench press'),
  catalogEntry('25', 'dumbbell romanian deadlift'),
  catalogEntry('26', 'barbell romanian deadlift'),
  catalogEntry('27', 'dumbbell single leg calf raise')
]

const specOf = (routine: string, alias: string) => {
  const found = SEED_ROUTINES.find(r => r.name === routine)!.exercises.find(e => e.alias.startsWith(alias))
  assert.ok(found, `no existe la especificacion ${routine}/${alias}`)
  return found
}

test('el emparejador elige la variante correcta y descarta las parecidas', () => {
  const cases: Array<[string, string, string]> = [
    ['Pierna A', 'Sentadilla Barra Alta', 'smith full squat'],
    ['Pierna B', 'Sentadilla (Barra', 'barbell full squat'],
    ['Pierna A', 'Sentadilla Bulgara', 'dumbbell single leg split squat'],
    ['Pierna A', 'Hip Thrust', 'barbell hip thrust'],
    ['Pierna A', 'Curl Femoral', 'lever lying leg curl'],
    ['Pierna A', 'Elevacion De Talones De Pie', 'dumbbell standing calf raise'],
    ['Pierna B', 'Elevaciones De Talones Unilateral', 'dumbbell single leg calf raise'],
    ['Pierna B', 'Peso Muerto Rumano', 'dumbbell romanian deadlift'],
    ['Pull', 'Remo (Barra', 'barbell bent over row'],
    ['Pull', 'Dominada', 'pull-up'],
    ['Pull', 'Remo Unilateral', 'cable one arm seated row'],
    ['Pull', 'Curl Martillo', 'dumbbell hammer curl'],
    ['Pull', 'Curl Bayesian', 'cable one arm curl'],
    ['Push', 'Elevaciones Laterales', 'dumbbell seated lateral raise'],
    ['Push', 'Press De Hombros', 'dumbbell seated shoulder press'],
    ['Push', 'Press Frances', 'dumbbell lying triceps extension'],
    ['Push', 'Press De Banca Inclinado', 'dumbbell incline bench press']
  ]

  for (const [routine, alias, expected] of cases) {
    const match = bestMatch(CATALOG, specOf(routine, alias))
    assert.equal(match?.name, expected, `${routine} / ${alias}`)
  }
})

test('si el catalogo no tiene nada compatible no se inventa un ejercicio', () => {
  assert.equal(bestMatch([catalogEntry('x', 'treadmill run')], specOf('Pull', 'Dominada')), null)
})

test('las 4 rutinas tienen las series y reps de las capturas', () => {
  const shape = SEED_ROUTINES.map(r => ({
    name: r.name,
    sets: r.exercises.map(e => `${e.sets}x${e.reps}`)
  }))
  assert.deepEqual(shape, [
    { name: 'Push', sets: ['2x15', '2x10', '1x12', '2x10'] },
    { name: 'Pull', sets: ['1x9', '2x10', '1x10', '1x12', '1x10'] },
    { name: 'Pierna A', sets: ['3x9', '3x20', '3x10', '3x12', '2x15'] },
    { name: 'Pierna B', sets: ['2x15', '2x12', '1x12', '2x10', '2x15'] },
    { name: 'Cardio', sets: ['1x0', '1x0'] }
  ])
})

test('la distribucion muscular reparte segun series y suma 100', () => {
  const press = catalogEntry('p', 'press', { target: 'pectorals', secondaryMuscles: ['delts', 'triceps'] })
  const curl = catalogEntry('c', 'curl', { target: 'biceps', secondaryMuscles: [] })

  const shares = muscleDistribution([
    { targetSets: 3, exercise: press },
    { targetSets: 1, exercise: curl }
  ])

  assert.equal(shares[0].muscle, 'Pecho', 'el objetivo principal manda')
  assert.ok(shares.some(s => s.muscle === 'Biceps'))
  assert.ok(shares.some(s => s.muscle === 'Hombros'), 'los sinergistas cuentan menos pero cuentan')
  const total = shares.reduce((a, s) => a + s.percent, 0)
  assert.ok(Math.abs(total - 100) <= 2, `suma ${total}`)
})

test('los musculos se muestran en espanol', () => {
  assert.equal(muscleEs('quads'), 'Cuadriceps')
  assert.equal(muscleEs('lats'), 'Dorsales')
  assert.equal(muscleEs('hamstrings'), 'Femoral')
  assert.equal(muscleEs('unknown muscle'), 'Unknown muscle', 'lo que no conocemos se muestra tal cual')
})

test('la duracion estimada cuenta trabajo mas descanso', () => {
  // 3 series x (45 s + 135 s) = 9 min
  assert.equal(estimateMinutes([{ targetSets: 3, restSeconds: 135 }]), 9)
})

test('sembrar crea las rutinas, las asigna a sus dias y no duplica', async () => {
  await db.exercises.bulkPut(CATALOG)
  await ensureCardioCatalog()

  const first = await seedExampleRoutines()
  assert.deepEqual(first.created, ['Push', 'Pull', 'Pierna A', 'Pierna B', 'Cardio'])
  assert.equal(first.custom, 0, 'con este catalogo todo deberia salir del catalogo')

  const routines = (await db.routines.toArray()).filter(r => !r.deletedAt)
  assert.equal(routines.length, 5)

  const pierna = routines.find(r => r.name === 'Pierna A')!
  const items = (await db.routineItems.where('routineId').equals(pierna.id).toArray()).sort((a, b) => a.order - b.order)
  assert.equal(items.length, 5)
  assert.equal(items[0].targetSets, 3)
  assert.equal(items[0].targetRepsMin, 9)
  assert.equal(items[0].targetRepsMax, 11, 'el rango deja margen para la doble progresion')

  const schedule = await db.schedule.toArray()
  const assigned = SEED_ROUTINES.map(spec => {
    const day = schedule.find(d => d.weekday === spec.weekday)
    const routine = routines.find(r => r.id === day?.routineId)
    return routine?.name
  })
  assert.deepEqual(assigned, ['Push', 'Pull', 'Pierna A', 'Pierna B', 'Cardio'])

  const second = await seedExampleRoutines()
  assert.deepEqual(second.created, [])
  assert.equal((await db.routines.toArray()).filter(r => !r.deletedAt).length, 5, 'siguen siendo 5')
})

test('la rutina de cardio queda con duracion y sin series de fuerza', async () => {
  await ensureCardioCatalog()
  await seedExampleRoutines()

  const routines = (await db.routines.toArray()).filter(r => !r.deletedAt)
  const cardio = routines.find(r => r.name === 'Cardio')!
  const items = (await db.routineItems.where('routineId').equals(cardio.id).toArray())
    .sort((a, b) => a.order - b.order)

  assert.deepEqual(items.map(i => i.exerciseId), ['cardio-hiit', 'cardio-bici'])
  assert.deepEqual(items.map(i => i.targetDurationMin), [20, 45])
  assert.ok(items.every(i => i.targetRepsMax === 0 && i.restSeconds === 0))

  // 20 + 45 minutos, sin sumar descansos que aqui no existen
  assert.equal(estimateMinutes(items), 65)
})

test('sin catalogo las rutinas se crean igual con ejercicios propios', async () => {
  await db.delete()
  await db.open()

  const result = await seedExampleRoutines()
  assert.equal(result.created.length, 5)
  assert.ok(result.custom > 0)

  const custom = (await db.exercises.toArray()).filter(e => e.isCustom === 1)
  assert.ok(custom.every(e => e.target), 'llevan musculo objetivo para que la distribucion funcione')

  // Bulgara y Hip Thrust salen en dos rutinas: deben compartir el mismo ejercicio.
  const names = custom.map(e => e.alias)
  assert.equal(new Set(names).size, names.length, 'no se crean duplicados entre rutinas')
})
