import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonFromPack } from '../server/engine/material.js';
import { diagnose } from '../server/engine/diagnosis.js';
import { getPack } from '../server/packs/index.js';

const te = lessonFromPack(getPack('texto-expositivo')).concepts[0];
const chunk = te.chunks[0];
const ask = (text, extra = {}) =>
  diagnose({ purpose: 'explain', qType: 'open', answer: { text }, points: chunk.points, concept: te, source: chunk.text, ...extra });

test('no es solo correcto/incorrecto: detecta la confusión informar vs. narrar', () => {
  const d = ask('Un texto expositivo sirve para contar una historia.');
  assert.equal(d.outcome, 'confused');
  assert.equal(d.misconception.id, 'expositivo-es-narrativo');
  assert.match(d.interpretation, /Posible confusión/);
  assert.equal(d.recommendedHelp, 'compare');
  assert.ok(d.confidence < 0.8, 'el diagnóstico es probabilístico, nunca certeza');
});

test('una negación no dispara el error conceptual', () => {
  const d = ask('No sirve para contar una historia, sirve para informar sobre un tema');
  assert.equal(d.misconception, null);
  assert.notEqual(d.outcome, 'confused');
});

test('respuesta parcial: identifica qué ideas faltan', () => {
  const d = ask('Explica un tema');
  assert.equal(d.outcome, 'partial');
  assert.ok(d.coveredPointIds.includes('p-sirve'));
  assert.ok(d.missingPointIds.length > 0);
});

test('copiar el texto casi literal se marca como repetición, no como comprensión', () => {
  const d = ask('Un texto expositivo es un texto que explica o informa sobre un tema. Quien lo escribe quiere que el lector aprenda algo nuevo y lo entienda con claridad.');
  assert.ok(d.signals.includes('recited'));
  assert.equal(d.outcome, 'comprehension_issue');
  assert.ok(d.dims.comprehension <= 1.5);
});

test('"no sé" es falta de conocimiento y no un error', () => {
  const d = ask('no sé');
  assert.equal(d.outcome, 'no_knowledge');
});

test('palabras desconocidas se registran', () => {
  const d = ask('no entiendo qué significa objetivo');
  assert.deepEqual(d.unknownWords, ['objetivo']);
});

test('opción con error conceptual asociado revela la confusión', () => {
  const f = lessonFromPack(getPack('fracciones')).concepts[0];
  const d = diagnose({ purpose: 'apply', qType: 'choice', task: f.applyTasks[0], answer: { choice: 'b' }, concept: f });
  assert.equal(d.outcome, 'confused');
  assert.equal(d.misconception.id, 'denominador-mayor-fraccion-mayor');
  assert.equal(d.dims.application, 0);
});

test('elegir bien y explicar la razón puntúa más que solo elegir', () => {
  const f = lessonFromPack(getPack('fracciones')).concepts[0];
  const solo = diagnose({ purpose: 'apply', qType: 'choice', task: f.applyTasks[0], answer: { choice: 'a' }, concept: f });
  const razon = diagnose({ purpose: 'apply', qType: 'choice', task: f.applyTasks[0], answer: { choice: 'a', text: 'porque la mitad se corta en menos partes y cada pedazo es mas grande' }, concept: f });
  assert.ok(razon.dims.application > solo.dims.application);
});

test('aplicación abierta: narrar en lugar de explicar queda como aplicación parcial', () => {
  const task = te.applyTasks.find((t) => t.id === 'te-a2');
  const story = diagnose({ purpose: 'apply', qType: 'open', task, answer: { text: 'Había una vez un niño que jugaba un videojuego y un día ganó mucho' }, concept: te });
  const expo = diagnose({ purpose: 'apply', qType: 'open', task, answer: { text: 'El ajedrez se juega entre dos personas. Cada una tiene 16 piezas y el objetivo es capturar al rey.' }, concept: te });
  assert.ok(expo.dims.application > story.dims.application);
  assert.ok(story.signals.includes('narrative_instead_of_expository'));
});

test('universidad: p-valor como probabilidad de H0 se detecta y su negación no', () => {
  const v = lessonFromPack(getPack('valor-p')).concepts[0];
  const mk = (t) => diagnose({ purpose: 'explain', qType: 'open', answer: { text: t }, points: v.chunks[2].points, concept: v, source: v.chunks[2].text });
  assert.equal(mk('Es la probabilidad de que la hipótesis nula sea verdadera').misconception?.id, 'p-es-prob-h0');
  assert.equal(mk('No es la probabilidad de que H0 sea cierta; es la probabilidad de los datos si H0 es cierta').misconception, null);
  assert.equal(mk('Es la probabilidad de que el resultado se deba al azar').misconception?.id, 'p-es-prob-azar');
});

test('tarea numérica: acepta el valor esperado con tolerancia', () => {
  const v = lessonFromPack(getPack('valor-p')).concepts[0];
  const task = v.applyTasks.find((t) => t.id === 'vp-a1');
  const ok = diagnose({ purpose: 'apply', qType: 'open', task, answer: { text: 'z = 1,2 y el valor p será mayor porque 72 está más cerca de 70, el dato es menos raro' }, concept: v });
  const bad = diagnose({ purpose: 'apply', qType: 'open', task, answer: { text: 'z = 5 y el valor p será menor porque es raro' }, concept: v });
  assert.equal(ok.numericOk, true);
  assert.equal(bad.numericOk, false);
  assert.ok(ok.dims.application > bad.dims.application);
});
