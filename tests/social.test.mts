// Social: codigos de amigo, posts, feed, amistades y rangos publicos.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { db } from '../src/db/db.ts'
import { collectPostChanges, collectStats } from '../src/db/social.ts'
import { keepingImages, withoutImages } from '../src/db/sync.ts'
import { heatColor } from '../src/lib/muscle-work.ts'
import {
  DECAY_RATE, buildRank, computeMuscleRanks, groupRanks, type WeekMuscleData
} from '../src/lib/ranks.ts'
import { computeStreak } from '../src/lib/streak.ts'
import { formatDateEs } from '../src/lib/stats.ts'
import {
  FRIEND_CODE_ALPHABET, activityFromPublic, buildPost, formatFriendCode, generateFriendCode,
  isValidFriendCode, mergeFeed, normalizeFriendCode, partitionFriendships, postColors,
  ranksFromPublic, readPost, readProfile, readPublicStats, relationWith, timeAgoEs, toPublicStats,
  type FeedStream, type Friendship, type Post
} from '../src/lib/social.ts'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../src/db/types.ts'

// --- datos de prueba -------------------------------------------------------

const exercise = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id, name: id, search: id, category: 'chest', equipment: 'barbell', target: 'pectorals',
  secondaryMuscles: [], instructions: [], image: null, gif: null, isCustom: 0, favorite: 0,
  incrementKg: null, updatedAt: 1, deletedAt: null, ...over
})

const BENCH = exercise('bench', { secondaryMuscles: ['triceps', 'delts'] })
const SQUAT = exercise('squat', { category: 'upper legs', target: 'quads', secondaryMuscles: ['glutes'] })
const BIKE = exercise('bike', {
  category: 'cardio', target: 'cardiovascular system', tracking: 'cardio', cardioKind: 'distance'
})
const CATALOG = new Map([BENCH, SQUAT, BIKE].map(e => [e.id, e]))

const HOUR = 3_600_000

const workout = (over: Partial<Workout> = {}): Workout => ({
  id: 'w1', routineId: 'r1', routineName: 'Push', startedAt: 10 * HOUR, finishedAt: 11 * HOUR,
  notes: '', dateKey: '2026-10-01', updatedAt: 5, deletedAt: null, ...over
})

const NAMES: Record<string, string> = { bench: 'Press banca', squat: 'Sentadilla', bike: 'Bici' }

const link = (id: string, exerciseId: string, order: number, over: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  id, workoutId: 'w1', exerciseId, exerciseName: NAMES[exerciseId], order, targetSets: 3,
  targetRepsMin: 8, targetRepsMax: 10, restSeconds: 120, notes: '', updatedAt: 5, deletedAt: null, ...over
})

