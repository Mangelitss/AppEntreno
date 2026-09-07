// ---------------------------------------------------------------------------
// Agrupacion de musculos.
//
// El dataset nombra unos 25 musculos distintos entre objetivos y secundarios.
// Aqui se reparten en los seis grupos con los que uno piensa al entrenar, que
// es como se muestran los rangos.
// ---------------------------------------------------------------------------

export interface MuscleGroup {
  id: string
  label: string
  /** musculos del dataset, en ingles */
  muscles: string[]
}

export const MUSCLE_GROUPS: MuscleGroup[] = [
  {
    id: 'pecho', label: 'Pecho',
    muscles: ['pectorals', 'serratus anterior']
  },
  {
    id: 'espalda', label: 'Espalda',
    muscles: ['lats', 'upper back', 'traps', 'rhomboids', 'spine', 'lower back', 'levator scapulae']
  },
  {
    id: 'hombros', label: 'Hombros',
    muscles: ['delts', 'rotator cuff', 'rear deltoids', 'shoulders']
  },
  {
    id: 'brazos', label: 'Brazos',
    muscles: ['biceps', 'triceps', 'forearms', 'brachialis', 'wrist extensors', 'wrist flexors']
  },
  {
    id: 'abdominales', label: 'Abdominales',
    muscles: ['abs', 'obliques', 'core', 'hip flexors']
  },
  {
    id: 'piernas', label: 'Piernas',
    muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors']
  }
]

/** El sistema cardiovascular no es un musculo y no entra en los rangos. */
export const NOT_A_MUSCLE = ['cardiovascular system']

const LOOKUP = new Map<string, MuscleGroup>()
for (const group of MUSCLE_GROUPS) {
  for (const muscle of group.muscles) LOOKUP.set(muscle, group)
}

export function groupOf(muscle: string): MuscleGroup | null {
  return LOOKUP.get(muscle.trim().toLowerCase()) ?? null
}

export function isRankable(muscle: string): boolean {
  const clean = muscle.trim().toLowerCase()
  return Boolean(clean) && !NOT_A_MUSCLE.includes(clean) && LOOKUP.has(clean)
}
