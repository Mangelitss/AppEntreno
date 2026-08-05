// Pruebas del motor de progresion. Se ejecutan con: npm test
import assert from 'node:assert/strict'
import test from 'node:test'
import { applyEvaluation, defaultIncrement, emptyProgression, evaluateSession } from '../src/lib/progression.ts'
import type { Exercise, Settings, WorkoutSet } from '../src/db/types.ts'

const settings: Settings = {
  id: 'settings', rirThreshold: 2, requiredStreak: 2, autoProgression: 1,
  defaultRestSeconds: 120, defaultSets: 3, defaultRepsMin: 8, defaultRepsMax: 10,
  unit: 'kg', catalogVersion: 1
}

const bench: Exercise = {
  id: 'e1', name: 'barbell bench press', search: '', category: 'chest', equipment: 'barbell',
  target: 'pectorals', secondaryMuscles: [], instructions: [], image: null, gif: null,
  isCustom: 0, favorite: 0, incrementKg: null, updatedAt: 0, deletedAt: null
}

const squat: Exercise = { ...bench, id: 'e2', name: 'barbell full squat', category: 'upper legs' }
const pullup: Exercise = { ...bench, id: 'e3', name: 'pull-up', category: 'back', equipment: 'body weight' }

function set(over: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: Math.random().toString(36), workoutId: 'w', workoutExerciseId: 'we', exerciseId: 'e1',
    order: 0, weight: 60, reps: 10, rir: 2, type: 'normal', done: 1, completedAt: 0,
    updatedAt: 0, deletedAt: null, ...over
  }
}

test('incrementos deducidos del equipamiento', () => {
  assert.equal(defaultIncrement(bench), 2.5, 'barra tren superior')
  assert.equal(defaultIncrement(squat), 5, 'barra en pierna')
  assert.equal(defaultIncrement({ equipment: 'dumbbell', category: 'upper arms' }), 2)
  assert.equal(defaultIncrement({ equipment: 'cable', category: 'back' }), 5)
  assert.equal(defaultIncrement(pullup), 0, 'peso corporal progresa en reps')
})

test('las series de calentamiento no cuentan', () => {
  const sets = [set({ type: 'warmup', reps: 3, rir: 5 }), set({ reps: 10, rir: 3 })]
  assert.equal(evaluateSession(sets, 10, 2).ready, true)
})

test('no sube si no llegas al tope de reps', () => {
  const sets = [set({ reps: 10, rir: 3 }), set({ reps: 8, rir: 3 })]
  const e = evaluateSession(sets, 10, 2)
  assert.equal(e.ready, false)
  assert.match(e.reason, /10 reps/)
})

test('no sube si llegas al rango pero con RIR bajo', () => {
  const sets = [set({ reps: 10, rir: 1 }), set({ reps: 10, rir: 0 })]
  assert.equal(evaluateSession(sets, 10, 2).ready, false)
})

test('sube cuando cierras el rango con RIR suficiente', () => {
  const sets = [set({ reps: 10, rir: 3 }), set({ reps: 11, rir: 2 })]
  const e = evaluateSession(sets, 10, 2)
  assert.equal(e.ready, true)
  assert.equal(e.topWeight, 60)
})

test('sin RIR anotado basta con cerrar el rango', () => {
  const sets = [set({ reps: 10, rir: null }), set({ reps: 10, rir: null })]
  assert.equal(evaluateSession(sets, 10, 2).ready, true)
})

test('hacen falta dos sesiones seguidas antes de subir', () => {
  const ready = evaluateSession([set({ reps: 10, rir: 3 })], 10, 2)

  const first = applyEvaluation(emptyProgression('e1'), ready, bench, settings, 'w1')
  assert.equal(first.appliedIncrement, 0, 'la primera sesion solo acumula racha')
  assert.equal(first.state.streak, 1)

  const second = applyEvaluation(first.state, ready, bench, settings, 'w2')
  assert.equal(second.appliedIncrement, 2.5, 'la segunda ya sube')
  assert.equal(second.state.pendingWeightKg, 2.5)
  assert.equal(second.state.streak, 0, 'la racha se reinicia tras subir')
})

test('una sesion mala corta la racha', () => {
  const ready = evaluateSession([set({ reps: 10, rir: 3 })], 10, 2)
  const bad = evaluateSession([set({ reps: 7, rir: 0 })], 10, 2)

  const a = applyEvaluation(emptyProgression('e1'), ready, bench, settings, 'w1')
  const b = applyEvaluation(a.state, bad, bench, settings, 'w2')
  assert.equal(b.state.streak, 0)

  const c = applyEvaluation(b.state, ready, bench, settings, 'w3')
  assert.equal(c.appliedIncrement, 0, 'vuelve a empezar de cero')
})

test('un entreno sin series completadas no toca la racha', () => {
  const previous = { ...emptyProgression('e1'), streak: 1 }
  const nothing = evaluateSession([set({ done: 0 })], 10, 2)
  const out = applyEvaluation(previous, nothing, bench, settings, 'w9')
  assert.equal(out.state.streak, 1, 'la racha se conserva')
})

test('peso corporal progresa sumando repeticiones', () => {
  const ready = evaluateSession([set({ weight: 0, reps: 10, rir: 3 })], 10, 2)
  const a = applyEvaluation(emptyProgression('e3'), ready, pullup, settings, 'w1')
  const b = applyEvaluation(a.state, ready, pullup, settings, 'w2')
  assert.equal(b.appliedReps, 1)
  assert.equal(b.state.pendingWeightKg, 0)
})

test('con la progresion desactivada nunca sube sola', () => {
  const off: Settings = { ...settings, autoProgression: 0 }
  const ready = evaluateSession([set({ reps: 10, rir: 3 })], 10, 2)
  let state = emptyProgression('e1')
  for (let i = 0; i < 5; i++) state = applyEvaluation(state, ready, bench, off, `w${i}`).state
  assert.equal(state.pendingWeightKg, 0)
})

test('el incremento manual del ejercicio manda sobre el del equipamiento', () => {
  const custom: Exercise = { ...bench, incrementKg: 1 }
  const ready = evaluateSession([set({ reps: 10, rir: 3 })], 10, 2)
  const a = applyEvaluation(emptyProgression('e1'), ready, custom, settings, 'w1')
  const b = applyEvaluation(a.state, ready, custom, settings, 'w2')
  assert.equal(b.appliedIncrement, 1)
})
