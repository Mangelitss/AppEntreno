import { db, getSettings, saveSettings } from './db'
import type { Exercise } from './types'
import { normalize } from '../lib/stats'

export const MEDIA_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/'
export const MEDIA_ATTRIBUTION = '© Gym visual — gymvisual.com'

export function mediaUrl(path: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  return MEDIA_BASE + path.replace(/^\//, '')
}

interface RawExercise {
  id: string
  name: string
  search?: string
  category: string
  equipment: string
  target: string
  secondaryMuscles?: string[]
  instructions?: string[]
  image?: string | null
  gif?: string | null
}

function toExercise(raw: RawExercise): Exercise {
  return {
    id: raw.id,
    name: raw.name,
    search: raw.search || normalize([raw.name, raw.target, raw.equipment, raw.category].join(' ')),
    category: raw.category || '',
    equipment: raw.equipment || '',
    target: raw.target || '',
    secondaryMuscles: raw.secondaryMuscles || [],
    instructions: raw.instructions || [],
    image: raw.image ?? null,
    gif: raw.gif ?? null,
    isCustom: 0,
    favorite: 0,
    incrementKg: null,
    updatedAt: Date.now(),
    deletedAt: null
  }
}

/**
 * Catalogo minimo de emergencia con ids reales del dataset, para que la app
 * nunca arranque vacia si la descarga fallo. Al importar el catalogo completo
 * estos registros se sobreescriben solos porque comparten id.
 */
const FALLBACK: RawExercise[] = [
  { id: '0025', name: 'barbell bench press', category: 'chest', equipment: 'barbell', target: 'pectorals', image: 'images/0025-EIeI8Vf.jpg', gif: 'videos/0025-EIeI8Vf.gif' },
  { id: '0043', name: 'barbell full squat', category: 'upper legs', equipment: 'barbell', target: 'glutes', image: 'images/0043-qXTaZnJ.jpg', gif: 'videos/0043-qXTaZnJ.gif' },
  { id: '0032', name: 'barbell deadlift', category: 'upper legs', equipment: 'barbell', target: 'glutes', image: 'images/0032-ila4NZS.jpg', gif: 'videos/0032-ila4NZS.gif' },
  { id: '0652', name: 'pull-up', category: 'back', equipment: 'body weight', target: 'lats', image: 'images/0652-lBDjFxJ.jpg', gif: 'videos/0652-lBDjFxJ.gif' },
  { id: '0294', name: 'dumbbell biceps curl', category: 'upper arms', equipment: 'dumbbell', target: 'biceps', image: 'images/0294-NbVPDMW.jpg', gif: 'videos/0294-NbVPDMW.gif' },
  { id: '0334', name: 'dumbbell lateral raise', category: 'shoulders', equipment: 'dumbbell', target: 'delts', image: 'images/0334-DsgkuIt.jpg', gif: 'videos/0334-DsgkuIt.gif' },
  { id: '0001', name: '3/4 sit-up', category: 'waist', equipment: 'body weight', target: 'abs', image: 'images/0001-2gPfomN.jpg', gif: 'videos/0001-2gPfomN.gif' }
]

const CATALOG_VERSION = 1

/** Campos que vienen del dataset y por tanto se pueden restaurar. */
export type DatasetFields = Pick<
  Exercise,
  'name' | 'category' | 'equipment' | 'target' | 'secondaryMuscles' | 'instructions' | 'image' | 'gif'
>

let datasetCache: Map<string, RawExercise> | null = null

async function loadDataset(): Promise<Map<string, RawExercise>> {
  if (datasetCache) return datasetCache

  let list: RawExercise[] = FALLBACK
  try {
    const res = await fetch('/data/exercises.json', { cache: 'force-cache' })
    if (res.ok) {
      const json = await res.json()
      const parsed: RawExercise[] = Array.isArray(json) ? json : json.exercises
      if (Array.isArray(parsed) && parsed.length > 0) list = parsed
    }
  } catch {
    // sin red ni fichero: solo tendremos los del catalogo minimo
  }

  datasetCache = new Map(list.map(raw => [String(raw.id), raw]))
  return datasetCache
}

/**
 * Como venia un ejercicio en el dataset, para poder deshacer tus ediciones.
 * Devuelve null si lo creaste tu o si no esta en el fichero descargado.
 */
export async function datasetOriginal(id: string): Promise<DatasetFields | null> {
  const raw = (await loadDataset()).get(id)
  if (!raw) return null

  const { name, category, equipment, target, secondaryMuscles, instructions, image, gif } = toExercise(raw)
  return { name, category, equipment, target, secondaryMuscles, instructions, image, gif }
}

/** Campos del dataset que se sustituyen al reimportar. */
const DATASET_FIELDS = [
  'name', 'category', 'equipment', 'target', 'secondaryMuscles', 'instructions', 'image', 'gif'
] as const

/** Cuantos ejercicios del catalogo tienen algun campo cambiado a mano. */
export async function countEditedExercises(): Promise<number> {
  const all = await db.exercises.toArray()
  return all.filter(e => e.isCustom !== 1 && (e.editedFields?.length ?? 0) > 0).length
}

export interface CatalogOptions {
  /** true = tus ediciones a mano no se pisan. Por defecto se conservan. */
  preserveEdits?: boolean
}

/**
 * Importa el catalogo la primera vez (o cuando cambia de version).
 *
 * Nunca toca los ejercicios que hayas creado tu. De los del dataset conserva
 * siempre lo que es tuyo (favorito, incremento, anotaciones, imagenes propias,
 * archivado) y, si preserveEdits, tambien los campos que hayas editado a mano.
 */
export async function ensureCatalog(
  options: CatalogOptions = {}
): Promise<{ count: number; source: 'dataset' | 'fallback' | 'cache' }> {
  const preserveEdits = options.preserveEdits ?? true
  const settings = await getSettings()
  const existing = await db.exercises.count()

  if (existing > 0 && settings.catalogVersion >= CATALOG_VERSION) {
    return { count: existing, source: 'cache' }
  }

  let raws: RawExercise[] = FALLBACK
  let source: 'dataset' | 'fallback' = 'fallback'

  try {
    const res = await fetch('/data/exercises.json', { cache: 'no-cache' })
    if (res.ok) {
      const json = await res.json()
      const list: RawExercise[] = Array.isArray(json) ? json : json.exercises
      if (Array.isArray(list) && list.length > 0) {
        raws = list
        source = 'dataset'
      }
    }
  } catch {
    // sin red o sin fichero: seguimos con el catalogo minimo
  }

  const previous = new Map((await db.exercises.toArray()).map(e => [e.id, e]))

  const rows = raws.map(raw => {
    const fresh = toExercise(raw)
    const old = previous.get(fresh.id)
    if (!old) return fresh

    // Lo que es tuyo no lo decide el dataset.
    fresh.favorite = old.favorite
    fresh.incrementKg = old.incrementKg
    fresh.alias = old.alias ?? fresh.alias
    fresh.props = old.props
    fresh.imageData = old.imageData
    fresh.gifData = old.gifData
    fresh.archived = old.archived
    fresh.tracking = old.tracking
    fresh.cardioKind = old.cardioKind
    fresh.paceStyle = old.paceStyle
    fresh.editedFields = old.editedFields

    if (preserveEdits) {
      for (const field of old.editedFields ?? []) {
        if ((DATASET_FIELDS as readonly string[]).includes(field)) {
          // @ts-expect-error copia campo a campo por nombre
          fresh[field] = old[field]
        }
      }
    } else {
      fresh.editedFields = []
    }

    return fresh
  })

  await db.exercises.bulkPut(rows)
  if (source === 'dataset') await saveSettings({ catalogVersion: CATALOG_VERSION })

  return { count: rows.length, source }
}
