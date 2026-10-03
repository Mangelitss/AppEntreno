import { useEffect, useState } from 'react'
import { cx } from './ui'

/** Las dos primeras iniciales del nombre, para cuando no hay foto. */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('')
}

/**
 * Foto de alguien, o sus iniciales.
 *
 * La foto de un amigo es un enlace que ha puesto esa persona, asi que puede no cargar
 * (borrada, sin permiso, sin red): entonces se ven las iniciales en vez de un
 * icono roto. Va sin referrer para no contarle a esa web desde donde se mira.
 */
export default function Avatar({
  name, url, size = 40, className
}: {
  name: string | null | undefined
  url: string | null | undefined
  size?: number
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [url])

  const usable = !!url && !broken && /^(https?:|data:image\/)/.test(url)

  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-800 font-semibold text-ink-500',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {usable ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (initialsOf(name) || '?')}
    </span>
  )
}
