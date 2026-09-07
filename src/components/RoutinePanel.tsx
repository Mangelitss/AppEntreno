import { useState } from 'react'
import { WEEKDAYS, WEEKDAYS_SHORT } from '../db/repo'
import { displayName, estimateMinutes, muscleDistribution } from '../lib/muscles'
import type { Exercise, Routine, RoutineItem } from '../db/types'
import ExerciseThumb from './ExerciseThumb'
import { Card, cx } from './ui'

export interface PanelItem {
  item: RoutineItem
  exercise: Exercise | undefined
}

/**
 * Portada de una rutina.
 *
 * Se dimensiona con `@container`, es decir segun el ancho de la propia tarjeta
 * y no el de la pantalla. Asi la misma pieza sirve para una columna en el
 * movil o para tres en el ordenador sin tener versiones distintas.
 *
 * El panel entero abre el editor; la flecha de desplegar se come su propio
 * clic para que no te lleve a otra pantalla cuando solo querias mirar.
 * La semana se ve siempre entera y solo se encienden los dias asignados, para
 * leer de un golpe cuando toca sin tener que contar letras.
 */
export default function RoutinePanel({
  routine, items, weekdays, onOpen, footer, expanded, onToggleExpand, dimmed
}: {
  routine: Routine
  items: PanelItem[]
  weekdays: number[]
  onOpen?: () => void
  footer?: React.ReactNode
  /** si se pasa, quien manda sobre el desplegable es la pantalla, no el panel */
  expanded?: boolean
  onToggleExpand?: () => void
  /** atenuado porque hay otro panel abierto al que estas mirando */
  dimmed?: boolean
}) {
  // Controlado desde fuera cuando hace falta coordinar varios paneles; por su
  // cuenta cuando esta solo, como en Hoy.
  const [ownOpen, setOwnOpen] = useState(false)
  const open = expanded ?? ownOpen
  const toggle = onToggleExpand ?? (() => setOwnOpen(o => !o))

  const distribution = muscleDistribution(items.map(i => ({ targetSets: i.item.targetSets, exercise: i.exercise })))
  const minutes = estimateMinutes(items.map(i => i.item))
  const cover = routine.imageData

  // Sin foto, un degradado con el color del musculo que mas trabaja.
  const dominant = distribution[0]?.color ?? 'var(--color-accent)'
  const fallback = `linear-gradient(145deg, ${dominant}55 0%, #16161a 55%, #0f0f12 100%)`

  return (
    <Card
      className={cx(
        '@container overflow-hidden transition-all duration-200',
        dimmed && 'opacity-35 saturate-50'
      )}
    >
      <div
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={e => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}
        className={cx('relative aspect-[16/11] w-full overflow-hidden', onOpen && 'cursor-pointer')}
      >
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: fallback }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/45" />

        <div className="absolute inset-x-0 top-0 flex gap-0.5 p-2 @[18rem]:gap-1 @[18rem]:p-3">
          {WEEKDAYS_SHORT.map((label, weekday) => {
            const active = weekdays.includes(weekday)
            return (
              <span
                key={weekday}
                title={`${WEEKDAYS[weekday]}${active ? '' : ': descanso'}`}
                className={cx(
                  'flex flex-1 items-center justify-center rounded-md py-1 text-[9px] font-semibold',
                  '@[18rem]:h-7 @[18rem]:w-7 @[18rem]:flex-none @[18rem]:rounded-lg @[18rem]:py-0 @[18rem]:text-[11px]',
                  active
                    ? 'bg-accent text-ink-950'
                    : 'bg-black/35 text-white/35 backdrop-blur'
                )}
              >
                {label}
              </span>
            )
          })}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-3 pb-3 text-center @[18rem]:px-5 @[18rem]:pb-5">
          <h3 className="text-lg font-bold uppercase leading-none tracking-tight text-white drop-shadow-lg @[18rem]:text-3xl @[26rem]:text-4xl @[34rem]:text-5xl">
            {routine.name}
          </h3>
          <p className="mt-1 text-[11px] text-white/80 drop-shadow @[18rem]:mt-2 @[18rem]:text-sm">
            {minutes} min · {items.length} {items.length === 1 ? 'ejercicio' : 'ejercicios'}
          </p>
        </div>
      </div>

      <button
        onClick={toggle}
        className="flex w-full items-center justify-center gap-2 border-t border-ink-850 py-2 text-xs text-ink-500 transition-colors hover:bg-ink-850 hover:text-ink-300"
      >
        <span className="truncate">{open ? 'Ocultar detalle' : 'Ver ejercicios'}</span>
        <span>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="border-t border-ink-850">
          {distribution.length > 0 && (
            <div className="px-4 pt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-ink-500">Distribucion muscular</p>
              <div className="flex h-2 overflow-hidden rounded-full bg-ink-850">
                {distribution.map(share => (
                  <div
                    key={share.muscle}
                    style={{ width: `${share.percent}%`, backgroundColor: share.color }}
                    title={`${share.muscle} ${share.percent}%`}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {distribution.slice(0, 4).map(share => (
                  <span key={share.muscle} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: share.color }} />
                    <span className="text-ink-300">{share.muscle}</span>
                    <span className="tabular-nums text-ink-500">{share.percent}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <ul className="mt-3 divide-y divide-ink-850 border-t border-ink-850">
            {items.map(({ item, exercise }) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <ExerciseThumb exercise={exercise} shape="rounded-full" size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-500">
                    {item.targetDurationMin
                      ? `${item.targetDurationMin} min`
                      : `${item.targetSets} ${item.targetSets === 1 ? 'serie' : 'series'} × ${item.targetRepsMin}${item.targetRepsMax > item.targetRepsMin ? `-${item.targetRepsMax}` : ''} reps`}
                  </p>
                  <p className="truncate text-sm capitalize">{displayName(exercise, 'Ejercicio')}</p>
                </div>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-500">Rutina vacia</li>
            )}
          </ul>
        </div>
      )}

      {footer && <div className="flex flex-wrap gap-1 border-t border-ink-850 px-2 py-2">{footer}</div>}
    </Card>
  )
}
