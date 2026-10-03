// ---------------------------------------------------------------------------
// Navegacion del movil: tres hexagonos.
//
// En el centro, grande, el icono de la pestana en la que estas; tocarlo te
// lleva siempre a Hoy. A los lados, Progreso y Perfil: al tocar uno sale de el
// un abanico con sus otras dos pestanas (Medidas y Rutinas; Social y
// Estadisticas) y, con el abanico abierto, tocar el propio hexagono lleva a la
// suya. Tocar fuera, cambiar de pantalla o pulsar Escape lo recogen.
//
// Solo en el movil: en el ordenador sigue la barra lateral con todas.
// ---------------------------------------------------------------------------

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  MOBILE_GROUPS, SECTION_LABEL, SECTION_PATH, sectionOf, sideOf, type SectionId, type Side
} from '../lib/navigation'
import SectionIcon from './SectionIcon'
import { cx } from './ui'

/** Hexagono con punta arriba, como las insignias de los rangos, en una caja de 100 de ancho. */
const HEX = '50,0 100,28.87 100,86.6 50,115.47 0,86.6 0,28.87'
const HEX_VIEWBOX = '-3 -3 106 121.47'
const HEX_RATIO = 1.1547

const SIDE_WIDTH = 40
const CENTER_WIDTH = 60
const RHOMBUS = 46

/**
 * Alto de la barra sin la zona segura de abajo. La barra de Guardar
 * (SaveBar) se apoya justo encima: si cambia, cambia alli tambien.
 */
const BAR_HEIGHT = 76

const FILL = 'var(--color-ink-950)'
/** El grupo en el que estas: acento muy suave, pero opaco para tapar lo de detras. */
const FILL_ACTIVE = 'color-mix(in srgb, var(--color-accent) 16%, var(--color-ink-950))'
const GLOW = 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.6))'

/** Donde acaba cada pieza del abanico respecto al centro del hexagono, y cuando sale. */
interface Spot { x: number; y: number; rotate: number; delay: number }

const SPOTS: Record<'left' | 'right' | 'triangle', Spot> = {
  left: { x: -40, y: -68, rotate: -28, delay: 0 },
  right: { x: 40, y: -68, rotate: 28, delay: 60 },
  triangle: { x: 0, y: -88, rotate: 0, delay: 130 }
}

/**
 * Al abrirse cada pieza sale del centro del hexagono con un rebote; al
 * cerrarse vuelve rapida y sin rebote, todas a la vez.
 */
function timing(open: boolean, spot: Spot, properties: string): CSSProperties {
  return {
    transitionProperty: properties,
    transitionDuration: open ? '460ms' : '170ms',
    transitionTimingFunction: open ? 'cubic-bezier(.34, 1.56, .64, 1)' : 'ease-in',
    transitionDelay: open ? `${spot.delay}ms` : '0ms'
  }
}

function travel(open: boolean, spot: Spot, closedScale = 0.3): CSSProperties {
  return {
    ...timing(open, spot, 'transform, opacity'),
    transform: open
      ? `translate(-50%, -50%) translate(${spot.x}px, ${spot.y}px) scale(1)`
      : `translate(-50%, -50%) scale(${closedScale})`,
    opacity: open ? 1 : 0
  }
}

/** Aviso de solicitudes de amistad sin contestar. */
function Count({ value }: { value: number }) {
  if (value <= 0) return null
  return (
    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-ink-950">
      {value > 9 ? '9+' : value}
    </span>
  )
}

function Hexagon({ width, fill, strokeWidth = 2, shapeClassName, shapeKey, children }: {
  width: number
  fill: string
  strokeWidth?: number
  /** para animar solo el contorno (el giro del central al cambiar de pestana) */
  shapeClassName?: string
  shapeKey?: string
  children: ReactNode
}) {
  return (
    <span className="relative flex items-center justify-center" style={{ width, height: width * HEX_RATIO }}>
      <svg
        key={shapeKey}
        viewBox={HEX_VIEWBOX}
        className={cx('absolute inset-0 h-full w-full overflow-visible', shapeClassName)}
        aria-hidden="true"
      >
        <polygon
          points={HEX}
          fill={fill}
          stroke="var(--color-accent)"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative flex text-accent">{children}</span>
    </span>
  )
}

/** Un rombo del abanico. Solo gira el marco: el icono va siempre derecho. */
function Rhombus({ section, spot, open, count, onPick }: {
  section: SectionId
  spot: Spot
  open: boolean
  count: number
  onPick: (section: SectionId) => void
}) {
  return (
    <button
      type="button"
      tabIndex={open ? 0 : -1}
      aria-hidden={!open}
      aria-label={SECTION_LABEL[section]}
      onClick={() => onPick(section)}
      className={cx('nav-motion absolute left-0 top-0 flex items-center justify-center', !open && 'pointer-events-none')}
      style={{ width: RHOMBUS, height: RHOMBUS, ...travel(open, spot) }}
    >
      <span
        className="nav-motion absolute inset-0 rounded-[11px] border-2 border-accent bg-ink-950 shadow-[0_0_14px_rgba(34,211,238,0.3)]"
        style={{ ...timing(open, spot, 'transform'), transform: `rotate(${open ? spot.rotate : 0}deg)` }}
      />
      <span className="relative flex text-accent"><SectionIcon section={section} size={22} /></span>
      <Count value={count} />
    </button>
  )
}

