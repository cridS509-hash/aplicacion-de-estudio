// Motor pedagógico: decide QUÉ preguntar, CUÁNDO explicar, CUÁNDO dar una pista, cuándo cambiar de
// actividad y cuándo considerar un concepto comprendido. Sigue el ciclo
//   DESCUBRIR → EXPLORAR → EXPLICAR → DIAGNOSTICAR → ENSEÑAR → INTENTAR → APLICAR → EXPLICAR → RECORDAR.
// Todo el estado vive en objetos JSON (session, learner) → el motor es determinista y testeable.

import { diagnose, detectMisconception, snippet } from './diagnosis.js';
import { capitalize, hash, norm, sentences, wordCount } from './text.js';
import { hardWords } from './material.js';
import {
  getConcept, recordDim, recordMisconception, recordHelp, observe, noteChunkResult, adaptation, autonomyPrompt,
  conceptState, conceptReport, score, addInterest, INTEREST_OPTIONS, helpName,
} from './profile.js';
import { scheduleAfterStudy, applyReview } from './review.js';

const MAX_CHAIN = 3; // intentos antes de enseñar la parte que falta

let counter = 0;
const nid = () => `s${Date.now().toString(36)}${(++counter).toString(36)}`;

/* ------------------------------ utilidades ------------------------------ */

const isUni = (session) => session.level === 'university';
const pick = (arr, seed) => arr[hash(String(seed)) % arr.length];

function say(session, role, kind, text, extra = {}, now) {
  session.transcript.push({ role, kind, text, at: now, ...extra });
}
const tutor = (s, text, now, extra) => say(s, 'tutor', 'text', text, extra, now);

function log(session, type, data, now) {
  session.events.push({ at: now, type, ...data });
}

function lessonOf(env, session, id) {
  return env.getLesson ? env.getLesson(id || session.lessonId) : env.lesson;
}

function curConcept(session, lesson) {
  return lesson.concepts[session.flow.ci];
}
function curChunk(session, lesson) {
  return curConcept(session, lesson).chunks[session.flow.ki];
}

function allPoints(concept) {
  return concept.chunks.flatMap((c) => c.points);
}

function analogyFor(concept, learner) {
  const a = concept.analogies || {};
  const hit = (learner.interests || []).find((i) => a[i]);
  return hit ? a[hit] : a.default || null;
}

function pointById(concept, id) {
  return allPoints(concept).find((p) => p.id === id);
}

function labelsOf(concept, ids) {
  return ids.map((id) => pointById(concept, id)?.label).filter(Boolean);
}

function ensureResult(session, concept) {
  return (session.results[concept.id] ||= {
    conceptId: concept.id,
    name: concept.name,
    asks: 0,
    helpMax: 0,
    fullHelp: false,
    misconceptions: [],
    resolved: [],
    applyScores: [],
    compScores: [],
    outcomes: [],
    priorLevel: null,
    priorMisc: null,
    needsReinforcement: false,
  });
}

export function publicStep(step) {
  if (!step) return null;
  const out = {};
  for (const [k, v] of Object.entries(step)) if (!k.startsWith('_')) out[k] = v;
  return out;
}

/* ------------------------------ ayudas progresivas ------------------------------ */

const HELP_META = {
  hint: { level: 1, icon: '💡', label: 'Dame una pista' },
  example: { level: 2, icon: '🔎', label: 'Muéstrame un ejemplo' },
  steps: { level: 3, icon: '🧩', label: 'Ayúdame paso a paso' },
  full: { level: 4, icon: '🧠', label: 'Explícamelo completo' },
};

function helpOptions(step, learner) {
  const a = step._ask;
  if (!a || a.noHelp) return [];
  const opts = [];
  const next = Object.entries(HELP_META).find(([, m]) => m.level === a.helpMax + 1);
  const maxLevel = a.maxLevel ?? 4;
  if (next && next[1].level <= maxLevel) {
    const suggested = adaptation(learner).suggestedHelp;
    opts.push({ kind: next[0], icon: next[1].icon, label: next[1].label, suggested: suggested === next[0] });
  }
  if (a.allowReread && step.type !== 'read') opts.push({ kind: 'reread', icon: '📖', label: 'Volver a estudiar' });
  if (a.allowAnother && (a.helpMax >= 1 || a.attempts >= 1)) opts.push({ kind: 'another', icon: '🙋', label: 'Explícamelo de otra manera' });
  return opts;
}

function genericSteps(point) {
  return [
    `1. Busca en el fragmento la frase que habla de «${point.label}».`,
    '2. Léela despacio y subraya la palabra más importante.',
    `3. Ahora dilo con tus palabras empezando así: «${capitalize(point.label.split(' ').slice(0, 3).join(' '))}…»`,
  ];
}

function helpText(session, learner, lesson, step, kind) {
  const a = step._ask;
  const concept = a.conceptId ? lesson.concepts.find((c) => c.id === a.conceptId) : curConcept(session, lesson);
  const uni = isUni(session);
  const prefix = [];
  if (kind !== 'full') {
    if (learner.autonomy === 1) prefix.push('¿Qué podrías intentar tú primero? Aquí tienes un empujón:');
  }
  // Tarea de aplicación / contraste
  if (a.taskId) {
    const task = (concept.applyTasks || []).find((t) => t.id === a.taskId);
    const h = task?.help || {};
    if (kind === 'hint') return { text: [...prefix, h.hint || 'Piensa en el concepto principal que acabas de estudiar y en qué parte de él te sirve aquí.'].join(' ') };
    if (kind === 'example') return { text: h.example || analogyFor(concept, learner) || 'Piensa en un caso parecido que ya conozcas y compáralo con este.' };
    if (kind === 'steps')
      return { text: (h.steps || ['1. ¿Qué te pide exactamente el problema?', '2. ¿Qué idea de lo que estudiaste se relaciona?', '3. Pruébala en este caso y comprueba si tiene sentido.']).join('\n') };
    const ok = task?.options?.find((o) => o.id === task.correct);
    return { text: [ok ? `La opción más adecuada es: «${ok.text}».` : '', task?.explain || h.example || ''].filter(Boolean).join(' ') || 'Revisa el concepto en el fragmento y vuelve a intentarlo.' };
  }
  if (a.contrastMisc) {
    const m = concept.misconceptions.find((x) => x.id === a.contrastMisc);
    const f = m?.contrast?.features || [];
    if (kind === 'hint') return { text: 'Fíjate en qué intenta lograr cada uno de los dos casos, no solo en cómo se ven.' };
    if (kind === 'example') return { text: f[0] || 'Piensa en un ejemplo claro de cada concepto y compáralos.' };
    if (kind === 'steps') return { text: ['1. Mira el primer caso: ¿qué hace o qué dice?', '2. Mira el segundo caso: ¿qué hace o qué dice?', '3. ¿En qué se diferencian? Elige el que cumple el concepto.'].join('\n') };
    return { text: m?.contrast?.reveal || f.join(' ') };
  }
  const pts = a.pointIds?.length ? a.pointIds.map((id) => pointById(concept, id)).filter(Boolean) : [];
  const missing = (a.lastDiag?.missingPointIds || []).map((id) => pointById(concept, id)).filter(Boolean);
  const target = missing[0] || pts[0] || allPoints(concept)[0];
  if (!target) return { text: 'Vuelve a leer el fragmento con calma y busca la idea más importante.' };
  const chunk = concept.chunks.find((c) => c.id === a.chunkId);
  if (kind === 'hint') return { text: [...prefix, target.hint].join(' ') };
  if (kind === 'example') {
    const ex = target.example || analogyFor(concept, learner);
    return { text: ex || 'Piensa en un ejemplo de tu vida diaria donde ocurra esto.', visual: chunk?.visual || null, usedVisual: !!chunk?.visual };
  }
  if (kind === 'steps') return { text: (target.steps || genericSteps(target)).join('\n') };
  const an = analogyFor(concept, learner);
  return { text: `${target.statement}${an ? `\n\n${an}` : ''}` , visual: chunk?.visual || null };
}

