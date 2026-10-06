// Motor de diagnóstico: analiza la respuesta del niño y produce un diagnóstico estructurado,
// NO un simple correcto/incorrecto. Es heurístico (palabras clave, errores conceptuales conocidos,
// similitud con el texto fuente) y probabilístico: cada diagnóstico lleva una confianza y separa
// OBSERVACIÓN (hechos) de INTERPRETACIÓN (hipótesis).
// Con un LLM conectado, llm.js puede refinar el resultado con la misma estructura.

import { norm, tokens, wordCount, groupScore, verbatimRatio, noveltyRatio, matchesAffirmed, clamp } from './text.js';

export const lite = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const IDK = /\b(no se|no lo se|nose|ni idea|no entiendo|no comprendo|no me acuerdo|no recuerdo|no estoy seguro|no tengo idea|no se que|no sabria)\b/;
const EXAMPLE_MARKERS = /\b(por ejemplo|como cuando|es como|se parece|igual que|me recuerda|como el|como la|imagina|pienso en|por ejemplo)\b/;
const WHY_MARKERS = /\b(porque|ya que|debido a|por eso|por lo tanto|entonces|asi que|gracias a)\b/;

export function snippet(text, n = 90) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function unknownWords(text) {
  const t = lite(text);
  const out = [];
  const re = /(?:no (?:se|entiendo|comprendo|conozco) (?:que (?:significa|es|quiere decir)|lo que (?:significa|es|quiere decir)|la palabra|el significado de)|que (?:significa|quiere decir)|que es)\s+(?:la palabra\s+|el\s+|la\s+|un\s+|una\s+)?["«']?([a-zñ]{4,})/g;
  let m;
  while ((m = re.exec(t))) out.push(m[1]);
  return out;
}

function pointCoverage(text, points = []) {
  if (!points.length) return { coverage: 0, covered: [], missing: [], partial: [], detail: {} };
  let total = 0;
  let got = 0;
  const covered = [];
  const partial = [];
  const missing = [];
  const detail = {};
  for (const p of points) {
    const w = p.weight || 1;
    total += w;
    const gs = groupScore(text, p.keywords || []);
    const need = p.min ?? 0.5;
    detail[p.id] = gs.ratio;
    if (gs.ratio >= need - 1e-9 && gs.ratio > 0) {
      got += w;
      covered.push(p.id);
    } else if (gs.ratio > 0) {
      got += w * gs.ratio * 0.5;
      partial.push(p.id);
    } else missing.push(p.id);
  }
  return { coverage: total ? got / total : 0, covered, partial, missing: [...partial, ...missing], detail };
}

export function detectMisconception(text, concept) {
  // Se evalúa por oraciones: «…el día y la noche; la traslación…» no debe leerse como una sola afirmación.
  const segments = String(text || '').split(/[.;:!?\n]+/).map(norm).filter(Boolean);
  for (const m of concept?.misconceptions || []) {
    for (const src of m.triggers || []) {
      try {
        if (segments.some((seg) => matchesAffirmed(seg, src))) return { id: m.id, label: m.label, confusedWith: m.confusedWith, via: 'text' };
      } catch {
        /* patrón inválido: se ignora */
      }
    }
  }
  return null;
}

const toScore = (cov) => (cov >= 0.7 ? 3 : cov >= 0.35 ? 2 : cov > 0 ? 1 : 0);

function evalChoice(ctx, d) {
  const { task, answer } = ctx;
  const opt = task.options?.find((o) => o.id === answer.choice);
  const right = answer.choice === task.correct;
  d.choiceCorrect = right;
  d.signals.push(right ? 'choice_correct' : 'choice_wrong');
  if (!right && opt?.misc) {
    const m = ctx.concept?.misconceptions?.find((x) => x.id === opt.misc);
    if (m) d.misconception = { id: m.id, label: m.label, confusedWith: m.confusedWith, via: 'choice' };
  }
  // Justificación: ¿explica la razón o solo elige?
  const why = (answer.text || '').trim();
  let whyRatio = null;
  if (why) {
    whyRatio = groupScore(why, task.whyKeywords || []).ratio;
    if (!d.misconception) d.misconception = detectMisconception(why, ctx.concept);
    d.signals.push(whyRatio > 0 ? 'reason_given' : 'reason_unclear');
  } else d.signals.push('no_reason');
  d.whyRatio = whyRatio;
  return right ? (whyRatio > 0 ? 3 : why ? 2 : 2) : opt?.misc ? 0 : 1;
}

function evalOrder(ctx, d) {
  const { task, answer } = ctx;
  const given = answer.order || [];
  const want = task.correct;
  let pos = 0;
  want.forEach((id, i) => {
    if (given[i] === id) pos++;
  });
  const exact = pos === want.length;
  d.choiceCorrect = exact;
  d.signals.push(exact ? 'order_correct' : 'order_wrong');
  return exact ? 3 : pos / want.length >= 0.5 ? 1.5 : 0.5;
}

function evalOpenApply(ctx, d) {
  const { task } = ctx;
  const text = (ctx.answer.text || '').trim();
  const lt = lite(text);
  const words = wordCount(text);
  let score = 0;
  const checks = [];
  const kw = task.keywords?.length ? groupScore(text, task.keywords).ratio : null;
  const need = task.min ?? 0.5;
  if (kw !== null) checks.push(kw >= need - 1e-9 && kw > 0);
  if (task.minWords) checks.push(words >= task.minWords);
  if (task.require?.length) checks.push(task.require.some((r) => new RegExp(r).test(lt)));
  if (task.numeric) {
    const nums = (lt.match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(',', '.')));
    const ok = nums.some((x) => Math.abs(x - task.numeric.expect) <= task.numeric.tol);
    d.numericOk = ok;
    d.signals.push(ok ? 'numeric_ok' : 'numeric_off');
    checks.push(ok);
  }
  const narrative = task.avoid?.some((r) => new RegExp(r).test(lt));
  if (narrative) {
    d.signals.push('narrative_instead_of_expository');
    d.avoidNote = task.avoidNote;
  }
  const passed = checks.filter(Boolean).length;
  const frac = checks.length ? passed / checks.length : 0;
  score = frac >= 1 ? 2 : frac >= 0.5 ? 1.5 : frac > 0 ? 1 : 0;
  if (narrative) score = Math.min(score, 1);
  if (score >= 2) {
    const nov = task.novelty ? noveltyRatio(text, ctx.source || '') : 0.5;
    const copy = ctx.source ? verbatimRatio(text, ctx.source) : 0;
    if (copy > 0.5) {
      d.signals.push('copied_from_text');
      score = 1.5;
    } else if (nov >= 0.35 || !task.novelty) score = 3;
  }
  d.checks = { kw, words, passed, total: checks.length };
  return score;
}

