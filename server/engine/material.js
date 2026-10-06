// Material → lección. Detecta el tema, divide en fragmentos, extrae ideas clave y, si existe un
// paquete curado para el tema, lo usa para enriquecer (errores conceptuales, tareas de aplicación…).
// Es la parte "heurística" del MVP: con un LLM conectado (llm.js) se reemplaza por un análisis real.

import { PACKS, matchPack, getPack, packText } from '../packs/index.js';
import { norm, tokens, stem, isStop, sentences, keyTerms, wordCount, capitalize, hash } from './text.js';

export const DEFAULT_CHUNK_WORDS = { primary: 90, university: 170 };

let seq = 0;
const uid = (p) => `${p}${++seq}${hash(String(seq) + p).toString(36).slice(0, 3)}`;

function splitTitle(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const first = lines.findIndex((l) => l.trim());
  if (first === -1) return { title: '', body: '' };
  const l = lines[first].trim();
  const rest = lines.slice(first + 1).join('\n').trim();
  if (/^#{1,3}\s+/.test(l)) return { title: l.replace(/^#+\s+/, ''), body: rest };
  if (l.length <= 70 && !/[.!?:;,]$/.test(l) && rest && wordCount(l) <= 9) return { title: l, body: rest };
  return { title: '', body: text.trim() };
}

function splitSections(body) {
  // Secciones por encabezados markdown o líneas cortas sin puntuación final seguidas de texto.
  const lines = body.replace(/\r/g, '').split('\n');
  const sections = [];
  let cur = { heading: '', paras: [] };
  let buf = [];
  const flush = () => {
    if (buf.length) cur.paras.push(buf.join(' ').trim());
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i + 1 < lines.length && !lines[i + 1].trim();
    const isHead =
      /^#{1,3}\s+/.test(l) ||
      (l && l.length <= 60 && !/[.!?:;,]$/.test(l) && wordCount(l) <= 8 && prevBlank && nextBlank && i + 2 < lines.length);
    if (isHead) {
      flush();
      if (cur.paras.length || cur.heading) sections.push(cur);
      cur = { heading: l.replace(/^#+\s+/, ''), paras: [] };
    } else if (!l) {
      flush();
    } else {
      buf.push(l);
    }
  }
  flush();
  if (cur.paras.length || cur.heading) sections.push(cur);
  return sections.filter((s) => s.paras.length);
}

/** Agrupa párrafos hasta ~target palabras; divide párrafos muy largos por frases. */
export function chunkParagraphs(paras, target) {
  const units = [];
  for (const p of paras) {
    if (wordCount(p) > target * 1.6) {
      const ss = p.split(/(?<=[.!?…])\s+/);
      let acc = [];
      let n = 0;
      for (const s of ss) {
        acc.push(s);
        n += wordCount(s);
        if (n >= target * 0.8) {
          units.push(acc.join(' '));
          acc = [];
          n = 0;
        }
      }
      if (acc.length) units.push(acc.join(' '));
    } else units.push(p);
  }
  const chunks = [];
  let cur = [];
  let n = 0;
  for (const u of units) {
    const w = wordCount(u);
    if (cur.length && n + w > target * 1.25) {
      chunks.push(cur.join('\n\n'));
      cur = [];
      n = 0;
    }
    cur.push(u);
    n += w;
  }
  if (cur.length) chunks.push(cur.join('\n\n'));
  return chunks;
}

function _unusedShortLabel(sentence, termMap) {
  const toks = sentence
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((w) => !isStop(norm(w)) && norm(w).length > 3) || [];
  const uniq = [...new Set(toks)].sort((a, b) => (termMap.get(stem(norm(b))) || 0) - (termMap.get(stem(norm(a))) || 0));
  return uniq.slice(0, 3).join(', ');
}

/** Ideas clave de un fragmento: las frases con más términos importantes del documento. */
function pointsForChunk(chunkText, docTerms, level, chunkId) {
  const ss = sentences(chunkText);
  if (!ss.length) return [];
  const scored = ss.map((s, i) => {
    const toks = tokens(s).filter((t) => !isStop(t) && t.length > 3);
    const score = toks.reduce((a, t) => a + (docTerms.get(stem(t)) || 0), 0) / Math.sqrt(toks.length + 1);
    return { s, i, score };
  });
  const k = Math.max(1, Math.min(3, Math.ceil(ss.length / 3)));
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, k).sort((a, b) => a.i - b.i);
  return top.map((t, idx) => {
    const rawOrig = t.s.match(/[\p{L}\p{N}]+/gu) || [];
    const weight = (w, i) => (docTerms.get(stem(norm(w))) || 0) + (i > 0 && /^\p{Lu}/u.test(w) ? 3 : 0);
    const content = [...new Map(rawOrig.map((w, i) => [w, i]).filter(([w]) => !isStop(norm(w)) && norm(w).length > 3).map(([w, i]) => [stem(norm(w)), { w: w.toLowerCase(), wt: weight(w, i) }])).values()];
    const ranked = content.sort((a, b) => b.wt - a.wt || b.w.length - a.w.length).slice(0, 5).map((x) => x.w);
    const label = ranked.slice(0, 3).join(', ') || 'esta idea';
    const k1 = ranked[0] || label;
    const k2 = ranked[1];
    const blank = t.s.replace(new RegExp(k1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____');
    return {
      id: `${chunkId}-p${idx + 1}`,
      weight: 1,
      label,
      statement: t.s,
      keywords: ranked.map((w) => [norm(w).slice(0, Math.max(4, Math.min(norm(w).length, 6)))]),
      min: 0.4,
      generated: true,
      hint: `Vuelve al fragmento y busca la parte donde aparece «${k1}»${k2 ? ` y «${k2}»` : ''}. ¿Qué dice sobre eso?`,
      example: `Completa la idea del texto: «${blank}»`,
      probe: `Todavía falta una parte: ¿qué dice el texto sobre «${k1}»${k2 ? ` y «${k2}»` : ''}?`,
    };
  });
}

function genericApplyTasks(name, terms, level) {
  const t = terms.slice(0, 4).map((x) => x.surface);
  const groupA = t.length ? [t.map((w) => norm(w).slice(0, 5))] : [];
  const prefix = level === 'university' ? 'Aplica lo estudiado:' : '';
  return [
    {
      id: 'gen-a1',
      level: 1,
      kind: 'open',
      prompt: `${prefix} Inventa un ejemplo nuevo sobre «${name}» que NO esté en el texto. Explica por qué es un buen ejemplo.`.trim(),
      keywords: groupA,
      minWords: 10,
      novelty: true,
      generated: true,
      help: {
        hint: 'Piensa en una situación de tu vida diaria donde aparezca esta idea. ¿Qué parte del texto se cumple en tu ejemplo?',
        example: 'Un buen ejemplo cumple las ideas del texto pero cuenta una situación distinta. Por ejemplo, cambia el lugar o los personajes.',
      },
    },
    {
      id: 'gen-a2',
      level: 2,
      kind: 'open',
      prompt:
        level === 'university'
          ? `Plantea un caso en el que lo estudiado sobre «${name}» NO se cumpla o deje de aplicarse, y explica por qué (condiciones o límites).`
          : `¿Qué pasaría si cambiáramos una parte importante de lo que dice el texto sobre «${name}»? Elige una parte y explica qué cambiaría y por qué.`,
      keywords: groupA,
      minWords: 12,
      novelty: true,
      generated: true,
      help: {
        hint: 'Elige una sola idea del texto y piensa: si fuera al revés, ¿qué consecuencia tendría?',
        example: 'Por ejemplo: si en un texto sobre ríos el agua no se moviera, ¿qué pasaría con los peces?',
      },
    },
  ];
}

function priorQuestions(name, words, level, title) {
  const base = [
    level === 'university'
      ? `Antes de empezar: ¿qué entiendes hoy por «${name}»? Escribe lo que sepas o intuyas, sin buscar nada.`
      : `Antes de leer, quiero saber qué sabes tú. ¿Qué crees que es «${name}»?`,
    level === 'university'
      ? `¿Qué problema crees que intenta resolver «${name}» y dónde lo has visto aplicado?`
      : `¿Has visto o escuchado algo parecido a «${name}» antes? Cuéntame lo que recuerdes.`,
    level === 'university'
      ? `¿Con qué otros conceptos que ya conoces crees que se relaciona «${name}»?`
      : `Si tuvieras que adivinar, ¿qué crees que vamos a aprender en este tema?`,
  ];
  const n = level === 'university' ? 3 : words < 250 ? 2 : 3;
  return base.slice(0, n);
}

function conceptFromSection({ name, paras, level, chunkWords, docTerms, sectionIdx }) {
  const chunkTexts = chunkParagraphs(paras, chunkWords);
  const text = paras.join('\n\n');
  const terms = keyTerms(text, 8);
  const chunks = chunkTexts.map((ct, i) => {
    const id = `c${sectionIdx}k${i + 1}`;
    return { id, title: chunkTexts.length > 1 ? `Parte ${i + 1} de ${chunkTexts.length}` : 'Lee con atención', text: ct, points: pointsForChunk(ct, docTerms, level, id) };
  });
  return {
    id: `con-${sectionIdx}-${hash(name).toString(36)}`,
    name,
    summary: sentences(text)[0] || name,
    prior: priorQuestions(name, wordCount(text), level),
    analogies: {},
    vocabulary: [],
    chunks,
    misconceptions: [],
    applyTasks: genericApplyTasks(name, terms, level),
    terms: terms.map((t) => t.surface),
    generated: true,
  };
}

/** Detecta candidatas a palabras difíciles (largas y poco frecuentes). */
export function hardWords(text, max = 5) {
  const raw = text.match(/[\p{L}]{9,}/gu) || [];
  return [...new Set(raw.map((w) => w.toLowerCase()))].slice(0, max);
}

function enrich(concept, packConcept) {
  concept.misconceptions = packConcept.misconceptions || [];
  concept.applyTasks = packConcept.applyTasks?.length ? packConcept.applyTasks : concept.applyTasks;
  concept.analogies = packConcept.analogies || {};
  concept.vocabulary = packConcept.vocabulary || [];
  concept.prior = packConcept.prior || concept.prior;
  concept.uni = packConcept.uni;
  concept.summary = packConcept.summary || concept.summary;
  concept.packConceptId = packConcept.id;
  concept.coreStatements = packConcept.chunks.flatMap((c) => c.points.map((p) => p.statement));
  concept.corePoints = packConcept.chunks.flatMap((c) => c.points);
  return concept;
}

/**
 * Crea una lección a partir de texto libre.
 * opts: { title, subject, level, chunkWords, packId, topic }
 */
export function buildLesson(text, opts = {}) {
  const level = opts.level || 'primary';
  const chunkWords = opts.chunkWords || DEFAULT_CHUNK_WORDS[level];
  const clean = String(text || '').trim();
  if (!clean) throw new Error('El material está vacío.');

  // 1) Paquete curado pedido explícitamente (muestra) → se usa tal cual, con su lectura curada.
  const requestedPack = opts.packId ? getPack(opts.packId) : null;
  if (requestedPack && norm(clean) === norm(packText(requestedPack))) return lessonFromPack(requestedPack);

  // 2) Texto libre.
  const { title: detectedTitle, body } = splitTitle(clean);
  const title = opts.title || detectedTitle;
  const pack = requestedPack || matchPack(clean, { title, topic: opts.topic, level });

  // Texto breve que solo nombra un tema ("fracciones", "el texto expositivo"): lección curada.
  if (pack && wordCount(clean) < 12) return lessonFromPack(pack);

  const sections = splitSections(body || clean);
  const docTerms = new Map(keyTerms(body || clean, 40).map((t) => [t.stem, t.count]));
  const useSections = sections.length >= 2 && sections.length <= 6 && sections.every((s) => s.heading);
  let concepts;
  if (useSections) {
    concepts = sections.map((s, i) =>
      conceptFromSection({ name: s.heading, paras: s.paras, level, chunkWords, docTerms, sectionIdx: i + 1 }),
    );
  } else {
    const paras = (body || clean).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const top = keyTerms(body || clean, 3);
    const name = pack ? pack.concepts[0].name : title || capitalize(top.slice(0, 2).map((t) => t.surface).join(' y ')) || 'Tema del material';
    concepts = [conceptFromSection({ name, paras, level, chunkWords, docTerms, sectionIdx: 1 })];
  }
  if (pack) {
    concepts.forEach((c, i) => {
      const pc = pack.concepts[i] || (i === 0 ? pack.concepts[0] : null);
      if (pc) enrich(c, pc);
    });
  }
  const topicName = title || concepts[0].name;
  return {
    id: uid('les'),
    title: topicName,
    subject: opts.subject || pack?.subject || 'General',
    level,
    source: pack ? 'pack+heuristic' : 'heuristic',
    packId: pack?.id || null,
    concepts,
    sourceText: clean,
    notes: pack
      ? ['Tu material coincide con un tema que el tutor conoce: usa sus errores típicos y actividades preparadas.']
      : ['Análisis básico del material (sin IA externa): ideas clave y preguntas generadas a partir del propio texto.'],
  };
}

export function lessonFromPack(pack) {
  const concepts = pack.concepts.map((c, i) => ({
    ...structuredClone(c),
    id: c.id,
    packConceptId: c.id,
    terms: [],
    coreStatements: c.chunks.flatMap((ch) => ch.points.map((p) => p.statement)),
    corePoints: c.chunks.flatMap((ch) => ch.points),
  }));
  return {
    id: uid('les'),
    title: pack.title,
    subject: pack.subject,
    level: pack.level,
    source: 'pack',
    packId: pack.id,
    concepts,
    sourceText: packText(pack),
    notes: [],
  };
}

/** Adapta la lección ya creada a las palancas del perfil (tamaño de fragmento, etc.). */
export function rechunk(lesson, chunkWords) {
  if (lesson.source === 'pack') return lesson;
  const docTerms = new Map(keyTerms(lesson.sourceText, 40).map((t) => [t.stem, t.count]));
  lesson.concepts.forEach((c, ci) => {
    const paras = c.chunks.flatMap((ch) => ch.text.split('\n\n'));
    const texts = chunkParagraphs(paras, chunkWords);
    c.chunks = texts.map((ct, i) => {
      const id = `c${ci + 1}k${i + 1}`;
      return { id, title: texts.length > 1 ? `Parte ${i + 1} de ${texts.length}` : 'Lee con atención', text: ct, points: pointsForChunk(ct, docTerms, lesson.level, id) };
    });
  });
  return lesson;
}

export function previewLesson(lesson) {
  return {
    title: lesson.title,
    subject: lesson.subject,
    level: lesson.level,
    source: lesson.source,
    notes: lesson.notes,
    concepts: lesson.concepts.map((c) => ({ id: c.id, name: c.name, chunks: c.chunks.length })),
    words: wordCount(lesson.sourceText),
  };
}

export { PACKS };