export async function requestHelp(session, learner, kind, env) {
  const lesson = lessonOf(env, session, session.cur?._lessonId);
  const step = session.cur;
  const now = env.now;
  if (!step?._ask || step.type === 'read' || step.type === 'wrap') return { ok: false, message: 'Ahora no hace falta ayuda.' };
  const a = step._ask;
  if (a.noHelp) return { ok: false, message: 'En esta actividad no hay ayuda: inténtalo con lo que sabes.' };

  if (kind === 'reread') {
    const concept = lesson.concepts.find((c) => c.id === a.conceptId) || curConcept(session, lesson);
    const chunk = concept.chunks.find((c) => c.id === a.chunkId) || curChunk(session, lesson);
    a.helpUsed.push({ kind: 'reread', level: 0 });
    a.sinceAttempt.push('reread');
    learner.stats.helpRequests++;
    log(session, 'help', { kind, ask: step.id }, now);
    const t = { role: 'tutor', kind: 'reread', title: chunk.title, text: chunk.text, at: now };
    session.transcript.push(t);
    return { ok: true, kind, message: 'Vuelve a leerlo con calma y busca la parte que te ayude.', view: view(session, learner, env) };
  }
  if (kind === 'another') {
    const concept = lesson.concepts.find((c) => c.id === a.conceptId) || curConcept(session, lesson);
    const an = analogyFor(concept, learner);
    const target = a.lastDiag?.missingPointIds?.[0] ? pointById(concept, a.lastDiag.missingPointIds[0]) : null;
    const alt = an || (target ? `Dicho de otra forma: ${target.statement.split(/,| y | que /).map((x) => x.trim()).filter(Boolean).join(' · ')}` : 'Intenta explicarlo como si se lo contaras a un amigo que no ha leído el texto.');
    a.helpUsed.push({ kind: 'another', level: 2 });
    a.sinceAttempt.push('another');
    a.helpMax = Math.max(a.helpMax, 1);
    learner.stats.helpRequests++;
    log(session, 'help', { kind, ask: step.id }, now);
    tutor(session, alt, now, { help: 'another' });
    return { ok: true, kind, message: alt, view: view(session, learner, env) };
  }

  const meta = HELP_META[kind];
  if (!meta) return { ok: false, message: 'Esa ayuda no existe.' };
  if (meta.level !== a.helpMax + 1) return { ok: false, message: 'Vamos paso a paso: primero la ayuda más pequeña.', view: view(session, learner, env) };
  if (meta.level > (a.maxLevel ?? 4)) return { ok: false, message: 'En esta actividad ya no hay más ayuda.', view: view(session, learner, env) };

  // Autonomía: si ya tiene herramientas, antes de la primera pista se le invita a elegir una estrategia.
  if (learner.autonomy >= 2 && a.helpMax === 0 && !a.autonomyPrompted && a.attempts === 0) {
    a.autonomyPrompted = true;
    const msg =
      learner.autonomy >= 3
        ? 'Antes de una pista: inténtalo tú. ¿Qué sé? ¿Qué no sé? ¿Qué puedo intentar? Escribe aunque sea una idea incompleta.'
        : 'Antes de una pista: ¿qué estrategia podrías usar? Por ejemplo: releer, buscar la palabra clave, o imaginar un ejemplo. Prueba una y, si sigues atascado, vuelve a pedirla.';
    tutor(session, msg, now, { help: 'autonomy' });
    log(session, 'autonomy-prompt', { ask: step.id }, now);
    return { ok: true, kind: 'autonomy', message: msg, view: view(session, learner, env) };
  }

  const out = helpText(session, learner, lesson, step, kind);
  a.helpMax = meta.level;
  a.helpUsed.push({ kind, level: meta.level, visual: !!out.usedVisual });
  a.sinceAttempt.push(kind);
  if (a.attempts === 0) a.preHelp = true;
  learner.stats.helpRequests++;
  if (kind === 'full') {
    ensureResult(session, lesson.concepts.find((c) => c.id === a.conceptId) || curConcept(session, lesson)).fullHelp = true;
  }
  log(session, 'help', { kind, level: meta.level, ask: step.id }, now);
  tutor(session, out.text, now, { help: kind, visual: out.visual || null });
  return { ok: true, kind, message: out.text, view: view(session, learner, env) };
}

/* ------------------------------ creación de pasos ------------------------------ */

function makeStep(session, base, ask) {
  const step = { id: `${session.id}-${session.stepSeq++}`, ...base };
  if (ask) {
    step._ask = {
      attempts: 0,
      helpMax: 0,
      helpUsed: [],
      sinceAttempt: [],
      preHelp: false,
      lastDiag: null,
      allowReread: true,
      allowAnother: true,
      maxLevel: 4,
      noHelp: false,
      chain: 0,
      ...ask,
    };
  }
  return step;
}

function setCur(session, learner, step, env) {
  step.help = step._ask ? helpOptions(step, learner) : [];
  step._lessonId = step._lessonId || session.lessonId;
  session.cur = step;
}

function priorCount(lesson, learner, session) {
  const words = wordCount(lesson.sourceText || '');
  const ad = adaptation(learner);
  let n = isUni(session) ? 3 : words < 250 ? 2 : 3;
  if (ad.oneIdeaAtATime) n = Math.min(n, 2);
  return n;
}

function askPrior(session, learner, lesson, env) {
  const concept = curConcept(session, lesson);
  const i = session.flow.pi;
  const n = session.flow.ci === 0 ? Math.min(priorCount(lesson, learner, session), concept.prior.length) : 1;
  session.flow.priorTotal = n;
  const prompt = concept.prior[i];
  if (i === 0 && session.flow.ci === 0) tutor(session, isUni(session) ? 'Antes de explicarte nada, quiero ver qué sabes. Responde con lo que recuerdes o intuyas; no hace falta que sea correcto.' : 'Antes de empezar, quiero saber qué sabes tú. No hay respuestas malas: me ayudan a saber por dónde empezar.', env.now);
  const step = makeStep(session, {
    type: 'ask', purpose: 'prior', qType: 'open', prompt, conceptId: concept.id, placeholder: 'Escribe lo que piensas…',
    progress: progress(session, lesson),
  }, { conceptId: concept.id, purpose: 'prior', qType: 'open', pointIds: allPoints(concept).map((p) => p.id), noHelp: true });
  setCur(session, learner, step, env);
}

function progress(session, lesson) {
  const f = session.flow;
  const c = lesson?.concepts?.[f.ci];
  return {
    stage: f.stage,
    concept: c?.name,
    conceptIndex: f.ci + 1,
    conceptTotal: lesson?.concepts?.length || 1,
    chunkIndex: f.ki + 1,
    chunkTotal: c?.chunks?.length || 1,
  };
}

function enterRead(session, learner, lesson, env) {
  const concept = curConcept(session, lesson);
  const chunk = curChunk(session, lesson);
  session.flow.stage = 'read';
  const ad = adaptation(learner);
  const words = wordCount(chunk.text);
  const pause = learner.settings.readingPause ? Math.min(15, Math.round(words / 8)) : 0;
  if (session.flow.ki === 0 && concept.chunks.length > 1 && session.flow.ci === 0 && !isUni(session)) {
    tutor(session, `Vamos a leerlo en ${concept.chunks.length} partes pequeñas. Léelo con calma; después me cuentas qué entendiste.`, env.now);
  }
  const step = makeStep(session, {
    type: 'read',
    title: chunk.title,
    stage: chunk.stage || null,
    text: chunk.text,
    visual: chunk.visual || null,
    words,
    minSeconds: pause,
    hardWords: isUni(session) ? [] : hardWords(chunk.text, 4),
    conceptId: concept.id,
    progress: progress(session, lesson),
  }, { conceptId: concept.id, chunkId: chunk.id, noHelp: true, purpose: 'read' });
  step._chunkStart = env.now;
  session.transcript.push({ role: 'tutor', kind: 'chunk', title: chunk.title, text: chunk.text, visual: chunk.visual || null, stage: chunk.stage || null, at: env.now });
  setCur(session, learner, step, env);
}

const PROMPTS = {
  'own-words': { primary: 'Cuéntame con tus propias palabras qué acabas de leer.', uni: 'Explica con tus propias palabras lo esencial de este fragmento, sin copiarlo.' },
  'main-idea': { primary: '¿Cuál es la idea principal de esta parte?', uni: '¿Cuál es la idea central de este fragmento y qué lo sostiene?' },
  example: { primary: 'Dame un ejemplo de lo que acabas de leer. Puede ser de tu vida diaria.', uni: 'Da un ejemplo concreto de lo que acabas de leer.' },
  'invent-example': { primary: 'Inventa un ejemplo diferente a los del texto.', uni: 'Inventa un ejemplo distinto a los del texto y explica por qué encaja.' },
  why: { primary: '¿Por qué crees que es así? Explícame la razón.', uni: '¿Por qué funciona así? Explica la razón, no solo la regla.' },
  'teach-younger': { primary: 'Explícaselo a un niño más pequeño, con palabras sencillas.', uni: 'Explícaselo a un compañero que nunca lo ha visto, con palabras sencillas pero precisas.' },
  'own-question': { primary: 'Hazme una pregunta sobre lo que leíste: algo que te dé curiosidad o que no hayas entendido.', uni: 'Formula una pregunta sobre lo que leíste que te gustaría poder responder.' },
  draw: { primary: 'Dibuja cómo imaginas lo que leíste y escribe una frase que explique tu dibujo.', uni: 'Dibuja un esquema de lo que leíste y escribe una frase que lo explique.' },
};

/** Elige el tipo de pregunta según el concepto, lo ya observado y lo ya usado en esta sesión. */
function chooseExplainKind(session, learner, lesson, concept, chunk) {
  const f = session.flow;
  const used = (f.used ||= []);
  const ad = adaptation(learner);
  const last = f.lastExplainOutcome;
  const lastChunk = f.ki === concept.chunks.length - 1;
  const seq = [];
  if (!used.length) seq.push('own-words');
  if (ad.deeperQuestions || f.priorLevel === 'strong') seq.push('why', 'invent-example');
  if (last === 'correct') seq.push(lastChunk ? 'teach-younger' : 'example', 'why');
  if (last === 'comprehension_issue' || last === 'no_knowledge') seq.push('main-idea');
  if (!isUni(session) && f.ki >= 1 && concept.chunks.length > 1 && (concept.chunks[f.ki].visual || learner.interests.includes('dibujar')) && !used.includes('draw')) seq.push('draw');
  if (last === 'correct' && f.ki >= 2 && !used.includes('own-question') && !isUni(session)) seq.push('own-question');
  seq.push('own-words', 'main-idea', 'example', 'why');
  return seq.find((k) => !used.includes(k) || k === 'own-words') || 'own-words';
}

