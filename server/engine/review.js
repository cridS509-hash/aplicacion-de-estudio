// Motor de revisión: programa la recuperación futura (repetición espaciada con 6 niveles).
// El resultado de cada repaso decide el siguiente intervalo; si el niño no puede recordar,
// el concepto vuelve a un intervalo corto en lugar de "darse por aprendido".

export const DAY = 86400000;
export const INTERVALS = [1, 3, 7, 14, 30, 60];

export function scheduleAfterStudy(rec, now) {
  rec.box = 0;
  rec.lastReviewAt = null;
  rec.nextReviewAt = now + DAY; // "¿Te acuerdas de qué hablábamos ayer?"
  rec.reviewPending = true;
  return rec;
}

/** score 0..3 (cobertura de lo recordado sin ayuda), helpLevel 0..4. */
export function applyReview(rec, now, score, helpLevel = 0, factor = 1) {
  const eff = score * (1 - 0.12 * Math.min(4, helpLevel));
  let kind;
  if (eff >= 2.4) {
    rec.box = Math.min((rec.box ?? 0) + 1, INTERVALS.length - 1);
    kind = 'strong';
  } else if (eff >= 1.4) {
    kind = 'partial';
  } else {
    rec.box = 0;
    kind = 'weak';
  }
  const base = INTERVALS[rec.box ?? 0];
  const days = Math.max(1, Math.round((kind === 'partial' ? base * 0.5 : base) * factor));
  rec.lastReviewAt = now;
  rec.nextReviewAt = now + days * DAY;
  rec.reviewPending = false;
  (rec.reviewHistory ||= []).push({ at: now, score: Number(eff.toFixed(2)), kind, days });
  if (rec.reviewHistory.length > 20) rec.reviewHistory.shift();
  return { kind, days, eff };
}

export function isDue(rec, now) {
  return !!rec.nextReviewAt && rec.nextReviewAt <= now;
}

/** Conceptos que toca repasar, los más atrasados y débiles primero. */
export function dueConcepts(learner, now, limit = 4) {
  return Object.values(learner.concepts || {})
    .filter((r) => isDue(r, now))
    .map((r) => ({ r, overdue: (now - r.nextReviewAt) / DAY, weak: 3 - (r.dims?.comprehension?.score ?? 1.5) }))
    .sort((a, b) => b.overdue + b.weak - (a.overdue + a.weak))
    .slice(0, limit)
    .map((x) => x.r);
}

export function upcoming(learner, now) {
  return Object.values(learner.concepts || {})
    .filter((r) => r.nextReviewAt && r.nextReviewAt > now)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}

export function daysUntil(ts, now) {
  return Math.ceil((ts - now) / DAY);
}
