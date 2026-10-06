// Ilustraciones esquemáticas (SVG propio, sin recursos externos) que acompañan conceptos abstractos.
// En el MVP son una representación simulada de "imágenes relevantes": con material propio o IA conectada
// se podrían generar o recuperar imágenes reales.
import { svg, h } from './ui.js';

function pizza(n, take, size = 140) {
  const r = size / 2 - 6;
  const c = size / 2;
  const g = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `Pizza dividida en ${n} partes iguales; se toman ${take}` });
  g.append(svg('circle', { cx: c, cy: c, r, fill: 'var(--pizza-base)', stroke: 'var(--pizza-line)', 'stroke-width': 3 }));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const x0 = c + r * Math.cos(a0);
    const y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1);
    const y1 = c + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = n === 1 ? '' : `M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    if (i < take && d) g.append(svg('path', { d, fill: 'var(--pizza-take)', stroke: 'var(--pizza-line)', 'stroke-width': 2 }));
    else if (d) g.append(svg('path', { d, fill: 'none', stroke: 'var(--pizza-line)', 'stroke-width': 2 }));
  }
  if (n === 1) g.append(svg('circle', { cx: c, cy: c, r, fill: 'var(--pizza-take)' }));
  return g;
}

function earthRotation() {
  const g = svg('svg', { viewBox: '0 0 300 150', width: 300, height: 150, role: 'img', 'aria-label': 'La Tierra gira sobre su eje frente al Sol: una mitad con día y otra con noche' });
  g.append(svg('circle', { cx: 40, cy: 75, r: 28, fill: 'var(--sun)' }));
  for (const a of [-30, 0, 30]) g.append(svg('line', { x1: 78, y1: 75 + a * 0.4, x2: 150, y2: 75 + a * 0.9, stroke: 'var(--sun)', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  g.append(svg('circle', { cx: 210, cy: 75, r: 48, fill: 'var(--earth-night)' }));
  g.append(svg('path', { d: 'M 210 27 A 48 48 0 0 0 210 123 Z', fill: 'var(--earth-day)' }));
  const t1 = svg('text', { x: 190, y: 146, 'font-size': 12, fill: 'var(--ink-soft)', 'text-anchor': 'middle' });
  t1.textContent = 'día';
  g.append(t1);
  const t2 = svg('text', { x: 240, y: 148, 'font-size': 12, fill: 'var(--ink-soft)', 'text-anchor': 'middle' });
  t2.textContent = 'noche';
  g.append(t2);
  const t3 = svg('text', { x: 210, y: 15, 'font-size': 12, fill: 'var(--ink-soft)', 'text-anchor': 'middle' });
  t3.textContent = '⟳ gira sobre sí misma';
  g.append(t3);
  return g;
}

function earthOrbit() {
  const g = svg('svg', { viewBox: '0 0 300 170', width: 300, height: 170, role: 'img', 'aria-label': 'La Tierra se mueve alrededor del Sol siguiendo una órbita' });
  g.append(svg('ellipse', { cx: 150, cy: 85, rx: 110, ry: 62, fill: 'none', stroke: 'var(--ink-soft)', 'stroke-width': 2, 'stroke-dasharray': '6 5' }));
  g.append(svg('circle', { cx: 150, cy: 85, r: 22, fill: 'var(--sun)' }));
  for (const [x, y] of [[260, 85], [150, 23], [40, 85], [150, 147]]) g.append(svg('circle', { cx: x, cy: y, r: 9, fill: 'var(--earth-day)' }));
  const t = svg('text', { x: 150, y: 165, 'font-size': 12, fill: 'var(--ink-soft)', 'text-anchor': 'middle' });
  t.textContent = 'órbita: un año';
  g.append(t);
  return g;
}

export function visual(v) {
  if (!v) return null;
  let node = null;
  let caption = '';
  if (v.type === 'pizza') {
    node = pizza(v.n, v.take);
    caption = `${v.take}/${v.n} de la pizza`;
  } else if (v.type === 'pizza-compare') {
    node = h('div', { class: 'visual-row' }, h('figure', null, pizza(v.a[0], v.a[1], 120), h('figcaption', null, `${v.a[1]}/${v.a[0]}`)), h('figure', null, pizza(v.b[0], v.b[1], 120), h('figcaption', null, `${v.b[1]}/${v.b[0]}`)));
    return h('div', { class: 'visual' }, node);
  } else if (v.type === 'earth-rotation') {
    node = earthRotation();
    caption = 'Rotación: una vuelta ≈ 24 horas';
  } else if (v.type === 'earth-orbit') {
    node = earthOrbit();
    caption = 'Traslación: una vuelta ≈ 365 días';
  }
  if (!node) return null;
  return h('figure', { class: 'visual' }, node, caption && h('figcaption', null, caption));
}