function enterExplain(session, learner, lesson, env) {
  const concept = curConcept(session, lesson);
  const chunk = curChunk(session, lesson);
  const f = session.flow;
  f.stage = 'explain';
  f.chain = 0;
  let kind;
  let prompt;
  let purpose = 'explain';
  if (chunk.ask) {
    kind = chunk.ask.purpose || 'own-words';
    prompt = chunk.ask.prompt;
    purpose = chunk.ask.purpose === 'why' ? 'why' : chunk.ask.purpose === 'explain-example' ? 'explain-example' : 'explain';
  } else {
    kind = chooseExplainKind(session, learner, lesson, concept, chunk);
    prompt = PROMPTS[kind][isUni(session) ? 'uni' : 'primary'];
    purpose = kind === 'why' ? 'why' : kind === 'example' || kind === 'invent-example' ? 'explain-example' : kind === 'own-question' ? 'own-question' : 'explain';
  }
  (f.used ||= []).push(kind);
  f.askKind = kind;
  const qType = kind === 'draw' ? 'draw' : 'open';
  const step = makeStep(session, {
    type: 'ask', purpose, kind, qType, prompt, conceptId: concept.id, chunkId: chunk.id,
    placeholder: kind === 'own-question' ? 'Escribe tu pregunta…' : 'Escribe aquí con tus palabras…',
    progress: progress(session, lesson),
    reflect: learner.autonomy >= 2 && !isUni(session) ? '¿Qué sé? ¿Qué no sé? Piénsalo un momento antes de escribir.' : null,
  }, { conceptId: concept.id, chunkId: chunk.id, purpose, kind, qType, pointIds: chunk.points.map((p) => p.id) });
  setCur(session, learner, step, env);
}

function enterContrast(session, learner, lesson, concept, miscId, env, chunk) {
  const m = concept.misconceptions.find((x) => x.id === miscId);
  const c = m.contrast;
  session.flow.stage = 'contrast';
  (session.flow.contrastDone ||= []).push(miscId);
  session.transcript.push({ role: 'tutor', kind: 'contrast', text: c.intro, items: c.items, at: env.now });
  const step = makeStep(session, {
    type: 'contrast', purpose: 'contrast', qType: 'choice',
    prompt: c.choiceQuestion || c.question, followUp: c.question,
    intro: c.intro, items: c.items, options: c.items.map((i) => ({ id: i.id, text: `Texto ${i.id}`.replace('Texto', c.items[0].id.length === 1 ? 'Opción' : 'Opción') })),
    askWhy: true, whyPrompt: '¿Cómo lo sabes? Explica tu razón.', conceptId: concept.id, progress: progress(session, lesson),
  }, { conceptId: concept.id, chunkId: chunk?.id, purpose: 'contrast', qType: 'choice', contrastMisc: miscId, pointIds: chunk ? chunk.points.map((p) => p.id) : [] });
  step.options = c.items.map((i) => ({ id: i.id, text: isUni(session) ? `${i.id}` : `${i.id}` }));
  setCur(session, learner, step, env);
}

/* ------------------------------ aplicación ------------------------------ */

function shuffleDet(arr, seed) {
  return [...arr].sort((a, b) => hash(seed + a.id) - hash(seed + b.id));
}

function pickApplyTasks(session, learner, concept) {
  const tasks = concept.applyTasks || [];
  const res = ensureResult(session, concept);
  const ad = adaptation(learner);
  const struggled = res.fullHelp || res.misconceptions.length > 0;
  let ordered;
  if (tasks.some((t) => t.scaffold)) {
    const order = { guided: 0, partial: 1, independent: 2 };
    ordered = tasks.filter((t) => t.scaffold).sort((a, b) => order[a.scaffold] - order[b.scaffold]);
  } else {
    ordered = [...tasks].sort((a, b) => (a.level || 1) - (b.level || 1));
    if (!struggled && session.flow.priorLevel === 'strong' && ordered.length > 1) ordered = ordered.slice(1);
  }
  const n = isUni(session) && ordered.some((t) => t.scaffold) ? ordered.length : Math.min(ordered.length, 1 + ad.extraApply + (struggled ? 1 : 0));
  return ordered.slice(0, Math.max(1, n)).map((t) => t.id);
}

function enterApply(session, learner, lesson, env, opts = {}) {
  const concept = curConcept(session, lesson);
  const f = session.flow;
  if (f.stage !== 'apply' || f.applyConcept !== concept.id) {
    f.stage = 'apply';
    f.applyConcept = concept.id;
    f.applyQueue = pickApplyTasks(session, learner, concept);
    f.ai = 0;
    tutor(
      session,
      isUni(session)
        ? 'Ahora lo pones a prueba. Iremos reduciendo la ayuda: primero un ejercicio guiado, luego parcialmente guiado y por último independiente.'
        : 'Ahora vamos a usar lo que aprendiste en una situación nueva.',
      env.now,
    );
  }
  const task = concept.applyTasks.find((t) => t.id === f.applyQueue[f.ai]);
  f.chain = 0;
  let prompt = task.prompt;
  const ip = task.interestPrompt && learner.interests.find((i) => task.interestPrompt[i]);
  if (ip) prompt = task.interestPrompt[ip];
  const qType = task.kind === 'choice' ? 'choice' : task.kind === 'order' ? 'order' : 'open';
  const step = makeStep(session, {
    type: 'ask', purpose: 'apply', qType, prompt, taskId: task.id, conceptId: concept.id,
    scaffold: task.scaffold || null,
    options: task.options?.map((o) => ({ id: o.id, text: o.text })),
    items: task.items ? shuffleDet(task.items, session.id) : null,
    askWhy: !!task.whyPrompt, whyPrompt: task.whyPrompt || null,
    placeholder: 'Escribe tu respuesta…', progress: progress(session, lesson),
  }, { conceptId: concept.id, purpose: 'apply', qType, taskId: task.id, pointIds: [], final: !!opts.final });
  setCur(session, learner, step, env);
}

function enterReexplain(session, learner, lesson, env) {
  const concept = curConcept(session, lesson);
  session.flow.stage = 'reexplain';
  session.flow.chain = 0;
  const step = makeStep(session, {
    type: 'ask', purpose: 'reexplain', qType: 'open',
    prompt: isUni(session)
      ? `Para cerrar, reconstruye «${concept.name}» desde cero: qué es, por qué funciona y cuándo se usa. Hazlo como si se lo enseñaras a alguien, sin releer.`
      : `Una última cosa: explícame con tus palabras qué es «${concept.name}», como si se lo enseñaras a alguien que no sabe nada.`,
    conceptId: concept.id, placeholder: 'Escribe tu explicación…', progress: progress(session, lesson),
  }, { conceptId: concept.id, purpose: 'reexplain', qType: 'open', pointIds: (concept.corePoints || allPoints(concept)).map((p) => p.id), allowReread: false });
  setCur(session, learner, step, env);
}

/* ------------------------------ flujo principal ------------------------------ */

export function createSession({ learner, lesson, now, mode = 'study' }) {
  const session = {
    id: nid(),
    profileId: learner.id,
    lessonId: lesson.id,
    mode,
    level: learner.level,
    createdAt: now,
    updatedAt: now,
    stepSeq: 1,
    flow: { stage: 'start', ci: 0, ki: 0, pi: 0, chain: 0, used: [], contrastDone: [], priorLevel: null },
    cur: null,
    transcript: [],
    events: [],
    results: {},
    summary: null,
    selfRating: null,
  };
  return session;
}

export function startSession(session, learner, lesson, env) {
  const f = session.flow;
  const concept = lesson.concepts[0];
  getConcept(learner, { subject: lesson.subject, name: concept.name, lessonId: lesson.id });
  if (isUni(session)) {
    const uni = concept.uni;
    tutor(session, `Vamos a estudiar «${lesson.title}». ${uni?.whyItMatters ? '\n\n¿Por qué vale la pena? ' + uni.whyItMatters : ''}`.trim(), env.now);
    f.stage = 'selfrate';
    const step = makeStep(session, {
      type: 'selfrate', prompt: concept.selfRatingPrompt || `¿Qué tan familiar te resulta «${concept.name}» hoy?`,
      options: [
        { id: '0', text: 'No lo conozco' },
        { id: '1', text: 'Me suena' },
        { id: '2', text: 'Creo que lo entiendo' },
        { id: '3', text: 'Puedo explicarlo' },
      ],
      conceptId: concept.id, progress: progress(session, lesson),
    }, { noHelp: true, purpose: 'selfrate', conceptId: concept.id });
    setCur(session, learner, step, env);
  } else {
    f.stage = 'prior';
    askPrior(session, learner, lesson, env);
  }
  log(session, 'start', { lesson: lesson.id }, env.now);
  return view(session, learner, env);
}

export function view(session, learner, env) {
  if (session.cur?._ask) session.cur.help = helpOptions(session.cur, learner);
  const lesson = lessonOf(env, session, session.cur?._lessonId);
  return {
    id: session.id,
    mode: session.mode,
    level: session.level,
    stage: session.flow.stage,
    transcript: session.transcript,
    step: publicStep(session.cur),
    done: session.flow.stage === 'done',
    summary: session.summary,
    progress: lesson && session.mode === 'study' ? progress(session, lesson) : session.cur?.progress || null,
    autonomyPrompt: autonomyPrompt(learner.autonomy),
    autonomy: learner.autonomy,
    examPlanId: session.exam?.planId || null,
  };
}

/* ---- Acciones del niño que no son respuestas ---- */

