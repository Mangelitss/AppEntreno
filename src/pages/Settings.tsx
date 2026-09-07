import { useEffect, useRef, useState } from 'react'
import { db, getSettings, saveSettings } from '../db/db'
import { countEditedExercises, ensureCatalog, MEDIA_ATTRIBUTION } from '../db/catalog'
import { seedExampleRoutines } from '../db/seed-routines'
import { clearTrainingHistory, seedTrainingHistory } from '../db/seed-history'
import { Button, Card, Input, Label, Pill, Sheet } from '../components/ui'
import { PageHeader } from '../components/Layout'
import type { Settings as SettingsType } from '../db/types'

const TABLES = [
  'exercises', 'routines', 'routineItems', 'schedule', 'workouts',
  'workoutExercises', 'sets', 'body', 'progression', 'settings'
] as const

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [status, setStatus] = useState<string>('')
  const [catalogCount, setCatalogCount] = useState(0)
  const [editedCount, setEditedCount] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings())
      setCatalogCount(await db.exercises.count())
    })()
  }, [])

  async function patch(changes: Partial<SettingsType>) {
    await saveSettings(changes)
    setSettings(await getSettings())
  }

  /** Copia de seguridad completa. Mientras no haya sync, esto es el puente
   *  entre el movil y el ordenador. */
  async function exportData() {
    const dump: Record<string, unknown[]> = {}
    for (const table of TABLES) dump[table] = await db.table(table).toArray()
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: Date.now(), data: dump })], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `appentreno-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Copia descargada')
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text())
      const data = parsed.data ?? parsed
      await db.transaction('rw', TABLES.map(t => db.table(t)), async () => {
        for (const table of TABLES) {
          if (Array.isArray(data[table])) await db.table(table).bulkPut(data[table])
        }
      })
      setStatus('Datos importados. Recarga la pagina.')
    } catch {
      setStatus('El fichero no parece una copia valida')
    }
  }

  async function loadExamples() {
    setStatus('Creando rutinas de ejemplo...')
    const result = await seedExampleRoutines()
    const parts: string[] = []
    if (result.created.length) parts.push(`Creadas: ${result.created.join(', ')}`)
    if (result.skipped.length) parts.push(`Ya existian: ${result.skipped.join(', ')}`)
    if (result.custom > 0) {
      parts.push(`${result.custom} ejercicios no estaban en el catalogo y se crearon como propios`)
    }
    setStatus(parts.join('. '))
  }

  /** Si hay ejercicios editados a mano, primero preguntamos que hacer con ellos. */
  async function loadHistory() {
    if (!confirm('Genera 30 semanas de entrenos de prueba. Puede tardar unos segundos. Seguir?')) return
    setStatus('Generando historial… no cierres la pagina')
    const report = await seedTrainingHistory({ weeks: 30 })
    setStatus(
      `Listo: ${report.workouts} entrenos y ${report.sets} series en ${report.weeks} semanas, ` +
      `${report.cardioSessions} sesiones de cardio, ${report.bodyEntries} pesajes ` +
      `y ${report.skippedDays} dias saltados.`
    )
  }

  async function wipeHistory() {
    if (!confirm('Borra TODOS los entrenos y pesajes, pero deja las rutinas. Seguir?')) return
    await clearTrainingHistory()
    setStatus('Historial borrado. Las rutinas siguen ahi.')
  }

  async function reimportCatalog() {
    const edited = await countEditedExercises()
    if (edited > 0) { setEditedCount(edited); return }
    await runReimport(true)
  }

  async function runReimport(preserveEdits: boolean) {
    setEditedCount(null)
    setStatus('Importando catalogo...')
    await patch({ catalogVersion: 0 })
    const result = await ensureCatalog({ preserveEdits })
    setCatalogCount(await db.exercises.count())
    setStatus(result.source === 'dataset'
      ? `Catalogo actualizado: ${result.count} ejercicios${preserveEdits ? ', tus ediciones intactas' : ''}`
      : 'No se encontro el catalogo. Ejecuta: npm run fetch-exercises')
  }

  if (!settings) return <div className="p-8 text-ink-500">Cargando…</div>

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Ajustes" />

      <div className="space-y-4 px-4 pb-8 md:px-8">
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-medium">Progresion automatica</h2>
            <p className="mt-1 text-sm text-ink-500">
              Cuando cierras el rango de reps con margen de esfuerzo varias sesiones seguidas,
              el peso sube solo la proxima vez.
            </p>
          </div>

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Activada</span>
            <input
              type="checkbox" checked={settings.autoProgression === 1}
              onChange={e => void patch({ autoProgression: e.target.checked ? 1 : 0 })}
              className="h-5 w-5 accent-cyan-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <Label>RIR minimo para subir</Label>
              <Input
                type="number" inputMode="numeric" min={0} max={5} value={settings.rirThreshold} className="w-full"
                onChange={e => void patch({ rirThreshold: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label className="space-y-1">
              <Label>Sesiones seguidas</Label>
              <Input
                type="number" inputMode="numeric" min={1} max={5} value={settings.requiredStreak} className="w-full"
                onChange={e => void patch({ requiredStreak: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
          </div>

          <p className="rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-ink-500">
            Ahora mismo: para subir tienes que llegar al tope de reps en todas las series efectivas
            con RIR {settings.rirThreshold} o mas, y repetirlo {settings.requiredStreak}{' '}
            {settings.requiredStreak === 1 ? 'sesion' : 'sesiones'} seguidas.
          </p>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-medium">Valores por defecto</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="space-y-1">
              <Label>Series</Label>
              <Input type="number" min={1} value={settings.defaultSets} className="w-full"
                onChange={e => void patch({ defaultSets: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label className="space-y-1">
              <Label>Reps min</Label>
              <Input type="number" min={1} value={settings.defaultRepsMin} className="w-full"
                onChange={e => void patch({ defaultRepsMin: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label className="space-y-1">
              <Label>Reps max</Label>
              <Input type="number" min={1} value={settings.defaultRepsMax} className="w-full"
                onChange={e => void patch({ defaultRepsMax: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label className="space-y-1">
              <Label>Descanso (s)</Label>
              <Input type="number" min={0} step={15} value={settings.defaultRestSeconds} className="w-full"
                onChange={e => void patch({ defaultRestSeconds: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Catalogo de ejercicios</h2>
            <Pill tone={catalogCount > 100 ? 'good' : 'warn'}>{catalogCount} ejercicios</Pill>
          </div>
          {catalogCount <= 100 && (
            <p className="text-sm text-amber-300/80">
              Estas con el catalogo minimo. Ejecuta <code className="rounded bg-ink-850 px-1">npm run fetch-exercises</code>{' '}
              y vuelve a importar para tener los 1.324.
            </p>
          )}
          <Button variant="outline" onClick={() => void reimportCatalog()}>Reimportar catalogo</Button>
          <p className="text-xs text-ink-500">Imagenes y GIFs: {MEDIA_ATTRIBUTION}</p>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="font-medium">Copia de seguridad</h2>
          <p className="text-sm text-ink-500">
            Los datos viven en este dispositivo. Exporta un fichero para llevartelos al ordenador
            o al movil hasta que montemos el sync en la nube.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void exportData()}>Exportar</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>Importar</Button>
            <input
              ref={fileRef} type="file" accept="application/json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void importData(f) }}
            />
          </div>
          {status && <p className="text-sm text-accent">{status}</p>}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="font-medium">Datos de prueba</h2>
          <p className="text-sm text-ink-500">
            Carga Push, Pull, Pierna A y Pierna B con sus series y reps, y las asigna a
            lunes, martes, miercoles y viernes. Si ya existen no se duplican.
          </p>
          <Button variant="outline" onClick={() => void loadExamples()}>Cargar rutinas de ejemplo</Button>

          <div className="border-t border-ink-850 pt-3">
            <p className="text-sm text-ink-500">
              Y para ver funcionando los rangos, las graficas y la racha hace falta historial:
              esto genera 30 semanas de entrenos realistas, con progresion que se frena, una
              semana de descarga, dias saltados, cardio y pesajes semanales. Los musculos mas
              entrenados llegaran a Oro y los accesorios se quedaran en Plata o Bronce.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadHistory()}>
                Generar 30 semanas de entrenos
              </Button>
              <Button variant="danger" onClick={() => void wipeHistory()}>
                Borrar historial
              </Button>
            </div>
          </div>
        </Card>

        <Card className="space-y-2 p-5">
          <h2 className="font-medium">Zona peligrosa</h2>
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm('Borrar TODOS los datos de este dispositivo? No hay vuelta atras.')) return
              await db.delete()
              location.reload()
            }}
          >
            Borrar todos los datos
          </Button>
        </Card>
      </div>

      <Sheet
        open={editedCount !== null}
        onClose={() => setEditedCount(null)}
        title="Tienes ejercicios editados"
      >
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-300">
            Has cambiado a mano algun dato en <strong>{editedCount}</strong>{' '}
            {editedCount === 1 ? 'ejercicio' : 'ejercicios'} del catalogo.
          </p>
          <p className="text-sm text-ink-500">
            Tus favoritos, anotaciones, imagenes propias e incrementos se conservan pase lo que pase.
            La duda es solo con los campos del dataset que tocaste: nombre, grupo, material,
            musculos e instrucciones.
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={() => void runReimport(true)}>
              Conservar mis cambios
            </Button>
            <Button variant="outline" onClick={() => void runReimport(false)}>
              Dejar que el catalogo los sustituya
            </Button>
            <Button variant="ghost" onClick={() => setEditedCount(null)}>Cancelar</Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
