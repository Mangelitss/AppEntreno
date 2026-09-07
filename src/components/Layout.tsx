import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Hoy', icon: '⌂' },
  { to: '/rutinas', label: 'Rutinas', icon: '☰' },
  { to: '/ejercicios', label: 'Ejercicios', icon: '⛁' },
  { to: '/progreso', label: 'Progreso', icon: '↗' },
  { to: '/medidas', label: 'Medidas', icon: '⚖' },
  { to: '/perfil', label: 'Perfil', icon: '☺' }
]

export default function Layout() {
  const location = useLocation()
  // El modo entreno ocupa la pantalla entera: sin nav que distraiga.
  const immersive = location.pathname.startsWith('/entreno/')

  if (immersive) return <Outlet />

  return (
    <div className="min-h-full md:flex">
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r border-ink-800 bg-ink-900/50 p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-accent text-xl">▮▮</span>
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
            <span className="w-4 text-center opacity-70">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <div className="mt-auto px-3 text-[11px] leading-relaxed text-ink-500">
          Datos guardados en este dispositivo
        </div>
      </aside>

      <main className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-800 bg-ink-900/95 backdrop-blur safe-bottom md:hidden">
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cx(
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2.5 text-[10px] transition-colors',
              isActive ? 'text-accent' : 'text-ink-500'
            )}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span className="max-w-full truncate px-0.5">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="safe-top flex items-end justify-between gap-4 px-4 pb-4 pt-4 md:px-8 md:pt-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
