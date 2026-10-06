// Demostración narrada del flujo completo (sin navegador):
// MATERIAL → DIAGNÓSTICO → RESPUESTA → ANÁLISIS → AYUDA ADAPTADA → NUEVO INTENTO → APLICACIÓN → PROGRESO → REPASO
import { Store } from '../server/store.js';
import { createService } from '../server/service.js';

const store = new Store(null);
const svc = createService(store);
const line = (s = '') => console.log(s);
const last = (v, n = 2) => v.transcript.filter((t) => t.role === 'tutor').slice(-n).map((t) => t.text).join('\n      ');

const kid = svc.createProfile({ name: 'Ana', level: 'primary', ageBand: '9-12' });
line('═══ 1. MATERIAL ═══');
const prev = await svc.previewMaterial({ profileId: kid.id, sampleId: 'texto-expositivo' });
line(`Tema detectado: ${prev.title} (${prev.subject}) · ${prev.concepts[0].chunks} fragmentos · fuente: ${prev.source}`);
let v = await svc.startStudy(kid.id, prev.lessonId);
const sid = v.id;

async function say(text, extra = {}) {
  line(`\n  🧒 Ana: ${extra.choice ? `(elige ${extra.choice}) ` : ''}${text || ''}`);
  const r = await svc.answer(kid.id, sid, { text, ...extra });
  const d = r.debug;
  if (d) line(`  ⚙️  diagnóstico: ${d.outcome}${d.misconception ? ` · confusión: ${d.misconception.id}` : ''} · cobertura ${d.coverage} · ayuda ${d.help}\n     obs: ${d.observation}\n     int: ${d.interpretation}`);
  line(`  🧑‍🏫 Tutor: ${last(r.view, 3)}`);
  v = r.view;
  return r;
}
async function adv(action, extra = {}) {
  v = (await svc.advance(kid.id, sid, action, extra)).view;
}

line('\n═══ 2. DIAGNÓSTICO INICIAL ═══');
line(`  🧑‍🏫 Tutor: ${v.step.prompt}`);
await say('Creo que sirve para contar una historia.');
line(`  🧑‍🏫 Tutor pregunta: ${v.step.prompt}`);
await say('Nunca lo había oído, la verdad.');

line('\n═══ 3. EXPLORAR Y EXPLICAR ═══');
line(`  📖 Fragmento: «${v.step.title}»`);
await adv('read-done');
line(`  🧑‍🏫 Tutor: ${v.step.prompt}`);
await say('Un texto expositivo sirve para contar una historia.');
line('\n═══ 4. ERROR CONCEPTUAL → ACTIVIDAD DE CONTRASTE ═══');
line(`  Actividad: ${v.step.type} · ${v.step.followUp}`);
await say('porque el A tiene un perro que corre y eso es una historia', { choice: 'B' });
line('\n═══ 5. NUEVO INTENTO ═══');
await say('Ah, entonces B explica cosas sobre los perros y A cuenta lo que pasó.');
await say('Un texto expositivo explica o informa sobre un tema usando datos y ejemplos.');
line('\n═══ 6. SIGUIENTE FRAGMENTO + AYUDA PROGRESIVA ═══');
await adv('read-done');
line(`  🧑‍🏫 Tutor: ${v.step.prompt}`);
await say('no sé');
const h = await svc.help(kid.id, sid, 'hint');
line(`  💡 Pista: ${h.message}`);
v = h.view;
await say('Tiene introducción, desarrollo y conclusión. Usa un lenguaje claro y objetivo.');
await adv('read-done');
await say('Usa títulos, subtítulos e imágenes, y palabras como primero y además para ordenar las ideas.');
line('\n═══ 7. APLICACIÓN ═══');
while (v.step && v.step.purpose === 'apply') {
  line(`  🧑‍🏫 Tarea: ${v.step.prompt}`);
  if (v.step.qType === 'choice') await say('porque da datos reales del sol', { choice: 'b' });
  else if (v.step.qType === 'order') {
    const r = await svc.answer(kid.id, sid, { order: ['intro', 'desarrollo', 'conclusion'] });
    v = r.view; line(`  ⚙️  ${r.debug.outcome}`);
  } else await say('El ajedrez se juega entre dos personas. Cada una tiene 16 piezas. El objetivo es capturar al rey del otro jugador.');
}
if (v.step?.purpose === 'reexplain') {
  line('\n  (Como hubo una confusión, el tutor pide explicarlo de nuevo antes de cerrar)');
  line(`  🧑‍🏫 Tutor: ${v.step.prompt}`);
  await say('Es un texto que explica o informa sobre un tema con datos y ejemplos; se organiza en introducción, desarrollo y conclusión, y no cuenta una historia como el cuento.');
}
line('\n═══ 8. PROGRESO ═══');
if (v.summary) {
  for (const c of v.summary.child.can) line(`  ✅ ${c}`);
  for (const c of v.summary.child.working) line(`  🔧 ${c}`);
  line(`  🗓️  ${v.summary.child.tomorrow}`);
}
const map = svc.knowledgeMap(kid.id);
for (const s of map.subjects) for (const c of s.concepts) line(`  ${c.emoji} ${s.subject} › ${c.name}: ${c.summary}`);

line('\n═══ 9. REPASO (un día después) ═══');
svc.store.db.meta.clockOffsetDays = 1;
const home = svc.home(kid.id);
line(`  Conceptos para repasar hoy: ${home.dueCount}`);
v = await svc.startReview(kid.id);
line(`  🧑‍🏫 Tutor: ${v.step.prompt}`);
const rid = v.id;
const rr = await svc.answer(kid.id, rid, { text: 'Era un texto que explica o informa sobre un tema, con datos.' });
line(`  ⚙️  ${rr.debug.outcome} · cobertura ${rr.debug.coverage}`);
line(`  🧑‍🏫 Tutor: ${last(rr.view, 2)}`);

line('\n═══ 10. VISTA DEL ADULTO ═══');
const rep = svc.adultReport(kid.id);
for (const c of rep.concepts) {
  line(`  ${c.emoji} ${c.name}: ${c.summary}`);
  line(`     Conocimiento ${c.dims.knowledge.word} · Comprensión ${c.dims.comprehension.word} · Aplicación ${c.dims.application.word} · Recuperación ${c.dims.recall.word}`);
  if (c.mainDifficulty) line(`     Principal dificultad: ${c.mainDifficulty}`);
  if (c.practice.length) line(`     Practicar: ${c.practice.join(' | ')}`);
  if (c.helpThatWorked.length) line(`     Ayuda que funcionó: ${c.helpThatWorked.map((h) => h.name).join(', ')}`);
}
line('  Observaciones del perfil:');
for (const o of rep.observations) line(`   · OBSERVACIÓN: ${o.observation}\n     INTERPRETACIÓN: ${o.interpretation}`);
