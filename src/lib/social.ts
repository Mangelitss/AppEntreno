// ---------------------------------------------------------------------------
// Social: todo lo que se puede calcular sin red.
//
// Aqui vive la parte de Social que no habla con Firestore, para poder probarla
// con el runner de Node: los codigos de amigo, el post que resume un entreno,
// la mezcla del feed de varios amigos y el resumen de rangos que publica cada
// uno. Lo que lee y escribe en la nube esta en db/social.ts.
//
// Todo lo que llega de la nube pasa por una funcion read*: lo escribio otra
// persona desde su movil, y un campo raro no puede romperte la pantalla.
// ---------------------------------------------------------------------------

import type { Exercise, SetType, Workout, WorkoutExercise, WorkoutSet } from '../db/types'
import { dateKey } from '../db/repo'
import { isCardioSet } from './cardio'
import { heatColor, muscleWorkOf } from './muscle-work'
import { buildRank, DECAY_RATE, weeksBetween, type MuscleRank } from './ranks'
import { formatDateEs, totalVolume } from './stats'
import { dayNumber, MAX_GAP_DAYS, shiftDateKey, type Streak } from './streak'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// ---------------------------------------------------------------------------
// Codigos de amigo
//
// Ocho caracteres sin los que se confunden al dictarlos o copiarlos a mano
// (0/O, 1/I/L). Con 31 simbolos salen casi un billon de combinaciones, asi que
// toparse con uno ya cogido es rarisimo; y si pasa, se genera otro.
// ---------------------------------------------------------------------------

export const FRIEND_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const FRIEND_CODE_LENGTH = 8

const CODE_PATTERN = new RegExp(`^[${FRIEND_CODE_ALPHABET}]{${FRIEND_CODE_LENGTH}}$`)

/** Un numero en [0, 1), con crypto si lo hay: un codigo no deberia poder adivinarse. */
function secureRandom(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
  }
  return Math.random()
}

export function generateFriendCode(random: () => number = secureRandom): string {
  let code = ''
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) {
    code += FRIEND_CODE_ALPHABET[Math.floor(random() * FRIEND_CODE_ALPHABET.length)]
  }
  return code
}

/**
 * Lo que escribe o pega alguien, a codigo limpio. Admite minusculas, espacios,
 * el guion de en medio y hasta el enlace entero del boton Compartir.
 */
