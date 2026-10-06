// Modo examen: parte del DIAGNÓSTICO, se concentra en las debilidades y sube de nivel
//   recordar → comprender → identificar → aplicar → transferir → tipo examen (→ sin ayuda en universidad).
// No genera "50 preguntas": cada ronda elige pocos ítems, de los temas más débiles, y no da la respuesta de inmediato.

import { DAY } from './review.js';
import { norm, wordCount, hash } from './text.js';
import { getConcept, recordDim, score, conceptReport, observe, adaptation } from './profile.js';
import {
  makeStep, setCur, ensureResult, recordEvidence, runDiagnosis, creditHelp, tutor, say, log, childAnswerText, shuffleDet, pointById,
  labelsOf, allPoints, reviewPoints, view, compactDiag, publicStep, helpOptions,
} from './pedagogy.js';

export const LEVELS = {
  primary: ['recordar', 'comprender', 'identificar', 'aplicar', 'transferir', 'tipo examen'],
  university: ['recordar', 'comprender', 'comparar', 'aplicar', 'casos nuevos', 'tipo examen', 'sin ayuda'],
};
const NO_HELP_LEVELS = new Set(['tipo examen', 'sin ayuda']);
const LEVEL_DESC = {
  recordar: 'Recordar lo esencial',
  comprender: 'Comprender con tus palabras',
  identificar: 'Identificar y distinguir',
  comparar: 'Comparar conceptos parecidos',
  aplicar: 'Aplicar',
  transferir: 'Transferir a algo nuevo',
  'casos nuevos': 'Casos nuevos',
  'tipo examen': 'Preguntas tipo examen',
  'sin ayuda': 'Recuperación sin ayuda',
};
export const levelDesc = (l) => LEVEL_DESC[l] || l;

let seq = 0;
export const planId = () => `ex${Date.now().toString(36)}${(++seq).toString(36)}`;

/* ------------------------------ plan ------------------------------ */

export function buildExamPlan({ id, learner, subject, topics, examDate, instructions = '', questionTypes = [], now }) {
  const levels = LEVELS[learner.level] || LEVELS.primary;
  const plan = {
    id,
    profileId: learner.id,
    subject,
    examDate,
    createdAt: now,
    instructions: String(instructions).slice(0, 600),
    questionTypes,
    levels,
    topics: topics.map((t) => ({
      name: t.name,
      lessonId: t.lessonId || null,
      conceptId: t.conceptId || null,
      limited: !t.lessonId,
      levelIdx: 0,
      passes: 0,
      fails: 0,
      diagnosed: false,
      readiness: null,
      needsStudy: false,
      used: [],
      reached: 0,
    })),
    history: [],
    schedule: [],
    sessions: [],
  };
  plan.schedule = makeSchedule(plan, now);
  return plan;
}

export function daysLeft(plan, now) {
  return Math.max(0, Math.ceil((plan.examDate - now) / DAY));
}

/** Calendario sencillo: primero diagnóstico, más práctica para lo débil, simulacro y repaso final. */
export function makeSchedule(plan, now) {
  const d = daysLeft(plan, now);
  const days = Math.max(1, Math.min(d, 30));
  const out = [];
  const unit = (i) => now + i * DAY;
  const weak = [...plan.topics].map((t) => ({ t, w: t.diagnosed ? 3 - (t.readiness ?? 1.5) + 0.3 : 2 })).sort((a, b) => b.w - a.w);
  const pool = [];
  for (const { t, w } of weak) for (let k = 0; k < Math.max(1, Math.round(w)); k++) pool.push(t.name);
  let pi = 0;
  for (let i = 0; i < days; i++) {
    let kind = 'practicar';
    let focus = pool.length ? pool[pi++ % pool.length] : 'todos los temas';
    if (i === 0 && !plan.topics.every((t) => t.diagnosed)) {
      kind = 'diagnóstico';
      focus = 'Todos los temas (diagnóstico inicial)';
    } else if (days >= 3 && i === days - 2) {
      kind = 'simulacro';
      focus = 'Todos los temas: preguntas tipo examen';
    } else if (i === days - 1 && days >= 2) {
      kind = 'repaso final';
      focus = 'Recuperación sin ayuda de lo más débil';
    } else if (plan.topics.find((t) => t.name === focus)?.needsStudy) kind = 'estudiar';
    out.push({ day: i, date: unit(i), kind, focus });
  }
  return out.slice(0, 14);
}