/** El triangulo de entre los rombos: decorativo. Llega girando y se queda latiendo. */
function Triangle({ open }: { open: boolean }) {
  const spot = SPOTS.triangle
  return (
    <span
      aria-hidden="true"
      className="nav-motion pointer-events-none absolute left-0 top-0"
      style={{ width: 26, height: 22.5, ...travel(open, spot, 0.1) }}
    >
      <svg
        viewBox="-4 -4 108 94.6"
        className={cx('nav-motion h-full w-full overflow-visible', open && 'tri-glow')}
        style={{ ...timing(open, spot, 'transform'), transform: `rotate(${open ? 0 : -180}deg)` }}
      >
        <polygon
          points="0,0 100,0 50,86.6"
          fill="var(--color-ink-950)"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  )
}

/** Un hexagono lateral con su abanico, colocados respecto al centro del hexagono. */
function SideHexagon({ side, left, open, active, pending, onTap, onPick }: {
  side: Side
  /** posicion horizontal en la barra, en % */
  left: string
  open: boolean
  /** estas en una de sus pestanas */
  active: boolean
  pending: number
  onTap: () => void
  onPick: (section: SectionId) => void
}) {
  const { main, fan: [first, second] } = MOBILE_GROUPS[side]
  const countFor = (section: SectionId) => (section === 'social' ? pending : 0)

  return (
    <div className="absolute" style={{ left, bottom: BAR_HEIGHT / 2 }}>
      <Rhombus section={first} spot={SPOTS.left} open={open} count={countFor(first)} onPick={onPick} />
      <Triangle open={open} />
      <Rhombus section={second} spot={SPOTS.right} open={open} count={countFor(second)} onPick={onPick} />

      <button
        type="button"
        onClick={onTap}
        aria-expanded={open}
        aria-label={open ? `Ir a ${SECTION_LABEL[main]}` : `${SECTION_LABEL[main]} y más`}
        className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 transition-[scale,filter] duration-300 active:scale-90"
        style={open ? { scale: '1.12', filter: GLOW } : undefined}
      >
        <Hexagon width={SIDE_WIDTH} fill={active || open ? FILL_ACTIVE : FILL}>
          <SectionIcon section={main} size={20} />
        </Hexagon>
        {/* Social vive en el grupo de Perfil: el aviso se ve sin abrir el abanico. */}
        <Count value={countFor(first) + countFor(second)} />
      </button>
    </div>
  )
}

export default function MobileNav({ pending }: { pending: number }) {
  const location = useLocation()
  const navigate = useNavigate()
  const current = sectionOf(location.pathname)
  const here = sideOf(current)
  const [open, setOpen] = useState<Side | null>(null)

  // Cambiar de pantalla recoge el abanico, se haya cambiado desde aqui o no.
  useEffect(() => { setOpen(null) }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function go(section: SectionId) {
    setOpen(null)
    navigate(SECTION_PATH[section])
  }

  /** El primer toque abre el abanico; con el abierto, el hexagono lleva a su pestana. */
  function tap(side: Side) {
    if (open === side) go(MOBILE_GROUPS[side].main)
    else setOpen(side)
  }

  return (
    <>
      {/* Velo para cerrar tocando fuera. Va por encima de la barra de Guardar y por debajo de esta. */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(null)}
        className={cx(
          'fixed inset-0 z-40 bg-black/55 transition-opacity duration-200 md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />

      <nav
        aria-label="Navegación"
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="absolute inset-0 border-t border-ink-850 bg-ink-950/95 backdrop-blur" />

        <div className="relative mx-auto max-w-md" style={{ height: BAR_HEIGHT }}>
          <SideHexagon
            side="izquierda" left="21%" open={open === 'izquierda'} active={here === 'izquierda'}
            pending={pending} onTap={() => tap('izquierda')} onPick={go}
          />

          <div className="absolute left-1/2" style={{ bottom: BAR_HEIGHT / 2 }}>
            <button
              type="button"
              onClick={() => go('hoy')}
              aria-label={current === 'hoy' ? 'Hoy' : `Estás en ${SECTION_LABEL[current]}. Ir a Hoy`}
              className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 transition-[scale] duration-200 active:scale-90"
              style={{ filter: 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.35))' }}
            >
              {/* Al cambiar de pestana el contorno da un giro de 60 grados (acaba igual,
                  es un hexagono) y el icono nuevo entra con un pequeno salto. */}
              <Hexagon
                width={CENTER_WIDTH} fill={FILL_ACTIVE} strokeWidth={2.4}
                shapeClassName="hex-turn" shapeKey={current}
              >
                <span key={current} className="hex-pop flex">
                  <SectionIcon section={current} size={28} />
                </span>
              </Hexagon>
            </button>
          </div>

          <SideHexagon
            side="derecha" left="79%" open={open === 'derecha'} active={here === 'derecha'}
            pending={pending} onTap={() => tap('derecha')} onPick={go}
          />
        </div>
      </nav>
    </>
  )
}
