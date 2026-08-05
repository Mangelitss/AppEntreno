#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Descarga el catalogo de ejercicios y lo recorta a lo que usa la app.
//
// El JSON original trae instrucciones en 10 idiomas y pesa bastante. Aqui nos
// quedamos con espanol y los metadatos, con lo que baja a un par de MB y se
// puede empaquetar en la app para que la busqueda funcione offline.
//
// Los GIFs y miniaturas NO se descargan: son cientos de MB. Se sirven desde
// jsDelivr y el service worker cachea solo los de los ejercicios que uses.
//
//   node scripts/fetch-exercises.mjs              descarga siempre
//   node scripts/fetch-exercises.mjs --if-missing solo si no existe ya
// ---------------------------------------------------------------------------

import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/data/exercises.json')
const SOURCE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json'

const onlyIfMissing = process.argv.includes('--if-missing')

const exists = async p => { try { await access(p); return true } catch { return false } }

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function trim(raw) {
  const steps = raw.instruction_steps?.es
    ?? (raw.instructions?.es ? raw.instructions.es.split(/(?<=\.)\s+/).filter(Boolean) : [])
  return {
    id: String(raw.id),
    name: raw.name,
    search: normalize([raw.name, raw.target, raw.equipment, raw.category].join(' ')),
    category: raw.category ?? raw.body_part ?? '',
    equipment: raw.equipment ?? '',
    target: raw.target ?? '',
    secondaryMuscles: Array.isArray(raw.secondary_muscles) ? raw.secondary_muscles : [],
    instructions: Array.isArray(steps) ? steps : [],
    image: raw.image ?? null,
    gif: raw.gif_url ?? null
  }
}

async function main() {
  if (onlyIfMissing && await exists(OUT)) {
    console.log('Catalogo ya presente, no se vuelve a descargar.')
    return
  }

  console.log('Descargando catalogo de ejercicios...')
  const res = await fetch(SOURCE)
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el dataset`)
  const raw = await res.json()
  if (!Array.isArray(raw)) throw new Error('El dataset no es un array')

  const exercises = raw.map(trim).filter(e => e.id && e.name)
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify({
    version: 1,
    source: 'https://github.com/hasaneyldrm/exercises-dataset',
    mediaAttribution: '(c) Gym visual - https://gymvisual.com/',
    count: exercises.length,
    exercises
  }))

  const mb = (Buffer.byteLength(JSON.stringify(exercises)) / 1024 / 1024).toFixed(1)
  console.log(`Listo: ${exercises.length} ejercicios (${mb} MB) en public/data/exercises.json`)
}

main().catch(err => {
  console.error('No se pudo descargar el catalogo:', err.message)
  console.error('La app arrancara igualmente con un catalogo minimo.')
  console.error('Puedes reintentarlo luego con: npm run fetch-exercises')
  process.exit(onlyIfMissing ? 0 : 1)
})