export async function advance(session, learner, action, payload, env) {
  const lesson = lessonOf(env, session);
  const step = session.cur;
  const f = session.flow;
  const now = env.now;
  if (action === 'selfrate' && step?.type === 'selfrate') {
    session.selfRating = Number(payload.value);
    say(session, 'child', 'text', step.options.find((o) => o.id === String(payload.value))?.text || '', {}, now);
    f.stage = 'prior';
    tutor(session, 'Gracias; lo comprobaremos juntos al final.', now);
    askPrior(session, learner, lesson, env);
    return view(session, learner, env);
  }
  if (action === 'read-done' && step?.type === 'read') {
    log(session, 'read', { chunk: step.title, ms: now - (step._chunkStart || now) }, now);
    enterExplain(session, learner, lesson, env);
    return view(session, learner, env);
  }
  if (action === 'unknown-word' && step?.type === 'read') {
    const w = String(payload.word || '').trim().slice(0, 40);
    if (!w) return view(session, learner, env);
    const concept = curConcept(session, lesson);
    const sent = sentences(step.text).find((s) => norm(s).includes(norm(w))) || null;
    const vocab = concept.vocabulary?.find((v) => norm(v.term).includes(norm(w)) || norm(w).includes(norm(v.term)));
    observe(learner, 'vocabulary', { at: now, sessionId: session.id, concept: concept.name, note: norm(w) });
    log(session, 'unknown-word', { word: w }, now);
    const msg = sent
      ? `En el texto aparece así: «${sent}». Mira las palabras que están alrededor: ¿qué crees que puede significar «${w}»?`
      : `No encuentro «${w}» en este fragmento. Mira las palabras de alrededor y piensa qué significaría.`;
    tutor(session, msg, now, { vocab: vocab ? { term: vocab.term, meaning: vocab.meaning } : null });
    return view(session, learner, env);
  }
  if (action === 'continue' && step?.type === 'teach') {
    return afterTeach(session, learner, lesson, env);
  }
  if (action === 'continue' && step?.type === 'note') {
    return proceed(session, learner, lesson, env, step._next);
  }
  return view(session, learner, env);
}

/* ---- Respuesta del niño ---- */

function childAnswerText(step, payload) {
  if (step.qType === 'choice') {
    const o = step.options?.find((x) => x.id === payload.choice);
    return [o ? `${o.id}) ${o.text}` : '', payload.text ? `— ${payload.text}` : ''].filter(Boolean).join(' ');
  }
  if (step.qType === 'order') return (payload.order || []).map((id, i) => `${i + 1}. ${step.items?.find((x) => x.id === id)?.text || id}`).join('\n');
  if (step.qType === 'draw') return `🖼️ (dibujo) ${payload.text || ''}`;
  return payload.text || '';
}

function buildPraise(session, diag, step, concept) {
  const uni = isUni(session);
  const cov = labelsOf(concept, diag.coveredPointIds);
  const gained = labelsOf(concept, diag.gainedPointIds);
  const a = step._ask;
  if (a.purpose === 'apply' || a.purpose === 'contrast') {
    if (diag.signals.includes('reason_given') && diag.choiceCorrect) return 'Esta vez explicaste la razón, no solamente la respuesta.';
    if (a.purpose === 'apply') return uni ? 'Aplicaste la idea correctamente a un caso nuevo.' : 'Usaste la idea en una situación nueva: eso es justo lo que buscábamos.';
    return 'Elegiste bien y supiste decir en qué te fijaste.';
  }
  if (gained.length) return `Ahora incluiste algo que antes faltaba: ${gained[0]}.`;
  if (a.helpMax >= 1 && a.attempts > 1) return 'Con esa ayuda lograste encontrar la parte que faltaba.';
  if (diag.signals.includes('gave_example') && diag.dims.connection >= 2) return uni ? 'Tu ejemplo conecta la idea con un caso distinto al del texto.' : 'Tu ejemplo demuestra que entendiste la idea.';
  if (cov.length >= 2) return `Mencionaste ideas importantes: ${cov.slice(0, 2).join(' y ')}.`;
  if (cov.length === 1) return `Entendiste que ${cov[0]}.`;
  return 'Tu respuesta muestra que entendiste la idea.';
}

const NORMALIZE = [
  'Bien, encontramos una parte que todavía podemos entender mejor.',
  'Vamos bien: hay una parte que aún podemos aclarar juntos.',
  'Esto nos sirve: ahora sé en qué parte conviene detenernos.',
  'Equivocarse aquí es normal; justo por eso practicamos.',
];

async function runDiagnosis(session, learner, lesson, concept, step, payload, env) {
  const a = step._ask;
  const chunk = concept.chunks.find((c) => c.id === a.chunkId);
  const task = a.taskId ? (concept.applyTasks || []).find((t) => t.id === a.taskId) : null;
  let diagTask = task;
  if (a.contrastMisc) {
    const m = concept.misconceptions.find((x) => x.id === a.contrastMisc);
    diagTask = { options: m.contrast.items.map((i) => ({ id: i.id })), correct: m.contrast.correct, whyKeywords: m.contrast.whyKeywords };
  }
  const points = a.pointIds.map((id) => pointById(concept, id)).filter(Boolean);
  const rec = getConcept(learner, { subject: lesson.subject, name: concept.name });
  const ctx = {
    level: session.level,
    purpose: a.purpose,
    qType: step.qType,
    answer: { text: payload.text || '', choice: payload.choice, order: payload.order },
    points,
    concept,
    task: diagTask,
    source: chunk?.text || lesson.sourceText,
    prev: a.lastDiag,
    helpLevel: a.helpMax,
    priorComprehension: score(rec, 'comprehension'),
  };
  const fn = env.diagnose || diagnose;
  const diag = await fn(ctx);
  return { diag, ctx, rec, chunk, task };
}

function creditHelp(rec, learner, session, step, diag, concept, now, improved) {
  const a = step._ask;
  if (!a.sinceAttempt.length) return;
  const kinds = [...new Set(a.sinceAttempt)];
  for (const k of kinds) {
    const map = { hint: 'hint_helped', example: 'example_helped', steps: 'steps_helped', reread: 'reread_helped', another: 'another_helped' };
    recordHelp(rec, k, improved);
    if (improved && map[k]) observe(learner, map[k], { at: now, sessionId: session.id, concept: concept.name, note: step.id });
    if (improved && k === 'example' && a.helpUsed.some((h) => h.visual)) observe(learner, 'visual_helped', { at: now, sessionId: session.id, concept: concept.name, note: step.id });
  }
  if (kinds.includes('full') ) observe(learner, 'full_help_needed', { at: now, sessionId: session.id, concept: concept.name, note: step.id });
  a.sinceAttempt = [];
}

function recordEvidence(session, learner, lesson, concept, rec, step, diag, chunk, now) {
  const a = step._ask;
  const res = ensureResult(session, concept);
  res.asks++;
  res.helpMax = Math.max(res.helpMax, a.helpMax);
  learner.stats.asks++;
  rec.attempts++;
  const sid = session.id;
  if (a.purpose !== 'prior' && a.purpose !== 'own-question') {
    for (const [dim, v] of Object.entries(diag.dims)) recordDim(rec, dim, v, { help: a.helpMax, at: now, sessionId: sid, note: a.purpose });
    rec.history.push({ at: now, sessionId: sid, purpose: a.purpose, outcome: diag.outcome, overall: diag.overallWithHelp, help: a.helpMax });
    if (rec.history.length > 40) rec.history.shift();
    res.outcomes.push(diag.outcome);
    if (diag.dims.comprehension !== null && diag.dims.comprehension !== undefined) res.compScores.push(diag.dims.comprehension * (1 - 0.12 * a.helpMax));
    if (diag.dims.application !== null && diag.dims.application !== undefined && a.purpose === 'apply') res.applyScores.push(diag.dims.application * (1 - 0.12 * a.helpMax));
  }
  if (diag.misconception && a.purpose !== 'prior') {
    const def = concept.misconceptions.find((m) => m.id === diag.misconception.id);
    recordMisconception(rec, diag.misconception, { at: now, def });
    if (!res.misconceptions.includes(diag.misconception.id)) res.misconceptions.push(diag.misconception.id);
    observe(learner, 'confuses_similar', { at: now, sessionId: sid, concept: concept.name, note: diag.misconception.id });
  }
  if (diag.signals.includes('recited')) observe(learner, 'recites_definitions', { at: now, sessionId: sid, concept: concept.name, note: step.id });
  if (diag.signals.includes('unknown_word')) observe(learner, 'vocabulary', { at: now, sessionId: sid, concept: concept.name, note: diag.unknownWords.join(',') });
  if (diag.signals.includes('too_short') && a.purpose === 'explain') observe(learner, 'short_answers', { at: now, sessionId: sid, concept: concept.name, note: step.id });
  if (diag.outcome === 'application_issue' || (a.purpose === 'apply' && diag.dims.application !== null && diag.dims.application < 1.5 && score(rec, 'comprehension') >= 2))
    observe(learner, 'application_gap', { at: now, sessionId: sid, concept: concept.name, note: step.id });
  if (a.attempts === 1 && a.helpMax === 0 && a.purpose !== 'prior') observe(learner, 'tries_alone', { at: now, sessionId: sid, concept: concept.name, note: 'first-try' });
  if (a.attempts === 1 && a.preHelp) observe(learner, 'asks_help_early', { at: now, sessionId: sid, concept: concept.name, note: step.id });
  if (chunk && a.attempts === 1 && (a.purpose === 'explain' || a.purpose === 'why')) {
    const k = noteChunkResult(learner, wordCount(chunk.text), diag.coverage);
    if (k) observe(learner, 'chunk_sensitive', { at: now, sessionId: sid, concept: concept.name, note: 'chunk-length' });
  }
  rec.lessonId = lesson.id;
  rec.conceptId = concept.id;
  rec.lastSeen = now;
}

