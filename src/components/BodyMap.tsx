import { cx } from './ui'
import { muscleEs } from '../lib/muscles'
import {
  FRONT_PATHS, BACK_PATHS, FRONT_VIEWBOX, BACK_VIEWBOX, type PathMap
} from './body-map-paths'

/**
 * Mapa corporal de frente y espalda.
 *
 * La geometria es la de MuscleMapJS (paths en body-map-paths.ts): un cuerpo
 * mas anatomico que el esquema dibujado a mano anterior. Se pinta como SVG
 * desde React, sin el motor Canvas de la libreria, para conservar el manejo de
 * clicks, el theming y las transiciones del resto de la app.
 *
 * Cada region de MuscleMapJS (su "slug") se asocia a un musculo del dataset.
 * Los que tienen rango se tinen con el color de su rango; el resto queda en
 * claro, como una lamina de anatomia. Las piezas que no son musculo (cabeza,
 * cuello, manos, pies...) son silueta y nunca se colorean ni se pueden tocar.
 *
 * Limitaciones del modelo de MuscleMapJS respecto al dataset:
 *   - Dorsales y romboides comparten una sola region ("upper-back"): se pinta
 *     como dorsales; los romboides no se representan en el dibujo.
 *   - No hay region de abductores.
 * Esos musculos siguen apareciendo en la lista de grupos de RankPanel; solo no
 * tienen sitio propio en la figura.
 */

// slug de MuscleMapJS -> musculo del dataset. Un slug apunta a un unico
// musculo (color y click). Varios slugs pueden apuntar al mismo musculo
// (p. ej. chest + upper-chest + lower-chest = pecho): entonces la region entera
// se colorea y selecciona junta. Los slugs ausentes de este mapa son silueta.
const FRONT_MUSCLE: Record<string, string> = {
  chest: 'pectorals', 'upper-chest': 'pectorals', 'lower-chest': 'pectorals',
  abs: 'abs', 'upper-abs': 'abs', 'lower-abs': 'abs',
  biceps: 'biceps', triceps: 'triceps',
  deltoids: 'delts', 'front-deltoid': 'delts',
  obliques: 'obliques',
  quadriceps: 'quads', 'inner-quad': 'quads', 'outer-quad': 'quads',
  calves: 'calves', adductors: 'adductors', trapezius: 'traps',
  forearm: 'forearms', serratus: 'serratus anterior', 'hip-flexors': 'hip flexors'
}

const BACK_MUSCLE: Record<string, string> = {
  trapezius: 'traps', deltoids: 'delts',
  'upper-back': 'lats', triceps: 'triceps', 'lower-back': 'spine',
  forearm: 'forearms', gluteal: 'glutes', adductors: 'adductors',
  hamstring: 'hamstrings', calves: 'calves'
}

const NO_RANK = '#d4d4d8'
const STROKE = '#0a0a0c'

function Body({
  paths, viewBox, muscleOf, colors, onPick, selected, title
}: {
  paths: PathMap
  viewBox: string
  /** slug de MuscleMapJS -> musculo del dataset */
  muscleOf: Record<string, string>
  colors: Map<string, string>
  onPick?: (muscle: string) => void
  selected?: string | null
  title: string
}) {
  return (
    <div className="flex-1">
      <svg viewBox={viewBox} className="h-auto w-full" role="img" aria-label={title}>
        {Object.entries(paths).map(([slug, shapes]) => {
          const muscle = muscleOf[slug]
          const color = muscle ? colors.get(muscle) : undefined
          const isSelected = !!muscle && selected === muscle

          return (
            <g
              key={slug}
              onClick={muscle && onPick ? () => onPick(muscle) : undefined}
              className={cx(muscle && onPick && 'cursor-pointer')}
            >
              {muscle && <title>{muscleEs(muscle)}</title>}
              {shapes.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={color ?? NO_RANK}
                  stroke={STROKE}
                  strokeWidth={isSelected ? 2.4 : 1}
                  strokeLinejoin="round"
                  className="transition-[fill] duration-300"
                />
              ))}
            </g>
          )
        })}
      </svg>
      <p className="mt-1 text-center text-[11px] uppercase tracking-wide text-ink-500">{title}</p>
    </div>
  )
}

export default function BodyMap({
  colors, onPick, selected
}: {
  /** musculo del dataset -> color de su rango */
  colors: Map<string, string>
  onPick?: (muscle: string) => void
  selected?: string | null
}) {
  return (
    <div className="flex gap-1 sm:gap-3">
      <Body
        paths={FRONT_PATHS} viewBox={FRONT_VIEWBOX} muscleOf={FRONT_MUSCLE}
        colors={colors} onPick={onPick} selected={selected} title="Frente"
      />
      <Body
        paths={BACK_PATHS} viewBox={BACK_VIEWBOX} muscleOf={BACK_MUSCLE}
        colors={colors} onPick={onPick} selected={selected} title="Espalda"
      />
    </div>
  )
}
