import test from 'node:test';
import assert from 'node:assert/strict';
import { makeService, lastTutor } from './helpers.js';

async function startUni(svc) {
  const u = svc.createProfile({ name: 'Luis', level: 'university' });
  const prev = await svc.previewMaterial({ profileId: u.id, sampleId: 'valor-p' });
  const v = await svc.startStudy(u.id, prev.lessonId);
  return { u, v, sid: v.id };
}

test('universidad: primero autoevaluación («me suena» ≠ «puedo explicarlo») y contexto antes del contenido', async () => {
  const svc = makeService();
  const { u, v, sid } = await startUni(svc);
  assert.equal(v.step.type, 'selfrate');
  assert.match(v.transcript[0].text, /¿Por qué vale la pena\?/);
  assert.equal(v.step.options.length, 4);
  let r = await svc.advance(u.id, sid, 'selfrate', { value: '3' });
  assert.equal(r.view.step.purpose, 'prior');
});

test('universidad: error de p-valor → análisis del error (U8) → contraste con contraejemplo (U4) → reconstrucción', async () => {
  const svc = makeService();
  const { u, sid } = await startUni(svc);
  await svc.advance(u.id, sid, 'selfrate', { value: '3' });
  await svc.answer(u.id, sid, { text: 'no lo sé bien' });
  await svc.answer(u.id, sid, { text: 'no lo sé' });
  await svc.advance(u.id, sid, 'read-done'); // contexto
  await svc.answer(u.id, sid, { text: 'Sirve para distinguir si una diferencia es azar o un efecto real' });
  await svc.advance(u.id, sid, 'read-done'); // intuición
  await svc.answer(u.id, sid, { text: 'Si una persona nunca falla un penalti y de pronto falla diez seguidos, sería raro si fuera normal' });
  await svc.advance(u.id, sid, 'read-done'); // lenguaje técnico
  let r = await svc.answer(u.id, sid, { text: 'El valor p es la probabilidad de que la hipótesis nula sea verdadera' });
  const t = r.view.transcript.filter((m) => m.role === 'tutor').map((m) => m.text).join('\n');
  assert.match(t, /Qué intentaste/);
  assert.match(t, /Dónde se rompió el razonamiento/);
  assert.match(t, /Cómo debería razonarse/);
  assert.equal(r.view.step.type, 'contrast');
  const contrast = r.view.transcript.find((m) => m.kind === 'contrast');
  assert.equal(contrast.items.length, 3, 'correcto, incorrecto y contraejemplo');
  r = await svc.answer(u.id, sid, { choice: 'A', text: 'La A empieza suponiendo que la moneda fuera justa: es la probabilidad de los datos dado H0, no al revés' });
  assert.equal(r.view.step.purpose, 'retry');
  const rep = svc.adultReport(u.id);
  assert.equal(rep.concepts[0].resolvedConfusions.length, 1);
});

test('universidad: los ejercicios reducen la ayuda (guiado → parcial → independiente) y el cierre sigue U10/U11', async () => {
  const svc = makeService();
  const { u, sid } = await startUni(svc);
  // Se avanza rápido hasta la aplicación con respuestas correctas
  const L = (async () => {
    const ok = {
      prior: 'no lo sé', 
      context: 'Sirve para distinguir si una diferencia es azar o un efecto real',
      intuition: 'Si un jugador gana doce partidas seguidas, sería raro suponiendo que no tiene ventaja',
      technical: 'Es la probabilidad, suponiendo que H0 es cierta, de un resultado al menos tan extremo como el observado; se compara con alfa y si es menor se rechaza',
      how: 'Porque H0 especifica una distribución concreta y permite calcular, mientras que H1 es vaga y tiene muchos valores',
      example: 'Como 0,036 es menor que alfa 0,05 se rechaza H0; si la app no tuviera efecto, un resultado así sería raro y ocurriría el 3,6 % de las veces',
    };
    await svc.advance(u.id, sid, 'selfrate', { value: '1' });
    await svc.answer(u.id, sid, { text: ok.prior });
    await svc.answer(u.id, sid, { text: ok.prior });
    let v;
    for (const k of ['context', 'intuition', 'technical', 'how', 'example']) {
      await svc.advance(u.id, sid, 'read-done');
      v = (await svc.answer(u.id, sid, { text: ok[k] })).view;
    }
    return v;
  })();
  let v = await L;
  const scaff = [];
  while (v.step.purpose === 'apply') {
    scaff.push(v.step.scaffold);
    const body = { text: 'z = 1,2; el valor p será mayor porque 72 está más cerca de 70, es menos raro' };
    if (v.step.scaffold === 'partial') body.text = 'z = 2,4 y se rechaza H0: si no hubiera efecto sería raro un resultado así';
    if (v.step.scaffold === 'independent') body.text = 'Hay evidencia estadísticamente significativa pero el efecto es pequeño, casi irrelevante en la práctica; pediría el tamaño del efecto y un intervalo de confianza';
    v = (await svc.answer(u.id, sid, body)).view;
  }
  assert.deepEqual(scaff, ['guided', 'partial', 'independent']);
  assert.equal(v.step.type, 'wrap');
  const s = v.summary.sections;
  assert.ok(s.memorize.some((m) => /Definición formal/.test(m)), 'qué debo memorizar');
  assert.ok('canExplain' in s && 'canApply' in s && 'stillConfuse' in s && 'review' in s && s.nextAction);
  assert.ok(['understood', 'partial'].includes(v.summary.concepts[0].state));
});

