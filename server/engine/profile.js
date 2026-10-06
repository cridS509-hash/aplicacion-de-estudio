// Perfil de aprendizaje. Guarda EVIDENCIA, no etiquetas: cada observación es un hecho con fecha y
// contexto; la interpretación aparece solo cuando hay más de una evidencia y siempre en lenguaje
// probabilístico ("posible patrón…"). Nunca se afirma "es visual" o "tiene mala memoria".

import { DEFAULT_CHUNK_WORDS } from './material.js';
import { clamp } from './text.js';

export const DIMS = ['knowledge', 'comprehension', 'connection', 'application', 'recall'];
const DIM_ES = { knowledge: 'Conocimiento', comprehension: 'Comprensión', connection: 'Conexión', application: 'Aplicación', recall: 'Recuperación' };
export const dimLabel = (d) => DIM_ES[d];

export function newLearner({ id, name, level = 'primary', ageBand = null, createdAt }) {
  return {
    id,
    name,
    level,
    ageBand,
    createdAt,
    interests: [],
    interestAsks: 0,
    lastInterestAskSession: -99,
    autonomy: 0,
    autonomyStreak: 0,
    settings: { readingPause: level === 'primary' },
    concepts: {},
    observations: {},
    stats: { sessions: 0, asks: 0, helpRequests: 0, chunkObs: [] },
    sessions: [],
    exams: [],
  };
}

export const conceptKey = (subject, name) => `${String(subject || 'General').toLowerCase()}::${String(name).toLowerCase().trim()}`;

export function getConcept(learner, { subject, name, lessonId }) {
  const key = conceptKey(subject, name);
  let rec = learner.concepts[key];
  if (!rec) {
    rec = learner.concepts[key] = {
      key,
      name,
      subject: subject || 'General',
      lessonIds: [],
      dims: {},
      misconceptions: {},
      helpWorked: {},
      helpTried: {},
      attempts: 0,
      fullHelpNeeded: 0,
      box: 0,
      nextReviewAt: null,
      lastReviewAt: null,
      reviewPending: false,
      reviewHistory: [],
      history: [],
      studied: 0,
    };
  }
  if (lessonId && !rec.lessonIds.includes(lessonId)) rec.lessonIds.push(lessonId);
  return rec;
}

/** Actualiza una dimensión con una media móvil que da más peso a lo reciente. */
export function recordDim(rec, dim, value, { help = 0, at, sessionId, note } = {}) {
  if (value === null || value === undefined) return;
  const eff = value * (1 - 0.12 * Math.min(4, help));
  const d = (rec.dims[dim] ||= { score: null, n: 0, last: null, trail: [] });
  d.score = d.score === null ? eff : d.score * 0.45 + eff * 0.55;
  d.n++;
  d.last = at;
  d.trail.push({ at, v: Number(eff.toFixed(2)), help, sessionId, note });
  if (d.trail.length > 12) d.trail.shift();
}

export function recordMisconception(rec, m, { at, resolved = false, def } = {}) {
  const cur = (rec.misconceptions[m.id] ||= {
    id: m.id,
    label: m.label,
    confusedWith: m.confusedWith,
    adult: def?.adult,
    recommendation: def?.recommendation,
    count: 0,
    resolved: false,
    firstAt: at,
  });
  if (resolved) {
    cur.resolved = true;
    cur.resolvedAt = at;
  } else {
    cur.count++;
    cur.resolved = false;
    cur.lastAt = at;
  }
  return cur;
}

export function recordHelp(rec, kind, worked) {
  rec.helpTried[kind] = (rec.helpTried[kind] || 0) + 1;
  if (worked) rec.helpWorked[kind] = (rec.helpWorked[kind] || 0) + 1;
}

/* ------------------------------ Estado del concepto ------------------------------ */

export const score = (rec, dim) => rec.dims?.[dim]?.score ?? null;

