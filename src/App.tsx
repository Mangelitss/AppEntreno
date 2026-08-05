import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Today from './pages/Today'
import Train from './pages/Train'
import Routines from './pages/Routines'
import RoutineEditor from './pages/RoutineEditor'
import Progress from './pages/Progress'
import Body from './pages/Body'
import Settings from './pages/Settings'
import { ensureCatalog } from './db/catalog'
import { db } from './db/db'
import { stamp } from './db/repo'
import type { ScheduleDay } from './db/types'

/** Crea las 7 filas del calendario la primera vez. */
async function ensureSchedule() {
  const count = await db.schedule.count()
  if (count >= 7) return
  const existing = new Set((await db.schedule.toArray()).map(d => d.weekday))
  for (let weekday = 0; weekday < 7; weekday++) {
    if (existing.has(weekday)) continue
    await db.schedule.put(stamp({ weekday, routineId: null }) as ScheduleDay)
  }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureSchedule()
        await ensureCatalog()
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
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="/rutinas" element={<Routines />} />
        <Route path="/rutinas/:routineId" element={<RoutineEditor />} />
        <Route path="/progreso" element={<Progress />} />
        <Route path="/cuerpo" element={<Body />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="/entreno/:workoutId" element={<Train />} />
        <Route path="*" element={<Today />} />
      </Route>
    </Routes>
  )
}