function feedbackFor(session, learner, lesson, concept, diag, step) {
  const uni = isUni(session);
  const msgs = [];
  const a = step._ask;
  const praise = buildPraise(session, diag, step, concept);
  const normalize = pick(NORMALIZE, session.id + a.attempts + step.id);
  const miss = (a.pointIds || []).filter((id) => diag.missingPointIds.includes(id));
  const target = pointById(concept, miss[0]);
  switch (diag.outcome) {
    case 'correct':
      msgs.push({ kind: 'praise', text: praise });
      break;
    case 'partial':
      msgs.push({ kind: 'praise', text: diag.coveredPointIds.length ? praise : (uni ? 'Vas en la dirección correcta.' : 'Vas por buen camino.') });
      if (diag.avoidNote) msgs.push({ kind: 'note', text: diag.avoidNote + ' Intenta que explique, no que cuente.' });
      else msgs.push({ kind: 'note', text: uni ? `Aún falta una idea importante. ${target?.probe || ''}`.trim() : `${normalize} ${target?.probe || ''}`.trim() });
      break;
    case 'no_knowledge':
      msgs.push({ kind: 'note', text: uni ? 'No pasa nada: partamos de lo que sí sabes. Vuelve al fragmento.' : 'Está bien no saberlo todavía: para eso estamos aquí. Vamos a mirarlo juntos, paso a paso.' });
      break;
    case 'comprehension_issue':
      if (diag.signals.includes('recited'))
        msgs.push({ kind: 'note', text: uni ? 'Tu respuesta reproduce casi literalmente el texto: eso demuestra que lo recuerdas, pero todavía no que lo entiendas. Vamos a comprobar la lógica detrás.' : 'Esas palabras se parecen mucho a las del texto. Ahora quiero oír las tuyas.' });
      else msgs.push({ kind: 'note', text: uni ? 'Tu respuesta no parece relacionada con el fragmento. Releámoslo con una pregunta concreta.' : 'Parece que esta parte no quedó clara. No es culpa tuya: léela otra vez y busca la idea principal.' });
      break;
    case 'application_issue':
      msgs.push({ kind: 'note', text: uni ? 'Conoces la idea pero al usarla en un caso nuevo algo se rompió. Vamos a encontrar dónde.' : 'La idea la tienes, pero al usarla en esta situación nueva algo no encajó. Vamos a mirar dónde.' });
      break;
    default:
      msgs.push({ kind: 'note', text: normalize });
  }
  return msgs;
}

function errorAnalysisText(m) {
  const e = m.errorAnalysis;
  if (!e) return null;
  return [
    `**Qué intentaste:** ${e.attempted}`,
    `**Concepto que usaste:** ${e.conceptUsed}`,
    `**Dónde se rompió el razonamiento:** ${e.brokeAt}`,
    `**Qué concepto confundiste:** ${e.confusedWith}`,
    `**Qué conocimiento faltaba:** ${e.missing}`,
    `**Cómo debería razonarse:** ${e.shouldReason}`,
  ].join('\n');
}

export async function submitAnswer(session, learner, payload, env) {
  const lesson = lessonOf(env, session, session.cur?._lessonId);
  const step = session.cur;
  const now = env.now;
  if (!step?._ask || ['read', 'wrap', 'teach', 'selfrate'].includes(step.type)) return { ok: false, error: 'No hay una pregunta activa.' };
  const a = step._ask;
  const concept = lesson.concepts.find((c) => c.id === a.conceptId) || curConcept(session, lesson);
  const f = session.flow;

  const needsText = step.qType === 'open' || step.qType === 'draw';
  if (needsText && !(payload.text || '').trim()) return { ok: false, error: 'Escribe algo, aunque sea una idea a medias.' };
  if (step.qType === 'choice' && !payload.choice && step.lockedChoice) payload.choice = step.lockedChoice;
  if (step.qType === 'choice' && !payload.choice) return { ok: false, error: 'Elige una opción.' };
  if (step.qType === 'order' && !(payload.order || []).length) return { ok: false, error: 'Ordena los elementos.' };
  if ((payload.text || '').length > 2000) payload.text = payload.text.slice(0, 2000);

  say(session, 'child', 'text', childAnswerText(step, payload), {}, now);
  a.attempts++;
  const { diag, rec, chunk } = await runDiagnosis(session, learner, lesson, concept, step, payload, env);
  const prevDiag = a.lastDiag;
  a.lastDiag = diag;
  const improved = !!prevDiag && (diag.gainedPointIds.length > 0 || rankOutcome(diag.outcome) > rankOutcome(prevDiag.outcome));
  creditHelp(rec, learner, session, step, diag, concept, now, improved);
  recordEvidence(session, learner, lesson, concept, rec, step, diag, chunk, now);
  log(session, 'answer', { ask: step.id, purpose: a.purpose, attempt: a.attempts, diag: compactDiag(diag), help: a.helpMax }, now);
  const res = ensureResult(session, concept);

  let msgs = [];
  const debug = compactDiag(diag);

  /* ---- Diagnóstico inicial: no se evalúa, se descubre ---- */
  if (a.purpose === 'prior') {
    const cov = diag.coverage;
    const level = cov >= 0.6 ? 'strong' : cov >= 0.2 ? 'some' : 'none';
    f.priorLevel = f.priorLevel === 'strong' ? 'strong' : level;
    res.priorLevel = level;
    if (diag.misconception) res.priorMisc = diag.misconception.id;
    rec.prior = { coverage: Number(cov.toFixed(2)), level, misc: diag.misconception?.id || null };
    let line;
    if (diag.signals.includes('idk')) line = 'Está bien no saberlo todavía. Eso también me sirve: así sé por dónde empezar.';
    else if (diag.misconception) line = 'Gracias, anoté tu idea. La vamos a poner a prueba mientras leemos.';
    else if (level === 'strong') line = 'Ya sabes bastante. Vamos a ir más a fondo.';
    else line = 'Gracias, eso me ayuda a saber por dónde empezar.';
    msgs.push({ kind: 'note', text: line });
    f.pi++;
    const total = f.priorTotal || 1;
    msgs.forEach((m) => tutor(session, m.text, now, { fb: m.kind }));
    if (f.pi < total && concept.prior[f.pi]) {
      askPrior(session, learner, lesson, env);
    } else {
      f.pi = 0;
      enterRead(session, learner, lesson, env);
    }
    return { ok: true, debug, view: view(session, learner, env) };
  }

  /* ---- Pregunta propia del niño: se valora la curiosidad, no se puntúa ---- */
  if (a.purpose === 'own-question') {
    tutor(session, 'Buena pregunta: apunta algo que te da curiosidad. Antes de que yo te responda: ¿en qué parte del texto crees que podría estar la respuesta? Anótala; si no está, es una gran pregunta para investigar con un adulto.', now);
    f.lastExplainOutcome = 'correct';
    return { ok: true, debug, view: await nextAfterGood(session, learner, lesson, concept, env) };
  }

  /* ---- Contraste ---- */
  if (a.purpose === 'contrast') return handleContrast(session, learner, lesson, concept, rec, step, diag, payload, env, debug);

  /* ---- Aplicación ---- */
  if (a.purpose === 'apply') return handleApply(session, learner, lesson, concept, rec, step, diag, env, debug);

  /* ---- Explicar / reintentar / reexplicar ---- */
  f.lastExplainOutcome = diag.outcome;
  msgs = feedbackFor(session, learner, lesson, concept, diag, step);
  const good = diag.outcome === 'correct';
  if (good) {
    msgs.forEach((m) => tutor(session, m.text, now, { fb: m.kind }));
    if (f.stage === 'reexplain') return { ok: true, debug, view: await finishConcept(session, learner, lesson, env) };
    return { ok: true, debug, view: await nextAfterGood(session, learner, lesson, concept, env) };
  }

  f.chain = (f.chain || 0) + 1;

  // Tras enseñar, solo hay dos intentos más: después se sigue y el concepto queda marcado para reforzar.
  if (a.final && a.attempts >= 2) {
    msgs.forEach((m) => tutor(session, m.text, now, { fb: m.kind }));
    tutor(session, 'Lo dejamos anotado para repasarlo con calma otro día; no pasa nada.', now, { fb: 'note' });
    res.needsReinforcement = true;
    if (f.stage === 'reexplain') return { ok: true, debug, view: await finishConcept(session, learner, lesson, env) };
    return { ok: true, debug, view: await nextAfterGood(session, learner, lesson, concept, env) };
  }

  // Error conceptual conocido → actividad de contraste (usa el error para diseñar la siguiente actividad)
  if (diag.misconception) {
    const m = concept.misconceptions.find((x) => x.id === diag.misconception.id);
    if (m) {
      msgs = [];
      if (m.child && !isUni(session)) msgs.push({ kind: 'misc', text: m.child });
      if (isUni(session)) {
        const ea = errorAnalysisText(m);
        if (ea) msgs.push({ kind: 'analysis', text: `Tu respuesta contiene una confusión frecuente: ${m.label}.\n\n${ea}` });
      }
      msgs.forEach((x) => tutor(session, x.text, now, { fb: x.kind }));
      if (m.contrast && !f.contrastDone.includes(m.id)) {
        enterContrast(session, learner, lesson, concept, m.id, env, chunk);
        return { ok: true, debug, view: view(session, learner, env) };
      }
      return { ok: true, debug, view: await retryAfterTeaching(session, learner, lesson, concept, chunk, step, env, m.contrast?.reveal) };
    }
  }

  msgs.forEach((m) => tutor(session, m.text, now, { fb: m.kind }));

  // Repetición del texto → pedir razón o ejemplo propio (no es un fallo: es una invitación a comprender)
  if (diag.signals.includes('recited') && a.attempts <= 2) {
    return { ok: true, debug, view: setFollowUp(session, learner, lesson, concept, chunk, step, a.purpose === 'explain-example' ? 'invent-example' : 'why', env) };
  }

  // Demasiados intentos: se enseña lo que falta de forma explícita y se vuelve a intentar con otra forma
  if (f.chain >= MAX_CHAIN || a.helpMax >= 4) {
    return { ok: true, debug, view: await teachMissing(session, learner, lesson, concept, chunk, step, diag, env) };
  }

  // Reintento dirigido a la idea que falta
  return { ok: true, debug, view: retryTargeted(session, learner, lesson, concept, chunk, step, diag, env) };
}

