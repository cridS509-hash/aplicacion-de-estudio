import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import * as LLM from '../server/engine/llm.js';
import { diagnose } from '../server/engine/diagnosis.js';
import { lessonFromPack } from '../server/engine/material.js';
import { getPack } from '../server/packs/index.js';
import { makeService } from './helpers.js';

async function withApp(fn) {
  const { server } = createApp({});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { 'x-adult-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const txt = await res.text();
    let json = null;
    try { json = JSON.parse(txt); } catch { /* html */ }
    return { status: res.status, json, txt, headers: res.headers };
  };
  try { await fn(call, base); } finally { server.close(); }
}

test('HTTP: la zona adulta exige PIN y los datos del niño no se leen sin él', async () => {
  await withApp(async (call) => {
    const p = (await call('/api/profiles', { method: 'POST', body: { name: 'Ana' } })).json;
    assert.equal((await call(`/api/adult/profiles/${p.id}/report`)).status, 401);
    assert.equal((await call(`/api/adult/profiles/${p.id}/export`)).status, 401);
    assert.equal((await call(`/api/adult/profiles/${p.id}`, { method: 'DELETE' })).status, 401);
    assert.equal((await call('/api/adult/setup', { method: 'POST', body: { pin: 'abc' } })).status, 400);
    const { token } = (await call('/api/adult/setup', { method: 'POST', body: { pin: '1234' } })).json;
    assert.equal((await call('/api/adult/setup', { method: 'POST', body: { pin: '9999' } })).status, 409, 'no se puede sobrescribir el PIN');
    assert.equal((await call('/api/adult/unlock', { method: 'POST', body: { pin: '0000' } })).status, 401);
    assert.equal((await call(`/api/adult/profiles/${p.id}/report`, { token })).status, 200);
    const exp = await call(`/api/adult/profiles/${p.id}/export`, { token });
    assert.match(exp.headers.get('content-disposition'), /attachment/);
  });
});

test('HTTP: borrar el perfil elimina perfil, sesiones, materiales y exámenes', async () => {
  await withApp(async (call) => {
    const p = (await call('/api/profiles', { method: 'POST', body: { name: 'Ana' } })).json;
    const prev = (await call(`/api/profiles/${p.id}/material`, { method: 'POST', body: { sampleId: 'texto-expositivo' } })).json;
    await call(`/api/profiles/${p.id}/sessions`, { method: 'POST', body: { lessonId: prev.lessonId } });
    const { token } = (await call('/api/adult/setup', { method: 'POST', body: { pin: '1234' } })).json;
    assert.equal((await call(`/api/adult/profiles/${p.id}`, { method: 'DELETE', token })).status, 200);
    assert.equal((await call(`/api/profiles/${p.id}/home`)).status, 404);
    assert.deepEqual((await call('/api/profiles')).json.profiles, []);
  });
});

test('HTTP: un niño no puede leer la sesión de otro perfil', async () => {
  await withApp(async (call) => {
    const a = (await call('/api/profiles', { method: 'POST', body: { name: 'A' } })).json;
    const b = (await call('/api/profiles', { method: 'POST', body: { name: 'B' } })).json;
    const prev = (await call(`/api/profiles/${a.id}/material`, { method: 'POST', body: { sampleId: 'fracciones' } })).json;
    const s = (await call(`/api/profiles/${a.id}/sessions`, { method: 'POST', body: { lessonId: prev.lessonId } })).json;
    assert.equal((await call(`/api/profiles/${b.id}/sessions/${s.id}`)).status, 404);
    assert.equal((await call(`/api/profiles/${b.id}/sessions`, { method: 'POST', body: { lessonId: prev.lessonId } })).status, 404);
  });
});

test('HTTP: archivos estáticos, cabeceras de seguridad y sin salir del directorio público', async () => {
  await withApp(async (call, base) => {
    const idx = await call('/');
    assert.equal(idx.status, 200);
    assert.match(idx.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(idx.headers.get('x-content-type-options'), 'nosniff');
    const trav = await fetch(base + '/..%2f..%2fpackage.json');
    assert.notEqual(trav.status, 200);
    const trav2 = await fetch(base + '/%2e%2e/package.json');
    assert.notEqual(trav2.status, 200);
    assert.equal((await call('/api/nope')).status, 404);
    const bad = await fetch(base + '/api/profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{no json' });
    assert.equal(bad.status, 400);
  });
});