export function levelWord(s) {
  if (s === null || s === undefined) return 'pendiente';
  if (s >= 2.3) return 'buena';
  if (s >= 1.4) return 'parcial';
  return 'débil';
}

/** 'new' | 'needs_work' (🔴) | 'partial' (🟡) | 'understood' (🟢) */
export function conceptState(rec) {
  const comp = score(rec, 'comprehension');
  const app = score(rec, 'application');
  const recall = score(rec, 'recall');
  const unresolved = Object.values(rec.misconceptions || {}).filter((m) => !m.resolved);
  if (comp === null && app === null) return 'new';
  if ((comp !== null && comp < 1.2) || unresolved.some((m) => m.count >= 2)) return 'needs_work';
  if (comp !== null && comp >= 2.2 && app !== null && app >= 2 && !unresolved.length && (recall === null || recall >= 1.8)) return 'understood';
  return 'partial';
}

export const STATE_EMOJI = { new: '⚪', needs_work: '🔴', partial: '🟡', understood: '🟢' };

/** Frase corta y honesta del estado, para niño o adulto. */
export function stateSummary(rec, level = 'primary') {
  const st = conceptState(rec);
  const comp = score(rec, 'comprehension');
  const app = score(rec, 'application');
  const recall = score(rec, 'recall');
  const unresolved = Object.values(rec.misconceptions || {}).filter((m) => !m.resolved);
  const uni = level === 'university';
  if (st === 'new') return uni ? 'Aún sin evidencia' : 'Todavía no lo hemos practicado';
  if (st === 'needs_work') return uni ? 'No lo comprendo todavía: necesita refuerzo' : 'Necesita refuerzo';
  if (st === 'understood') {
    const pend = recall === null;
    return uni ? `Comprendo: puedo explicarlo y aplicarlo${pend ? ' (falta comprobar que lo recuerdo)' : ''}` : `Ya lo entiendo y puedo usarlo${pend ? ' (falta comprobar que lo recuerdas)' : ''}`;
  }
  if (unresolved.length) return uni ? `Reconozco, pero confundo: ${unresolved[0].confusedWith}` : `Lo voy entendiendo, pero lo mezclo con ${unresolved[0].confusedWith}`;
  if (app === null || app < 2) return uni ? 'Reconozco y puedo definirlo, pero aún me cuesta aplicarlo' : 'Puede explicarlo, pero todavía le cuesta usarlo en situaciones nuevas';
  if (recall !== null && recall < 1.8) return uni ? 'Lo comprendí pero me cuesta recordarlo después' : 'Lo entendió, pero hay que recordarlo con práctica';
  return uni ? 'Reconozco, falta consolidar' : 'Lo voy entendiendo';
}

const HELP_ES = { hint: 'una pista', example: 'un ejemplo', steps: 'ir paso a paso', reread: 'volver a leer', another: 'una explicación de otra manera', compare: 'comparar dos casos', visual: 'una imagen o esquema' };
export const helpName = (k) => HELP_ES[k] || k;

