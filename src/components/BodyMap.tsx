import { cx } from './ui'

/**
 * Mapa corporal de frente y espalda.
 *
 * Cada region es un poligono asociado a un musculo del dataset. Los que aun no
 * tienen rango se dibujan en claro, como en una lamina de anatomia, y los que
 * si lo tienen se tinen con el color de su rango: asi lo entrenado destaca y
 * lo abandonado se lee de un vistazo, que es para lo que sirve el dibujo.
 *
 * Las coordenadas van sobre un lienzo de 220x420 con el cuerpo centrado en
 * x=110. Los brazos son piezas aparte, separadas del torso, para que quepan
 * biceps y antebrazos sin pisar los oblicuos.
 *
 * No es anatomia exacta ni pretende serlo: es un esquema reconocible dibujado
 * a mano, sin depender de ninguna ilustracion de terceros.
 */

interface Region {
  muscle: string
  label: string
  shapes: string[]
}

/** Piezas de la silueta que no son musculo y nunca se colorean. */
const SILHOUETTE = [
  // cabeza y cuello
  'M110,16 c10,0 18,10 18,23 c0,10 -4,18 -9,21 l0,10 l-18,0 l0,-10 c-5,-3 -9,-11 -9,-21 c0,-13 8,-23 18,-23 z',
  // torso
  'M70,88 C74,78 90,70 110,70 C130,70 146,78 150,88 C154,100 156,110 154,120 ' +
  'C152,142 140,158 134,170 C132,184 134,196 142,206 C144,210 144,214 142,216 ' +
  'L78,216 C76,214 76,210 78,206 C86,196 88,184 86,170 C80,158 68,142 66,120 ' +
  'C64,110 66,100 70,88 Z',
  // brazos
  'M68,86 C58,90 52,102 50,118 C48,140 46,158 44,176 C42,200 40,224 38,244 ' +
  'C37,258 38,268 40,278 C42,286 48,288 52,284 C56,276 58,262 58,246 ' +
  'C60,224 62,200 64,176 C66,156 70,132 74,110 C76,100 74,90 68,86 Z',
  'M152,86 C162,90 168,102 170,118 C172,140 174,158 176,176 C178,200 180,224 182,244 ' +
  'C183,258 182,268 180,278 C178,286 172,288 168,284 C164,276 162,262 162,246 ' +
  'C160,224 158,200 156,176 C154,156 150,132 146,110 C144,100 146,90 152,86 Z',
  // piernas
  'M78,216 C74,240 74,270 78,296 C80,308 82,314 84,320 C82,340 82,364 86,384 ' +
  'C87,392 88,396 92,396 C96,396 98,392 99,384 C102,364 102,340 100,320 ' +
  'C102,314 104,306 105,296 C108,270 108,240 106,216 Z',
  'M142,216 C146,240 146,270 142,296 C140,308 138,314 136,320 C138,340 138,364 134,384 ' +
  'C133,392 132,396 128,396 C124,396 122,392 121,384 C118,364 118,340 120,320 ' +
  'C118,314 116,306 115,296 C112,270 112,240 114,216 Z',
  // pies
  'M84,394 C80,402 72,406 72,410 C72,413 78,414 88,413 C96,412 100,410 100,405 L100,394 Z',
  'M136,394 C140,402 148,406 148,410 C148,413 142,414 132,413 C124,412 120,410 120,405 L120,394 Z'
]

