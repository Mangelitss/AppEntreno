// Como pesa cada tipo de serie en intensidad y estimulo.
import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveRir, setStimulus } from '../src/lib/set-metrics.ts'
import type { WorkoutSet } from '../src/db/types.ts'

function set(over: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: 's', workoutId: 'w', workoutExerciseId: 'we', exerciseId: 'e',
    order: 0, weight: 60, reps: 10, rir: null, type: 'normal', done: 1, completedAt: 0,
    updatedAt: 0, deletedAt: null, ...over
  }
}

test('al fallo y dropset valen RIR 0 aunque no se anote', () => {
  assert.equal(effectiveRir(set({ type: 'failure', rir: null })), 0)
  assert.equal(effectiveRir(set({ type: 'drop', rir: null })), 0)
})

test('una serie normal usa el RIR anotado, o null si no hay', () => {
  assert.equal(effectiveRir(set({ type: 'normal', rir: 3 })), 3)
  assert.equal(effectiveRir(set({ type: 'normal', rir: null })), null)
  // El calentamiento no tiene trato especial: lo filtran antes de llegar aqui.
  assert.equal(effectiveRir(set({ type: 'warmup', rir: 5 })), 5)
})

test('un dropset aporta mas estimulo que una serie normal o al fallo', () => {
  assert.equal(setStimulus(set({ type: 'normal' })), 1)
  assert.equal(setStimulus(set({ type: 'failure' })), 1)
  assert.ok(setStimulus(set({ type: 'drop' })) > setStimulus(set({ type: 'failure' })))
})
