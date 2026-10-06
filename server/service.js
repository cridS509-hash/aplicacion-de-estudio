// Capa de servicio: orquesta motor pedagógico, perfil, revisión y persistencia.
// La interfaz HTTP (index.js) solo traduce peticiones a estas funciones.

import crypto from 'node:crypto';
import { newLearner, conceptReport, summarizeObservations, adaptation, addInterest, INTEREST_OPTIONS, conceptState, STATE_EMOJI, stateSummary, getConcept } from './engine/profile.js';
import { buildLesson, rechunk, previewLesson, lessonFromPack } from './engine/material.js';
import { diagnose } from './engine/diagnosis.js';
import * as P from './engine/pedagogy.js';
import * as X from './engine/exam.js';
import { dueConcepts, upcoming, daysUntil, DAY } from './engine/review.js';
import { SAMPLES, matchPack, getPack } from './packs/index.js';
import * as LLM from './engine/llm.js';
import { norm, wordCount } from './engine/text.js';

const MAX_MATERIAL = 60000;
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new HttpError(400, m);
const missing = (m) => new HttpError(404, m);

const uid = (p) => `${p}${crypto.randomBytes(5).toString('hex')}`;

export function createService(store, opts = {}) {
  const locks = new Map();
  const adultTokens = new Map();

  const db = () => store.db;
  const now = () => store.now();

  async function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    let release;
    const next = new Promise((r) => (release = r));
    locks.set(key, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(key) === next) locks.delete(key);
    }
  }

  const llmOn = async () => !!db().meta.settings.llmEnabled && (await LLM.llmAvailable());

  const diagnoser = async (ctx) => {
    const h = diagnose(ctx);
    if (await llmOn()) return LLM.refineDiagnosis(ctx, h);
    return h;
  };

  const env = () => ({ now: now(), getLesson: (id) => db().lessons[id], diagnose: diagnoser });

  function learnerOf(id) {
    const p = db().profiles[id];
    if (!p) throw missing('Perfil no encontrado.');
    return p;
  }
  function sessionOf(id, profileId) {
    const s = db().sessions[id];
    if (!s || (profileId && s.profileId !== profileId)) throw missing('Sesión no encontrada.');
    return s;
  }
  function persist() {
    store.save();
  }

  /* ------------------------------ perfiles ------------------------------ */

  function publicProfile(p) {
    return { id: p.id, name: p.name, level: p.level, ageBand: p.ageBand };
  }

  function listProfiles() {
    return Object.values(db().profiles).map(publicProfile);
  }

  function createProfile({ name, level = 'primary', ageBand = null }) {
    const n = String(name || '').trim().slice(0, 24);
    if (!n) throw bad('Escribe un nombre o apodo (no hace falta el nombre real).');
    if (!['primary', 'university'].includes(level)) throw bad('Nivel no válido.');
    const id = uid('p');
    db().profiles[id] = newLearner({ id, name: n, level, ageBand: ageBand ? String(ageBand).slice(0, 12) : null, createdAt: now() });
    persist();
    return publicProfile(db().profiles[id]);
  }

  function setInterests(profileId, interests) {
    const l = learnerOf(profileId);
    l.interests = [];
    for (const i of (interests || []).slice(0, 6)) addInterest(l, i);
    persist();
    return { interests: l.interests };
  }

  /* ------------------------------ inicio ------------------------------ */

  function home(profileId) {
    const l = learnerOf(profileId);
    const t = now();
    const due = dueConcepts(l, t, 6);
    const recs = Object.values(l.concepts).filter((r) => r.dims?.comprehension);
    const learning = recs
      .map((r) => ({ key: r.key, name: r.name, subject: r.subject, state: conceptState(r), emoji: STATE_EMOJI[conceptState(r)], summary: stateSummary(r, l.level), due: !!r.nextReviewAt && r.nextReviewAt <= t, daysUntil: r.nextReviewAt ? daysUntil(r.nextReviewAt, t) : null }))
      .sort((a, b) => Number(b.due) - Number(a.due) || { needs_work: 0, partial: 1, understood: 2, new: 3 }[a.state] - { needs_work: 0, partial: 1, understood: 2, new: 3 }[b.state])
      .slice(0, 4);
    const open = Object.values(db().sessions)
      .filter((s) => s.profileId === profileId && s.mode === 'study' && s.flow.stage !== 'done' && t - s.updatedAt < 2 * DAY)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const exams = Object.values(db().exams).filter((e) => e.profileId === profileId && e.examDate > t - DAY).map((e) => X.planView(e, t));
    return {
      profile: publicProfile(l),
      dueCount: due.length,
      learning,
      continueSession: open ? { id: open.id, title: db().lessons[open.lessonId]?.title || 'Tema' } : null,
      exams: exams.map((e) => ({ id: e.id, subject: e.subject, daysLeft: e.daysLeft })),
      hasHistory: recs.length > 0,
    };
  }

  /* ------------------------------ material ------------------------------ */

  function listSamples(level) {
    return SAMPLES.filter((s) => !level || s.level === level).map((s) => ({ id: s.id, title: s.title, subject: s.subject, level: s.level, words: wordCount(s.text), text: s.text }));
  }

  async function previewMaterial({ profileId, text, title, subject, sampleId, topic }) {
    const l = learnerOf(profileId);
    let raw = String(text || '').trim();
    let packId = null;
    if (sampleId) {
      const s = SAMPLES.find((x) => x.id === sampleId);
      if (!s) throw bad('Tema de muestra no encontrado.');
      raw = s.text;
      packId = s.packId;
    }
    if (!raw && topic) raw = String(topic).trim();
    if (!raw) throw bad('Escribe, pega o elige un material para empezar.');
    if (raw.length > MAX_MATERIAL) throw bad('El material es muy largo. Prueba con una parte (hasta unas 8 000 palabras).');
    const ad = adaptation(l);
    let lesson = null;
    const pack = packId ? getPack(packId) : matchPack(raw, { title, topic, level: l.level });
    if (!pack && wordCount(raw) >= 40 && (await llmOn())) {
      lesson = await LLM.analyzeMaterialLLM(raw, { level: l.level, subject, title, chunkWords: ad.chunkWords });
    }
    if (!lesson) {
      lesson = buildLesson(raw, { level: l.level, subject, title, chunkWords: ad.chunkWords, packId: packId || pack?.id, topic });
      if (lesson.source !== 'pack') rechunk(lesson, ad.chunkWords);
    }
    if (subject && lesson.subject === 'General') lesson.subject = String(subject).slice(0, 40);
    lesson.profileId = profileId;
    lesson.createdAt = now();
    db().lessons[lesson.id] = lesson;
    persist();
    return { lessonId: lesson.id, ...previewLesson(lesson), adaptation: { chunkWords: ad.chunkWords } };
  }

  function renameLesson(profileId, lessonId, title) {
    const lesson = db().lessons[lessonId];
    if (!lesson || lesson.profileId !== profileId) throw missing('Material no encontrado.');
    const t = String(title || '').trim().slice(0, 80);
    if (t) {
      lesson.title = t;
      if (lesson.concepts.length === 1 && lesson.concepts[0].generated) lesson.concepts[0].name = t;
    }
    persist();
    return { title: lesson.title };
  }

  async function transcribePhoto(profileId, dataUrl) {
    learnerOf(profileId);
    if (!(await llmOn())) throw new HttpError(501, 'Leer fotos necesita la IA externa, que un adulto debe activar. Por ahora puedes escribir o pegar el texto.');
    const text = await LLM.transcribeImage(dataUrl);
    if (!text) throw new HttpError(502, 'No pude leer la foto. Prueba con otra más clara o escribe el texto.');
    return { text };
  }

  /* ------------------------------ sesiones ------------------------------ */

  async function startStudy(profileId, lessonId) {
    const l = learnerOf(profileId);
    const lesson = db().lessons[lessonId];
    if (!lesson || lesson.profileId !== profileId) throw missing('Material no encontrado.');
    const session = P.createSession({ learner: l, lesson, now: now() });
    session.level = l.level;
    db().sessions[session.id] = session;
    l.sessions.push(session.id);
    const view = P.startSession(session, l, lesson, env());
    persist();
    return view;
  }

  async function getSession(profileId, sessionId) {
    const l = learnerOf(profileId);
    const s = sessionOf(sessionId, profileId);
    return P.view(s, l, env());
  }

  const examPlanOf = (s) => (s.exam ? db().exams[s.exam.planId] : null);

  async function answer(profileId, sessionId, payload) {
    return withLock(sessionId, async () => {
      const l = learnerOf(profileId);
      const s = sessionOf(sessionId, profileId);
      let r;
      if (s.mode === 'review') r = await P.submitReview(s, l, payload, env());
      else if (s.mode === 'exam') r = await X.submitExam(s, examPlanOf(s), l, payload, env());
      else r = await P.submitAnswer(s, l, payload, env());
      s.updatedAt = now();
      persist();
      if (r.ok === false) throw bad(r.error);
      return { view: r.view, debug: r.debug };
    });
  }

  async function help(profileId, sessionId, kind) {
    return withLock(sessionId, async () => {
      const l = learnerOf(profileId);
      const s = sessionOf(sessionId, profileId);
      const r = await P.requestHelp(s, l, kind, env());
      s.updatedAt = now();
      persist();
      return { ok: r.ok, message: r.message, view: r.view || P.view(s, l, env()) };
    });
  }

  async function advance(profileId, sessionId, action, payload = {}) {
    return withLock(sessionId, async () => {
      const l = learnerOf(profileId);
      const s = sessionOf(sessionId, profileId);
      const view = await P.advance(s, l, action, payload, env());
      s.updatedAt = now();
      persist();
      return { view };
    });
  }

  /* ------------------------------ repaso ------------------------------ */

  function reviewItems(l, conceptKeys) {
    const t = now();
    let recs;
    if (conceptKeys?.length) recs = conceptKeys.map((k) => l.concepts[k]).filter(Boolean);
    else {
      recs = dueConcepts(l, t, 4);
      if (!recs.length)
        recs = Object.values(l.concepts)
          .filter((r) => r.lessonId)
          .sort((a, b) => (a.lastReviewAt || a.lastSeen || 0) - (b.lastReviewAt || b.lastSeen || 0))
          .slice(0, 3);
    }
    return recs
      .filter((r) => r.lessonId && db().lessons[r.lessonId])
      .map((r) => ({ lessonId: r.lessonId, conceptId: r.conceptId, conceptKey: r.key }));
  }

  async function startReview(profileId, conceptKeys) {
    const l = learnerOf(profileId);
    const items = reviewItems(l, conceptKeys);
    if (!items.length) throw bad('Todavía no hay nada para repasar: primero estudia algún tema.');
    const session = P.createReviewSession({ learner: l, items, now: now() });
    db().sessions[session.id] = session;
    l.sessions.push(session.id);
    const view = P.startReview(session, l, env());
    persist();
    return view;
  }

  /* ------------------------------ mapa / adulto ------------------------------ */

  function knowledgeMap(profileId) {
    const l = learnerOf(profileId);
    const t = now();
    const bySubject = {};
    for (const r of Object.values(l.concepts)) {
      if (!r.dims?.comprehension && !r.dims?.application) continue;
      const rep = conceptReport(r, t, l.level);
      (bySubject[r.subject] ||= []).push({
        key: r.key,
        name: r.name,
        state: rep.state,
        emoji: rep.emoji,
        summary: rep.summary,
        canDo: rep.canDo,
        next: rep.practice[0] || null,
        reviewDue: rep.reviewDue,
        daysUntil: r.nextReviewAt ? daysUntil(r.nextReviewAt, t) : null,
        dims: rep.dims,
        confuses: rep.confuses,
        cannotYet: rep.cannotYet,
        helpThatWorked: rep.helpThatWorked,
        know: rep.know,
        understands: rep.understands,
      });
    }
    return { subjects: Object.entries(bySubject).map(([subject, concepts]) => ({ subject, concepts })) };
  }

  function adultReport(profileId) {
    const l = learnerOf(profileId);
    const t = now();
    const concepts = Object.values(l.concepts).map((r) => conceptReport(r, t, l.level)).sort((a, b) => ({ needs_work: 0, partial: 1, understood: 2, new: 3 }[a.state] - { needs_work: 0, partial: 1, understood: 2, new: 3 }[b.state]));
    const sessions = l.sessions
      .map((id) => db().sessions[id])
      .filter(Boolean)
      .map((s) => ({ id: s.id, mode: s.mode, title: s.summary?.title || db().lessons[s.lessonId]?.title || 'Sesión', at: s.createdAt, done: s.flow.stage === 'done', asks: s.events.filter((e) => e.type === 'answer' || e.type === 'review-answer' || e.type === 'exam-answer').length }))
      .sort((a, b) => b.at - a.at)
      .slice(0, 30);
    const ad = adaptation(l);
    return {
      child: { id: l.id, name: l.name, level: l.level, interests: l.interests, autonomy: l.autonomy, createdAt: l.createdAt, sessions: l.stats.sessions },
      mastered: concepts.filter((c) => c.state === 'understood').map((c) => c.name),
      partial: concepts.filter((c) => c.state === 'partial').map((c) => c.name),
      confusing: concepts.filter((c) => c.confuses.length).map((c) => ({ name: c.name, what: c.confuses })),
      needsWork: concepts.filter((c) => c.state === 'needs_work').map((c) => c.name),
      concepts,
      observations: summarizeObservations(l),
      adaptation: ad,
      upcoming: upcoming(l, t).slice(0, 8).map((r) => ({ name: r.name, inDays: daysUntil(r.nextReviewAt, t) })),
      sessions,
      exams: Object.values(db().exams).filter((e) => e.profileId === profileId).map((e) => X.planView(e, t)),
      settings: { readingPause: l.settings.readingPause },
    };
  }

  function sessionDetail(profileId, sessionId) {
    const s = sessionOf(sessionId, profileId);
    return {
      id: s.id,
      mode: s.mode,
      createdAt: s.createdAt,
      transcript: s.transcript,
      events: s.events.filter((e) => e.type === 'answer' || e.type === 'review-answer' || e.type === 'exam-answer' || e.type === 'help' || e.type === 'teach'),
      summary: s.summary,
    };
  }

  /* ------------------------------ examen ------------------------------ */

  async function createExam(profileId, { subject, topics, date, material, instructions, questionTypes }) {
    const l = learnerOf(profileId);
    const t = now();
    const sub = String(subject || '').trim().slice(0, 40);
    if (!sub) throw bad('Indica la materia del examen.');
    const exDate = new Date(date).getTime();
    if (!Number.isFinite(exDate)) throw bad('Indica la fecha del examen.');
    if (exDate < t - DAY) throw bad('La fecha del examen ya pasó.');
    let names = (Array.isArray(topics) ? topics : String(topics || '').split(/\n|,|;/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
    const mat = String(material || '').trim();
    let sharedLesson = null;
    if (mat) {
      if (mat.length > MAX_MATERIAL) throw bad('El material es muy largo.');
      sharedLesson = buildLesson(mat, { level: l.level, subject: sub, chunkWords: adaptation(l).chunkWords });
      if (sharedLesson.source !== 'pack') rechunk(sharedLesson, adaptation(l).chunkWords);
      sharedLesson.profileId = profileId;
      sharedLesson.createdAt = t;
      db().lessons[sharedLesson.id] = sharedLesson;
      if (!names.length) names = sharedLesson.concepts.map((c) => c.name);
    }
    if (!names.length) throw bad('Indica al menos un tema.');
    const resolved = names.map((name) => {
      const nn = norm(name);
      const rec = Object.values(l.concepts).find((r) => r.lessonId && db().lessons[r.lessonId] && (norm(r.name) === nn || norm(r.name).includes(nn) || nn.includes(norm(r.name))));
      if (rec) return { name, lessonId: rec.lessonId, conceptId: rec.conceptId };
      if (sharedLesson) {
        const c = sharedLesson.concepts.find((x) => norm(x.name).includes(nn) || nn.includes(norm(x.name))) || (sharedLesson.concepts.length === 1 ? sharedLesson.concepts[0] : null);
        if (c) return { name, lessonId: sharedLesson.id, conceptId: c.id };
      }
      const pack = matchPack(name, { topic: name, level: l.level, minScore: 1 });
      if (pack) {
        const lesson = lessonFromPack(pack);
        lesson.profileId = profileId;
        lesson.createdAt = t;
        db().lessons[lesson.id] = lesson;
        return { name, lessonId: lesson.id, conceptId: lesson.concepts[0].id };
      }
      if (sharedLesson) return { name, lessonId: sharedLesson.id, conceptId: sharedLesson.concepts[0].id };
      return { name, lessonId: null, conceptId: null };
    });
    const plan = X.buildExamPlan({
      id: X.planId(), learner: l, subject: sub, topics: resolved, examDate: exDate, instructions,
      questionTypes: (Array.isArray(questionTypes) ? questionTypes : String(questionTypes || '').split(/,|;|\n/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 6), now: t,
    });
    db().exams[plan.id] = plan;
    l.exams.push(plan.id);
    persist();
    return X.planView(plan, t);
  }

  function getExam(profileId, examId) {
    const plan = db().exams[examId];
    if (!plan || plan.profileId !== profileId) throw missing('Plan no encontrado.');
    return X.planView(plan, now());
  }

  async function startExamSession(profileId, examId, mode) {
    const l = learnerOf(profileId);
    const plan = db().exams[examId];
    if (!plan || plan.profileId !== profileId) throw missing('Plan no encontrado.');
    const m = plan.topics.every((tp) => tp.diagnosed) ? 'practice' : mode === 'practice' && plan.topics.some((tp) => tp.diagnosed) ? 'practice' : 'diagnostic';
    const session = X.createExamSession({ plan, learner: l, now: now(), mode: m });
    db().sessions[session.id] = session;
    l.sessions.push(session.id);
    plan.sessions.push(session.id);
    const view = X.startExamSession(session, plan, l, env());
    persist();
    return view;
  }

  /* ------------------------------ adulto: PIN y controles ------------------------------ */

  function hashPin(pin, salt) {
    return crypto.scryptSync(String(pin), salt, 32).toString('hex');
  }
  function adultStatus() {
    return { pinSet: !!db().meta.adult, llm: { available: false, enabled: !!db().meta.settings.llmEnabled } };
  }
  async function adultStatusFull() {
    return { pinSet: !!db().meta.adult, llm: { available: await LLM.llmAvailable(), enabled: !!db().meta.settings.llmEnabled, model: LLM.DEFAULT_MODEL }, clockOffsetDays: db().meta.clockOffsetDays || 0 };
  }
  function issueToken() {
    const tok = crypto.randomBytes(24).toString('hex');
    adultTokens.set(tok, Date.now() + 30 * 60000);
    return tok;
  }
  function setupPin(pin) {
    if (db().meta.adult) throw new HttpError(409, 'Ya hay un PIN. Para cambiarlo, desbloquea primero la zona adulta.');
    if (!/^\d{4,8}$/.test(String(pin))) throw bad('El PIN debe tener de 4 a 8 números.');
    const salt = crypto.randomBytes(16).toString('hex');
    db().meta.adult = { salt, hash: hashPin(pin, salt) };
    persist();
    return { token: issueToken() };
  }
  const attempts = { n: 0, until: 0 };
  function unlock(pin) {
    const a = db().meta.adult;
    if (!a) throw new HttpError(409, 'Primero crea un PIN.');
    if (Date.now() < attempts.until) throw new HttpError(429, 'Demasiados intentos. Espera un momento.');
    const ok = crypto.timingSafeEqual(Buffer.from(hashPin(pin, a.salt), 'hex'), Buffer.from(a.hash, 'hex'));
    if (!ok) {
      if (++attempts.n >= 5) {
        attempts.n = 0;
        attempts.until = Date.now() + 30000;
      }
      throw new HttpError(401, 'PIN incorrecto.');
    }
    attempts.n = 0;
    return { token: issueToken() };
  }
  function requireAdult(token) {
    const exp = adultTokens.get(token);
    if (!exp || exp < Date.now()) {
      adultTokens.delete(token);
      throw new HttpError(401, 'Zona para adultos: introduce el PIN.');
    }
    adultTokens.set(token, Date.now() + 30 * 60000);
  }
  function changePin(pin) {
    if (!/^\d{4,8}$/.test(String(pin))) throw bad('El PIN debe tener de 4 a 8 números.');
    const salt = crypto.randomBytes(16).toString('hex');
    db().meta.adult = { salt, hash: hashPin(pin, salt) };
    persist();
    return { ok: true };
  }
  function setSettings(profileId, { llmEnabled, readingPause, clockOffsetDays }) {
    if (typeof llmEnabled === 'boolean') db().meta.settings.llmEnabled = llmEnabled;
    if (profileId && typeof readingPause === 'boolean') learnerOf(profileId).settings.readingPause = readingPause;
    if (Number.isFinite(clockOffsetDays)) db().meta.clockOffsetDays = Math.max(0, Math.min(365, Math.round(clockOffsetDays)));
    persist();
    return { ok: true };
  }
  function exportProfile(profileId) {
    const l = learnerOf(profileId);
    return {
      exportedAt: new Date(now()).toISOString(),
      profile: l,
      sessions: l.sessions.map((id) => db().sessions[id]).filter(Boolean),
      lessons: Object.values(db().lessons).filter((x) => x.profileId === profileId),
      exams: Object.values(db().exams).filter((x) => x.profileId === profileId),
    };
  }
  function deleteProfile(profileId) {
    const l = learnerOf(profileId);
    for (const id of l.sessions) delete db().sessions[id];
    for (const [id, les] of Object.entries(db().lessons)) if (les.profileId === profileId) delete db().lessons[id];
    for (const [id, e] of Object.entries(db().exams)) if (e.profileId === profileId) delete db().exams[id];
    delete db().profiles[profileId];
    persist();
    return { ok: true };
  }
  function deleteSession(profileId, sessionId) {
    const l = learnerOf(profileId);
    sessionOf(sessionId, profileId);
    delete db().sessions[sessionId];
    l.sessions = l.sessions.filter((x) => x !== sessionId);
    persist();
    return { ok: true };
  }
  function resetLearning(profileId) {
    const l = learnerOf(profileId);
    l.concepts = {};
    l.observations = {};
    l.stats = { sessions: 0, asks: 0, helpRequests: 0, chunkObs: [] };
    l.autonomy = 0;
    l.autonomyStreak = 0;
    for (const id of l.sessions) delete db().sessions[id];
    l.sessions = [];
    persist();
    return { ok: true };
  }

  return {
    store, listProfiles, createProfile, setInterests, home, listSamples, previewMaterial, renameLesson, transcribePhoto,
    startStudy, getSession, answer, help, advance, startReview, knowledgeMap, adultReport, sessionDetail,
    createExam, getExam, startExamSession, adultStatus, adultStatusFull, setupPin, unlock, requireAdult, changePin, setSettings,
    exportProfile, deleteProfile, deleteSession, resetLearning, INTEREST_OPTIONS,
  };
}
