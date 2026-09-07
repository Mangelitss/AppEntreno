import { useEffect, useState } from 'react'
import { mediaUrl } from '../db/catalog'
import { muscleColor, muscleEs } from '../lib/muscles'
import type { Exercise } from '../db/types'
import { cx } from './ui'

const SIZES = {
  sm: 'h-10 w-10 text-[9px]',
  md: 'h-12 w-12 text-[10px]',
  lg: 'h-16 w-16 text-xs',
  xl: 'h-56 w-56 text-3xl'
}

/**
 * Miniatura de un ejercicio.
 *
 * Los ejercicios propios y los del catalogo minimo no tienen imagen, y las del
 * dataset vienen de un CDN que puede fallar sin cobertura. En cualquiera de esos
 * casos se dibuja una pastilla con el color y las iniciales del musculo objetivo,
 * para que la fila no quede con un hueco vacio.
 */
export default function ExerciseThumb({
  exercise, size = 'md', shape = 'rounded-xl', gif = false
}: {
  exercise: Pick<Exercise, 'image' | 'gif' | 'target' | 'category'> & Partial<Exercise> | undefined
  size?: keyof typeof SIZES
  shape?: string
  gif?: boolean
}) {
  // Lo que hayas subido o pegado tu manda siempre sobre el media del dataset.
  const own = gif ? exercise?.gifData ?? exercise?.imageData : exercise?.imageData
  const src = own ?? mediaUrl((gif ? exercise?.gif : exercise?.image) ?? exercise?.image ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => { setFailed(false) }, [src])

  const muscle = muscleEs(exercise?.target || exercise?.category || 'otros')
  const color = muscleColor(muscle)

  if (!src || failed) {
    return (
      <div
        className={cx(
          'flex shrink-0 items-center justify-center font-semibold uppercase tracking-wide',
          SIZES[size], shape
        )}
        style={{ backgroundColor: `${color}22`, color }}
        title={muscle}
      >
        {muscle.slice(0, 3)}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cx('shrink-0 bg-ink-800 object-cover', SIZES[size], shape)}
    />
  )
}
