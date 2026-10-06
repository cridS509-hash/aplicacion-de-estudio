import { h, clear, md, toast, bar, daysText } from '../ui.js';
import { api } from '../api.js';
import { visual } from '../visuals.js';
import { state, setDemo, go } from '../app.js';

const STATE_WORDS = {
  primary: { understood: 'Ya lo entiendo', partial: 'Lo voy entendiendo', needs_work: 'Necesita refuerzo', new: 'Nuevo' },
  university: { understood: 'Comprendo', partial: 'Reconozco', needs_work: 'No lo comprendo', new: 'Sin evidencia' },
};

export async function sessionView(id) {
  const pid = state.profile.id;
  const base = `/api/profiles/${pid}/sessions/${id}`;
  let view = await api(base);
  const debugs = []; // {afterChild, diag}
  const root = h('section', { class: 'session' });
  const header = h('div', { class: 'session-head' });
  const log = h('div', { class: 'log', 'aria-live': 'polite' });
  const composer = h('div', { class: 'composer' });
  root.append(header, log, composer);
  let busy = false;
  let timer = null;
  render();
  return root;

  /* ------------------------------ render ------------------------------ */

  function render() {
    clearInterval(timer);
    renderHeader();
    renderLog();
    renderComposer();
    requestAnimationFrame(() => composer.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }

  function renderHeader() {
    clear(header);
    const p = view.progress;
    const bits = [];
    if (p?.concept) bits.push(p.concept);
    if (view.mode === 'study' && p?.chunkTotal > 1 && ['read', 'explain', 'contrast'].includes(view.stage)) bits.push(`Parte ${p.chunkIndex} de ${p.chunkTotal}`);
    if (view.mode === 'review' && p) bits.push(`Repaso ${p.conceptIndex} de ${p.conceptTotal}`);
    if (view.mode === 'exam' && p) bits.push(`Pregunta ${p.conceptIndex} de ${p.conceptTotal}`);
    header.append(
      h('a', { class: 'back', href: '#/home' }, '← Salir (se guarda)'),
      h('span', { class: 'crumb' }, bits.join(' · ')),
      h('label', { class: 'demo-toggle small' }, h('input', { type: 'checkbox', checked: state.demo, onchange: (e) => { setDemo(e.target.checked); renderLog(); } }), ' Ver cómo piensa el tutor'),
    );
  }

  function renderLog() {
    clear(log);
    let childCount = 0;
    const lastChunk = view.transcript.map((t) => t.kind).lastIndexOf('chunk');
    view.transcript.forEach((m, i) => {
      if (m.role === 'child') {
        childCount++;
        log.append(h('div', { class: 'msg child' }, h('div', { class: 'bubble' }, m.text)));
        for (const d of debugs.filter((x) => x.afterChild === childCount)) if (state.demo) log.append(debugCard(d.diag));
        return;
      }
      if (m.kind === 'chunk' || m.kind === 'reread') {
        const body = [m.stage && h('span', { class: 'stage' }, stageName(m.stage)), md(m.text), visual(m.visual)];
        if (m.kind === 'chunk' && i !== lastChunk) log.append(h('details', { class: 'msg tutor card reading' }, h('summary', null, `📖 ${m.title}`), ...body));
        else log.append(h('div', { class: 'msg tutor card reading' }, h('h3', null, `${m.kind === 'reread' ? '📖 Para releer: ' : ''}${m.title}`), ...body));
        return;
      }
      if (m.kind === 'contrast') {
        log.append(
          h('div', { class: 'msg tutor card' }, md(m.text), h('div', { class: 'contrast' }, ...m.items.map((it) => h('div', { class: 'cbox' }, h('span', { class: 'letter' }, it.id), md(it.text), visual(it.visual))))),
        );
        return;
      }
      const cls = ['msg', 'tutor', m.fb || m.help ? `fb-${m.fb || m.help}` : ''].join(' ');
      const bubble = h('div', { class: 'bubble' }, md(m.text), visual(m.visual));
      if (m.vocab) bubble.append(h('details', { class: 'small' }, h('summary', null, 'Ver el significado'), h('p', null, h('strong', null, m.vocab.term), ': ', m.vocab.meaning)));
      log.append(h('div', { class: cls }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, view.level === 'university' ? '🎓' : '🧑‍🏫'), bubble));
    });
    if (busy) log.append(h('div', { class: 'msg tutor' }, h('div', { class: 'bubble typing', role: 'status', 'aria-label': 'El tutor está pensando' }, h('i'), h('i'), h('i'))));
  }

  function stageName(s) {
    return { context: 'Contexto', intuition: 'Idea intuitiva', technical: 'Lenguaje técnico', how: 'Cómo funciona', example: 'Ejemplo completo' }[s] || s;
  }

  function debugCard(d) {
    const rows = [
      ['Resultado', `${d.outcomeLabel || d.outcome} · cobertura ${Math.round((d.coverage || 0) * 100)}% · confianza ${d.confidence}`],
      ['Observación', d.observation],
      ['Interpretación', d.interpretation],
      d.misconception ? ['Posible confusión', d.misconception.label] : null,
      d.signals?.length ? ['Señales', d.signals.join(', ')] : null,
      ['Ayuda recomendada', d.recommendedHelp],
    ].filter(Boolean);
    return h('div', { class: 'debug' }, h('strong', null, '🔬 Lo que el tutor observó'), ...rows.map(([k, v]) => h('div', null, h('span', { class: 'k' }, `${k}: `), v)));
  }

  /* ------------------------------ composer ------------------------------ */

  function renderComposer() {
    clear(composer);
    const s = view.step;
    if (!s) return;
    if (s.type === 'wrap') return composer.append(wrapView(s));
    if (s.type === 'read') return composer.append(readView(s));
    if (s.type === 'teach') return composer.append(h('div', { class: 'card' }, h('p', null, s.prompt), h('button', { class: 'btn primary', onclick: () => advance('continue') }, 'Intentarlo de nuevo')));
    if (s.type === 'selfrate') return composer.append(selfRateView(s));
    composer.append(askView(s));
  }

  function readView(s) {
    const btn = h('button', { class: 'btn primary', disabled: s.minSeconds > 0, onclick: () => advance('read-done') }, 'Ya lo leí');
    let left = s.minSeconds;
    if (left > 0) {
      btn.textContent = `Léelo con calma… (${left})`;
      timer = setInterval(() => {
        left--;
        if (left <= 0) {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = 'Ya lo leí';
        } else btn.textContent = `Léelo con calma… (${left})`;
      }, 1000);
    }
    const wordIn = h('input', { placeholder: 'Escribe la palabra', maxlength: 40, 'aria-label': 'Palabra que no entiendes' });
    const wordBox = h('form', { class: 'row', hidden: true, onsubmit: (e) => { e.preventDefault(); if (wordIn.value.trim()) advance('unknown-word', { word: wordIn.value }).then(() => {}); } }, wordIn, h('button', { class: 'btn', type: 'submit' }, 'Preguntar'));
    return h('div', { class: 'card stack' },
      view.level === 'university' ? null : h('p', { class: 'muted small' }, 'Léelo despacio. Cuando termines, te pediré que me cuentes qué entendiste.'),
      h('div', { class: 'row' }, btn, h('button', { class: 'btn ghost', type: 'button', onclick: () => { wordBox.hidden = !wordBox.hidden; wordIn.focus(); } }, view.level === 'university' ? 'Hay un término que no conozco' : 'Hay una palabra que no entiendo')),
      wordBox,
      s.hardWords?.length ? h('p', { class: 'small muted' }, 'Palabras que quizás quieras revisar: ', s.hardWords.join(', ')) : null,
    );
  }

  function selfRateView(s) {
    return h('div', { class: 'card stack' }, h('p', null, h('strong', null, s.prompt)), h('div', { class: 'stack tight' }, ...s.options.map((o) => h('button', { class: 'btn', onclick: () => advance('selfrate', { value: o.id }) }, o.text))));
  }

  function askView(s) {
    const box = h('form', { class: 'card stack', onsubmit: (e) => e.preventDefault() });
    if (s.examLevelDesc) box.append(h('p', { class: 'small tag' }, `${s.topic} · nivel: ${s.examLevelDesc}`, s.limited ? ' · sin material para comprobar' : ''));
    if (s.scaffold) box.append(h('p', { class: 'small tag' }, { guided: 'Ejercicio guiado', partial: 'Parcialmente guiado', independent: 'Independiente' }[s.scaffold]));
    box.append(h('p', { class: 'question' }, ...String(s.prompt).split('\n').flatMap((l, i) => [i ? h('br') : null, l])));
    if (s.reflect) box.append(h('p', { class: 'small reflect' }, '💭 ', s.reflect));
    let getPayload;
    if (s.qType === 'choice') {
      let chosen = s.lockedChoice || null;
      const opts = h('div', { class: 'options', role: 'radiogroup' });
      const draw = () => {
        clear(opts);
        for (const o of s.options) {
          const labelText = s.type === 'contrast' ? `Elijo el texto ${o.id}` : o.text;
          opts.append(h('button', { type: 'button', class: `opt ${chosen === o.id ? 'on' : ''}`, role: 'radio', 'aria-checked': String(chosen === o.id), disabled: !!s.lockedChoice && s.lockedChoice !== o.id, onclick: () => { if (!s.lockedChoice) { chosen = o.id; draw(); } } }, s.type !== 'contrast' ? h('span', { class: 'letter' }, o.id.toUpperCase()) : null, labelText));
        }
      };
      draw();
      box.append(opts);
      const why = s.askWhy ? h('textarea', { rows: 3, placeholder: s.whyPrompt || s.followUp || '¿Cómo lo sabes?', 'aria-label': 'Tu razón' }) : null;
      if (why) box.append(h('label', { class: 'small' }, s.lockedChoice ? 'Cuéntame qué detalle te hizo decidirlo' : s.whyPrompt || '¿Cómo lo sabes?', why));
      getPayload = () => ({ choice: chosen, text: why?.value || '' });
    } else if (s.qType === 'order') {
      let order = s.items.map((i) => i.id);
      const list = h('ol', { class: 'order' });
      const draw = () => {
        clear(list);
        order.forEach((id, i) => {
          const it = s.items.find((x) => x.id === id);
          list.append(h('li', null, h('span', { class: 'grow' }, it.text), h('button', { type: 'button', class: 'mini', 'aria-label': 'Subir', disabled: i === 0, onclick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); } }, '↑'), h('button', { type: 'button', class: 'mini', 'aria-label': 'Bajar', disabled: i === order.length - 1, onclick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); } }, '↓')));
        });
      };
      draw();
      box.append(list);
      getPayload = () => ({ order });
    } else if (s.qType === 'draw') {
      const canvas = h('canvas', { width: 320, height: 200, class: 'canvas', 'aria-label': 'Espacio para dibujar' });
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = getComputedStyle(document.body).color;
      let down = false;
      const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)]; };
      canvas.addEventListener('pointerdown', (e) => { down = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', (e) => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
      canvas.addEventListener('pointerup', () => (down = false));
      const cap = h('textarea', { rows: 2, placeholder: 'Escribe una frase que explique tu dibujo…', 'aria-label': 'Frase sobre tu dibujo' });
      box.append(canvas, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => ctx.clearRect(0, 0, 320, 200) }, 'Borrar')), cap, h('p', { class: 'small muted' }, 'Tu dibujo se queda en tu pantalla; yo leo tu frase.'));
      getPayload = () => ({ text: cap.value });
    } else {
      const ta = h('textarea', { rows: view.level === 'university' ? 5 : 4, placeholder: s.placeholder || 'Escribe aquí…', 'aria-label': 'Tu respuesta', maxlength: 2000 });
      ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); });
      box.append(ta);
      getPayload = () => ({ text: ta.value });
      setTimeout(() => ta.focus({ preventScroll: true }), 50);
    }
    const sendBtn = h('button', { class: 'btn primary', type: 'button', onclick: send }, s.type === 'contrast' ? 'Responder' : 'Enviar');
    box.append(h('div', { class: 'row' }, h('span', { class: 'grow' }), sendBtn));
    if (s.help?.length && !busy) {
      const bar2 = h('div', { class: 'helpbar' });
      if (view.autonomy >= 1 && s.purpose !== 'prior') bar2.append(h('span', { class: 'small muted' }, view.autonomyPrompt));
      for (const o of s.help) bar2.append(h('button', { type: 'button', class: `btn help ${o.suggested ? 'suggested' : ''}`, onclick: () => askHelp(o.kind) }, `${o.icon} ${o.label}`, o.suggested ? h('span', { class: 'small' }, ' · la última vez te ayudó') : null));
      box.append(bar2);
    } else if (s.purpose === 'prior') box.append(h('p', { class: 'small muted' }, 'No hay respuestas malas aquí: me sirve lo que pienses.'));

    async function send() {
      if (busy) return;
      try {
        busy = true;
        sendBtn.disabled = true;
        renderLog();
        const r = await api(`${base}/answer`, { method: 'POST', body: getPayload() });
        const childCount = view.transcript.filter((t) => t.role === 'child').length + 1;
        if (r.debug) debugs.push({ afterChild: childCount, diag: r.debug });
        view = r.view;
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        busy = false;
        render();
      }
    }
    return box;
  }

  async function askHelp(kind) {
    if (busy) return;
    try {
      busy = true;
      const r = await api(`${base}/help`, { method: 'POST', body: { kind } });
      view = r.view;
      if (!r.ok && r.message) toast(r.message, 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = false;
      const keep = composer.querySelector('textarea')?.value;
      render();
      const ta = composer.querySelector('textarea');
      if (ta && keep) ta.value = keep;
    }
  }

  async function advance(action, extra = {}) {
    if (busy) return;
    try {
      busy = true;
      const r = await api(`${base}/advance`, { method: 'POST', body: { action, ...extra } });
      view = r.view;
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = false;
      render();
    }
  }

  /* ------------------------------ resumen ------------------------------ */

  function wrapView(s) {
    const sum = s.summary;
    const words = STATE_WORDS[view.level];
    const box = h('div', { class: 'card stack wrap' });
    if (sum.review) {
      box.append(h('h2', null, 'Repaso terminado'));
      for (const r of sum.results) {
        box.append(h('div', { class: 'result' }, h('strong', null, r.name), h('p', { class: 'small' }, r.kind === 'strong' ? 'Lo recordaste bien sin ayuda.' : r.kind === 'partial' ? `Recordaste una parte${r.missing.length ? '; se escapó: ' + r.missing.slice(0, 2).join(' y ') : ''}.` : 'Costó recordarlo; no pasa nada, es parte de aprender.', ` Volveremos a verlo ${daysText(r.days)}.`)));
      }
      if (sum.studyAgain?.length) box.append(h('button', { class: 'btn', onclick: () => studyAgain(sum.studyAgain) }, 'Volver a estudiar lo que costó'));
    } else if (sum.exam) {
      box.append(h('h2', null, sum.title), h('p', null, sum.daysLeft ? `Faltan ${sum.daysLeft} días.` : 'El examen es hoy.'));
      for (const t of sum.topics) box.append(h('div', { class: 'topic' }, h('strong', null, t.name), t.diagnosed ? h('span', { class: 'small muted' }, ` · nivel: ${t.levelDesc}`) : h('span', { class: 'small muted' }, ' · sin diagnosticar'), t.diagnosed ? bar(t.readiness, `Preparación ${t.readiness}%`) : null, t.needsStudy ? h('p', { class: 'small' }, 'Conviene estudiar este tema antes de seguir practicando.') : null));
      box.append(h('p', null, h('strong', null, 'Siguiente paso: '), sum.next));
      box.append(h('a', { class: 'btn primary', href: `#/exam/${view.examPlanId}` }, 'Ver mi plan'));
    } else if (sum.uni) {
      const sec = sum.sections;
      box.append(h('h2', null, `Resumen: ${sum.title}`));
      for (const c of sum.concepts) box.append(h('p', null, h('span', { class: 'dot' }, c.emoji), ' ', h('strong', null, `${c.name}: ${words[c.state]}`), h('span', { class: 'small muted block' }, c.summary)));
      const part = (t, l) => h('div', null, h('h3', null, t), l.length ? h('ul', null, ...l.map((x) => h('li', null, x))) : h('p', { class: 'small muted' }, 'Nada por ahora.'));
      box.append(part('Lo que ahora puedo explicar', sec.canExplain), part('Lo que puedo aplicar', sec.canApply), part('Lo que todavía confundo', sec.stillConfuse), part('Lo que debo memorizar', sec.memorize), part('Lo que debo repasar', sec.review), h('div', null, h('h3', null, 'Próxima acción'), h('p', null, sec.nextAction)));
    } else {
      box.append(h('h2', null, 'Terminamos por hoy'));
      if (sum.child.can.length) box.append(h('div', null, h('h3', null, 'Lo que ya puedes hacer'), h('ul', { class: 'ticks' }, ...sum.child.can.map((c) => h('li', null, c)))));
      if (sum.child.working.length) box.append(h('div', null, h('h3', null, 'Lo que seguimos practicando'), h('ul', null, ...sum.child.working.map((c) => h('li', null, c)))));
      box.append(h('p', { class: 'note' }, sum.child.tomorrow));
    }
    if (sum.autonomyChange > 0) box.append(h('p', { class: 'note' }, view.level === 'university' ? 'Has necesitado menos ayuda: reduciré las sugerencias.' : 'Estás necesitando cada vez menos ayuda: la próxima vez te dejaré intentar más por tu cuenta.'));
    if (sum.askInterests) box.append(interests(sum.askInterests));
    box.append(h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/map' }, view.level === 'university' ? 'Ver el mapa' : 'Ver mi mapa'), h('span', { class: 'grow' }), h('a', { class: 'btn primary', href: '#/home' }, 'Volver al inicio')));
    return box;
  }

  function interests(options) {
    const sel = new Set();
    const holder = h('div', { class: 'card stack tight' }, h('p', null, h('strong', null, '¿Qué te gusta más?'), ' Así puedo usar ejemplos que te interesen (puedes saltarte esto).'));
    const chips = h('div', { class: 'chips' });
    for (const o of options) chips.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: (e) => { sel.has(o.id) ? sel.delete(o.id) : sel.add(o.id); e.currentTarget.classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed', String(sel.has(o.id))); } }, o.label));
    holder.append(chips, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: async () => { await api(`/api/profiles/${pid}/interests`, { method: 'POST', body: { interests: [...sel] } }); holder.replaceWith(h('p', { class: 'note' }, sel.size ? 'Anotado. ¡Gracias!' : 'Sin problema.')); } }, 'Guardar'), h('button', { class: 'btn ghost', type: 'button', onclick: () => holder.remove() }, 'Prefiero no decir')));
    return holder;
  }

  async function studyAgain(lessonIds) {
    try {
      const v = await api(`/api/profiles/${pid}/sessions`, { method: 'POST', body: { lessonId: lessonIds[0] } });
      go(`#/session/${v.id}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }
}
