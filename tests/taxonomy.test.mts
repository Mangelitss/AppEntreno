import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CATEGORIES, EQUIPMENT, MUSCLES, categoryEs, equipmentEs, mergeOptions
} from '../src/lib/taxonomy.ts'
import { muscleEs } from '../src/lib/muscles.ts'

test('la lista canonica cubre lo que trae el dataset', () => {
  // Valores reales que aparecen en exercises.json
  for (const value of ['chest', 'upper legs', 'waist', 'cardio']) {
    assert.ok(CATEGORIES.includes(value), `falta el grupo ${value}`)
  }
  for (const value of ['barbell', 'dumbbell', 'body weight', 'smith machine', 'leverage machine']) {
    assert.ok(EQUIPMENT.includes(value), `falta el material ${value}`)
  }
  for (const value of ['pectorals', 'lats', 'quads', 'glutes', 'delts', 'cardiovascular system']) {
    assert.ok(MUSCLES.includes(value), `falta el musculo ${value}`)
  }
})

test('todo valor de la lista tiene su pista en espanol', () => {
  for (const value of CATEGORIES) {
    assert.notEqual(categoryEs(value), '', `sin traducir: ${value}`)
  }
  for (const value of EQUIPMENT) {
    assert.notEqual(equipmentEs(value), '', `sin traducir: ${value}`)
  }
  for (const value of MUSCLES) {
    assert.notEqual(muscleEs(value), '', `sin traducir: ${value}`)
  }
})

test('las pistas traducen de verdad, no solo capitalizan', () => {
  assert.equal(muscleEs('lats'), 'Dorsales')
  assert.equal(muscleEs('quads'), 'Cuadriceps')
  assert.equal(muscleEs('delts'), 'Hombros')
  assert.equal(muscleEs('hamstrings'), 'Femoral')
  assert.equal(categoryEs('upper legs'), 'Pierna')
  assert.equal(categoryEs('waist'), 'Core')
  assert.equal(equipmentEs('smith machine'), 'Multipower')
  assert.equal(equipmentEs('body weight'), 'Peso corporal')
})

test('la lista se amplia con lo que haya en tu catalogo', () => {
  const merged = mergeOptions(EQUIPMENT, ['barbell', 'cinta de correr', 'deporte'])
  assert.ok(merged.includes('cinta de correr'), 'aparece lo que no estaba previsto')
  assert.ok(merged.includes('barbell'))
  assert.equal(merged.filter(v => v === 'barbell').length, 1, 'sin duplicados')
})

test('al fusionar se normaliza y se ignora la basura', () => {
  const merged = mergeOptions(['barbell'], ['  DUMBBELL  ', '', '   ', 'barbell'])
  assert.ok(merged.includes('dumbbell'), 'se guarda en minusculas y sin espacios')
  assert.equal(merged.length, 2)
})

test('la lista sale ordenada, para poder recorrerla', () => {
  const merged = mergeOptions(['zzz', 'aaa'], ['mmm'])
  assert.deepEqual(merged, ['aaa', 'mmm', 'zzz'])
})

test('un valor desconocido no revienta la traduccion', () => {
  assert.equal(categoryEs('inventado'), '')
  assert.equal(equipmentEs('inventado'), '')
  assert.equal(muscleEs('inventado'), 'Inventado', 'los musculos se muestran capitalizados')
})