function rankOutcome(o) {
  return { correct: 4, partial: 3, application_issue: 2, comprehension_issue: 2, confused: 1, incorrect: 1, no_knowledge: 0 }[o] ?? 0;
}

export function compactDiag(d) {
  return {
    outcome: d.outcome, outcomeLabel: d.outcomeLabel, coverage: Number(d.coverage.toFixed(2)), dims: d.dims, signals: d.signals,
    misconception: d.misconception ? { id: d.misconception.id, label: d.misconception.label } : null,
    observation: d.observation, interpretation: d.interpretation, confidence: d.confidence, recommendedHelp: d.recommendedHelp,
    help: d.helpLevel, covered: d.coveredPointIds, missing: d.missingPointIds,
  };
}

function retryTargeted(session, learner, lesson, concept, chunk, prevStep, diag, env) {
  const a = prevStep._ask;
  const uni = isUni(session);
  const missingIds = (a.pointIds || []).filter((id) => diag.missingPointIds.includes(id));
  const target = pointById(concept, missingIds[0]) || pointById(concept, a.pointIds[0]);
  let prompt = target?.probe || 'Inténtalo otra vez: ¿qué parte te falta decir?';
  if (a.purpose === 'reexplain') prompt = 'Inténtalo otra vez, ahora añadiendo la idea que falta.';
  const noKnow = diag.outcome === 'no_knowledge' || diag.outcome === 'comprehension_issue';
  if (noKnow && !diag.signals.includes('recited')) {
    // Se devuelve el fragmento y se pregunta de forma más concreta (ayuda mínima automática: releer)
    session.transcript.push({ role: 'tutor', kind: 'reread', title: chunk?.title || concept.name, text: chunk?.text || '', at: env.now });
    prompt = target?.probe || prompt;
  }
  const kind = a.purpose === 'reexplain' ? 'reexplain' : 'retry';
  const step = makeStep(session, {
    type: 'ask', purpose: kind, qType: 'open', prompt, conceptId: concept.id, chunkId: a.chunkId,
    placeholder: 'Escribe aquí…', progress: progress(session, lesson), retry: true,
    reflect: learner.autonomy >= 2 ? '¿Qué podrías hacer tú para encontrar la respuesta? Releer, buscar una palabra clave, imaginar un ejemplo…' : null,
  }, {
    conceptId: concept.id, chunkId: a.chunkId, purpose: kind, qType: 'open', pointIds: a.pointIds, lastDiag: diag,
    helpMax: a.helpMax, helpUsed: [...a.helpUsed], attempts: a.attempts, chain: a.chain, preHelp: a.preHelp, allowReread: a.allowReread,
    final: a.final, maxLevel: a.maxLevel,
  });
  step._ask.sinceAttempt = [];
  if (noKnow) step._ask.sinceAttempt.push('reread');
  setCur(session, learner, step, env);
  return view(session, learner, env);
}

function setFollowUp(session, learner, lesson, concept, chunk, prevStep, kind, env) {
  const a = prevStep._ask;
  const step = makeStep(session, {
    type: 'ask', purpose: kind === 'why' ? 'why' : 'explain-example', qType: 'open',
    prompt: PROMPTS[kind][isUni(session) ? 'uni' : 'primary'], conceptId: concept.id, chunkId: a.chunkId,
    placeholder: 'Escribe aquí con tus palabras…', progress: progress(session, lesson),
  }, {
    conceptId: concept.id, chunkId: a.chunkId, purpose: kind === 'why' ? 'why' : 'explain-example', qType: 'open',
    pointIds: a.pointIds, lastDiag: null, attempts: a.attempts, chain: a.chain, helpMax: a.helpMax, helpUsed: [...a.helpUsed],
  });
  setCur(session, learner, step, env);
  return view(session, learner, env);
}

/** Enseñanza explícita (solo lo necesario): ocurre tras varios intentos o con ayuda completa. */
async function teachMissing(session, learner, lesson, concept, chunk, prevStep, diag, env) {
  const a = prevStep._ask;
  const now = env.now;
  const missingIds = (a.pointIds || []).filter((id) => diag.missingPointIds.includes(id));
  const pts = (missingIds.length ? missingIds : a.pointIds.slice(0, 1)).map((id) => pointById(concept, id)).filter(Boolean);
  const an = analogyFor(concept, learner);
  const text = [
    isUni(session) ? 'Vamos a reconstruirlo. Esto es lo que faltaba:' : 'Te lo explico solo en la parte que falta:',
    ...pts.map((p) => `• ${p.statement}`),
    an ? `\n${an}` : '',
  ].join('\n');
  ensureResult(session, concept).fullHelp = true;
  ensureResult(session, concept).needsReinforcement = true;
  const rec = getConcept(learner, { subject: lesson.subject, name: concept.name });
  rec.fullHelpNeeded++;
  observe(learner, 'full_help_needed', { at: now, sessionId: session.id, concept: concept.name, note: prevStep.id });
  log(session, 'teach', { points: pts.map((p) => p.id) }, now);
  tutor(session, text, now, { fb: 'teach', visual: chunk?.visual || null });
  const step = makeStep(session, { type: 'teach', prompt: 'Cuando estés listo, lo intentas otra vez con tus palabras.', conceptId: concept.id, progress: progress(session, lesson) }, { noHelp: true, purpose: 'teach', conceptId: concept.id });
  step._after = { chunkId: a.chunkId, pointIds: a.pointIds };
  setCur(session, learner, step, env);
  return view(session, learner, env);
}

async function afterTeach(session, learner, lesson, env) {
  const step = session.cur;
  const concept = curConcept(session, lesson);
  const after = step._after;
  const chunk = concept.chunks.find((c) => c.id === after.chunkId) || curChunk(session, lesson);
  session.flow.chain = 0;
  const kind = isUni(session) ? 'why' : 'own-words';
  const prompt = isUni(session)
    ? 'Ahora reconstruye tú la idea: explícala con tus palabras y di por qué funciona así.'
    : 'Ahora inténtalo tú otra vez: cuéntame con tus palabras lo que acabamos de ver.';
  const ns = makeStep(session, {
    type: 'ask', purpose: 'retry', qType: 'open', prompt, conceptId: concept.id, chunkId: chunk.id, placeholder: 'Escribe aquí…',
    progress: progress(session, lesson), retry: true, final: true,
  }, { conceptId: concept.id, chunkId: chunk.id, purpose: 'retry', qType: 'open', pointIds: after.pointIds, final: true, maxLevel: 2 });
  setCur(session, learner, ns, env);
  return view(session, learner, env);
}

async function retryAfterTeaching(session, learner, lesson, concept, chunk, prevStep, env, reveal) {
  const a = prevStep._ask;
  if (reveal) tutor(session, reveal, env.now, { fb: 'teach' });
  const uni = isUni(session);
  const step = makeStep(session, {
    type: 'ask', purpose: 'retry', qType: 'open',
    prompt: uni ? 'Reconstruye tu respuesta: explícalo de nuevo, esta vez incorporando lo que acabas de ver.' : 'Ahora, con lo que descubriste, explícalo otra vez con tus palabras.',
    conceptId: concept.id, chunkId: a.chunkId, placeholder: 'Escribe aquí…', progress: progress(session, lesson), retry: true,
  }, { conceptId: concept.id, chunkId: a.chunkId, purpose: 'retry', qType: 'open', pointIds: a.pointIds, lastDiag: null, chain: session.flow.chain, final: true });
  setCur(session, learner, step, env);
  return view(session, learner, env);
}