/**
 * ctx: { level, purpose, qType, answer:{text,choice,order}, points, concept, task, source, prev, helpLevel, priorComprehension }
 */
export function diagnose(ctx) {
  const answer = ctx.answer || {};
  const text = String(answer.text || '').trim();
  const lt = norm(text);
  const words = wordCount(text);
  const d = {
    purpose: ctx.purpose,
    qType: ctx.qType,
    answer: snippet(text || answer.choice || (answer.order || []).join('>')),
    words,
    outcome: 'incorrect',
    dims: { knowledge: null, comprehension: null, connection: null, application: null, recall: null },
    coverage: 0,
    coveredPointIds: [],
    missingPointIds: [],
    gainedPointIds: [],
    misconception: null,
    signals: [],
    unknownWords: [],
    confidence: 0.4,
    helpLevel: ctx.helpLevel || 0,
    overall: 0,
  };

  const isChoice = ctx.qType === 'choice' && ctx.task?.options;
  const isOrder = ctx.qType === 'order' && ctx.task?.correct;
  const isApply = ctx.purpose?.startsWith('apply') || ctx.purpose === 'exam-apply' || ctx.purpose === 'exam-transfer';
  const idk = IDK.test(lt) || (!isChoice && !isOrder && words === 0);
  if (idk) d.signals.push('idk');
  d.unknownWords = unknownWords(text);
  if (d.unknownWords.length) d.signals.push('unknown_word');

  // --- Cobertura de ideas esperadas ---
  const pts = ctx.points || [];
  if (!isChoice && !isOrder && !isApply) {
    const pc = pointCoverage(text, pts);
    d.coverage = pc.coverage;
    d.coveredPointIds = pc.covered;
    d.missingPointIds = pc.missing;
    d.partialPointIds = pc.partial;
    const before = new Set(ctx.prev?.coveredPointIds || []);
    d.gainedPointIds = ctx.prev ? pc.covered.filter((id) => !before.has(id)) : [];
  }

  // --- Error conceptual conocido ---
  if (!isChoice) d.misconception = detectMisconception(text, ctx.concept);

  // --- Evaluación según tipo ---
  let appScore = null;
  if (isChoice) appScore = evalChoice(ctx, d);
  else if (isOrder) appScore = evalOrder(ctx, d);
  else if (isApply) appScore = evalOpenApply(ctx, d);

  if (isChoice || isOrder || isApply) {
    d.dims.application = ctx.purpose === 'contrast' ? null : appScore;
    if (ctx.purpose === 'contrast') d.dims.comprehension = appScore;
    d.coverage = clamp(appScore / 3, 0, 1);
  } else {
    // Recitación: copia casi literal del texto (memorizar sin explicar).
    const ratio = ctx.source && words >= 8 && !['recall', 'prior'].includes(ctx.purpose) ? verbatimRatio(text, ctx.source) : 0;
    if (ratio >= 0.5) d.signals.push('recited');
    if (words > 0 && words < 4 && d.coverage < 0.7) d.signals.push('too_short');
    if (words >= 5 && d.coverage === 0 && !d.misconception && !idk) d.signals.push('off_topic');

    const k = toScore(d.coverage);
    d.dims.knowledge = d.misconception ? Math.min(k, 1) : k;
    let c = d.misconception ? Math.min(k, 1) : k;
    if (d.signals.includes('recited')) c = Math.min(c, 1.5);
    if (d.signals.includes('too_short')) c = Math.min(c, 2);
    d.dims.comprehension = idk ? 0 : c;
    if (ctx.purpose === 'recall') d.dims.recall = d.dims.knowledge;
    if (ctx.purpose === 'prior') d.dims.comprehension = null; // el diagnóstico inicial no evalúa comprensión del contenido
    const hasEx = EXAMPLE_MARKERS.test(lt);
    const hasWhy = WHY_MARKERS.test(lt);
    if ((hasEx || ctx.purpose === 'explain-example') && words >= 5) {
      const nov = ctx.source ? noveltyRatio(text, ctx.source) : 0.5;
      d.dims.connection = nov >= 0.4 && d.coverage > 0 ? 3 : d.coverage > 0 || hasEx ? 2 : 1;
      d.signals.push(hasEx ? 'gave_example' : 'example_requested');
    }
    if ((ctx.purpose === 'why' || hasWhy) && words >= 5) d.signals.push(hasWhy ? 'gave_reason' : 'no_reason');
  }

  // --- Resultado global ---
  const idkOnly = idk && words <= 6 && d.coverage < 0.3;
  const comp = d.dims.comprehension;
  const app = d.dims.application;
  if (idkOnly) d.outcome = 'no_knowledge';
  else if (d.misconception) d.outcome = 'confused';
  else if (isChoice || isOrder || isApply) {
    const s = appScore ?? 0;
    if (s >= 2.5) d.outcome = 'correct';
    else if (s >= 1.5) d.outcome = 'partial';
    else if (ctx.purpose === 'contrast') d.outcome = 'incorrect';
    else d.outcome = (ctx.priorComprehension ?? 0) >= 2 ? 'application_issue' : 'incorrect';
  } else if (d.signals.includes('recited')) d.outcome = 'comprehension_issue';
  else if (d.signals.includes('off_topic') && ctx.purpose !== 'prior') d.outcome = 'comprehension_issue';
  else if (d.coverage >= (ctx.purpose === 'reexplain' ? 0.5 : 0.7)) d.outcome = 'correct';
  else if (d.coverage > 0 && d.coverage < 0.7) d.outcome = d.coverage >= 0.3 ? 'partial' : 'partial';
  else d.outcome = words === 0 ? 'no_knowledge' : 'incorrect';

  // --- Ayuda recomendada ---
  d.recommendedHelp = recommend(d);

  // --- Confianza (probabilística): respuestas cortas o ambiguas dan menos certeza ---
  let conf = 0.45;
  if (d.misconception?.via === 'choice') conf += 0.2;
  else if (d.misconception) conf += 0.15;
  if (words < 4 && !isChoice && !isOrder) conf -= 0.15;
  if (words >= 12) conf += 0.1;
  if (isChoice && d.whyRatio !== null) conf += 0.1;
  if ((ctx.prev?.outcome || '') === d.outcome) conf += 0.1;
  d.confidence = clamp(Number(conf.toFixed(2)), 0.15, 0.9);

  const dimVals = Object.values(d.dims).filter((x) => x !== null);
  d.overall = dimVals.length ? dimVals.reduce((a, b) => a + b, 0) / dimVals.length : 0;
  const pen = 1 - 0.12 * Math.min(4, d.helpLevel || 0);
  d.overallWithHelp = Number((d.overall * pen).toFixed(2));

  describe(d, ctx);
  return d;
}

