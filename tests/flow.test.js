import test from 'node:test';
import assert from 'node:assert/strict';
import { makeService, lastTutor } from './helpers.js';

async function startKid(svc, sampleId = 'texto-expositivo', level = 'primary') {
  const kid = svc.createProfile({ name: 'Ana', level });
  const prev = await svc.previewMaterial({ profileId: kid.id, sampleId });
  const v = await svc.startStudy(kid.id, prev.lessonId);
  return { kid, v, sid: v.id };
}
const ans = (svc, kid, sid, body) => svc.answer(kid.id, sid, body);

test('empieza descubriendo lo que sabe el niño, sin explicar', async () => {
  const svc = makeService();
  const { v } = await startKid(svc);
  assert.equal(v.step.type, 'ask');
  assert.equal(v.step.purpose, 'prior');
  assert.match(v.transcript[0].text, /quiero saber qué sabes/);
  assert.ok(!v.transcript.some((t) => t.kind === 'chunk'), 'no se muestra el contenido antes del diagnóstico');
});

test('el diagnóstico inicial no corrige: solo recoge información', async () => {
  const svc = makeService();
  const { kid, sid } = await startKid(svc);
  const r = await ans(svc, kid, sid, { text: 'Creo que sirve para contar una historia.' });
  assert.equal(r.debug.misconception.id, 'expositivo-es-narrativo');
  assert.doesNotMatch(lastTutor(r.view, 1), /incorrect|equivoc|mal\b|error/i);
});

test('la vista pública nunca filtra respuestas ni palabras clave', async () => {
  const svc = makeService();
  const { kid, sid } = await startKid(svc);
  let r = await ans(svc, kid, sid, { text: 'no sé' });
  r = await ans(svc, kid, sid, { text: 'no sé' });
  r = { view: (await svc.advance(kid.id, sid, 'read-done')).view };
  r = await ans(svc, kid, sid, { text: 'sirve para contar una historia' });
  const json = JSON.stringify(r.view.step);
  assert.doesNotMatch(json, /"correct"|keywords|whyKeywords|_ask|triggers/);
});

test('error conceptual → contraste → nuevo intento → concepto resuelto', async () => {
  const svc = makeService();
  const { kid, sid } = await startKid(svc);
  await ans(svc, kid, sid, { text: 'no sé' });
  await ans(svc, kid, sid, { text: 'no sé' });
  await svc.advance(kid.id, sid, 'read-done');
  let r = await ans(svc, kid, sid, { text: 'Sirve para contar una historia' });
  assert.equal(r.view.step.type, 'contrast');
  assert.match(lastTutor(r.view, 3), /mezclando dos tipos de textos/);
  r = await ans(svc, kid, sid, { choice: 'B', text: 'porque B da datos de cómo son los perros y A cuenta lo que pasó' });
  assert.equal(r.view.step.purpose, 'retry');
  const rep = svc.adultReport(kid.id);
  assert.ok(rep.concepts[0].resolvedConfusions.length === 1, 'la confusión queda como aclarada');
});

test('ayuda progresiva: no se puede saltar niveles y la explicación completa marca el concepto', async () => {
  const svc = makeService();
  const { kid, sid } = await startKid(svc);
  await ans(svc, kid, sid, { text: 'no sé' });
  await ans(svc, kid, sid, { text: 'no sé' });
  await svc.advance(kid.id, sid, 'read-done');
  const skip = await svc.help(kid.id, sid, 'steps');
  assert.equal(skip.ok, false);
  const h1 = await svc.help(kid.id, sid, 'hint');
  assert.equal(h1.ok, true);
  assert.deepEqual(h1.view.step.help.map((x) => x.kind).filter((k) => ['hint', 'example', 'steps', 'full'].includes(k)), ['example']);
  await svc.help(kid.id, sid, 'example');
  await svc.help(kid.id, sid, 'steps');
  const full = await svc.help(kid.id, sid, 'full');
  assert.equal(full.ok, true);
  assert.match(lastTutor(full.view), /expositivo/i);
  const r = await ans(svc, kid, sid, { text: 'Explica o informa sobre un tema con datos y ejemplos, como en las enciclopedias' });
  assert.equal(r.debug.help, 4);
  const rep = svc.adultReport(kid.id);
  assert.ok(rep.observations.some((o) => o.key === 'full_help_needed'));
  assert.ok(rep.concepts[0].dims.comprehension.score < 3 * 0.9, 'la ayuda completa reduce el valor de la evidencia');
});