async function handleContrast(session, learner, lesson, concept, rec, step, diag, payload, env, debug) {
  const a = step._ask;
  const now = env.now;
  const m = concept.misconceptions.find((x) => x.id === a.contrastMisc);
  const c = m.contrast;
  const res = ensureResult(session, concept);
  const right = diag.choiceCorrect;
  const reason = diag.whyRatio > 0;
  if (right && reason) {
    recordMisconception(rec, { id: m.id, label: m.label, confusedWith: m.confusedWith }, { at: now, resolved: true });
    res.resolved.push(m.id);
    tutor(session, 'Esta vez explicaste la razón, no solamente la respuesta. Eso demuestra que ya ves la diferencia.', now, { fb: 'praise' });
    tutor(session, c.reveal, now, { fb: 'teach' });
    observe(learner, 'example_helped', { at: now, sessionId: session.id, concept: concept.name, note: 'contrast-' + m.id });
    recordHelp(rec, 'compare', true);
  } else if (right && !reason && a.attempts < 2) {
    tutor(session, 'Elegiste bien. Ahora cuéntame qué detalle te hizo decidirlo: ¿cómo lo sabes?', now, { fb: 'note' });
    a.lastDiag = diag;
    step.lockedChoice = payload.choice;
    return { ok: true, debug, view: view(session, learner, env) };
  } else {
    tutor(session, right ? 'Elegiste bien, aunque todavía no puedo ver la razón. Te lo muestro:' : 'Esta vez no coincidió, y está bien: así vemos justo dónde se mezcla. Mira esto:', now, { fb: 'note' });
    tutor(session, c.reveal, now, { fb: 'teach' });
    ensureResult(session, concept).needsReinforcement = true;
    recordHelp(rec, 'compare', false);
  }
  if (a.returnToApply) {
    session.flow.stage = 'apply';
    enterApply(session, learner, lesson, env, { final: true });
    return { ok: true, debug, view: view(session, learner, env) };
  }
  const chunk = concept.chunks.find((x) => x.id === a.chunkId) || curChunk(session, lesson);
  return { ok: true, debug, view: await retryAfterTeaching(session, learner, lesson, concept, chunk, step, env, null) };
}

async function handleApply(session, learner, lesson, concept, rec, step, diag, env, debug) {
  const a = step._ask;
  const now = env.now;
  const f = session.flow;
  const task = concept.applyTasks.find((t) => t.id === a.taskId);
  const res = ensureResult(session, concept);
  const msgs = feedbackFor(session, learner, lesson, concept, diag, step);
  const ok = diag.outcome === 'correct' || (diag.outcome === 'partial' && (diag.dims.application ?? 0) >= 2);
  if (ok) {
    msgs.forEach((m) => tutor(session, m.text, now, { fb: m.kind }));
    return { ok: true, debug, view: await nextApply(session, learner, lesson, concept, env) };
  }
  // Un error en la aplicación es información: qué concepto se usó, dónde se rompió.
  if (diag.misconception) {
    const m = concept.misconceptions.find((x) => x.id === diag.misconception.id);
    if (m) {
      if (isUni(session) && m.errorAnalysis) tutor(session, `Analicemos tu respuesta como información:\n\n${errorAnalysisText(m)}`, now, { fb: 'analysis' });
      else if (m.child) tutor(session, m.child, now, { fb: 'misc' });
      if (m.contrast && !f.contrastDone.includes(m.id)) {
        enterContrast(session, learner, lesson, concept, m.id, env, null);
        step._ask.returnToApply = true;
        session.cur._ask.returnToApply = true;
        session.cur._ask.applyTaskId = task.id;
        return { ok: true, debug, view: view(session, learner, env) };
      }
    }
  } else {
    msgs.forEach((m) => tutor(session, m.text, now, { fb: m.kind }));
  }
  if (a.attempts < 2 && !a.final) {
    const hint = task?.help?.hint;
    if (hint) tutor(session, `Pista: ${hint}`, now, { fb: 'hint' });
    a.helpUsed.push({ kind: 'hint', level: 1, auto: true });
    a.sinceAttempt.push('hint');
    a.helpMax = Math.max(a.helpMax, 1);
    a.lastDiag = diag;
    session.cur.help = helpOptions(session.cur, learner);
    return { ok: true, debug, view: view(session, learner, env) };
  }
  // Se revela el razonamiento correcto y se registra la brecha de aplicación.
  res.needsReinforcement = true;
  const correctOpt = task?.options?.find((o) => o.id === task.correct);
  const reveal = [
    correctOpt ? `La opción más adecuada era: «${correctOpt.text}».` : '',
    task?.help?.example ? `Mira cómo se razona: ${task.help.example}` : '',
  ].filter(Boolean).join(' ');
  if (reveal) tutor(session, reveal, now, { fb: 'teach' });
  tutor(session, 'Lo anoto como algo para practicar de nuevo en unos días.', now, { fb: 'note' });
  return { ok: true, debug, view: await nextApply(session, learner, lesson, concept, env) };
}

async function nextApply(session, learner, lesson, concept, env) {
  const f = session.flow;
  f.ai++;
  if (f.ai < f.applyQueue.length) {
    enterApply(session, learner, lesson, env);
    return view(session, learner, env);
  }
  const res = ensureResult(session, concept);
  if ((res.misconceptions.length || res.fullHelp) && !res.reexplained) {
    res.reexplained = true;
    enterReexplain(session, learner, lesson, env);
    return view(session, learner, env);
  }
  return finishConcept(session, learner, lesson, env);
}

async function nextAfterGood(session, learner, lesson, concept, env) {
  const f = session.flow;
  if (f.ki < concept.chunks.length - 1) {
    f.ki++;
    f.chain = 0;
    enterRead(session, learner, lesson, env);
    return view(session, learner, env);
  }
  enterApply(session, learner, lesson, env);
  return view(session, learner, env);
}

async function finishConcept(session, learner, lesson, env) {
  const f = session.flow;
  const concept = curConcept(session, lesson);
  const rec = getConcept(learner, { subject: lesson.subject, name: concept.name });
  rec.studied++;
  scheduleAfterStudy(rec, env.now);
  if (f.ci < lesson.concepts.length - 1) {
    f.ci++;
    f.ki = 0;
    f.pi = 0;
    f.chain = 0;
    f.used = [];
    f.stage = 'prior';
    getConcept(learner, { subject: lesson.subject, name: lesson.concepts[f.ci].name, lessonId: lesson.id });
    tutor(session, `Pasamos al siguiente tema: «${lesson.concepts[f.ci].name}».`, env.now);
    askPrior(session, learner, lesson, env);
    return view(session, learner, env);
  }
  return wrapUp(session, learner, lesson, env);
}

/* ------------------------------ cierre de sesión ------------------------------ */

function outcomeWord(st) {
  return { understood: 'Comprendo', partial: 'Reconozco', needs_work: 'No lo comprendo todavía', new: 'Sin evidencia' }[st];
}

export async function wrapUp(session, learner, lesson, env) {
  const now = env.now;
  const uni = isUni(session);
  session.flow.stage = 'done';
  learner.stats.sessions++;
  const reports = [];
  const strong = [];
  const apply = [];
  const confuse = [];
  const memorize = [];
  const review = [];
  const asks = Object.values(session.results);
  for (const res of asks) {
    const concept = lesson.concepts.find((c) => c.id === res.conceptId);
    const rec = getConcept(learner, { subject: lesson.subject, name: res.name });
    const rep = conceptReport(rec, now, session.level);
    reports.push({ ...rep, session: { asks: res.asks, helpMax: res.helpMax, fullHelp: res.fullHelp } });
    if (rep.state === 'understood' || (rep.dims.comprehension.score ?? 0) >= 2.2) strong.push(res.name);
    if ((rep.dims.application.score ?? 0) >= 2) apply.push(res.name);
    for (const m of rep.confuses) confuse.push(`${res.name}: ${m}`);
    if (rep.state === 'needs_work' || rep.state === 'partial') review.push(res.name);
    for (const t of concept?.uni?.memorize || []) memorize.push(t);
    if (uni && session.selfRating >= 2 && (rep.dims.comprehension.score ?? 0) < 1.8)
      observe(learner, 'overconfident', { at: now, sessionId: session.id, concept: res.name, note: 'selfrating' });
  }
  // Autonomía: sube cuando necesita cada vez menos ayuda, baja si necesita explicaciones completas.
  const totals = asks.reduce((t, r) => ({ asks: t.asks + r.asks, indep: t.indep + (r.helpMax <= 1 ? 1 : 0), full: t.full + (r.fullHelp ? 1 : 0) }), { asks: 0, indep: 0, full: 0 });
  let autonomyChange = 0;
  if (totals.asks) {
    if (totals.full === 0 && totals.indep === asks.length) {
      learner.autonomyStreak++;
      if (learner.autonomyStreak >= 2 && learner.autonomy < 3) {
        learner.autonomy++;
        learner.autonomyStreak = 0;
        autonomyChange = 1;
      }
    } else if (totals.full >= Math.ceil(asks.length / 2) && learner.autonomy > 0) {
      learner.autonomy--;
      learner.autonomyStreak = 0;
      autonomyChange = -1;
    } else learner.autonomyStreak = 0;
  }
  const askInterests = learner.interests.length === 0 && learner.interestAsks < 2 && learner.stats.sessions - learner.lastInterestAskSession >= 1;
  if (askInterests) {
    learner.interestAsks++;
    learner.lastInterestAskSession = learner.stats.sessions;
  }
  session.summary = {
    title: lesson.title,
    concepts: reports,
    uni,
    sections: uni
      ? {
          canExplain: strong,
          canApply: apply,
          stillConfuse: confuse,
          memorize: [...new Set(memorize)],
          review,
          nextAction: nextAction(reports, session),
        }
      : null,
    child: uni ? null : childSummary(reports, session),
    askInterests: askInterests ? INTEREST_OPTIONS : null,
    autonomyChange,
    nextReviewAt: reports.map((r) => r.nextReviewAt).filter(Boolean).sort((x, y) => x - y)[0] || null,
  };
  const step = makeStep(session, { type: 'wrap', summary: session.summary }, { noHelp: true, purpose: 'wrap' });
  setCur(session, learner, step, env);
  tutor(session, uni ? 'Sesión terminada. Este es tu resumen.' : 'Terminamos por hoy. Mira lo que lograste.', now);
  log(session, 'wrap', { reports: reports.map((r) => ({ name: r.name, state: r.state })) }, now);
  session.updatedAt = now;
  return view(session, learner, env);
}

