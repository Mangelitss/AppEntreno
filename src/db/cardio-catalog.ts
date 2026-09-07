// ---------------------------------------------------------------------------
// Catalogo de actividades de cardio.
//
// El dataset de ejercicios trae poco cardio y ningun deporte: no hay tenis ni
// padel. Estas se crean aparte con id fijo, asi que darlas de alta es
// idempotente y puedes editarlas (o borrarlas) sin que vuelvan a aparecer
// duplicadas al siguiente arranque.
// ---------------------------------------------------------------------------

import { db } from './db'
import { now } from './repo'
import { normalize } from '../lib/stats'
import type { CardioKind, PaceStyle } from '../lib/cardio'
import type { Exercise } from './types'

interface ActivitySpec {
  id: string
  name: string
  kind: CardioKind
  pace?: PaceStyle
  /** musculo/sistema que se muestra en la miniatura */
  target: string
}

const ACTIVITIES: ActivitySpec[] = [
  { id: 'cardio-hiit', name: 'HIIT', kind: 'hiit', target: 'cardiovascular system' },
  { id: 'cardio-circuito', name: 'Circuito funcional', kind: 'hiit', target: 'cardiovascular system' },
  { id: 'cardio-comba', name: 'Comba', kind: 'hiit', target: 'calves' },
  { id: 'cardio-carrera', name: 'Carrera', kind: 'distance', pace: 'pace', target: 'cardiovascular system' },
  { id: 'cardio-cinta', name: 'Cinta', kind: 'distance', pace: 'pace', target: 'cardiovascular system' },
  { id: 'cardio-bici', name: 'Bicicleta', kind: 'distance', pace: 'speed', target: 'quads' },
  { id: 'cardio-bici-estatica', name: 'Bicicleta estatica', kind: 'distance', pace: 'speed', target: 'quads' },
  { id: 'cardio-natacion', name: 'Natacion', kind: 'distance', pace: 'pace100', target: 'lats' },
  { id: 'cardio-remo', name: 'Remo', kind: 'distance', pace: 'speed', target: 'upper back' },
  { id: 'cardio-eliptica', name: 'Eliptica', kind: 'distance', pace: 'speed', target: 'cardiovascular system' },
  { id: 'cardio-caminar', name: 'Caminar', kind: 'distance', pace: 'pace', target: 'cardiovascular system' },
  { id: 'cardio-tenis', name: 'Tenis', kind: 'sport', target: 'cardiovascular system' },
  { id: 'cardio-padel', name: 'Padel', kind: 'sport', target: 'cardiovascular system' },
  { id: 'cardio-futbol', name: 'Futbol', kind: 'sport', target: 'cardiovascular system' },
  { id: 'cardio-baloncesto', name: 'Baloncesto', kind: 'sport', target: 'cardiovascular system' },
  { id: 'cardio-escalada', name: 'Escalada', kind: 'sport', target: 'lats' },
  { id: 'cardio-senderismo', name: 'Senderismo', kind: 'distance', pace: 'pace', target: 'quads' }
]

function toExercise(spec: ActivitySpec): Exercise {
  return {
    id: spec.id,
    name: spec.name,
    alias: spec.name,
    search: normalize([spec.name, 'cardio', spec.kind].join(' ')),
    category: 'cardio',
    equipment: spec.kind === 'sport' ? 'deporte' : 'cardio',
    target: spec.target,
    secondaryMuscles: [],
    instructions: [],
    image: null,
    gif: null,
    isCustom: 1,
    favorite: 0,
    incrementKg: null,
    tracking: 'cardio',
    cardioKind: spec.kind,
    paceStyle: spec.pace ?? null,
    updatedAt: now(),
    deletedAt: null
  }
}

/** Da de alta las actividades que falten, sin tocar las que ya existan. */
export async function ensureCardioCatalog(): Promise<void> {
  const existing = new Set((await db.exercises.bulkGet(ACTIVITIES.map(a => a.id)))
    .filter(Boolean)
    .map(e => e!.id))

  const missing = ACTIVITIES.filter(a => !existing.has(a.id)).map(toExercise)
  if (missing.length) await db.exercises.bulkPut(missing)
}

export const CARDIO_ACTIVITY_IDS = ACTIVITIES.map(a => a.id)