export function normalizeFriendCode(input: string): string {
  const fromLink = input.match(/\/amigo\/([^/?#\s]+)/i)
  const raw = fromLink ? fromLink[1] : input
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function isValidFriendCode(code: string): boolean {
  return CODE_PATTERN.test(code)
}

/** K7Q2XM9P -> K7Q2-XM9P, que se lee y se dicta mejor. */
export function formatFriendCode(code: string): string {
  return code.length === FRIEND_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

// ---------------------------------------------------------------------------
// Perfil publico
// ---------------------------------------------------------------------------

/**
 * Un enlace a una foto. Solo http(s), que es lo unico que las reglas dejan
 * guardar en el perfil publico: las fotos subidas son data URL y no salen
 * del dispositivo.
 */
export function isLink(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048 && /^https?:\/\/\S+$/.test(value)
}

/** Lo que ve de ti cualquiera que tenga tu codigo: nombre, foto y poco mas. */
export interface PublicProfile {
  uid: string
  displayName: string | null
  avatarUrl: string | null
  friendCode: string | null
  /** desde cuando publica sus entrenos */
  socialSince: number | null
}

export function readProfile(uid: string, data: Record<string, unknown> | undefined): PublicProfile {
  const name = data?.displayName
  const avatar = data?.avatarUrl
  const code = data?.friendCode
  return {
    uid,
    displayName: typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : null,
    avatarUrl: isLink(avatar) ? avatar : null,
    friendCode: typeof code === 'string' && isValidFriendCode(code) ? code : null,
    socialSince: numOrNull(data?.socialSince)
  }
}

// ---------------------------------------------------------------------------
// Amistades
//
// Una amistad es un documento "solicitante_destinatario". Nace pendiente y la
// acepta el destinatario; a partir de ahi es mutua y da igual quien la pidio.
// Rechazar, cancelar o dejar de ser amigos es borrar ese documento.
// ---------------------------------------------------------------------------

export type FriendshipStatus = 'pendiente' | 'aceptada'

export interface Friendship {
  id: string
  requesterId: string
  addresseeId: string
  status: FriendshipStatus
  createdAt: number
  acceptedAt: number | null
}

/** El id va en un orden fijo, asi la misma solicitud no puede existir dos veces. */
export function friendshipId(requesterId: string, addresseeId: string): string {
  return `${requesterId}_${addresseeId}`
}

export function readFriendship(id: string, data: Record<string, unknown>): Friendship {
  return {
    id,
    requesterId: typeof data.requesterId === 'string' ? data.requesterId : '',
    addresseeId: typeof data.addresseeId === 'string' ? data.addresseeId : '',
    status: data.status === 'aceptada' ? 'aceptada' : 'pendiente',
    createdAt: num(data.createdAt),
    acceptedAt: numOrNull(data.acceptedAt)
  }
}

export interface FriendEntry {
  /** la otra persona, nunca tu */
  uid: string
  friendship: Friendship
}

export interface FriendLists {
  friends: FriendEntry[]
  /** te las han mandado y esperan tu respuesta */
  incoming: FriendEntry[]
  /** las has mandado tu y aun no las han aceptado */
  outgoing: FriendEntry[]
}

export const NO_FRIENDS: FriendLists = { friends: [], incoming: [], outgoing: [] }

/** Reparte tus documentos de amistad en amigos, recibidas y enviadas. */
export function partitionFriendships(rows: Friendship[], me: string): FriendLists {
  const friends = new Map<string, FriendEntry>()
  const incoming: FriendEntry[] = []
  const outgoing: FriendEntry[] = []

  for (const friendship of rows) {
    const mine = friendship.requesterId === me
    if (!mine && friendship.addresseeId !== me) continue
    const other = mine ? friendship.addresseeId : friendship.requesterId
    if (!other || other === me) continue

    if (friendship.status === 'aceptada') friends.set(other, { uid: other, friendship })
    else (mine ? outgoing : incoming).push({ uid: other, friendship })
  }

  // Si ya sois amigos, una solicitud suelta entre los dos no pinta nada.
  const pending = (list: FriendEntry[]) => list
    .filter(entry => !friends.has(entry.uid))
    .sort((a, b) => b.friendship.createdAt - a.friendship.createdAt)

  return {
    friends: [...friends.values()]
      .sort((a, b) => (b.friendship.acceptedAt ?? 0) - (a.friendship.acceptedAt ?? 0)),
    incoming: pending(incoming),
    outgoing: pending(outgoing)
  }
}

export type Relation =
  | { kind: 'nada' }
  | { kind: 'amigos' | 'enviada' | 'recibida'; friendship: Friendship }

/** En que punto estas con alguien: lo que decide el boton de "Anadir". */
export function relationWith(lists: FriendLists, uid: string): Relation {
  const friend = lists.friends.find(entry => entry.uid === uid)
  if (friend) return { kind: 'amigos', friendship: friend.friendship }
  const received = lists.incoming.find(entry => entry.uid === uid)
  if (received) return { kind: 'recibida', friendship: received.friendship }
  const sent = lists.outgoing.find(entry => entry.uid === uid)
  if (sent) return { kind: 'enviada', friendship: sent.friendship }
  return { kind: 'nada' }
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export type PostKind = 'fuerza' | 'cardio' | 'mixto'

/** Una serie tal y como se publica: lo justo para pintarla, sin ids de nadie. */
export interface PostSet {
  type: SetType
  weight: number
  reps: number
  rir: number | null
  durationSec: number | null
  distanceKm: number | null
  kcal: number | null
  avgHr: number | null
}

export interface PostExercise {
  name: string
  cardio: boolean
  sets: PostSet[]
}

/**
 * Un entreno terminado, resumido para tus amigos.
 *
 * Es una copia congelada, como el propio entreno: lleva los nombres y las
 * series de aquel dia y el trabajo por musculo ya calculado, asi que quien lo
 * lee no necesita tu catalogo ni tus ejercicios propios para pintarlo.
 */
export interface Post {
  v: 1
  workoutId: string
  routineName: string
  dateKey: string
  startedAt: number
  finishedAt: number
  durationMs: number
  kind: PostKind
  /** kg movidos sin calentamientos, igual que en el historial */
  volumeKg: number
  /** series hechas, calentamientos incluidos, igual que en el historial */
  setCount: number
  /** series efectivas por musculo (objetivo 1, secundario 0,4): de aqui sale el muneco */
  muscles: Record<string, number>
  /** totales de cardio, solo si lo hubo */
  cardio: { durationSec: number; distanceKm: number; kcal: number } | null
  exercises: PostExercise[]
  updatedAt: number
}

function toPostSet(set: WorkoutSet): PostSet {
  return {
    type: set.type,
    weight: set.weight,
    reps: set.reps,
    rir: set.rir ?? null,
    durationSec: set.durationSec ?? null,
    distanceKm: set.distanceKm ?? null,
    kcal: set.kcal ?? null,
    avgHr: set.avgHr ?? null
  }
}

/**
 * El post de un entreno, o null si no hay nada que publicar: sin terminar,
 * borrado o sin ninguna serie hecha. Las series sin marcar no salen.
 */
export function buildPost(
  workout: Workout,
  links: WorkoutExercise[],
  sets: WorkoutSet[],
  exercises: Map<string, Exercise>
): Post | null {
  if (!workout.finishedAt || workout.deletedAt) return null

  const alive = links
    .filter(link => !link.deletedAt && link.workoutId === workout.id)
    .sort((a, b) => a.order - b.order)
  const linkIds = new Set(alive.map(link => link.id))

  // Solo lo que se hizo de verdad, y de ejercicios que siguen en el entreno.
  const done = sets
    .filter(set => !set.deletedAt && set.done === 1 && linkIds.has(set.workoutExerciseId))
    .sort((a, b) => a.order - b.order)
  if (done.length === 0) return null

  const byLink = new Map<string, WorkoutSet[]>()
  for (const set of done) {
    const list = byLink.get(set.workoutExerciseId)
    if (list) list.push(set); else byLink.set(set.workoutExerciseId, [set])
  }

  const out: PostExercise[] = []
  for (const link of alive) {
    const linkSets = byLink.get(link.id)
    if (!linkSets) continue
    out.push({
      name: link.exerciseName,
      cardio: exercises.get(link.exerciseId)?.tracking === 'cardio' || linkSets.every(isCardioSet),
      sets: linkSets.map(toPostSet)
    })
  }

  const muscles: Record<string, number> = {}
  for (const [muscle, work] of muscleWorkOf(done, exercises)) {
    muscles[muscle] = round(work.effectiveSets, 1)
  }

  const cardioSets = out.filter(exercise => exercise.cardio).flatMap(exercise => exercise.sets)
  const cardio = cardioSets.length === 0 ? null : {
    durationSec: cardioSets.reduce((acc, set) => acc + (set.durationSec ?? 0), 0),
    distanceKm: round(cardioSets.reduce((acc, set) => acc + (set.distanceKm ?? 0), 0), 2),
    kcal: cardioSets.reduce((acc, set) => acc + (set.kcal ?? 0), 0)
  }
  const strength = out.some(exercise => !exercise.cardio)

  return {
    v: 1,
    workoutId: workout.id,
    routineName: workout.routineName,
    dateKey: workout.dateKey,
    startedAt: workout.startedAt,
    finishedAt: workout.finishedAt,
    durationMs: Math.max(0, workout.finishedAt - workout.startedAt),
    kind: !cardio ? 'fuerza' : strength ? 'mixto' : 'cardio',
    volumeKg: Math.round(totalVolume(done)),
    setCount: done.length,
    muscles,
    cardio,
    exercises: out,
    updatedAt: Math.max(workout.updatedAt, ...alive.map(link => link.updatedAt), ...done.map(set => set.updatedAt))
  }
}

/**
 * Colores del muneco de un post, con la misma escala que Distribucion del
 * cuerpo: rojo el musculo que mas trabajo ese dia y hacia el verde el resto.
 */
export function postColors(muscles: Record<string, number>): Map<string, string> {
  const map = new Map<string, string>()
  const max = Math.max(0, ...Object.values(muscles))
  if (max <= 0) return map
  for (const [muscle, sets] of Object.entries(muscles)) {
    if (sets > 0) map.set(muscle, heatColor(sets / max))
  }
  return map
}

const SET_TYPES: SetType[] = ['warmup', 'normal', 'failure', 'drop']

export function readPost(id: string, data: Record<string, unknown>): Post {
  const muscles: Record<string, number> = {}
  if (isObject(data.muscles)) {
    for (const [muscle, sets] of Object.entries(data.muscles)) {
      if (typeof sets === 'number' && Number.isFinite(sets) && sets > 0) muscles[muscle] = sets
    }
  }

  const cardio = isObject(data.cardio) ? data.cardio : null
  const exercises = (Array.isArray(data.exercises) ? data.exercises : []).filter(isObject)

  return {
    v: 1,
    workoutId: id,
    routineName: typeof data.routineName === 'string' && data.routineName.trim()
      ? data.routineName.slice(0, 80) : 'Entreno',
    dateKey: typeof data.dateKey === 'string' ? data.dateKey : '',
    startedAt: num(data.startedAt),
    finishedAt: num(data.finishedAt),
    durationMs: Math.max(0, num(data.durationMs)),
    kind: data.kind === 'cardio' || data.kind === 'mixto' ? data.kind : 'fuerza',
    volumeKg: num(data.volumeKg),
    setCount: num(data.setCount),
    muscles,
    cardio: cardio
      ? { durationSec: num(cardio.durationSec), distanceKm: num(cardio.distanceKm), kcal: num(cardio.kcal) }
      : null,
    exercises: exercises.map(exercise => ({
      name: typeof exercise.name === 'string' ? exercise.name.slice(0, 80) : 'Ejercicio',
      cardio: exercise.cardio === true,
      sets: (Array.isArray(exercise.sets) ? exercise.sets : []).filter(isObject).map(set => ({
        type: SET_TYPES.includes(set.type as SetType) ? set.type as SetType : 'normal',
        weight: num(set.weight),
        reps: num(set.reps),
        rir: numOrNull(set.rir),
        durationSec: numOrNull(set.durationSec),
        distanceKm: numOrNull(set.distanceKm),
        kcal: numOrNull(set.kcal),
        avgHr: numOrNull(set.avgHr)
      }))
    })),
    updatedAt: num(data.updatedAt)
  }
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export interface FeedStream {
  owner: string
  /** de mas nuevo a mas viejo, como llegan de Firestore */
  posts: Post[]
  /** true si ya no quedan posts de este amigo por cargar */
  exhausted: boolean
}

export interface FeedItem {
  owner: string
  post: Post
}

/**
 * Mezcla los posts de varios amigos en un solo feed por fecha.
 *
 * Cada amigo se carga por paginas, asi que no vale con ensenar todo lo que
 * haya llegado: si de Ana tienes sus 10 ultimos (de esta semana) y de Luis
 * tambien (del mes pasado), entre medias faltan los anteriores de Ana. Solo se
 * ensena hasta el horizonte, el post mas viejo cargado de quien aun tiene
 * paginas pendientes; lo de detras sale al pulsar "Ver mas".
 */
export function mergeFeed(streams: FeedStream[]): { items: FeedItem[]; hasMore: boolean } {
  let horizon = -Infinity
  for (const stream of streams) {
    if (stream.exhausted || stream.posts.length === 0) continue
    horizon = Math.max(horizon, stream.posts[stream.posts.length - 1].finishedAt)
  }

  const items = streams
    .flatMap(stream => stream.posts.map(post => ({ owner: stream.owner, post })))
    .filter(item => item.post.finishedAt >= horizon)
    .sort((a, b) => b.post.finishedAt - a.post.finishedAt || a.owner.localeCompare(b.owner))

  return { items, hasMore: streams.some(stream => !stream.exhausted) }
}

/** "hace 5 min", "hace 2 h", "ayer" o la fecha, contado como en cualquier red social. */
export function timeAgoEs(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp
  if (diff < 60_000) return 'ahora'

  const today = dateKey(now)
  const day = dateKey(timestamp)
  if (day === today) {
    const minutes = Math.floor(diff / 60_000)
    return minutes < 60 ? `hace ${minutes} min` : `hace ${Math.floor(minutes / 60)} h`
  }
  if (day === shiftDateKey(today, -1)) return 'ayer'
  return formatDateEs(day)
}

// ---------------------------------------------------------------------------
// Rangos y actividad publicos
// ---------------------------------------------------------------------------

export interface PublishedRank {
  muscle: string
  points: number
  weeksTrained: number
  weeksIdle: number
}

export interface PublicActivity {
  workouts: number
  /** mejor racha historica, en dias entrenados */
  best: number
  /** dias de la racha que estaba viva al publicar; 0 si no la habia */
  streakDays: number
  lastDayKey: string | null
}

/**
 * Rangos y actividad que cada uno publica para sus amigos.
 *
 * Van los puntos y no el rango ya pintado para que quien los lee pueda aplicar
 * el abandono de las semanas que pasen sin que el otro vuelva a abrir la app:
 * si no, un amigo que lo deja veria su Diamante congelado para siempre.
 */
export interface PublicStats {
  v: 1
  /** semana en la que se calcularon los puntos */
  weekKey: string
  ranks: PublishedRank[]
  activity: PublicActivity
}

export function toPublicStats(ranks: MuscleRank[], weekKey: string, workouts: number, streak: Streak): PublicStats {
  return {
    v: 1,
    weekKey,
    ranks: ranks
      .map(r => ({ muscle: r.muscle, points: r.points, weeksTrained: r.weeksTrained, weeksIdle: r.weeksIdle }))
      .sort((a, b) => a.muscle.localeCompare(b.muscle)),
    activity: {
      workouts,
      best: streak.best,
      streakDays: streak.alive ? streak.days : 0,
      lastDayKey: streak.lastDayKey
    }
  }
}

/** Los rangos de un amigo a dia de hoy: sus puntos, menos el abandono de las semanas sin publicar. */
export function ranksFromPublic(stats: PublicStats, todayWeek: string): MuscleRank[] {
  const elapsed = Math.max(0, weeksBetween(stats.weekKey, todayWeek).length - 1)
  const decay = (1 - DECAY_RATE) ** elapsed
  return stats.ranks
    .map(r => buildRank(r.muscle, Math.round(r.points * decay), r.weeksTrained, r.weeksIdle + elapsed))
    .sort((a, b) => b.points - a.points)
}

/** La actividad de un amigo hoy: su racha solo sigue viva si no ha pasado el hueco maximo. */
export function activityFromPublic(
  stats: PublicStats,
  todayKey: string
): { workouts: number; streak: number; best: number } {
  const { workouts, best, streakDays, lastDayKey } = stats.activity
  const gap = lastDayKey ? dayNumber(todayKey) - dayNumber(lastDayKey) : Infinity
  return { workouts, best, streak: streakDays > 0 && gap <= MAX_GAP_DAYS ? streakDays : 0 }
}

export function readPublicStats(data: Record<string, unknown> | undefined): PublicStats | null {
  if (!data || typeof data.weekKey !== 'string' || !/^\d{4}-W\d{2}$/.test(data.weekKey)) return null

  const ranks = (Array.isArray(data.ranks) ? data.ranks : [])
    .filter(isObject)
    .filter(r => typeof r.muscle === 'string' && r.muscle.trim() !== '')
    .map(r => ({
      muscle: String(r.muscle).trim().toLowerCase(),
      points: Math.max(0, num(r.points)),
      weeksTrained: Math.max(0, num(r.weeksTrained)),
      weeksIdle: Math.max(0, num(r.weeksIdle))
    }))

  const activity = isObject(data.activity) ? data.activity : {}
  const last = activity.lastDayKey
  return {
    v: 1,
    weekKey: data.weekKey,
    ranks,
    activity: {
      workouts: Math.max(0, num(activity.workouts)),
      best: Math.max(0, num(activity.best)),
      streakDays: Math.max(0, num(activity.streakDays)),
      lastDayKey: typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : null
    }
  }
}

/** Huella corta de un objeto, para saber si ha cambiado sin guardar una copia entera. */
export function hashOf(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  return `${hash.toString(36)}-${text.length.toString(36)}`
}