export function readinessOf(topic) {
  return topic.readiness === null ? null : Math.round((topic.readiness / 3) * 100);
}

/* ------------------------------ ítems ------------------------------ */

function lessonConcept(env, topic) {
  if (!topic.lessonId) return null;
  const lesson = env.getLesson(topic.lessonId);
  if (!lesson) return null;
  const concept = lesson.concepts.find((c) => c.id === topic.conceptId) || lesson.concepts[0];
  return { lesson, concept };
}

function genericTransfer(concept, learner) {
  const terms = (concept.terms || []).slice(0, 4);
  return {
    id: `gen-transfer-${concept.id}`,
    kind: 'open',
    prompt: `Inventa una situación nueva (que no esté en tu material) donde se use «${concept.name}» y explica cómo se aplicaría.`,
    keywords: terms.length ? [terms.map((t) => norm(t).slice(0, 5))] : [],
    minWords: learner.level === 'university' ? 18 : 12,
    novelty: true,
  };
}

/** Crea un ítem de práctica del nivel pedido. */
export function makeItem(plan, topic, env, learner) {
  const lc = lessonConcept(env, topic);
  const levelName = plan.levels[Math.min(topic.levelIdx, plan.levels.length - 1)];
  if (!lc) {
    return {
      topic: topic.name, level: levelName, limited: true, lessonId: null, conceptId: null,
      prompt: `Explica con tus palabras qué sabes sobre «${topic.name}»: qué es, cómo funciona y un ejemplo.`,
      qType: 'open', diagPurpose: 'explain', pointIds: [], noHelp: true,
    };
  }
  const { lesson, concept } = lc;
  const tasks = (concept.applyTasks || []).slice().sort((a, b) => (a.level || 1) - (b.level || 1));
  const unused = (arr) => arr.filter((t) => !topic.used.includes(t.id));
  const base = { topic: topic.name, level: levelName, lessonId: lesson.id, conceptId: concept.id };
  const fromTask = (task) => {
    topic.used.push(task.id);
    const qType = task.kind === 'choice' ? 'choice' : task.kind === 'order' ? 'order' : 'open';
    return {
      ...base, taskId: task.id, prompt: task.prompt, qType, diagPurpose: 'apply', options: task.options?.map((o) => ({ id: o.id, text: o.text })),
      items: task.items ? shuffleDet(task.items, plan.id + task.id) : null, askWhy: !!task.whyPrompt, whyPrompt: task.whyPrompt || null, pointIds: [],
      noHelp: NO_HELP_LEVELS.has(levelName),
    };
  };
  const pts = reviewPoints(concept);
  const comprehend = () => {
    const p = pts[(topic.passes + topic.fails) % pts.length];
    return { ...base, prompt: p.probe || `Explica con tus palabras: ${p.label}.`, qType: 'open', diagPurpose: 'explain', pointIds: [p.id], noHelp: false };
  };
  switch (levelName) {
    case 'recordar':
      return { ...base, prompt: `Escribe todo lo que recuerdes sobre «${concept.name}».`, qType: 'open', diagPurpose: 'explain', pointIds: pts.map((p) => p.id), noHelp: false };
    case 'comprender':
      return comprehend();
    case 'identificar':
    case 'comparar': {
      const m = (concept.misconceptions || []).find((x) => x.contrast && !topic.used.includes('c-' + x.id));
      if (m) {
        topic.used.push('c-' + m.id);
        const c = m.contrast;
        return {
          ...base, prompt: `${c.intro}\n\n${c.items.map((i) => `${i.id}) ${i.text}`).join('\n')}\n\n${c.choiceQuestion || c.question}`, qType: 'choice', diagPurpose: 'contrast', contrastMisc: m.id,
          options: c.items.map((i) => ({ id: i.id, text: i.id })), askWhy: true, whyPrompt: '¿Cómo lo sabes?', pointIds: [], noHelp: false,
        };
      }
      const t = unused(tasks.filter((x) => x.kind === 'choice'))[0];
      return t ? fromTask(t) : comprehend();
    }
    case 'aplicar': {
      const t = unused(tasks.filter((x) => (x.level || 1) <= 2))[0] || unused(tasks)[0];
      return t ? fromTask(t) : comprehend();
    }
    case 'transferir':
    case 'casos nuevos': {
      const t = unused(tasks.filter((x) => (x.level || 1) >= 3))[0];
      if (t) return fromTask(t);
      const g = genericTransfer(concept, learner);
      topic.used.push(g.id + topic.used.length);
      return { ...base, prompt: g.prompt, qType: 'open', diagPurpose: 'apply', genericTask: g, pointIds: [], noHelp: false };
    }
    default: {
      const pref = plan.questionTypes.map(norm).join(' ');
      let pool = unused(tasks);
      if (/(opcion|multiple|seleccion)/.test(pref)) pool = [...pool.filter((t) => t.kind === 'choice'), ...pool.filter((t) => t.kind !== 'choice')];
      else if (/(desarrollo|abiert|redact|explica)/.test(pref)) pool = [...pool.filter((t) => t.kind === 'open'), ...pool.filter((t) => t.kind !== 'open')];
      if (!pool.length) {
        topic.used = topic.used.filter((id) => !String(id).startsWith('gen') && !tasks.some((t) => t.id === id));
        pool = tasks;
      }
      const t = pool[0];
      return t ? fromTask(t) : comprehend();
    }
  }
}

