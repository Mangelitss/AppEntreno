// ---------------------------------------------------------------------------
// Un post del feed de Social: el entreno terminado de un amigo.
//
// Arriba quien y cuando; luego la rutina con su resumen, el muneco con lo que
// trabajo ese dia (la escala de calor de Distribucion del cuerpo) y, plegada,
// la lista de ejercicios con cada serie igual que en tu historial.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import { formatCardioDuration } from '../lib/cardio'
import { heatColor } from '../lib/muscle-work'
import { formatDuration } from '../lib/stats'
import { postColors, timeAgoEs, type Post, type PublicProfile } from '../lib/social'
import Avatar from './Avatar'
import BodyMap from './BodyMap'
import { SetRow } from './WorkoutSummaryCard'
import { Card, cx } from './ui'

const HEAT_LEGEND = `linear-gradient(90deg, ${heatColor(0.01)}, ${heatColor(0.5)}, ${heatColor(1)})`

function cardioParts(cardio: NonNullable<Post['cardio']>): string[] {
  const parts = [formatCardioDuration(cardio.durationSec)]
  if (cardio.distanceKm > 0) parts.push(`${cardio.distanceKm.toLocaleString('es-ES')} km`)
  if (cardio.kcal > 0) parts.push(`${cardio.kcal.toLocaleString('es-ES')} kcal`)
  return parts
}

/** La linea bajo el nombre de la rutina: duracion, kg y series, o lo propio del cardio. */
function summaryOf(post: Post): string {
  if (post.kind === 'cardio' && post.cardio) return cardioParts(post.cardio).join(' · ')
  return [
    formatDuration(post.durationMs),
    `${post.volumeKg.toLocaleString('es-ES')} kg`,
    `${post.setCount} ${post.setCount === 1 ? 'serie' : 'series'}`
  ].join(' · ')
}

/** En una sesion solo de cardio no hay muneco que pintar: van sus cifras en grande. */
function CardioTiles({ cardio }: { cardio: NonNullable<Post['cardio']> }) {
  const tiles = [
    { label: 'duración', value: formatCardioDuration(cardio.durationSec) },
    cardio.distanceKm > 0 ? { label: 'km', value: cardio.distanceKm.toLocaleString('es-ES') } : null,
    cardio.kcal > 0 ? { label: 'kcal', value: cardio.kcal.toLocaleString('es-ES') } : null
  ].filter((tile): tile is { label: string; value: string } => tile !== null)

  return (
    <div className="grid gap-2 px-4 py-3" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
      {tiles.map(tile => (
        <div key={tile.label} className="rounded-xl bg-ink-850 p-3 text-center">
          <p className="text-xl font-semibold tabular-nums">{tile.value}</p>
          <p className="text-xs text-ink-500">{tile.label}</p>
        </div>
      ))}
    </div>
  )
}

export default function PostCard({
  post, profile, onOpenProfile
}: {
  post: Post
  profile: PublicProfile | undefined
  onOpenProfile: () => void
}) {
  const [open, setOpen] = useState(false)
  const colors = useMemo(() => postColors(post.muscles), [post.muscles])
  const name = profile?.displayName ?? 'Sin nombre'
  const count = post.exercises.length

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 px-4 pt-4">
        <button onClick={onOpenProfile} className="shrink-0" aria-label={`Ver el perfil de ${name}`}>
          <Avatar name={name} url={profile?.avatarUrl} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <button
            onClick={onOpenProfile}
            className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          >
            {name}
          </button>
          <p className="text-xs text-ink-500">{timeAgoEs(post.finishedAt)}</p>
        </div>
      </div>

      <div className="px-4 pt-3">
        <p className="truncate text-lg font-semibold">{post.routineName}</p>
        <p className="text-sm text-ink-500">{summaryOf(post)}</p>
      </div>

      {post.kind !== 'cardio' && colors.size > 0 ? (
        <div className="mx-auto w-full max-w-xs px-4 pb-1 pt-3">
          <BodyMap colors={colors} />
          <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-500">
            <span>menos</span>
            <span className="h-1.5 flex-1 rounded-full" style={{ background: HEAT_LEGEND }} />
            <span>más</span>
          </div>
        </div>
      ) : post.cardio ? (
        <CardioTiles cardio={post.cardio} />
      ) : null}

      {count > 0 ? (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="mt-3 flex w-full items-center justify-between border-t border-ink-850 px-4 py-3 text-sm text-ink-300 transition-colors hover:bg-ink-850"
          >
            <span>{count} {count === 1 ? 'ejercicio' : 'ejercicios'}</span>
            <span className={cx('text-ink-500 transition-transform', open && 'rotate-180')}>⌄</span>
          </button>
          {open && (
            <div className="space-y-3 border-t border-ink-850 p-4">
              {post.exercises.map((exercise, i) => (
                <div key={i}>
                  <p className="mb-1 text-sm font-medium capitalize">{exercise.name}</p>
                  <div className="space-y-1">
                    {exercise.sets.map((set, j) => <SetRow key={j} set={set} index={j} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : <div className="h-4" />}
    </Card>
  )
}