function childSummary(reports, session) {
  const can = [];
  const working = [];
  for (const r of reports) {
    const comp = r.dims.comprehension.score ?? 0;
    const app = r.dims.application.score ?? 0;
    if (comp >= 2.2 && app >= 2) can.push(`Ahora puedes explicar «${r.name}» y usarlo en una situación nueva.`);
    else if (comp >= 2.2) can.push(`Puedes explicar «${r.name}» con tus palabras. Todavía practicaremos usarlo en situaciones nuevas.`);
    else if (comp >= 1.4) working.push(`«${r.name}»: entiendes una parte; vamos a seguir afinándola.`);
    else working.push(`«${r.name}»: lo estamos construyendo; mañana lo miramos con calma.`);
    if (r.confusesWith.length) working.push(`Ojo con no mezclar «${r.name}» con ${r.confusesWith[0]}.`);
    else if (r.resolvedWith.length) can.push(`Descubriste la diferencia entre «${r.name}» y ${r.resolvedWith[0]}.`);
  }
  return { can, working, tomorrow: 'Mañana te preguntaré qué recuerdas, sin ayuda, para que lo aprendido se quede.' };
}

function nextAction(reports, session) {
  const weak = reports.find((r) => r.state === 'needs_work') || reports.find((r) => r.state === 'partial');
  if (!weak) return 'Repasar mañana sin apuntes y explicar el tema a otra persona.';
  const p = weak.practice[0];
  return `${p || 'Repasar el concepto'} (tema: ${weak.name}).`;
}

/* ------------------------------ sesión de repaso (recuperación) ------------------------------ */

export function createReviewSession({ learner, items, now }) {
  const base = createSession({ learner, lesson: { id: 'review' }, now, mode: 'review' });
  base.review = { items, idx: 0, results: [] };
  return base;
}

function reviewPoints(concept) {
  const pts = (concept.corePoints || allPoints(concept)).slice().sort((a, b) => (b.weight || 1) - (a.weight || 1));
  return pts.slice(0, 4);
}

export function startReview(session, learner, env) {
  tutor(session, learner.level === 'university' ? 'Vamos a ver qué se quedó. Responde sin apuntes; no voy a corregirte hasta que termines cada pregunta.' : '¿Te acuerdas de qué hablábamos? Intenta recordarlo tú solo; no voy a ayudarte hasta que respondas.', env.now);
  askReviewItem(session, learner, env);
  return view(session, learner, env);
}

function askReviewItem(session, learner, env) {
  const r = session.review;
  const item = r.items[r.idx];
  const lesson = env.getLesson(item.lessonId);
  const concept = lesson.concepts.find((c) => c.id === item.conceptId) || lesson.concepts[0];
  session.lessonId = lesson.id;
  const pts = reviewPoints(concept);
  const step = makeStep(session, {
    type: 'ask', purpose: 'recall', qType: 'open',
    prompt: learner.level === 'university' ? `Sin mirar nada: ¿qué recuerdas de «${concept.name}»? Define, explica por qué funciona y menciona cuándo se usa.` : `Cuéntame lo que recuerdes sobre «${concept.name}». No importa si no es perfecto.`,
    conceptId: concept.id, placeholder: 'Escribe lo que recuerdes…',
    progress: { stage: 'review', conceptIndex: r.idx + 1, conceptTotal: r.items.length, concept: concept.name },
  }, { conceptId: concept.id, purpose: 'recall', qType: 'open', pointIds: pts.map((p) => p.id), maxLevel: 1, allowReread: false, allowAnother: false });
  step._lessonId = lesson.id;
  step._ask.reviewItem = r.idx;
  setCur(session, learner, step, env);
}

export async function submitReview(session, learner, payload, env) {
  const step = session.cur;
  if (!step?._ask) return { ok: false, error: 'No hay una pregunta activa.' };
  const a = step._ask;
  const now = env.now;
  const lesson = env.getLesson(step._lessonId);
  const concept = lesson.concepts.find((c) => c.id === a.conceptId);
  const r = session.review;

  const isApply = a.purpose === 'apply-review';
  if (!isApply && !(payload.text || '').trim()) return { ok: false, error: 'Escribe lo que recuerdes, o «no me acuerdo».' };
  say(session, 'child', 'text', childAnswerText(step, payload), {}, now);
  a.attempts++;
  const { diag, rec } = await runDiagnosis(session, learner, lesson, concept, step, payload, env);
  a.lastDiag = diag;
  const debug = compactDiag(diag);
  const cov = Math.min(3, diag.coverage * 3.3);
  const item = r.items[r.idx];

  if (!isApply) {
    recordDim(rec, 'recall', cov, { help: a.helpMax, at: now, sessionId: session.id, note: 'review' });
    const res = applyReview(rec, now, cov, a.helpMax, adaptation(learner).reviewFactor);
    rec.history.push({ at: now, sessionId: session.id, purpose: 'recall', outcome: diag.outcome, overall: Number(cov.toFixed(2)), help: a.helpMax });
    if (res.kind === 'strong') observe(learner, 'recall_ok', { at: now, sessionId: session.id, concept: concept.name, note: 'review' });
    else if (res.kind === 'weak') observe(learner, 'recall_gap', { at: now, sessionId: session.id, concept: concept.name, note: 'review' });
    r.results.push({ conceptKey: rec.key, lessonId: lesson.id, name: concept.name, kind: res.kind, days: res.days, coverage: Number(diag.coverage.toFixed(2)), missing: labelsOf(concept, diag.missingPointIds) });
    log(session, 'review-answer', { concept: concept.name, kind: res.kind, diag: debug }, now);
    const got = labelsOf(concept, diag.coveredPointIds);
    const lack = labelsOf(concept, diag.missingPointIds);
    // Sin re-enseñar: se muestra qué se recordó y qué faltó como pistas cortas
    if (res.kind === 'strong') tutor(session, `Recordaste ${got.length ? got.slice(0, 2).join(' y ') : 'lo esencial'} sin ayuda. Eso significa que se está quedando.`, now);
    else if (res.kind === 'partial') tutor(session, `Recordaste ${got.length ? got.slice(0, 2).join(' y ') : 'una parte'}. Se nos escapó: ${lack.slice(0, 2).join(' y ')}. No lo vuelvo a explicar ahora: lo repasaremos pronto.`, now);
    else tutor(session, `Por ahora costó recordarlo. Es normal: lo volveremos a ver en ${res.days} día${res.days > 1 ? 's' : ''} y, si quieres, puedes volver a estudiarlo ahora.`, now);
    // Si antes se vio dificultad de aplicación, se comprueba una aplicación breve
    const needApp = (score(rec, 'application') ?? 3) < 2 && (concept.applyTasks || []).length;
    if (needApp && res.kind !== 'weak') {
      const task = concept.applyTasks.find((t) => t.kind !== 'order') || concept.applyTasks[0];
      const qType = task.kind === 'choice' ? 'choice' : task.kind === 'order' ? 'order' : 'open';
      const ns = makeStep(session, {
        type: 'ask', purpose: 'apply', qType, prompt: task.prompt, taskId: task.id, conceptId: concept.id, options: task.options?.map((o) => ({ id: o.id, text: o.text })),
        items: task.items ? shuffleDet(task.items, session.id) : null, askWhy: !!task.whyPrompt, whyPrompt: task.whyPrompt || null, placeholder: 'Escribe tu respuesta…',
        progress: step.progress,
      }, { conceptId: concept.id, purpose: 'apply-review', qType, taskId: task.id, pointIds: [], maxLevel: 1, allowReread: false, allowAnother: false });
      ns._lessonId = lesson.id;
      tutor(session, 'Una pregunta más: ahora usa la idea en una situación.', now);
      setCur(session, learner, ns, env);
      return { ok: true, debug, view: view(session, learner, env) };
    }
  } else {
    recordDim(rec, 'application', diag.dims.application, { help: a.helpMax, at: now, sessionId: session.id, note: 'review-apply' });
    tutor(session, diag.outcome === 'correct' ? 'Lograste usarlo en una situación nueva, incluso después de unos días.' : 'La aplicación todavía necesita práctica; la dejo anotada.', now);
    log(session, 'review-apply', { concept: concept.name, diag: debug }, now);
  }
  r.idx++;
  if (r.idx < r.items.length) {
    askReviewItem(session, learner, env);
    return { ok: true, debug, view: view(session, learner, env) };
  }
  return { ok: true, debug, view: wrapReview(session, learner, env) };
}

function wrapReview(session, learner, env) {
  const now = env.now;
  session.flow.stage = 'done';
  const rs = session.review.results;
  session.summary = {
    review: true,
    title: 'Repaso',
    results: rs,
    next: rs.map((r) => ({ name: r.name, kind: r.kind, days: r.days })),
    studyAgain: [...new Set(rs.filter((r) => r.kind === 'weak').map((r) => r.lessonId))],
  };
  const step = makeStep(session, { type: 'wrap', summary: session.summary }, { noHelp: true, purpose: 'wrap' });
  setCur(session, learner, step, env);
  tutor(session, 'Terminamos el repaso.', now);
  learner.stats.sessions++;
  session.updatedAt = now;
  return view(session, learner, env);
}

/* ------------------------------ utilidades exportadas para otros módulos ------------------------------ */

export { makeStep, setCur, ensureResult, recordEvidence, runDiagnosis, creditHelp, tutor, say, log, childAnswerText, shuffleDet, pointById, labelsOf, allPoints, reviewPoints, analogyFor, helpOptions, HELP_META };