let counter = 0
const set = (workoutExerciseId: string, exerciseId: string, over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${++counter}`, workoutId: 'w1', workoutExerciseId, exerciseId, order: counter,
  weight: 60, reps: 10, rir: 2, type: 'normal', done: 1, completedAt: 1, updatedAt: 5, deletedAt: null, ...over
})

/** Un entreno de fuerza con un poco de todo: calentamiento, fallo, dropset y una serie sin hacer. */
function pushDay() {
  const links = [link('l1', 'bench', 0), link('l2', 'squat', 1)]
  const sets = [
    set('l1', 'bench', { type: 'warmup', weight: 20, reps: 10, rir: null }),
    set('l1', 'bench', { weight: 60, reps: 10, rir: 2 }),
    set('l1', 'bench', { type: 'failure', weight: 60, reps: 8, rir: null }),
    set('l1', 'bench', { weight: 60, reps: 10, done: 0 }),
    set('l2', 'squat', { weight: 100, reps: 5, rir: 1 }),
    set('l2', 'squat', { type: 'drop', weight: 80, reps: 8, rir: 0 })
  ]
  return { links, sets }
}

// --- codigos de amigo ------------------------------------------------------

test('un codigo son 8 caracteres del alfabeto sin los que se confunden', () => {
  let seed = 0
  const code = generateFriendCode(() => (seed++ * 0.137) % 1)
  assert.equal(code.length, 8)
  assert.ok([...code].every(char => FRIEND_CODE_ALPHABET.includes(char)))
  assert.ok(isValidFriendCode(code))
  assert.ok(isValidFriendCode(generateFriendCode()), 'tambien con el aleatorio de verdad')

  for (const confusing of ['0', 'O', '1', 'I', 'L']) {
    assert.ok(!FRIEND_CODE_ALPHABET.includes(confusing), `sin ${confusing}`)
  }
})

test('el codigo se acepta como venga: minusculas, guion, espacios o el enlace entero', () => {
  assert.equal(normalizeFriendCode(' k7q2-xm9p '), 'K7Q2XM9P')
  assert.equal(normalizeFriendCode('https://appentreno-31a7d.web.app/amigo/K7Q2XM9P?ref=wa'), 'K7Q2XM9P')
  assert.equal(formatFriendCode('K7Q2XM9P'), 'K7Q2-XM9P')
})

test('se rechaza lo que no puede ser un codigo', () => {
  assert.equal(isValidFriendCode('K7Q2XM9'), false, 'corto')
  assert.equal(isValidFriendCode('K7Q2XM9PP'), false, 'largo')
  assert.equal(isValidFriendCode('K7Q2XM0P'), false, 'con un cero')
  assert.equal(isValidFriendCode('k7q2xm9p'), false, 'sin normalizar')
})

// --- posts -----------------------------------------------------------------

test('el post resume solo lo que se hizo: sin series sin marcar', () => {
  const { links, sets } = pushDay()
  const post = buildPost(workout(), links, sets, CATALOG)!

  assert.equal(post.routineName, 'Push')
  assert.equal(post.kind, 'fuerza')
  assert.deepEqual(post.exercises.map(e => e.name), ['Press banca', 'Sentadilla'])
  assert.deepEqual(post.exercises[0].sets.map(s => s.type), ['warmup', 'normal', 'failure'])
  assert.equal(post.setCount, 5, 'calentamiento incluido, igual que el historial')
  assert.equal(post.durationMs, HOUR)
  assert.equal(post.cardio, null)
})

test('kilos y musculos del post cuentan igual que el resto de la app', () => {
  const { links, sets } = pushDay()
  const post = buildPost(workout(), links, sets, CATALOG)!

  // 60x10 + 60x8 + 100x5 + 80x8: el calentamiento no suma kilos
  assert.equal(post.volumeKg, 2220)
  // Objetivo 1 por serie, secundario 0,4; calentamiento fuera
  assert.deepEqual(post.muscles, { pectorals: 2, triceps: 0.8, delts: 0.8, quads: 2, glutes: 0.8 })
})

test('el muneco del post pinta en rojo lo que mas trabajo y escala el resto', () => {
  const colors = postColors({ pectorals: 2, triceps: 0.8 })
  assert.equal(colors.get('pectorals'), heatColor(1))
  assert.equal(colors.get('triceps'), heatColor(0.4))
  assert.equal(postColors({}).size, 0, 'sin musculos no hay nada que pintar')
})

test('una sesion de cardio publica sus totales en vez del muneco', () => {
  const links = [link('l1', 'bike', 0)]
  const sets = [set('l1', 'bike', {
    weight: 0, reps: 0, rir: null, durationSec: 2700, distanceKm: 20.5, kcal: 600, avgHr: 140
  })]
  const post = buildPost(workout({ routineName: 'Bici' }), links, sets, CATALOG)!

  assert.equal(post.kind, 'cardio')
  assert.deepEqual(post.cardio, { durationSec: 2700, distanceKm: 20.5, kcal: 600 })
  assert.deepEqual(post.muscles, {}, 'el cardio no reparte series entre musculos')
  assert.equal(post.volumeKg, 0)
})

test('fuerza y cardio en el mismo entreno es un post mixto', () => {
  const { links, sets } = pushDay()
  const withBike = [...links, link('l3', 'bike', 2)]
  const allSets = [...sets, set('l3', 'bike', { weight: 0, reps: 0, durationSec: 600, distanceKm: 5, kcal: 90 })]
  const post = buildPost(workout(), withBike, allSets, CATALOG)!
  assert.equal(post.kind, 'mixto')
  assert.equal(post.cardio?.durationSec, 600)
})

test('no hay post de un entreno sin terminar, borrado o vacio', () => {
  const { links, sets } = pushDay()
  assert.equal(buildPost(workout({ finishedAt: null }), links, sets, CATALOG), null, 'en curso')
  assert.equal(buildPost(workout({ deletedAt: 9 }), links, sets, CATALOG), null, 'borrado')
  assert.equal(buildPost(workout(), links, sets.map(s => ({ ...s, done: 0 as const })), CATALOG), null, 'nada hecho')
})

test('las series de un ejercicio quitado del entreno no salen', () => {
  const { links, sets } = pushDay()
  const post = buildPost(workout(), [links[0], { ...links[1], deletedAt: 9 }], sets, CATALOG)!
  assert.deepEqual(post.exercises.map(e => e.name), ['Press banca'])
  assert.equal(post.muscles.quads, undefined)
})

test('lo que llega de un amigo se valida antes de pintarlo', () => {
  const post = readPost('x', {
    routineName: 42,
    finishedAt: 'ayer',
    kind: 'raro',
    muscles: { pectorals: 3, biceps: 'mucho', quads: -1 },
    exercises: [{ name: 'Curl', sets: [{ type: 'trampa', weight: 20, reps: 10 }, 'basura'] }, null]
  })
  assert.equal(post.routineName, 'Entreno')
  assert.equal(post.finishedAt, 0)
  assert.equal(post.kind, 'fuerza')
  assert.deepEqual(post.muscles, { pectorals: 3 })
  assert.equal(post.exercises.length, 1)
  assert.deepEqual(post.exercises[0].sets.map(s => [s.type, s.weight, s.reps, s.rir]), [['normal', 20, 10, null]])
})

test('del perfil de otro solo se acepta un enlace como foto', () => {
  assert.equal(readProfile('u', { avatarUrl: 'https://img.example/yo.jpg' }).avatarUrl, 'https://img.example/yo.jpg')
  assert.equal(readProfile('u', { avatarUrl: 'javascript:alert(1)' }).avatarUrl, null)
  assert.equal(readProfile('u', { avatarUrl: 'data:image/png;base64,AA' }).avatarUrl, null)
  assert.equal(readProfile('u', { displayName: '   ' }).displayName, null)
  assert.equal(readProfile('u', { friendCode: 'nope' }).friendCode, null)
})

// --- feed ------------------------------------------------------------------

const post = (finishedAt: number): Post => ({ ...readPost(`p${finishedAt}`, { finishedAt }) })

test('el feed mezcla por fecha y no ensena huecos que aun no se han cargado', () => {
  const ana: FeedStream = { owner: 'ana', posts: [100, 90, 80, 70, 60, 50].map(post), exhausted: false }
  const luis: FeedStream = { owner: 'luis', posts: [95, 20].map(post), exhausted: true }

  const { items, hasMore } = mergeFeed([ana, luis])
  assert.deepEqual(items.map(i => i.post.finishedAt), [100, 95, 90, 80, 70, 60, 50])
  assert.ok(!items.some(i => i.post.finishedAt === 20), 'lo de Luis de antes de 50 espera a la siguiente pagina de Ana')
  assert.equal(hasMore, true)

  const all = mergeFeed([{ ...ana, exhausted: true }, luis])
  assert.equal(all.items.length, 8, 'con todo cargado sale todo')
  assert.equal(all.hasMore, false)
})

test('sin amigos el feed esta vacio y no hay mas que cargar', () => {
  assert.deepEqual(mergeFeed([]), { items: [], hasMore: false })
})

// --- amistades -------------------------------------------------------------

const friendship = (requesterId: string, addresseeId: string, status: Friendship['status'], at = 1): Friendship => ({
  id: `${requesterId}_${addresseeId}`, requesterId, addresseeId, status, createdAt: at, acceptedAt: status === 'aceptada' ? at : null
})

test('las amistades se reparten en amigos, recibidas y enviadas', () => {
  const lists = partitionFriendships([
    friendship('yo', 'ana', 'pendiente'),
    friendship('luis', 'yo', 'pendiente'),
    friendship('yo', 'eva', 'aceptada', 5),
    friendship('pablo', 'yo', 'aceptada', 9),
    friendship('otro', 'otra', 'aceptada'),
    // Una solicitud suelta con quien ya eres amigo no cuenta como pendiente
    friendship('eva', 'yo', 'pendiente')
  ], 'yo')

  assert.deepEqual(lists.friends.map(f => f.uid), ['pablo', 'eva'], 'la mas reciente primero')
  assert.deepEqual(lists.incoming.map(f => f.uid), ['luis'])
  assert.deepEqual(lists.outgoing.map(f => f.uid), ['ana'])

  assert.equal(relationWith(lists, 'eva').kind, 'amigos')
  assert.equal(relationWith(lists, 'luis').kind, 'recibida')
  assert.equal(relationWith(lists, 'ana').kind, 'enviada')
  assert.equal(relationWith(lists, 'nadie').kind, 'nada')
})

// --- rangos y actividad publicos ------------------------------------------

const week = (n: number) => `2026-W${String(n).padStart(2, '0')}`
const weeks = (from: number, to: number, over: Partial<WeekMuscleData> = {}): WeekMuscleData[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    weekKey: week(from + i), muscle: 'biceps', effectiveSets: 10, bestE1rm: 50 + i, intensityRatio: 1, ...over
  }))

test('los rangos publicados se leen igual que los ve su dueno', () => {
  const ranks = computeMuscleRanks(weeks(10, 20), week(20))
  const stats = toPublicStats(ranks, week(20), 30, computeStreak([], '2026-05-15'))
  const read = ranksFromPublic(stats, week(20))

  assert.deepEqual(read.map(r => [r.muscle, r.points, r.tier, r.division]), ranks.map(r => [r.muscle, r.points, r.tier, r.division]))
})

test('si un amigo deja de publicar, sus rangos van perdiendo como si no entrenara', () => {
  const ranks = computeMuscleRanks(weeks(10, 20), week(20))
  const stats = toPublicStats(ranks, week(20), 30, computeStreak([], '2026-05-15'))
  const later = ranksFromPublic(stats, week(23))

  assert.equal(later[0].points, Math.round(ranks[0].points * (1 - DECAY_RATE) ** 3))
  assert.equal(later[0].weeksIdle, ranks[0].weeksIdle + 3)
  // Y casi exactamente lo que le saldria a su dueno con su historial: solo cambia el redondeo
  const own = computeMuscleRanks(weeks(10, 20), week(23))
  assert.ok(Math.abs(own[0].points - later[0].points) <= 1)
})

test('la racha de un amigo se apaga sola si pasa el hueco maximo', () => {
  const streak = computeStreak(['2026-10-01', '2026-10-02', '2026-10-03'], '2026-10-03')
  const stats = toPublicStats([], week(40), 3, streak)

  assert.deepEqual(activityFromPublic(stats, '2026-10-05'), { workouts: 3, streak: 3, best: 3 })
  assert.deepEqual(activityFromPublic(stats, '2026-10-07'), { workouts: 3, streak: 0, best: 3 }, 'cuatro dias despues ya no aguanta')
})

test('unas estadisticas sin semana no se aceptan', () => {
  assert.equal(readPublicStats({ ranks: [] }), null)
  assert.equal(readPublicStats(undefined), null)
  const ok = readPublicStats({ weekKey: '2026-W40', ranks: [{ muscle: 'Biceps', points: -5 }], activity: {} })!
  assert.deepEqual(ok.ranks, [{ muscle: 'biceps', points: 0, weeksTrained: 0, weeksIdle: 0 }])
  assert.equal(ok.activity.lastDayKey, null)
})

test('el rango de un grupo es la media de sus musculos con rango', () => {
  const groups = groupRanks([
    buildRank('pectorals', 1300, 5, 0),
    buildRank('serratus anterior', 50, 1, 0)
  ])
  const chest = groups.find(g => g.id === 'pecho')!
  assert.equal(chest.points, 1300, 'el que esta calibrando no baja la media')
  assert.equal(chest.ranked, 1)
  assert.equal(chest.total, 2)
  assert.equal(chest.title, 'ORO III')
  assert.equal(groups.find(g => g.id === 'piernas')!.title, 'Sin rango')
})

// --- tiempo ----------------------------------------------------------------

test('cuando se termino un post se cuenta como en una red social', () => {
  const now = new Date(2026, 9, 3, 18, 0).getTime()
  assert.equal(timeAgoEs(now - 30_000, now), 'ahora')
  assert.equal(timeAgoEs(now - 5 * 60_000, now), 'hace 5 min')
  assert.equal(timeAgoEs(now - 3 * HOUR, now), 'hace 3 h')
  assert.equal(timeAgoEs(new Date(2026, 9, 2, 23, 30).getTime(), now), 'ayer')
  assert.equal(timeAgoEs(new Date(2026, 8, 30, 12, 0).getTime(), now), formatDateEs('2026-09-30'))
  assert.equal(timeAgoEs(now + HOUR, now), 'ahora', 'un reloj adelantado no da tiempos negativos')
})

// --- sync de fotos ---------------------------------------------------------

test('una foto subida se queda en casa; un enlace si viaja', () => {
  assert.equal('avatarUrl' in withoutImages('profile', { avatarUrl: 'data:image/jpeg;base64,AA' }), false)
  assert.equal(withoutImages('profile', { avatarUrl: 'https://img.example/yo.jpg' }).avatarUrl, 'https://img.example/yo.jpg')
})

test('al bajar, manda el enlace que llega; si no llega nada, se conserva la foto local', () => {
  const local = { id: 'profile', avatarUrl: 'data:image/jpeg;base64,AA' }
  assert.equal(keepingImages('profile', { id: 'profile', avatarUrl: 'https://img.example/yo.jpg' }, local).avatarUrl, 'https://img.example/yo.jpg')
  assert.equal(keepingImages('profile', { id: 'profile' } as typeof local, local).avatarUrl, local.avatarUrl)
  assert.equal(keepingImages('profile', { id: 'profile', avatarUrl: null } as unknown as typeof local, local).avatarUrl, local.avatarUrl)
})

// --- que se publica --------------------------------------------------------

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function storeWorkout(id: string, over: Partial<Workout>, updatedAt: number) {
  const { links, sets } = pushDay()
  await db.workouts.put(workout({ id, updatedAt, ...over }))
  await db.workoutExercises.bulkPut(links.map(l => ({ ...l, id: `${id}-${l.id}`, workoutId: id, updatedAt })))
  await db.sets.bulkPut(sets.map(s => ({
    ...s, id: `${id}-${s.id}`, workoutId: id, workoutExerciseId: `${id}-${s.workoutExerciseId}`, updatedAt
  })))
}

test('se publica lo terminado desde que se activo Social, y lo borrado se retira', async () => {
  await db.exercises.bulkPut([BENCH, SQUAT, BIKE])
  const since = 1_000
  await storeWorkout('nuevo', { finishedAt: 2_000 }, 10)
  await storeWorkout('antiguo', { finishedAt: 500 }, 10)
  await storeWorkout('en-curso', { finishedAt: null }, 10)
  await storeWorkout('borrado', { finishedAt: 3_000, deletedAt: 11 }, 11)

  const { changes, highest } = await collectPostChanges(0, since)
  const byId = new Map(changes.map(c => [c.id, c.post]))

  assert.deepEqual([...byId.keys()].sort(), ['borrado', 'nuevo'])
  assert.equal(byId.get('nuevo')?.volumeKg, 2220)
  assert.equal(byId.get('borrado'), null, 'se borra el post')
  assert.equal(highest, 11)

  const again = await collectPostChanges(highest, since)
  assert.equal(again.changes.length, 0, 'sin cambios no se vuelve a subir nada')
})

test('corregir una serie de un entreno ya publicado actualiza su post', async () => {
  await db.exercises.bulkPut([BENCH, SQUAT, BIKE])
  await storeWorkout('nuevo', { finishedAt: 2_000 }, 10)
  const first = await collectPostChanges(0, 1_000)

  const squatSet = (await db.sets.where('workoutId').equals('nuevo').toArray()).find(s => s.weight === 100)!
  await db.sets.update(squatSet.id, { weight: 110, updatedAt: 20 })

  const { changes } = await collectPostChanges(first.highest, 1_000)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].post?.volumeKg, 2270)
})

test('los rangos solo se recalculan si cambia el historial', async () => {
  const first = await collectStats(0, null, null)
  assert.ok(first, 'la primera vez siempre')
  assert.equal(await collectStats(first.highest, first.rows, first.hash), null, 'sin cambios, nada')

  await db.workouts.put(workout({ id: 'w9', updatedAt: 50 }))
  const second = await collectStats(first.highest, first.rows, first.hash)
  assert.ok(second, 'un entreno nuevo obliga a recalcular')

  await db.workouts.clear()
  assert.ok(await collectStats(second.highest, second.rows, second.hash), 'Borrar historial tambien')
})
