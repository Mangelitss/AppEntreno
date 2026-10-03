import type { ReactNode } from 'react'
import type { SectionId } from '../lib/navigation'

/**
 * Iconos de linea de cada pestana, para la navegacion del movil.
 *
 * Todos en una rejilla de 24 y con el color del texto, asi se tinen solos con
 * el acento dentro de los hexagonos y los rombos.
 */
const PATHS: Record<SectionId, ReactNode> = {
  // Una barra con sus discos: entrenar
  hoy: (
    <>
      <path d="M8 12h8" />
      <rect x="5" y="7" width="3" height="10" rx="1" />
      <rect x="16" y="7" width="3" height="10" rx="1" />
      <path d="M2.5 10v4M21.5 10v4" />
    </>
  ),
  progreso: (
    <>
      <path d="M3.5 16.5 9 11l4 4 7.5-7.5" />
      <path d="M15 7.5h5.5V13" />
    </>
  ),
  // Bascula: el peso y las medidas
  medidas: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 11a3.5 3.5 0 0 1 7 0" />
      <path d="m12 11 1.7-2" />
    </>
  ),
  // Tablilla con la lista del dia
  rutinas: (
    <>
      <path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  // Kettlebell, para no confundirla con la barra de Hoy
  ejercicios: (
    <>
      <path d="M8.5 11.5V8.5a3.5 3.5 0 0 1 7 0v3" />
      <circle cx="12" cy="15" r="5.5" />
    </>
  ),
  // La cara va sin contorno: dentro de un hexagono, el hexagono hace de cabeza
  perfil: (
    <>
      <path d="M9 8.5V10M15 8.5V10" />
      <path d="M7.5 13.5c1.1 1.8 2.7 2.7 4.5 2.7s3.4-.9 4.5-2.7" />
    </>
  ),
  social: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 5.8a2.7 2.7 0 0 1 0 5.4" />
      <path d="M17 14.6c1.9.5 3.2 2.1 3.6 4.9" />
    </>
  ),
  estadisticas: (
    <>
      <path d="M4 20h16" />
      <rect x="5.5" y="11" width="3" height="6" rx="1" />
      <rect x="10.5" y="6" width="3" height="11" rx="1" />
      <rect x="15.5" y="9" width="3" height="8" rx="1" />
    </>
  )
}

export default function SectionIcon({ section, size = 22 }: { section: SectionId; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[section]}
    </svg>
  )
}
