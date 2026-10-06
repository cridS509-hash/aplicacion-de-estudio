// Utilidades de texto en español: normalización, coincidencia por prefijos y
// medidas simples de solapamiento. Sin dependencias.

const STOP = new Set(
  `a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bien cada como con contra cual cuales
cuando de del desde donde el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estan estar este
esto estos fue fueron ha han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos o otra otras otro otros
para pero poco por porque pues que quien se sea ser si sin sobre son su sus tambien tan tanto te tiene tienen todo todos tu
tus un una unas uno unos y ya yo han hace hacen puede pueden ademas asi esta estan ese esa
todavia alli ahi varios varias cientos llamada llamado muchas durante segun hacia entonces luego despues menos mismo misma cada parte partes tipo`.split(/\s+/),
);

export function norm(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s) {
  const n = norm(s);
  return n ? n.split(' ') : [];
}

export const isStop = (t) => STOP.has(t);

export function stem(t) {
  let x = t;
  if (x.length > 5 && x.endsWith('es')) x = x.slice(0, -2);
  else if (x.length > 3 && x.endsWith('s')) x = x.slice(0, -1);
  return x.length > 5 ? x.slice(0, 5) : x;
}

export function wordCount(s) {
  return tokens(s).length;
}

/** ¿Coincide una alternativa (prefijo de palabra o frase) con el texto? */
export function altMatches(toks, normText, alt) {
  const a = norm(alt);
  if (!a) return false;
  if (a.includes(' ')) return (' ' + normText).includes(' ' + a);
  if (a.length <= 3) return toks.includes(a);
  return toks.some((t) => t.startsWith(a));
}

/** groups: [[alt, alt], [alt]] → proporción de grupos con al menos una coincidencia. */
export function groupScore(text, groups) {
  if (!groups?.length) return { ratio: 0, hits: [], total: 0 };
  const n = norm(text);
  const toks = n.split(' ').filter(Boolean);
  const hits = [];
  groups.forEach((g, i) => {
    if (g.some((alt) => altMatches(toks, n, alt))) hits.push(i);
  });
  return { ratio: hits.length / groups.length, hits, total: groups.length };
}

/** Fracción de 4-gramas de la respuesta que aparecen literalmente en la fuente. */
export function verbatimRatio(answer, source, n = 4) {
  const a = tokens(answer);
  const s = tokens(source);
  if (a.length < n + 1 || s.length < n) return 0;
  const set = new Set();
  for (let i = 0; i + n <= s.length; i++) set.add(s.slice(i, i + n).join(' '));
  let hit = 0;
  let tot = 0;
  for (let i = 0; i + n <= a.length; i++) {
    tot++;
    if (set.has(a.slice(i, i + n).join(' '))) hit++;
  }
  return tot ? hit / tot : 0;
}

/** Fracción de palabras con contenido de la respuesta que NO aparecen en la fuente. */
export function noveltyRatio(answer, source) {
  const a = tokens(answer).filter((t) => !isStop(t) && t.length > 2);
  if (!a.length) return 0;
  const src = new Set(tokens(source).map(stem));
  return a.filter((t) => !src.has(stem(t))).length / a.length;
}

export function sentences(text) {
  return String(text)
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => wordCount(s) >= 4);
}

/** Términos más frecuentes (con su forma original). */
export function keyTerms(text, k = 8) {
  const raw = String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const map = new Map();
  for (const w of raw) {
    const n = norm(w);
    if (n.length < 4 || isStop(n) || /^\d+$/.test(n)) continue;
    const key = stem(n);
    const e = map.get(key) || { stem: key, count: 0, forms: new Map() };
    e.count++;
    e.forms.set(w, (e.forms.get(w) || 0) + 1);
    map.set(key, e);
  }
  return [...map.values()]
    .map((e) => ({
      stem: e.stem,
      count: e.count,
      surface: [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => b.count - a.count || b.surface.length - a.surface.length)
    .slice(0, k);
}

export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Hash estable para elegir variantes sin aleatoriedad (motor determinista). */
export function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Busca un patrón en texto normalizado ignorando coincidencias negadas ("no sirve para…"). */
export function matchesAffirmed(normText, regexSource) {
  const re = new RegExp(regexSource, 'g');
  let m;
  while ((m = re.exec(normText))) {
    const before = normText.slice(Math.max(0, m.index - 24), m.index);
    if (!/\b(no|nunca|tampoco|ni)\s+(\w+\s+){0,2}$/.test(before + ' ')) return true;
  }
  return false;
}