test('modo examen: diagnóstico primero, luego práctica por niveles, sin dar la respuesta de inmediato', async () => {
  const svc = makeService();
  const kid = svc.createProfile({ name: 'Ana' });
  const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const plan = await svc.createExam(kid.id, { subject: 'Ciencias', topics: 'Rotación y traslación\nFracciones', date, instructions: 'entra todo', questionTypes: ['Opción múltiple'] });
  assert.equal(plan.topics.length, 2);
  assert.ok(plan.topics.every((t) => !t.limited));
  assert.equal(plan.schedule[0].kind, 'diagnóstico');
  let v = await svc.startExamSession(kid.id, plan.id, 'diagnostic');
  assert.match(lastTutor(v), /diagnóstico/);
  assert.equal(v.step.examLevel, 'recordar');
  // Tema débil: se responde mal
  let r = await svc.answer(kid.id, v.id, { text: 'La Tierra da vueltas alrededor del Sol y por eso hay día y noche' });
  assert.equal(r.view.step.topic, 'Fracciones');
  r = await svc.answer(kid.id, v.id, { text: 'Una fracción es una parte de un entero dividido en partes iguales; arriba el numerador y abajo el denominador cuenta las partes' });
  assert.equal(r.view.step.type, 'wrap');
  const p2 = svc.getExam(kid.id, plan.id);
  const rot = p2.topics.find((t) => t.name.startsWith('Rotación'));
  const fr = p2.topics.find((t) => t.name === 'Fracciones');
  assert.ok(fr.readiness > rot.readiness, 'se identifica la debilidad (rotación/traslación confundidas)');
  assert.ok(p2.diagnosticDone);
  // Práctica: empieza por el tema más débil
  v = await svc.startExamSession(kid.id, plan.id, 'practice');
  assert.match(v.step.topic, /Rotación/);
  const first = v.step.prompt;
  r = await svc.answer(kid.id, v.id, { text: 'no sé' });
  assert.equal(r.view.step.prompt, first, 'primero una segunda oportunidad con la misma pregunta');
  assert.doesNotMatch(lastTutor(r.view), /La rotación es/, 'no revela la respuesta en el primer fallo');
  const h = await svc.help(kid.id, v.id, 'hint');
  assert.equal(h.ok, true);
  r = await svc.answer(kid.id, v.id, { text: 'no sé' });
  assert.match(lastTutor(r.view, 2), /Veamos cómo se razona/, 'tras el segundo fallo se muestra el razonamiento');
});

test('modo examen: temas sin material no se califican (se avisa con honestidad)', async () => {
  const svc = makeService();
  const kid = svc.createProfile({ name: 'Ana' });
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const plan = await svc.createExam(kid.id, { subject: 'Historia', topics: 'La independencia', date });
  assert.equal(plan.topics[0].limited, true);
  const v = await svc.startExamSession(kid.id, plan.id, 'diagnostic');
  const r = await svc.answer(kid.id, v.id, { text: 'Fue cuando el país dejó de depender de España' });
  assert.match(lastTutor(r.view, 2), /no tengo material/i);
});

test('modo examen con material propio: los temas se enlazan a conceptos del material', async () => {
  const svc = makeService();
  const kid = svc.createProfile({ name: 'Ana' });
  const date = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const material = 'Ciudad Blanca\n\nLa Ciudad Blanca es una leyenda de Honduras. Se dice que estaba escondida en la selva de La Mosquitia y que tenía grandes riquezas. En 2012 un equipo usó LIDAR desde un avión para mapear el terreno bajo los árboles y se vieron plazas y montículos.';
  const plan = await svc.createExam(kid.id, { subject: 'Sociales', topics: 'Ciudad Blanca', material, date });
  assert.equal(plan.topics[0].limited, false);
});

test('examen: valida fecha y datos', async () => {
  const svc = makeService();
  const kid = svc.createProfile({ name: 'Ana' });
  await assert.rejects(() => svc.createExam(kid.id, { subject: 'X', topics: 'a', date: '2001-01-01' }), /pasó/);
  await assert.rejects(() => svc.createExam(kid.id, { subject: '', topics: 'a', date: '2999-01-01' }), /materia/);
  await assert.rejects(() => svc.createExam(kid.id, { subject: 'X', topics: '', date: '2999-01-01' }), /tema/);
});
