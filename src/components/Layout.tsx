import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSocial } from './SocialProvider'
import MobileNav from './MobileNav'
import { cx } from './ui'

/** Barra lateral del ordenador: todas las pestanas. En el movil va MobileNav. */
const NAV = [
  { to: '/', label: 'Hoy', icon: '⌂' },
  { to: '/rutinas', label: 'Rutinas', icon: '☰' },
  { to: '/ejercicios', label: 'Ejercicios', icon: '⛁' },
  { to: '/progreso', label: 'Progreso', icon: '↗' },
  { to: '/estadisticas', label: 'Estadisticas', icon: '▦' },
  { to: '/medidas', label: 'Medidas', icon: '⚖' },
  { to: '/social', label: 'Social', icon: '♡' },
  { to: '/perfil', label: 'Perfil', icon: '☺' }
]

/** Aviso de solicitudes de amistad sin contestar, sobre el icono de Social. */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-ink-950">
      {count > 9 ? '9+' : count}
    </span>
  )
}

export default function Layout() {
  const location = useLocation()
  const social = useSocial()
  const pending = social.lists.incoming.length
  // El modo entreno ocupa la pantalla entera: sin nav que distraiga.
  const immersive = location.pathname.startsWith('/entreno/')

  if (immersive) return <Outlet />

  return (
    <div className="min-h-full md:flex">
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r border-ink-800 bg-ink-900/50 p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
          <span className="font-semibold tracking-tight">AppEntreno</span>
        </div>
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cx(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
              isActive ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:bg-ink-850 hover:text-ink-100'
            )}
          >
            <span className="relative w-4 text-center">
              <span className="opacity-70">{item.icon}</span>
              {item.to === '/social' && <Badge count={pending} />}
            </span>
            {item.label}
          </NavLink>
        ))}
        <div className="mt-auto px-3 text-[11px] leading-relaxed text-ink-500">
          Datos guardados en este dispositivo
        </div>
      </aside>

      {/* En el movil se deja sitio a la barra de hexagonos, tambien con la zona segura del iPhone. */}
      <main className="flex-1 pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>

      <MobileNav pending={pending} />
    </div>
  )
}

export function PageHeader({ title, subtitle, action, onBack }: {
  title: string; subtitle?: string; action?: React.ReactNode; onBack?: () => void
}) {
  return (
    <header className="safe-top flex items-end justify-between gap-4 px-4 pb-4 pt-4 md:px-8 md:pt-8">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Volver"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100"
          >
            ‹
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  )
}