/* ------------------------------ sesión de práctica ------------------------------ */

export function createExamSession({ plan, learner, now, mode }) {
  return {
    id: `x${Date.now().toString(36)}${(++seq).toString(36)}`,
    profileId: learner.id,
    lessonId: null,
    mode: 'exam',
    level: learner.level,
    createdAt: now,
    updatedAt: now,
    stepSeq: 1,
    flow: { stage: 'exam', ci: 0, ki: 0, pi: 0, chain: 0, used: [], contrastDone: [] },
    cur: null,
    transcript: [],
    events: [],
    results: {},
    summary: null,
    exam: { planId: plan.id, mode, queue: [], idx: 0, outcomes: [] },
  };
}

export function selectTopics(plan, mode, learner, now) {
  if (mode === 'diagnostic') {
    const un = plan.topics.filter((t) => !t.diagnosed);
    return un.length ? un : plan.topics;
  }
  const d = daysLeft(plan, now);
  const n = Math.min(plan.topics.length * 2, learner.level === 'university' ? 6 : 4, d <= 2 ? 6 : 8);
  const order = [...plan.topics].sort((a, b) => (a.readiness ?? 1.5) - (b.readiness ?? 1.5) || a.levelIdx - b.levelIdx);
  const out = [];
  for (let i = 0; out.length < n && i < n * 2; i++) out.push(order[i % order.length]);
  return out.slice(0, n);
}

export function startExamSession(session, plan, learner, env) {
  const topics = selectTopics(plan, session.exam.mode, learner, env.now);
  session.exam.queue = topics.map((t) => t.name);
  const diag = session.exam.mode === 'diagnostic';
  tutor(
    session,
    diag
      ? 'Empezamos por un diagnóstico: unas pocas preguntas para ver cómo estás en cada tema. No te voy a dar las respuestas; me sirven para saber en qué concentrarnos.'
      : 'Vamos a practicar los temas que más lo necesitan, de menos a más difícil. Intenta responder sin ayuda; si te trabas, pide solo la pista más pequeña.',
    env.now,
  );
  askExam(session, plan, learner, env);
  return view(session, learner, env);
}