test('ciclo completo: material → … → aplicación → resumen → repaso al día siguiente', async () => {
  const svc = makeService();
  const { kid, sid } = await startKid(svc);
  const say = (t, x = {}) => ans(svc, kid, sid, { text: t, ...x });
  await say('Sirve para contar una historia');
  await say('no sé');
  await svc.advance(kid.id, sid, 'read-done');
  let r = await say('Sirve para contar una historia');
  r = await say('porque B informa con datos', { choice: 'B' });
  r = await say('Explica o informa sobre un tema usando datos y ejemplos');
  await svc.advance(kid.id, sid, 'read-done');
  r = await say('Tiene introducción, desarrollo y conclusión, y un lenguaje claro y objetivo');
  await svc.advance(kid.id, sid, 'read-done');
  r = await say('Usa títulos, imágenes y palabras como primero y además');
  assert.equal(r.view.step.purpose, 'apply');
  r = await ans(svc, kid, sid, { choice: 'b', text: 'porque da datos reales' });
  r = await say('El ajedrez se juega entre dos personas. Cada una tiene 16 piezas. El objetivo es capturar al rey.');
  assert.equal(r.view.step.purpose, 'reexplain', 'tras una confusión se pide explicar de nuevo antes de cerrar');
  r = await say('Es un texto que explica o informa con datos y ejemplos, se organiza en introducción, desarrollo y conclusión y usa títulos');
  assert.equal(r.view.step.type, 'wrap');
  assert.ok(r.view.summary.child.can.length);
  assert.ok(!svc.home(kid.id).dueCount, 'todavía no toca repasar');
  svc.store.db.meta.clockOffsetDays = 1;
  assert.equal(svc.home(kid.id).dueCount, 1, 'al día siguiente hay un repaso pendiente');
  const rv = await svc.startReview(kid.id);
  assert.match(rv.step.prompt, /Cuéntame lo que recuerdes/);
  const rr = await ans(svc, kid, rv.id, { text: 'Explica e informa sobre un tema con datos y ejemplos y tiene introducción, desarrollo y conclusión' });
  assert.ok(['strong', 'partial'].includes(rr.view.summary.results[0].kind));
  assert.ok(!rr.view.transcript.some((t) => t.kind === 'chunk'), 'el repaso no vuelve a enseñar');
  const map = svc.knowledgeMap(kid.id);
  assert.equal(map.subjects[0].subject, 'Lengua');
});

test('una respuesta repetida del texto no cuenta como comprensión: se pide un porqué o ejemplo', async () => {
  const svc = makeService();
  const { kid, sid } = await startKid(svc);
  await ans(svc, kid, sid, { text: 'no sé' });
  await ans(svc, kid, sid, { text: 'no sé' });
  await svc.advance(kid.id, sid, 'read-done');
  const r = await ans(svc, kid, sid, { text: 'Un texto expositivo es un texto que explica o informa sobre un tema. Quien lo escribe quiere que el lector aprenda algo nuevo y lo entienda con claridad.' });
  assert.equal(r.view.step.purpose, 'why');
  assert.ok(svc.adultReport(kid.id).observations.some((o) => o.key === 'recites_definitions'));
});

test('material propio: se divide en partes, se detecta el tema y se generan ideas clave', async () => {
  const svc = makeService();
  const kid = svc.createProfile({ name: 'Mia' });
  const { SAMPLES } = await import('../server/packs/index.js');
  const text = SAMPLES.find((s) => s.id === 'ciudad-blanca').text;
  const prev = await svc.previewMaterial({ profileId: kid.id, text });
  assert.equal(prev.title, 'Ciudad Blanca');
  assert.equal(prev.source, 'heuristic');
  assert.ok(prev.concepts[0].chunks >= 2);
  const v = await svc.startStudy(kid.id, prev.lessonId);
  assert.match(v.step.prompt, /Ciudad Blanca/);
  await ans(svc, kid, v.id, { text: 'Una ciudad perdida' });
  await ans(svc, kid, v.id, { text: 'No sé' });
  await svc.advance(kid.id, v.id, 'read-done');
  const r = await ans(svc, kid, v.id, { text: 'Habla de una leyenda de una ciudad escondida en la selva de Honduras' });
  assert.ok(['partial', 'correct'].includes(r.debug.outcome));
  if (r.debug.outcome === 'partial') assert.match(lastTutor(r.view, 1), /¿/, 'la pista es una pregunta, no la respuesta');
});

test('validaciones: sin texto, sin elegir, material gigante', async () => {
  const svc = makeService();
  const kid = svc.createProfile({ name: 'Ana' });
  await assert.rejects(() => svc.previewMaterial({ profileId: kid.id, text: '   ' }), /Escribe/);
  await assert.rejects(() => svc.previewMaterial({ profileId: kid.id, text: 'x'.repeat(70000) }), /largo/);
  await assert.rejects(() => svc.startStudy(kid.id, 'nope'), /no encontrado/i);
  assert.throws(() => svc.createProfile({ name: '' }), /nombre/);
});

test('sesión de aprendizaje es resumible (estado persistido en el servidor)', async () => {
  const svc = makeService();
  const { kid, sid } = await startKid(svc);
  await ans(svc, kid, sid, { text: 'no sé' });
  const again = await svc.getSession(kid.id, sid);
  assert.equal(again.step.purpose, 'prior');
  assert.equal(svc.home(kid.id).continueSession.id, sid);
});
