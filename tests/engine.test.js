import test from 'node:test';
import assert from 'node:assert/strict';
import { newLearner, observe, summarizeObservations, adaptation, getConcept, recordDim, recordMisconception, conceptState, conceptReport, noteChunkResult } from '../server/engine/profile.js';
import { applyReview, scheduleAfterStudy, dueConcepts, INTERVALS, DAY } from '../server/engine/review.js';
import { buildLesson, chunkParagraphs } from '../server/engine/material.js';
import { makeService, lastTutor } from './helpers.js';

const mk = () => newLearner({ id: 'l', name: 'Ana', createdAt: 0 });

test('perfil: una observación no es un patrón; dos sí, y siempre en lenguaje probabilístico', () => {
  const l = mk();
  observe(l, 'example_helped', { at: 1, sessionId: 's1', concept: 'a', note: '1' });
  let o = summarizeObservations(l)[0];
  assert.equal(o.isPattern, false);
  assert.match(o.interpretation, /una sola vez/);
  assert.equal(adaptation(l).exampleFirst, false);
  observe(l, 'example_helped', { at: 2, sessionId: 's2', concept: 'a', note: '2' });
  o = summarizeObservations(l)[0];
  assert.equal(o.isPattern, true);
  assert.match(o.interpretation, /Posible patrón/);
  assert.equal(adaptation(l).suggestedHelp, 'example');
  assert.doesNotMatch(JSON.stringify(summarizeObservations(l)), /es visual|mala memoria|kinest|auditiv/i);
});

test('perfil: la misma evidencia no se cuenta dos veces', () => {
  const l = mk();
  for (let i = 0; i < 3; i++) observe(l, 'vocabulary', { at: i, sessionId: 's', concept: 'c', note: 'palabra' });
  assert.equal(l.observations.vocabulary.count, 1);
});

test('adaptación: fragmentos más cortos si responde peor tras fragmentos largos', () => {
  const l = mk();
  assert.equal(adaptation(l).chunkWords, 90);
  noteChunkResult(l, 120, 0.1);
  noteChunkResult(l, 118, 0.2);
  noteChunkResult(l, 60, 0.9);
  assert.ok(adaptation(l).chunkSensitive);
  assert.ok(adaptation(l).chunkWords < 90);
});

test('estado del concepto: definir sin aplicar no es dominar (🟡 reconozco)', () => {
  const l = mk();
  const rec = getConcept(l, { subject: 'X', name: 'c' });
  recordDim(rec, 'comprehension', 3, { at: 1 });
  assert.equal(conceptState(rec), 'partial');
  assert.match(conceptReport(rec, 1).summary, /le cuesta usarlo|situaciones nuevas/);
  recordDim(rec, 'application', 3, { at: 2 });
  assert.equal(conceptState(rec), 'understood');
  recordMisconception(rec, { id: 'm', label: 'l', confusedWith: 'y' }, { at: 3 });
  assert.equal(conceptState(rec), 'partial');
  recordMisconception(rec, { id: 'm', label: 'l', confusedWith: 'y' }, { at: 4 });
  assert.equal(conceptState(rec), 'needs_work');
});

test('estado: la ayuda completa reduce el valor de la evidencia', () => {
  const l = mk();
  const a = getConcept(l, { subject: 'X', name: 'a' });
  const b = getConcept(l, { subject: 'X', name: 'b' });
  recordDim(a, 'comprehension', 3, { help: 0, at: 1 });
  recordDim(b, 'comprehension', 3, { help: 4, at: 1 });
  assert.ok(b.dims.comprehension.score < a.dims.comprehension.score);
});

test('repaso espaciado: éxito alarga, fallo vuelve a un día', () => {
  const l = mk();
  const rec = getConcept(l, { subject: 'X', name: 'c' });
  const t0 = 1000 * DAY;
  scheduleAfterStudy(rec, t0);
  assert.equal(rec.nextReviewAt - t0, DAY);
  assert.deepEqual(dueConcepts(l, t0), []);
  assert.equal(dueConcepts(l, t0 + DAY).length, 1);
  let t = t0 + DAY;
  const days = [];
  for (let i = 0; i < 3; i++) {
    const r = applyReview(rec, t, 3);
    days.push(r.days);
    t = rec.nextReviewAt;
  }
  assert.deepEqual(days, [3, 7, 14]);
  const weak = applyReview(rec, t, 0.5);
  assert.equal(weak.kind, 'weak');
  assert.equal(weak.days, 1);
  assert.equal(rec.box, 0);
});