function askExam(session, plan, learner, env) {
  const e = session.exam;
  const topic = plan.topics.find((t) => t.name === e.queue[e.idx]);
  const diagMode = e.mode === 'diagnostic';
  if (diagMode) topic.levelIdx = Math.min(topic.levelIdx, 1) === 0 ? 0 : topic.levelIdx; // el diagnóstico parte de «recordar»
  const item = makeItem(plan, topic, env, learner);
  e.cur = { topic: topic.name, item };
  const step = makeStep(session, {
    type: 'ask', purpose: 'exam', examLevel: item.level, examLevelDesc: levelDesc(item.level), topic: topic.name,
    qType: item.qType, prompt: item.prompt, options: item.options, items: item.items, askWhy: item.askWhy, whyPrompt: item.whyPrompt,
    placeholder: 'Escribe tu respuesta…', limited: !!item.limited,
    progress: { stage: 'exam', conceptIndex: e.idx + 1, conceptTotal: e.queue.length, concept: topic.name },
  }, {
    conceptId: item.conceptId, purpose: item.diagPurpose, qType: item.qType, pointIds: item.pointIds || [], taskId: item.taskId, contrastMisc: item.contrastMisc,
    noHelp: item.noHelp, allowReread: false, allowAnother: false, maxLevel: item.noHelp ? 0 : 2, exam: true, genericTask: item.genericTask,
  });
  step._lessonId = item.lessonId;
  setCur(session, learner, step, env);
}

function passed(diag) {
  return diag.outcome === 'correct' || (diag.overallWithHelp ?? 0) >= 2.2;
}

