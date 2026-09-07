import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ageFrom, bmi, bmiBand, composition, formatRatio, waistToHeight, waistToHeightBand
} from '../src/lib/body.ts'

test('el IMC sale de peso y altura', () => {
  assert.equal(bmi(80, 180), 24.7)
  assert.equal(bmi(60, 165), 22)
})

test('sin altura no hay IMC, y no se inventa', () => {
  assert.equal(bmi(80, null), null)
  assert.equal(bmi(null, 180), null)
  assert.equal(bmi(80, 0), null, 'una altura de cero dividiria entre cero')
})

test('las franjas del IMC estan en los cortes de siempre', () => {
  assert.equal(bmiBand(17)?.label, 'Bajo peso')
  assert.equal(bmiBand(22)?.label, 'Normal')
  assert.equal(bmiBand(24.9)?.label, 'Normal')
  assert.equal(bmiBand(25)?.label, 'Sobrepeso')
  assert.equal(bmiBand(31)?.label, 'Obesidad')
  assert.equal(bmiBand(null), null)
})

test('el ratio cintura/altura se calcula y se interpreta', () => {
  assert.equal(waistToHeight(80, 180), 0.444)
  assert.equal(waistToHeightBand(0.444)?.label, 'Saludable')
  assert.equal(waistToHeightBand(0.55)?.label, 'Riesgo aumentado')
  assert.equal(waistToHeightBand(0.62)?.label, 'Riesgo alto')
})

test('sin cintura anotada el ratio no existe', () => {
  assert.equal(waistToHeight(null, 180), null)
  assert.equal(waistToHeight(80, null), null)
})

test('el peso se reparte en masa magra y grasa', () => {
  const result = composition(80, 15, 180)
  assert.equal(result?.fatKg, 12)
  assert.equal(result?.leanKg, 68)
  assert.equal(result?.ffmi, 21, 'FFMI = magra entre altura al cuadrado')
})

test('sin porcentaje de grasa no se reparte nada', () => {
  assert.equal(composition(80, null, 180), null)
  assert.equal(composition(null, 15, 180), null)
  assert.equal(composition(80, 100, 180), null, 'un 100% de grasa no es un dato valido')
})

test('el reparto funciona aunque falte la altura, solo sin FFMI', () => {
  const result = composition(80, 15, null)
  assert.equal(result?.leanKg, 68)
  assert.equal(result?.ffmi, null)
})

test('la edad tiene en cuenta si ya cumpliste este ano', () => {
  const hoy = new Date(2026, 7, 25) // 25 de agosto de 2026
  assert.equal(ageFrom('1998-03-10', hoy), 28, 'cumplio en marzo')
  assert.equal(ageFrom('1998-12-10', hoy), 27, 'aun no ha cumplido')
  assert.equal(ageFrom('1998-08-25', hoy), 28, 'justo hoy cuenta como cumplido')
})

test('una fecha de nacimiento vacia o absurda no rompe nada', () => {
  assert.equal(ageFrom(null), null)
  assert.equal(ageFrom(''), null)
  assert.equal(ageFrom('no-es-una-fecha'), null)
})

test('el ratio se muestra con coma, como se escribe aqui', () => {
  assert.equal(formatRatio(0.444), '0,44')
  assert.equal(formatRatio(null), '—')
})