const FRONT: Region[] = [
  { muscle: 'traps', label: 'Trapecio', shapes: [
    'M98,72 C90,74 82,78 77,85 C85,82 93,80 99,80 Z',
    'M122,72 C130,74 138,78 143,85 C135,82 127,80 121,80 Z'
  ]},
  { muscle: 'delts', label: 'Hombros', shapes: [
    'M72,86 C62,90 56,102 55,117 C63,116 71,110 77,100 C79,93 77,88 72,86 Z',
    'M148,86 C158,90 164,102 165,117 C157,116 149,110 143,100 C141,93 143,88 148,86 Z'
  ]},
  { muscle: 'pectorals', label: 'Pecho', shapes: [
    'M107,84 C96,84 86,86 80,92 C77,102 77,114 80,122 C90,127 100,126 107,120 Z',
    'M113,84 C124,84 134,86 140,92 C143,102 143,114 140,122 C130,127 120,126 113,120 Z'
  ]},
  { muscle: 'serratus anterior', label: 'Serrato', shapes: [
    'M82,124 C84,132 87,139 90,143 C86,145 82,141 80,134 Z',
    'M138,124 C136,132 133,139 130,143 C134,145 138,141 140,134 Z'
  ]},
  { muscle: 'abs', label: 'Abdominales', shapes: [
    'M99,130 h9 v13 h-9 z', 'M112,130 h9 v13 h-9 z',
    'M99,146 h9 v13 h-9 z', 'M112,146 h9 v13 h-9 z',
    'M100,162 h8 v12 h-8 z', 'M112,162 h8 v12 h-8 z',
    'M101,177 h7 v14 c-5,-1 -7,-6 -7,-14 z', 'M112,177 h7 c0,8 -2,13 -7,14 z'
  ]},
  { muscle: 'obliques', label: 'Oblicuos', shapes: [
    'M88,128 C87,146 89,164 93,178 C89,180 85,176 83,168 C81,154 82,140 84,128 Z',
    'M132,128 C133,146 131,164 127,178 C131,180 135,176 137,168 C139,154 138,140 136,128 Z'
  ]},
  { muscle: 'biceps', label: 'Biceps', shapes: [
    'M66,100 C58,106 54,120 53,136 C52,150 53,160 56,168 C62,166 66,158 67,146 C68,130 68,114 66,100 Z',
    'M154,100 C162,106 166,120 167,136 C168,150 167,160 164,168 C158,166 154,158 153,146 C152,130 152,114 154,100 Z'
  ]},
  { muscle: 'forearms', label: 'Antebrazos', shapes: [
    'M54,178 C50,192 47,212 46,230 C45,244 46,254 48,262 C53,260 56,250 57,236 C58,216 57,196 54,178 Z',
    'M166,178 C170,192 173,212 174,230 C175,244 174,254 172,262 C167,260 164,250 163,236 C162,216 163,196 166,178 Z'
  ]},
  { muscle: 'hip flexors', label: 'Flexores de cadera', shapes: [
    'M88,196 C94,202 102,206 108,206 l0,10 C98,215 90,209 86,202 Z',
    'M132,196 C126,202 118,206 112,206 l0,10 C122,215 130,209 134,202 Z'
  ]},
  { muscle: 'abductors', label: 'Abductores', shapes: [
    'M78,216 C74,226 73,240 74,252 C71,242 70,226 74,216 Z',
    'M142,216 C146,226 147,240 146,252 C149,242 150,226 146,216 Z'
  ]},
  { muscle: 'adductors', label: 'Aductores', shapes: [
    'M98,222 C101,240 101,264 98,282 C94,276 92,262 92,246 C92,234 94,226 98,222 Z',
    'M122,222 C119,240 119,264 122,282 C126,276 128,262 128,246 C128,234 126,226 122,222 Z'
  ]},
  { muscle: 'quads', label: 'Cuadriceps', shapes: [
    'M80,220 C76,244 76,270 80,292 C83,300 88,304 94,302 C98,282 99,252 96,226 C94,220 88,218 80,220 Z',
    'M140,220 C144,244 144,270 140,292 C137,300 132,304 126,302 C122,282 121,252 124,226 C126,220 132,218 140,220 Z'
  ]},
  { muscle: 'calves', label: 'Gemelos', shapes: [
    'M86,324 C82,344 82,366 85,380 C89,382 93,376 94,362 C95,344 92,330 86,324 Z',
    'M134,324 C138,344 138,366 135,380 C131,382 127,376 126,362 C125,344 128,330 134,324 Z'
  ]}
]