function recommend(d) {
  switch (d.outcome) {
    case 'confused':
      return 'compare';
    case 'no_knowledge':
      return 'example';
    case 'comprehension_issue':
      return d.signals.includes('recited') ? 'why' : 'reread';
    case 'application_issue':
      return 'steps';
    case 'partial':
      return 'hint';
    case 'incorrect':
      return d.signals.includes('choice_wrong') ? 'hint' : 'reread';
    default:
      return 'none';
  }
}

const OUTCOME_ES = {
  correct: 'correcta',
  partial: 'parcialmente correcta',
  incorrect: 'incorrecta',
  confused: 'indica un concepto confundido',
  no_knowledge: 'sin conocimiento previo evidente',
  comprehension_issue: 'posible problema de comprensión',
  application_issue: 'posible problema de aplicación',
};

/** Texto para el adulto: OBSERVACIÓN (hechos) separada de INTERPRETACIÓN (hipótesis). */
function describe(d, ctx) {
  const pts = ctx.points || [];
  const label = (id) => pts.find((p) => p.id === id)?.label || id;
  const obs = [];
  obs.push(`Respuesta: «${d.answer || '(vacía)'}»`);
  if (pts.length && !['choice', 'order'].includes(ctx.qType) && !ctx.purpose?.startsWith('apply')) {
    obs.push(`Mencionó ${d.coveredPointIds.length} de ${pts.length} ideas esperadas${d.coveredPointIds.length ? ` (${d.coveredPointIds.map(label).join('; ')})` : ''}.`);
    if (d.missingPointIds.length) obs.push(`No apareció: ${d.missingPointIds.map(label).join('; ')}.`);
  }
  if (d.signals.includes('recited')) obs.push('La redacción es casi idéntica a la del texto.');
  if (d.unknownWords.length) obs.push(`Dijo no conocer: ${d.unknownWords.join(', ')}.`);
  if (d.helpLevel) obs.push(`Usó ayuda hasta el nivel ${d.helpLevel}.`);
  d.observation = obs.join(' ');

  const intr = [];
  const conf = d.confidence < 0.45 ? 'con poca certeza' : 'con certeza moderada';
  if (d.misconception) intr.push(`Posible confusión: ${d.misconception.label} (${conf}; una sola evidencia, a verificar en otra actividad).`);
  else if (d.outcome === 'comprehension_issue' && d.signals.includes('recited')) intr.push('Posible repetición del texto sin evidencia de comprensión propia (a verificar pidiendo un ejemplo o un porqué).');
  else if (d.outcome === 'comprehension_issue') intr.push('Posible dificultad para comprender el fragmento o distracción (respuesta sin relación con el contenido).');
  else if (d.outcome === 'no_knowledge') intr.push('Aún no muestra conocimiento previo del tema; conviene partir de un ejemplo concreto.');
  else if (d.outcome === 'application_issue') intr.push('Puede que comprenda la idea pero todavía no la use en una situación nueva.');
  else if (d.outcome === 'partial') intr.push('Comprensión parcial: tiene una parte de la idea y falta otra.');
  else if (d.outcome === 'correct') intr.push('La respuesta muestra comprensión de la idea en este momento.');
  else intr.push('La respuesta no aporta evidencia suficiente para saber qué comprende.');
  d.interpretation = intr.join(' ');
  d.outcomeLabel = OUTCOME_ES[d.outcome];
}