export async function submitExam(session, plan, learner, payload, env) {
  const step = session.cur;
  const now = env.now;
  if (!step?._ask || step.type !== 'ask') return { ok: false, error: 'No hay una pregunta activa.' };
  const a = step._ask;
  const e = session.exam;
  const topic = plan.topics.find((t) => t.name === e.cur.topic);
  const item = e.cur.item;
  if ((step.qType === 'open') && !(payload.text || '').trim()) return { ok: false, error: 'Escribe tu respuesta, aunque sea parcial.' };
  if (step.qType === 'choice' && !payload.choice) return { ok: false, error: 'Elige una opción.' };

  say(session, 'child', 'text', childAnswerText(step, payload), {}, now);
  a.attempts++;
  let diag;
  let rec = null;
  let concept = null;
  let lesson = null;
  if (item.limited || !item.lessonId) {
    // Sin contenido que comparar: se guarda la explicación y se avisa con honestidad.
    diag = { outcome: 'partial', coverage: 0.5, dims: { comprehension: null }, signals: ['unchecked'], misconception: null, coveredPointIds: [], missingPointIds: [], gainedPointIds: [], overallWithHelp: 0, helpLevel: 0, observation: 'Explicación libre sin material con el que compararla.', interpretation: 'No se puede comprobar sin material o IA conectada.', confidence: 0.1, recommendedHelp: 'none', words: wordCount(payload.text || '') };
    tutor(session, 'Gracias. No tengo material de este tema para comprobar tu explicación; para que pueda ayudarte de verdad, añade tu material (o conecta la IA). Por ahora la guardo como tu punto de partida.', now);
    topic.diagnosed = true;
    topic.readiness = topic.readiness ?? 1.5;
    return advanceExam(session, plan, learner, env, { debug: { outcome: 'unchecked' } });
  }
  lesson = env.getLesson(item.lessonId);
  concept = lesson.concepts.find((c) => c.id === item.conceptId) || lesson.concepts[0];
  const r = await runDiagnosis(session, learner, lesson, concept, step, payload, env);
  diag = r.diag;
  rec = r.rec;
  const prev = a.lastDiag;
  a.lastDiag = diag;
  const improved = !!prev && (diag.gainedPointIds.length > 0 || diag.overallWithHelp > prev.overallWithHelp);
  creditHelp(rec, learner, session, step, diag, concept, now, improved);
  recordEvidence(session, learner, lesson, concept, rec, step, { ...diag }, null, now);
  log(session, 'exam-answer', { topic: topic.name, level: item.level, attempt: a.attempts, diag: compactDiag(diag) }, now);
  const debug = compactDiag(diag);
  const level = item.level;
  const uni = learner.level === 'university';
  const ok = passed(diag);

  if (e.mode === 'diagnostic' && !topic.diagnosed) {
    topic.diagnosed = true;
    topic.readiness = Math.max(0, Math.min(3, diag.coverage * 3.2));
    if (diag.misconception) topic.readiness = Math.min(topic.readiness, 1.2); // una confusión activa pesa más que las ideas sueltas
    topic.levelIdx = diag.misconception ? 1 : diag.coverage >= 0.7 ? 2 : diag.coverage >= 0.35 ? 1 : 0;
    topic.needsStudy = diag.coverage < 0.2 && !!diag.signals.includes('idk');
    topic.history = topic.history || [];
    plan.history.push({ at: now, topic: topic.name, level, outcome: diag.outcome, kind: 'diagnostic' });
    tutor(session, diag.misconception
      ? 'Anotado. Una idea que conviene revisar aparece en tu respuesta; la trabajaremos en la práctica.'
      : diag.coverage >= 0.5 ? 'Anotado: ya tienes una base en este tema.' : 'Anotado. Aquí hay trabajo por hacer, y justo para eso sirve el plan.', now);
    return advanceExam(session, plan, learner, env, { debug });
  }

  if (ok) {
    topic.passes++;
    topic.reached = Math.max(topic.reached, topic.levelIdx);
    topic.readiness = Math.min(3, (topic.readiness ?? 1.5) * 0.6 + (diag.overallWithHelp || 2.4) * 0.4 + 0.1);
    const was = topic.levelIdx;
    if (topic.levelIdx < plan.levels.length - 1) topic.levelIdx++;
    plan.history.push({ at: now, topic: topic.name, level, outcome: 'correct' });
    tutor(session, ok && diag.signals.includes('reason_given') ? 'Esta vez explicaste la razón, no solo la respuesta.' : uni ? `Correcto. Subimos de nivel en «${topic.name}».` : `Muy buen trabajo en «${topic.name}»: pasas al siguiente nivel (${levelDesc(plan.levels[topic.levelIdx])}).`, now, { fb: 'praise' });
    return advanceExam(session, plan, learner, env, { debug });
  }

  // Aún no: se identifica dónde se rompió el razonamiento y se da una segunda oportunidad antes de mostrar nada.
  const lines = [];
  if (diag.misconception) {
    const m = concept.misconceptions.find((x) => x.id === diag.misconception.id);
    lines.push(uni && m?.errorAnalysis ? `Confusión detectada: ${m.label}.\n\n${m.errorAnalysis.brokeAt}\n\n${m.errorAnalysis.shouldReason}` : m?.child || `Parece que se mezcla con ${m?.confusedWith || 'otro concepto'}.`);
  } else if (diag.coveredPointIds.length) {
    lines.push(`Tienes una parte: ${labelsOf(concept, diag.coveredPointIds)[0]}.`);
  }
  const miss = pointById(concept, diag.missingPointIds[0]);
  if (miss && !diag.misconception) lines.push(miss.probe || 'Falta una idea importante; revisa tu respuesta.');
  if (!lines.length) lines.push('Todavía no encuentro lo que buscamos; piensa en lo que estudiaste de este tema.');

  if (a.attempts < 2) {
    tutor(session, lines.join('\n'), now, { fb: 'note' });
    step.help = helpOptions(step, learner);
    return { ok: true, debug, view: view(session, learner, env) };
  }
  // Segundo fallo: se muestra el razonamiento y se registra la debilidad.
  topic.fails++;
  topic.readiness = Math.max(0, (topic.readiness ?? 1.5) * 0.7 + (diag.overallWithHelp || 0) * 0.3);
  if (topic.fails >= 2) topic.needsStudy = true;
  plan.history.push({ at: now, topic: topic.name, level, outcome: diag.outcome });
  const reveal = [];
  const ptsMissing = diag.missingPointIds.map((id) => pointById(concept, id)).filter(Boolean).slice(0, 2);
  for (const p of ptsMissing) reveal.push(`• ${p.statement}`);
  const task = a.taskId ? (concept.applyTasks || []).find((t) => t.id === a.taskId) : null;
  const ok2 = task?.options?.find((o) => o.id === task.correct);
  if (ok2) reveal.push(`• La opción más adecuada era: «${ok2.text}».`);
  if (task?.help?.example) reveal.push(`• ${task.help.example}`);
  if (a.contrastMisc) reveal.push(`• ${concept.misconceptions.find((m) => m.id === a.contrastMisc)?.contrast?.reveal || ''}`);
  tutor(session, `Veamos cómo se razona:\n${reveal.join('\n') || '• Revisa este tema en tu material.'}\n\nLo dejo anotado para volver a practicarlo con una pregunta distinta.`, now, { fb: 'teach' });
  return advanceExam(session, plan, learner, env, { debug });
}

