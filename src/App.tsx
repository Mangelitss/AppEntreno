import { useEffect, useState, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Today from './pages/Today'
import Train from './pages/Train'
import Routines from './pages/Routines'
import Exercises from './pages/Exercises'
import ExerciseDetail from './pages/ExerciseDetail'
import RoutineEditor from './pages/RoutineEditor'
import Progress from './pages/Progress'
import Body from './pages/Body'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Auth from './pages/Auth'
import { ensureCatalog } from './db/catalog'
import { ensureSchedule } from './db/schedule'
import { ensureCardioCatalog } from './db/cardio-catalog'
import { AuthProvider, useAuth } from './components/AuthProvider'
import { SyncProvider } from './components/SyncProvider'

/** El arranque se comparte entre montajes para que nunca corra dos veces a la vez. */
let bootstrap: Promise<void> | null = null

function boot(): Promise<void> {
  bootstrap ??= (async () => {
    await ensureSchedule()
    await ensureCatalog()
    await ensureCardioCatalog()
  })().catch(err => { bootstrap = null; throw err })
  return bootstrap
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await boot()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al iniciar')
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-ink-500">
        <span className="animate-pulse">Cargando…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-red-300">No se pudo iniciar la base de datos local</p>
        <p className="text-sm text-ink-500">{error}</p>
      </div>
    )
  }

  return (
    <AuthProvider>
      <SyncProvider>
        <AuthGate>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Today />} />
            <Route path="/rutinas" element={<Routines />} />
            <Route path="/rutinas/:routineId" element={<RoutineEditor />} />
            <Route path="/ejercicios" element={<Exercises />} />
            <Route path="/ejercicios/:exerciseId" element={<ExerciseDetail />} />
            <Route path="/progreso" element={<Progress />} />
            <Route path="/medidas" element={<Body />} />
            {/* la ruta antigua sigue viva por si tienes la app instalada en esa pantalla */}
            <Route path="/cuerpo" element={<Body />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/entrar" element={<Auth />} />
            <Route path="/ajustes" element={<Settings />} />
            <Route path="/entreno/:workoutId" element={<Train />} />
            <Route path="*" element={<Today />} />
          </Route>
        </Routes>
        </AuthGate>
      </SyncProvider>
    </AuthProvider>
  )
}

/**
 * Puerta de entrada. Si hay nube configurada y todavia no has iniciado sesion,
 * lo primero que ves es la pantalla de acceso: registrarte o entrar (tambien con
 * Google). Se puede seguir sin cuenta, pero solo si lo eliges a proposito, y ese
 * "sin cuenta" dura hasta que cierres la app: al volver a abrirla te pedira
 * entrar de nuevo. Sin nube configurada no hay sesion posible y la app es 100%
 * local, asi que no molesta con ninguna puerta.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [skipped, setSkipped] = useState(false)

  if (auth.status === 'cargando') {
    return (
      <div className="flex h-full items-center justify-center text-ink-500">
        <span className="animate-pulse">Cargando…</span>
      </div>
    )
  }

  if (auth.status === 'invitado' && !skipped) {
    return <Auth onSkip={() => setSkipped(true)} />
  }

  return <>{children}</>
}
