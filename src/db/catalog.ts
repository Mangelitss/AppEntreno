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

/**
 * Importa el catalogo la primera vez (o cuando cambia de version).
 * Nunca toca los ejercicios que hayas creado tu ni tus overrides de incremento.
 */
export async function ensureCatalog(): Promise<{ count: number; source: 'dataset' | 'fallback' | 'cache' }> {
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

  // Preservamos favoritos e incrementos personalizados de lo que ya hubiera.
  const previous = await db.exercises.toArray()
  const overrides = new Map(previous.map(e => [e.id, { favorite: e.favorite, incrementKg: e.incrementKg }]))

  const rows = raws.map(raw => {
    const ex = toExercise(raw)
    const ov = overrides.get(ex.id)
    if (ov) { ex.favorite = ov.favorite; ex.incrementKg = ov.incrementKg }
    return ex
  })

  await db.exercises.bulkPut(rows)
  if (source === 'dataset') await saveSettings({ catalogVersion: CATALOG_VERSION })

  return { count: rows.length, source }
}