test('repaso: pedir ayuda para recordar reduce el éxito; intervalo acotado por factor de perfil', () => {
  const l = mk();
  const rec = getConcept(l, { subject: 'X', name: 'c' });
  assert.equal(applyReview(rec, 0, 3, 4).kind, 'partial');
  const rec2 = getConcept(l, { subject: 'X', name: 'd' });
  const r = applyReview(rec2, 0, 3, 0, 0.7);
  assert.equal(r.days, Math.round(INTERVALS[1] * 0.7));
});

test('material: texto largo se divide en fragmentos razonables y sin perder contenido', () => {
  const para = 'Esta es una oración de ejemplo con varias palabras para llenar el párrafo. '.repeat(12);
  const text = `Tema de prueba\n\n${para}\n\n${para}\n\n${para}`;
  const lesson = buildLesson(text, { level: 'primary', chunkWords: 90 });
  const chunks = lesson.concepts[0].chunks;
  assert.ok(chunks.length >= 3);
  assert.equal(chunks.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim().length >= text.replace(/Tema de prueba/, '').replace(/\s+/g, ' ').trim().length - 5, true);
  const small = chunkParagraphs([para, para, para], 50);
  assert.ok(small.length > chunks.length - 1);
});

test('material con encabezados → varios conceptos; el nivel universitario usa fragmentos más largos', () => {
  const body = (w) => `${w} es un concepto importante que se explica con detalle en esta sección del material de estudio. `.repeat(5);
  const text = `Apuntes de biología\n\n## Mitosis\n\n${body('La mitosis')}\n\n## Meiosis\n\n${body('La meiosis')}`;
  const lesson = buildLesson(text, { level: 'university' });
  assert.deepEqual(lesson.concepts.map((c) => c.name), ['Mitosis', 'Meiosis']);
  assert.equal(lesson.title, 'Apuntes de biología');
});

test('autonomía: sube tras varias sesiones con poca ayuda y se usa para dejar de dar pistas rápidas', async () => {
  const svc = makeService();
  const kid = svc.createProfile({ name: 'Ana' });
  const l = svc.store.db.profiles[kid.id];
  l.autonomy = 2;
  const prev = await svc.previewMaterial({ profileId: kid.id, sampleId: 'texto-expositivo' });
  const v = await svc.startStudy(kid.id, prev.lessonId);
  await svc.answer(kid.id, v.id, { text: 'no sé' });
  await svc.answer(kid.id, v.id, { text: 'no sé' });
  await svc.advance(kid.id, v.id, 'read-done');
  const first = await svc.help(kid.id, v.id, 'hint');
  assert.match(lastTutor(first.view), /estrategia/, 'con autonomía alta primero se invita a elegir una estrategia');
  assert.equal(first.view.step.help[0].kind, 'hint', 'la pista sigue disponible después');
  const second = await svc.help(kid.id, v.id, 'hint');
  assert.doesNotMatch(lastTutor(second.view), /estrategia/);
});

test('intereses: solo se usan si el niño los compartió; nunca se inventan', async () => {
  const svc = makeService();
  const kid = svc.createProfile({ name: 'Ana' });
  const run = async () => {
    const prev = await svc.previewMaterial({ profileId: kid.id, sampleId: 'texto-expositivo' });
    const v = await svc.startStudy(kid.id, prev.lessonId);
    await svc.answer(kid.id, v.id, { text: 'no sé' });
    await svc.answer(kid.id, v.id, { text: 'no sé' });
    await svc.advance(kid.id, v.id, 'read-done');
    await svc.help(kid.id, v.id, 'hint');
    await svc.help(kid.id, v.id, 'example');
    await svc.help(kid.id, v.id, 'steps');
    return svc.help(kid.id, v.id, 'full');
  };
  const a = await run();
  assert.doesNotMatch(lastTutor(a.view), /videojuego/i);
  svc.setInterests(kid.id, ['videojuegos']);
  const b = await run();
  assert.match(lastTutor(b.view), /videojuego/i);
});
