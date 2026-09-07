/**
 * Insignia hexagonal de un grupo muscular.
 *
 * Dentro hay un cuerpo diminuto con la zona del grupo encendida en el color
 * de su rango y el resto en gris. A 48 px no cabe anatomia, solo la silueta
 * suficiente para reconocer de un vistazo de que grupo se habla.
 */

const HEX = 'M24,2 L42,12.5 L42,35.5 L24,46 L6,35.5 L6,12.5 Z'

/** Silueta de fondo, siempre apagada. */
const BODY = [
  'M24,8 a3.4,3.4 0 1,0 0.1,0 z',              // cabeza
  'M17.5,16 h13 v14 h-13 z',                    // torso
  'M12.5,17 h4 v13 h-4 z',                      // brazo izq
  'M31.5,17 h4 v13 h-4 z',                      // brazo der
  'M18.5,30.5 h5 v13 h-5 z',                    // pierna izq
  'M24.5,30.5 h5 v13 h-5 z'                     // pierna der
]

/** Que se enciende en cada grupo. */
const HIGHLIGHT: Record<string, string[]> = {
  pecho: ['M17.5,16.5 h13 v6.5 h-13 z'],
  espalda: ['M17.5,16.5 h13 v9 h-13 z'],
  hombros: ['M13,16.5 h4.5 v4.5 h-4.5 z', 'M30.5,16.5 h4.5 v4.5 h-4.5 z'],
  brazos: ['M12.5,17 h4 v13 h-4 z', 'M31.5,17 h4 v13 h-4 z'],
  abdominales: ['M19.5,23.5 h9 v6.5 h-9 z'],
  piernas: ['M18.5,30.5 h5 v13 h-5 z', 'M24.5,30.5 h5 v13 h-5 z']
}

export default function GroupBadge({
  group, color, active, size = 44
}: {
  group: string
  color: string
  /** false cuando el grupo no tiene rango: todo en gris */
  active: boolean
  size?: number
}) {
  const tint = active ? color : '#52525b'

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0" aria-hidden>
      <path d={HEX} fill={active ? `${color}1f` : '#1f1f23'} stroke={tint} strokeWidth="1.6" />

      {BODY.map((d, i) => (
        <path key={`b${i}`} d={d} fill="#3f3f46" opacity={0.9} />
      ))}

      {(HIGHLIGHT[group] ?? []).map((d, i) => (
        <path key={`h${i}`} d={d} fill={tint} opacity={active ? 1 : 0.55} />
      ))}
    </svg>
  )
}