const BACK: Region[] = [
  { muscle: 'traps', label: 'Trapecio', shapes: [
    'M110,70 C96,70 84,76 78,86 C82,104 90,120 102,130 C107,126 110,116 110,104 Z',
    'M110,70 C124,70 136,76 142,86 C138,104 130,120 118,130 C113,126 110,116 110,104 Z'
  ]},
  { muscle: 'delts', label: 'Hombros', shapes: [
    'M72,86 C62,90 56,102 55,117 C63,116 71,110 77,100 C79,93 77,88 72,86 Z',
    'M148,86 C158,90 164,102 165,117 C157,116 149,110 143,100 C141,93 143,88 148,86 Z'
  ]},
  { muscle: 'rhomboids', label: 'Romboides', shapes: [
    'M92,102 C98,108 104,111 109,111 l0,22 C101,131 95,124 91,116 Z',
    'M128,102 C122,108 116,111 111,111 l0,22 C119,131 125,124 129,116 Z'
  ]},
  { muscle: 'lats', label: 'Dorsales', shapes: [
    'M80,104 C76,124 78,146 86,162 C92,170 100,174 107,174 l0,-42 C97,128 87,118 80,104 Z',
    'M140,104 C144,124 142,146 134,162 C128,170 120,174 113,174 l0,-42 C123,128 133,118 140,104 Z'
  ]},
  { muscle: 'triceps', label: 'Triceps', shapes: [
    'M66,100 C58,106 54,120 53,136 C52,150 53,160 56,168 C62,166 66,158 67,146 C68,130 68,114 66,100 Z',
    'M154,100 C162,106 166,120 167,136 C168,150 167,160 164,168 C158,166 154,158 153,146 C152,130 152,114 154,100 Z'
  ]},
  { muscle: 'forearms', label: 'Antebrazos', shapes: [
    'M54,178 C50,192 47,212 46,230 C45,244 46,254 48,262 C53,260 56,250 57,236 C58,216 57,196 54,178 Z',
    'M166,178 C170,192 173,212 174,230 C175,244 174,254 172,262 C167,260 164,250 163,236 C162,216 163,196 166,178 Z'
  ]},
  { muscle: 'spine', label: 'Lumbares', shapes: [
    'M100,162 C104,166 108,168 109,168 l0,26 C103,192 99,186 98,178 Z',
    'M120,162 C116,166 112,168 111,168 l0,26 C117,192 121,186 122,178 Z'
  ]},
  { muscle: 'glutes', label: 'Gluteos', shapes: [
    'M108,192 C96,192 86,196 80,204 C78,218 82,232 92,238 C100,240 106,236 108,228 Z',
    'M112,192 C124,192 134,196 140,204 C142,218 138,232 128,238 C120,240 114,236 112,228 Z'
  ]},
  { muscle: 'hamstrings', label: 'Femoral', shapes: [
    'M84,246 C80,266 80,286 84,298 C88,304 94,304 98,300 C100,282 100,260 97,246 C93,242 88,242 84,246 Z',
    'M136,246 C140,266 140,286 136,298 C132,304 126,304 122,300 C120,282 120,260 123,246 C127,242 132,242 136,246 Z'
  ]},
  { muscle: 'calves', label: 'Gemelos', shapes: [
    'M85,322 C80,342 80,368 84,382 C89,384 93,376 95,360 C96,340 92,328 85,322 Z',
    'M135,322 C140,342 140,368 136,382 C131,384 127,376 125,360 C124,340 128,328 135,322 Z'
  ]}
]

const NO_RANK = '#d4d4d8'
const STROKE = '#0a0a0c'

function Body({
  regions, colors, onPick, selected, title
}: {
  regions: Region[]
  colors: Map<string, string>
  onPick?: (muscle: string) => void
  selected?: string | null
  title: string
}) {
  return (
    <div className="flex-1">
      <svg viewBox="0 0 220 420" className="h-auto w-full" role="img" aria-label={title}>
        {SILHOUETTE.map((d, i) => (
          <path key={`s${i}`} d={d} fill={NO_RANK} stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
        ))}

        {regions.map(region => {
          const color = colors.get(region.muscle)
          const isSelected = selected === region.muscle

          return (
            <g
              key={region.muscle}
              onClick={() => onPick?.(region.muscle)}
              className={cx(onPick && 'cursor-pointer')}
            >
              <title>{region.label}</title>
              {region.shapes.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={color ?? NO_RANK}
                  stroke={STROKE}
                  strokeWidth={isSelected ? 2.6 : 1.1}
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
      <Body regions={FRONT} colors={colors} onPick={onPick} selected={selected} title="Frente" />
      <Body regions={BACK} colors={colors} onPick={onPick} selected={selected} title="Espalda" />
    </div>
  )
}
