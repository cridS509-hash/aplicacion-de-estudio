// Utilidades de interfaz. Todo el contenido dinámico se construye con nodos DOM (nunca innerHTML),
// así el texto del niño o del material no puede inyectar HTML.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'required' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

/** Markdown mínimo y seguro: **negrita**, *cursiva*, listas con «- » y saltos de línea. */
export function md(text) {
  const root = h('div', { class: 'md' });
  const lines = String(text ?? '').split('\n');
  let list = null;
  const inline = (s) => {
    const frag = document.createDocumentFragment();
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let last = 0;
    let m;
    while ((m = re.exec(s))) {
      if (m.index > last) frag.append(s.slice(last, m.index));
      const raw = m[0];
      frag.append(raw.startsWith('**') ? h('strong', null, raw.slice(2, -2)) : h('em', null, raw.slice(1, -1)));
      last = m.index + raw.length;
    }
    if (last < s.length) frag.append(s.slice(last));
    return frag;
  };
  for (const line of lines) {
    const li = /^\s*[-•]\s+(.*)$/.exec(line);
    const ol = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (li) {
      if (!list) root.append((list = h('ul')));
      list.append(h('li', null, inline(li[1])));
    } else {
      list = null;
      if (!line.trim()) continue;
      root.append(h('p', null, ol ? inline(`${ol[1]}. ${ol[2]}`) : inline(line)));
    }
  }
  return root;
}

export function toast(msg, kind = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: `toast ${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.remove(), 4500);
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export function daysText(n) {
  if (n === null || n === undefined) return '';
  if (n <= 0) return 'hoy';
  if (n === 1) return 'mañana';
  return `en ${n} días`;
}

export function bar(pct, label) {
  return h('div', { class: 'bar', role: 'img', 'aria-label': label || `${pct}%` }, h('i', { style: { width: `${Math.max(2, Math.min(100, pct ?? 0))}%` } }));
}