test('HTTP: leer una foto sin IA externa activada responde con un mensaje amable', async () => {
  await withApp(async (call) => {
    const p = (await call('/api/profiles', { method: 'POST', body: { name: 'Ana' } })).json;
    const r = await call(`/api/profiles/${p.id}/photo`, { method: 'POST', body: { image: 'data:image/png;base64,AAAA' } });
    assert.equal(r.status, 501);
    assert.match(r.json.error, /adulto/);
  });
});

/* ---- IA externa simulada ---- */

const fakeClient = (handler) => ({ messages: { create: async (req, opts) => handler(req, opts) } });
const textRes = (obj) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });

test('LLM: no envía nada si no hay cliente; usa el SDK con esquema JSON y esfuerzo bajo para diagnosticar', async () => {
  LLM._setClient(null);
  const te = lessonFromPack(getPack('texto-expositivo')).concepts[0];
  const ctx = { level: 'primary', purpose: 'explain', qType: 'open', answer: { text: 'sirve para informar con datos' }, points: te.chunks[0].points, concept: te, source: te.chunks[0].text };
  const h = diagnose(ctx);
  const seen = [];
  LLM._setClient(fakeClient((req) => {
    seen.push(req);
    return textRes({ outcome: 'partial', comprehension: 2, covered_ideas: [], missing_ideas: [], misconception: '', observation: 'Mencionó informar con datos.', interpretation: 'Posible comprensión parcial.', confidence: 0.7 });
  }));
  const r = await LLM.refineDiagnosis(ctx, h);
  assert.equal(r.source, 'llm');
  assert.equal(r.outcome, 'partial');
  assert.equal(seen[0].model, LLM.DEFAULT_MODEL);
  assert.equal(seen[0].output_config.format.type, 'json_schema');
  assert.equal(seen[0].output_config.effort, 'low');
  assert.doesNotMatch(JSON.stringify(seen[0]), /\bAna\b/, 'no se envían datos personales');
  LLM._setClient(null);
});

test('LLM: cualquier fallo o rechazo vuelve al diagnóstico local', async () => {
  const te = lessonFromPack(getPack('texto-expositivo')).concepts[0];
  const ctx = { level: 'primary', purpose: 'explain', qType: 'open', answer: { text: 'sirve para informar' }, points: te.chunks[0].points, concept: te, source: te.chunks[0].text };
  const h = diagnose(ctx);
  for (const handler of [() => { throw new Error('red'); }, () => ({ stop_reason: 'refusal', content: [] }), () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'no es json' }] })]) {
    LLM._setClient(fakeClient(handler));
    assert.deepEqual(await LLM.refineDiagnosis(ctx, h), h);
  }
  LLM._setClient(null);
});

test('LLM: el análisis de material se valida y las expresiones inválidas se descartan', async () => {
  const out = {
    title: 'Mitosis', subject: 'Ciencias',
    concepts: [{
      name: 'Mitosis', summary: 's', prior: ['¿Qué es?'],
      chunks: [{ title: 'Fases', text: 'La mitosis es la división celular.', points: [{ label: 'división celular', statement: 'La mitosis divide la célula.', keywords: [['divis']], hint: 'h', example: 'e', probe: 'p' }] }],
      misconceptions: [{ label: 'confunde con meiosis', confusedWith: 'meiosis', triggers: ['meiosis', '(sin cerrar'], adult: 'x' }],
      applyTasks: [{ prompt: 'Aplica', keywords: [['divis']], hint: 'h', example: 'e' }],
    }],
  };
  LLM._setClient(fakeClient(() => textRes(out)));
  const lesson = await LLM.analyzeMaterialLLM('La mitosis es la división celular. '.repeat(10), { level: 'primary' });
  assert.equal(lesson.source, 'llm');
  assert.deepEqual(lesson.concepts[0].misconceptions[0].triggers, ['meiosis']);
  LLM._setClient(fakeClient(() => textRes({ concepts: [] })));
  assert.equal(await LLM.analyzeMaterialLLM('x '.repeat(50), {}), null);
  LLM._setClient(null);
});

test('LLM: el adulto debe activarlo; por defecto está apagado aunque haya cliente', async () => {
  const svc = makeService();
  let calls = 0;
  LLM._setClient(fakeClient(() => { calls++; return textRes({}); }));
  const kid = svc.createProfile({ name: 'Ana' });
  const text = 'Las abejas viven en colmenas. Cada colmena tiene una reina, obreras y zánganos. Las obreras recogen polen y néctar para fabricar miel. '.repeat(3);
  const prev = await svc.previewMaterial({ profileId: kid.id, text });
  const v = await svc.startStudy(kid.id, prev.lessonId);
  await svc.answer(kid.id, v.id, { text: 'no sé' });
  assert.equal(calls, 0);
  LLM._setClient(null);
});
