import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm } from '../engine/text.js';
import textoExpositivo from './texto-expositivo.js';
import fracciones from './fracciones.js';
import rotacion from './rotacion-traslacion.js';
import valorP from './valor-p.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PACKS = [textoExpositivo, fracciones, rotacion, valorP];

/** Texto del material curado como texto corrido (para mostrarlo/pegarlo como muestra). */
export function packText(pack) {
  return pack.concepts
    .flatMap((c) => c.chunks.map((ch) => ch.text.replace(/\*\*/g, '').replace(/\*/g, '')))
    .join('\n\n');
}

export const SAMPLES = [
  ...PACKS.map((p) => ({
    id: p.id,
    title: p.title,
    subject: p.subject,
    level: p.level,
    packId: p.id,
    text: packText(p),
  })),
  {
    id: 'ciudad-blanca',
    title: 'Ciudad Blanca',
    subject: 'Estudios Sociales',
    level: 'primary',
    packId: null,
    text: fs.readFileSync(path.join(here, 'ciudad-blanca.txt'), 'utf8').trim(),
  },
];

/** Busca un paquete curado cuyo tema coincida con el material o con el tema pedido. */
export function matchPack(text, { title = '', topic = '', level, minScore } = {}) {
  const hay = norm(`${title} ${topic}`);
  const body = norm(text).slice(0, 6000);
  const short = body.split(' ').length < 12;
  const need = minScore ?? (short ? 1 : 2);
  let best = null;
  for (const p of PACKS) {
    if (level && p.level !== level) continue;
    let score = 0;
    let occ = 0;
    for (const m of p.match) {
      const nm = norm(m);
      if (hay.includes(nm)) score += 3;
      occ += body.split(nm).length - 1;
    }
    score += Math.min(3, occ);
    if (score >= need && (!best || score > best.score)) best = { pack: p, score };
  }
  return best?.pack || null;
}

export const getPack = (id) => PACKS.find((p) => p.id === id) || null;
