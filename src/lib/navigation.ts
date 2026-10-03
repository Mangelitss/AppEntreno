// ---------------------------------------------------------------------------
// Pestanas de la app y como se agrupan en la navegacion del movil.
//
// En el ordenador la barra lateral las ensena todas. En el movil van en tres
// hexagonos: Hoy en el centro y un grupo a cada lado, con su pestana
// principal y otras dos que salen en abanico al tocarlo. Ejercicios no tiene
// hueco a proposito: en el movil se entra desde Rutinas.
// ---------------------------------------------------------------------------

export type SectionId =
  | 'hoy' | 'rutinas' | 'ejercicios' | 'progreso' | 'estadisticas' | 'medidas' | 'social' | 'perfil'

export type Side = 'izquierda' | 'derecha'

export interface NavGroup {
  /** la del propio hexagono */
  main: SectionId
  /** las dos del abanico, de izquierda a derecha */
  fan: [SectionId, SectionId]
}

export const MOBILE_GROUPS: Record<Side, NavGroup> = {
  izquierda: { main: 'progreso', fan: ['medidas', 'rutinas'] },
  derecha: { main: 'perfil', fan: ['social', 'estadisticas'] }
}

export const SECTION_PATH: Record<SectionId, string> = {
  hoy: '/',
  rutinas: '/rutinas',
  ejercicios: '/ejercicios',
  progreso: '/progreso',
  estadisticas: '/estadisticas',
  medidas: '/medidas',
  social: '/social',
  perfil: '/perfil'
}

export const SECTION_LABEL: Record<SectionId, string> = {
  hoy: 'Hoy',
  rutinas: 'Rutinas',
  ejercicios: 'Ejercicios',
  progreso: 'Progreso',
  estadisticas: 'Estadísticas',
  medidas: 'Medidas',
  social: 'Social',
  perfil: 'Perfil'
}

/**
 * La pestana a la que pertenece una ruta, tambien en sus subpantallas: una
 * rutina es Rutinas, el perfil de un amigo es Social y Ajustes cuelga de Perfil.
 */
export function sectionOf(pathname: string): SectionId {
  switch (pathname.split('/')[1] ?? '') {
    case 'rutinas': return 'rutinas'
    case 'ejercicios': return 'ejercicios'
    case 'progreso': return 'progreso'
    case 'estadisticas': return 'estadisticas'
    case 'medidas':
    case 'cuerpo': return 'medidas'
    case 'social':
    case 'amigo': return 'social'
    case 'perfil':
    case 'ajustes':
    case 'entrar': return 'perfil'
    default: return 'hoy'
  }
}

/** El lado del movil donde vive una pestana; null para Hoy. Ejercicios va con Rutinas. */
export function sideOf(section: SectionId): Side | null {
  if (section === 'ejercicios') return 'izquierda'
  for (const side of ['izquierda', 'derecha'] as const) {
    const group = MOBILE_GROUPS[side]
    if (group.main === section || group.fan.includes(section)) return side
  }
  return null
}