/** Ficha completa de un concepto (mapa de conocimiento y vista adulta). */
export function conceptReport(rec, now, level = 'primary') {
  const st = conceptState(rec);
  const comp = score(rec, 'comprehension');
  const app = score(rec, 'application');
  const kn = score(rec, 'knowledge');
  const unresolved = Object.values(rec.misconceptions || {}).filter((m) => !m.resolved);
  const resolved = Object.values(rec.misconceptions || {}).filter((m) => m.resolved);
  const know = [];
  const understands = [];
  const confuses = unresolved.map((m) => m.label);
  const canDo = [];
  const cannotYet = [];
  const practice = [];
  if (kn !== null && kn >= 1.4) know.push('Recuerda las ideas principales del tema');
  if (comp !== null && comp >= 2.2) understands.push('Puede explicar la idea con sus propias palabras');
  else if (comp !== null && comp >= 1.4) understands.push('Comprende parte de la idea (explicación parcial)');
  if (app !== null && app >= 2) canDo.push('Aplica el concepto en una situación nueva');
  if (app === null) cannotYet.push('Aún no se ha evaluado su aplicación en una situación nueva');
  else if (app < 2) cannotYet.push('Todavía no aplica el concepto con seguridad en situaciones nuevas');
  if (comp !== null && comp < 2.2) cannotYet.push('Todavía no explica el concepto completo con sus propias palabras');
  for (const m of unresolved) practice.push(m.recommendation || `Practicar la diferencia con ${m.confusedWith}`);
  if (app === null || (app !== null && app < 2)) practice.push('Practicar con ejemplos y problemas nuevos (aplicación)');
  const recall = score(rec, 'recall');
  if (rec.reviewPending || recall === null) practice.push('Repasar sin ayuda después de uno o más días (recuperación)');
  else if (recall < 1.8) practice.push('Repetir el repaso espaciado: costó recordarlo sin ayuda');
  const worked = Object.entries(rec.helpWorked || {}).sort((a, b) => b[1] - a[1]);
  const help = worked.map(([k, n]) => ({ kind: k, name: helpName(k), times: n, tried: rec.helpTried?.[k] || n }));
  return {
    key: rec.key,
    name: rec.name,
    subject: rec.subject,
    state: st,
    emoji: STATE_EMOJI[st],
    summary: stateSummary(rec, level),
    dims: Object.fromEntries(DIMS.map((d) => [d, { score: score(rec, d) === null ? null : Number(score(rec, d).toFixed(2)), word: levelWord(score(rec, d)), n: rec.dims?.[d]?.n || 0 }])),
    know,
    understands,
    confuses,
    confusesWith: unresolved.map((m) => m.confusedWith),
    resolvedConfusions: resolved.map((m) => m.label),
    resolvedWith: resolved.map((m) => m.confusedWith),
    canDo,
    cannotYet,
    helpThatWorked: help,
    practice: [...new Set(practice)],
    nextReviewAt: rec.nextReviewAt,
    reviewDue: !!rec.nextReviewAt && rec.nextReviewAt <= now,
    box: rec.box,
    mainDifficulty: unresolved[0]
      ? unresolved[0].adult || unresolved[0].label
      : app !== null && app < 2
        ? 'Dificultad para aplicar el concepto en situaciones nuevas'
        : comp !== null && comp < 2.2
          ? 'Comprensión parcial del concepto'
          : null,
    lastSeen: rec.history?.at(-1)?.at || null,
  };
}

/* ------------------------------ Observaciones ------------------------------ */

