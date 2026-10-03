// Navegacion del movil: que pestana es cada ruta y como se reparten en los hexagonos.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MOBILE_GROUPS, SECTION_PATH, sectionOf, sideOf, type SectionId
} from '../src/lib/navigation.ts'

test('cada ruta cae en su pestana, tambien sus subpantallas', () => {
  const cases: Array<[string, SectionId]> = [
    ['/', 'hoy'],
    ['/rutinas', 'rutinas'],
    ['/rutinas/abc', 'rutinas'],
    ['/ejercicios/0025', 'ejercicios'],
    ['/progreso', 'progreso'],
    ['/estadisticas/historial-vida', 'estadisticas'],
    ['/medidas', 'medidas'],
    ['/cuerpo', 'medidas'],
    ['/social/amigo/uid123', 'social'],
    ['/amigo/K7Q2XM9P', 'social'],
    ['/perfil', 'perfil'],
    ['/ajustes', 'perfil'],
    ['/entrar', 'perfil'],
    ['/no-existe', 'hoy']
  ]
  for (const [path, section] of cases) assert.equal(sectionOf(path), section, path)
})

test('progreso abre medidas y rutinas; perfil abre social y estadisticas', () => {
  assert.deepEqual(MOBILE_GROUPS.izquierda, { main: 'progreso', fan: ['medidas', 'rutinas'] })
  assert.deepEqual(MOBILE_GROUPS.derecha, { main: 'perfil', fan: ['social', 'estadisticas'] })
})

test('en el movil estan todas menos Ejercicios, que se abre desde Rutinas', () => {
  const inNav = new Set<SectionId>(['hoy'])
  for (const group of Object.values(MOBILE_GROUPS)) {
    inNav.add(group.main)
    for (const section of group.fan) inNav.add(section)
  }
  const missing = (Object.keys(SECTION_PATH) as SectionId[]).filter(section => !inNav.has(section))
  assert.deepEqual(missing, ['ejercicios'])
  assert.equal(inNav.size, 7, 'sin repetir ninguna')
})

test('cada pestana sabe en que lado vive, para resaltar su hexagono', () => {
  assert.equal(sideOf('hoy'), null)
  assert.equal(sideOf('progreso'), 'izquierda')
  assert.equal(sideOf('rutinas'), 'izquierda')
  assert.equal(sideOf('ejercicios'), 'izquierda', 'va con Rutinas, que es desde donde se entra')
  assert.equal(sideOf('perfil'), 'derecha')
  assert.equal(sideOf('social'), 'derecha')
  assert.equal(sideOf('estadisticas'), 'derecha')
})