function advanceExam(session, plan, learner, env, extra) {
  const e = session.exam;
  e.outcomes.push({ topic: e.cur.topic, level: e.cur.item.level });
  e.idx++;
  if (e.idx < e.queue.length) {
    askExam(session, plan, learner, env);
    return { ok: true, ...extra, view: view(session, learner, env) };
  }
  return { ok: true, ...extra, view: wrapExam(session, plan, learner, env) };
}

function wrapExam(session, plan, learner, env) {
  const now = env.now;
  session.flow.stage = 'done';
  const topics = plan.topics.map((t) => ({
    name: t.name,
    readiness: readinessOf(t),
    level: plan.levels[Math.min(t.levelIdx, plan.levels.length - 1)],
    levelDesc: levelDesc(plan.levels[Math.min(t.levelIdx, plan.levels.length - 1)]),
    diagnosed: t.diagnosed,
    needsStudy: t.needsStudy,
    limited: t.limited,
  }));
  plan.schedule = makeSchedule(plan, now);
  const weakest = [...topics].filter((t) => t.diagnosed).sort((a, b) => (a.readiness ?? 0) - (b.readiness ?? 0))[0];
  session.summary = {
    exam: true,
    title: `Preparación: ${plan.subject}`,
    mode: session.exam.mode,
    topics,
    daysLeft: daysLeft(plan, now),
    next: weakest
      ? weakest.needsStudy
        ? `Estudiar primero «${weakest.name}» (todavía no hay base suficiente) y luego practicar.`
        : `Seguir con «${weakest.name}», nivel «${weakest.levelDesc}».`
      : 'Empezar con el diagnóstico.',
    schedule: plan.schedule.slice(0, 7),
  };
  const step = makeStep(session, { type: 'wrap', summary: session.summary }, { noHelp: true, purpose: 'wrap' });
  setCur(session, learner, step, env);
  tutor(session, session.exam.mode === 'diagnostic' ? 'Diagnóstico terminado: ya sé dónde concentrar tu preparación.' : 'Terminamos esta ronda de práctica.', now);
  learner.stats.sessions++;
  session.updatedAt = now;
  return view(session, learner, env);
}

export function planView(plan, now) {
  return {
    id: plan.id,
    subject: plan.subject,
    examDate: plan.examDate,
    daysLeft: daysLeft(plan, now),
    instructions: plan.instructions,
    questionTypes: plan.questionTypes,
    levels: plan.levels.map((l) => ({ id: l, desc: levelDesc(l) })),
    topics: plan.topics.map((t) => ({
      name: t.name,
      diagnosed: t.diagnosed,
      readiness: readinessOf(t),
      level: plan.levels[Math.min(t.levelIdx, plan.levels.length - 1)],
      levelDesc: levelDesc(plan.levels[Math.min(t.levelIdx, plan.levels.length - 1)]),
      levelIdx: t.levelIdx,
      needsStudy: t.needsStudy,
      limited: t.limited,
      lessonId: t.lessonId,
    })),
    schedule: plan.schedule,
    diagnosticDone: plan.topics.every((t) => t.diagnosed),
  };
}