const OBS = {
  example_helped: {
    obs: (n) => `Después de ver un ejemplo concreto, mejoró su siguiente respuesta (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'Posible patrón: los ejemplos concretos parecen ayudarle a comprender; el tutor los ofrecerá antes.',
  },
  hint_helped: {
    obs: (n) => `Una pista fue suficiente para corregir su respuesta (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'Posible patrón: con ayuda mínima suele poder avanzar; el tutor empezará siempre por la pista más pequeña.',
  },
  steps_helped: {
    obs: (n) => `Avanzó después de recibir ayuda paso a paso (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'Posible patrón: cuando la idea es nueva puede necesitar dividirla en pasos pequeños.',
  },
  visual_helped: {
    obs: (n) => `Una imagen o esquema acompañó una mejora en su respuesta (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'Posible patrón: en varias actividades una representación visual le ayudó a comprender este tipo de conceptos.',
  },
  reread_helped: {
    obs: (n) => `Volver a leer el fragmento mejoró su respuesta (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'Posible patrón: relee con provecho; se le sugerirá releer antes de otras ayudas.',
  },
  another_helped: {
    obs: (n) => `Mejoró tras recibir una segunda explicación de otra manera (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'Posible patrón: cuando la primera explicación es abstracta puede necesitar una segunda forma de verlo.',
  },
  full_help_needed: {
    obs: (n) => `Necesitó la explicación completa para poder avanzar (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'Hay conceptos que todavía no logra construir solo; conviene repasarlos pronto y con fragmentos más pequeños.',
  },
  recites_definitions: {
    obs: (n) => `Repitió frases casi idénticas al texto en ${n} ${n === 1 ? 'respuesta' : 'respuestas'}.`,
    interp: 'Posible patrón: puede repetir definiciones sin explicarlas; se le pedirán más ejemplos propios y «por qués».',
  },
  confuses_similar: {
    obs: (n) => `Confundió conceptos parecidos en ${n} ${n === 1 ? 'ocasión' : 'ocasiones'}.`,
    interp: 'Posible patrón: tiende a mezclar conceptos similares; ayudan las comparaciones lado a lado.',
  },
  application_gap: {
    obs: (n) => `Explicó una idea pero tuvo dificultad al usarla en una situación nueva (${n} ${n === 1 ? 'caso' : 'casos'}).`,
    interp: 'Posible patrón: conocer la idea no basta todavía para aplicarla; se programarán más ejercicios de aplicación.',
  },
  vocabulary: {
    obs: (n) => `Dijo no conocer palabras del texto en ${n} ${n === 1 ? 'ocasión' : 'ocasiones'}.`,
    interp: 'Posible dificultad con vocabulario; conviene preguntar el significado antes de leer.',
  },
  short_answers: {
    obs: (n) => `Dio respuestas muy cortas en ${n} ${n === 1 ? 'actividad' : 'actividades'} en las que se esperaba explicar.`,
    interp: 'Puede que le cueste elaborar explicaciones largas; el tutor pedirá una idea a la vez.',
  },
  tries_alone: {
    obs: (n) => `Intentó responder antes de pedir ayuda en ${n} ${n === 1 ? 'actividad' : 'actividades'}.`,
    interp: 'Suele intentar solo antes de recibir ayuda; el tutor reducirá las sugerencias.',
  },
  asks_help_early: {
    obs: (n) => `Pidió ayuda antes de intentar responder en ${n} ${n === 1 ? 'actividad' : 'actividades'}.`,
    interp: 'Puede que aún no confíe en su propia respuesta; el tutor le preguntará primero «¿qué crees tú?».',
  },
  recall_gap: {
    obs: (n) => `En el repaso después de un tiempo recordó poco sin ayuda (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'En esta etapa tuvo dificultad para recuperar información tras unos días; se acortarán los intervalos de repaso.',
  },
  recall_ok: {
    obs: (n) => `En el repaso después de un tiempo recordó bien sin ayuda (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'La información se mantiene tras unos días; se podrán espaciar más los repasos.',
  },
  overconfident: {
    obs: (n) => `Dijo poder explicar un tema, pero su explicación fue parcial (${n} ${n === 1 ? 'vez' : 'veces'}).`,
    interp: 'Posible desajuste entre «me suena» y «puedo explicarlo»; conviene comprobar con una explicación propia antes de avanzar.',
  },
  chunk_sensitive: {
    obs: (n) => `Respondió con menos precisión después de fragmentos largos que de fragmentos cortos (${n} comparaciones).`,
    interp: 'Posible patrón: se benefician los fragmentos pequeños; el tutor los acortará.',
  },
};

export function observe(learner, key, { at, sessionId, concept, note } = {}) {
  if (!OBS[key]) return;
  const o = (learner.observations[key] ||= { key, count: 0, firstSeen: at, lastSeen: at, evidence: [] });
  const dup = o.evidence.some((e) => e.sessionId === sessionId && e.concept === concept && e.note === note);
  if (dup) return;
  o.count++;
  o.lastSeen = at;
  o.evidence.push({ at, sessionId, concept, note });
  if (o.evidence.length > 15) o.evidence.shift();
}

export function summarizeObservations(learner) {
  return Object.values(learner.observations)
    .map((o) => {
      const def = OBS[o.key];
      return {
        key: o.key,
        count: o.count,
        observation: def.obs(o.count),
        interpretation: o.count >= 2 ? def.interp : 'Observado una sola vez: aún no es un patrón; el tutor seguirá recogiendo evidencia.',
        isPattern: o.count >= 2,
        confidence: o.count >= 4 ? 'media' : o.count >= 2 ? 'baja-media' : 'muy baja',
        firstSeen: o.firstSeen,
        lastSeen: o.lastSeen,
        evidence: o.evidence.slice(-4),
      };
    })
    .sort((a, b) => b.count - a.count);
}

const cnt = (l, k) => l.observations[k]?.count || 0;

/** Palancas de adaptación derivadas de la evidencia (con umbrales prudentes). */
export function adaptation(learner) {
  const base = DEFAULT_CHUNK_WORDS[learner.level] || 90;
  const obsList = learner.stats.chunkObs || [];
  const long = obsList.filter((o) => o.words >= base * 0.95);
  const short = obsList.filter((o) => o.words < base * 0.95);
  const mean = (a) => a.reduce((x, y) => x + y.cov, 0) / (a.length || 1);
  let chunkWords = base;
  let chunkSensitive = false;
  if (long.length >= 2 && short.length >= 1 && mean(short) - mean(long) >= 0.25) chunkSensitive = true;
  if (cnt(learner, 'chunk_sensitive') >= 1 || chunkSensitive || cnt(learner, 'full_help_needed') >= 2) chunkWords = Math.round(base * 0.7);
  const helpers = [
    ['example', cnt(learner, 'example_helped')],
    ['hint', cnt(learner, 'hint_helped')],
    ['steps', cnt(learner, 'steps_helped')],
    ['reread', cnt(learner, 'reread_helped')],
    ['another', cnt(learner, 'another_helped')],
  ].sort((a, b) => b[1] - a[1]);
  const suggestedHelp = helpers[0][1] >= 2 ? helpers[0][0] : null;
  return {
    chunkWords,
    chunkSensitive,
    suggestedHelp,
    preferVisual: cnt(learner, 'visual_helped') >= 2,
    exampleFirst: cnt(learner, 'example_helped') >= 2,
    deeperQuestions: cnt(learner, 'recites_definitions') >= 2 || cnt(learner, 'application_gap') >= 2,
    extraApply: cnt(learner, 'application_gap') >= 2 ? 1 : 0,
    oneIdeaAtATime: cnt(learner, 'short_answers') >= 3,
    reviewFactor: cnt(learner, 'recall_gap') >= 2 ? 0.7 : cnt(learner, 'recall_ok') >= 3 ? 1.3 : 1,
    askFirst: cnt(learner, 'asks_help_early') >= 2,
    autonomy: learner.autonomy,
  };
}

export function noteChunkResult(learner, words, coverage) {
  const arr = learner.stats.chunkObs;
  arr.push({ words, cov: Number(coverage.toFixed(2)) });
  if (arr.length > 30) arr.shift();
  const base = DEFAULT_CHUNK_WORDS[learner.level] || 90;
  const a = adaptation(learner);
  if (a.chunkSensitive && !learner.observations.chunk_sensitive) return 'chunk_sensitive';
  return null;
}

export function addInterest(learner, interest) {
  const v = String(interest || '').trim().toLowerCase().slice(0, 30);
  if (!v || learner.interests.includes(v)) return;
  learner.interests.push(v);
  if (learner.interests.length > 6) learner.interests.shift();
}

export const INTEREST_OPTIONS = [
  { id: 'futbol', label: '⚽ Fútbol' },
  { id: 'animales', label: '🐾 Animales' },
  { id: 'videojuegos', label: '🎮 Videojuegos' },
  { id: 'ciencia', label: '🔬 Ciencia' },
  { id: 'dibujar', label: '🎨 Dibujar' },
];

export function autonomyPrompt(level) {
  return ['Te puedo ayudar.', '¿Qué crees que podrías intentar primero?', '¿Qué estrategia podrías usar?', 'Inténtalo tú; ya tienes herramientas para hacerlo.'][clamp(level, 0, 3)];
}
