import { h, clear, toast, md, fmtDate, daysText } from '../ui.js';
import { api, session } from '../api.js';
import { state, go, setProfile } from '../app.js';

const WORD_ES = { buena: 'buena', parcial: 'parcial', 'débil': 'débil', pendiente: 'pendiente' };
const STATE_TEXT = { understood: 'Domina', partial: 'Parcial', needs_work: 'Necesita refuerzo', new: 'Sin datos' };

export async function adultView() {
  const root = h('section', { class: 'wide' });
  const { profiles, adult } = await api('/api/profiles');
  root.append(h('a', { class: 'back', href: state.profile ? '#/home' : '#/' }, '← Volver'), h('h1', null, '🔒 Zona para adultos'));
  if (!session.adultToken) {
    root.append(pinGate(adult.pinSet));
    return root;
  }
  const body = h('div');
  root.append(body);
  await dashboard(body, profiles);
  return root;

  function pinGate(pinSet) {
    const form = h('form', { class: 'card stack narrow', onsubmit: async (e) => {
      e.preventDefault();
      try {
        const pin = new FormData(e.target).get('pin');
        const r = await api(pinSet ? '/api/adult/unlock' : '/api/adult/setup', { method: 'POST', body: { pin } });
        session.adultToken = r.token;
        go('#/adult');
      } catch (err) {
        toast(err.message, 'error');
      }
    } });
    form.append(
      h('p', null, pinSet ? 'Introduce el PIN para ver el progreso y los controles.' : 'Crea un PIN de 4 a 8 números. Protege el progreso y los controles de privacidad; guárdalo bien.'),
      h('input', { name: 'pin', type: 'password', inputmode: 'numeric', pattern: '\\d{4,8}', minlength: 4, maxlength: 8, required: true, autocomplete: 'off', 'aria-label': 'PIN', placeholder: 'PIN' }),
      h('button', { class: 'btn primary', type: 'submit' }, pinSet ? 'Entrar' : 'Crear PIN'),
    );
    return form;
  }
}

async function dashboard(body, profiles) {
  if (!profiles.length) return body.append(h('p', null, 'Todavía no hay perfiles.'));
  let current = state.profile?.id && profiles.find((p) => p.id === state.profile.id) ? state.profile.id : profiles[0].id;
  let tab = 'summary';
  const status = await api('/api/adult/status', { adult: true });
  const head = h('div', { class: 'row wrap' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const panel = h('div', { class: 'panel' });
  body.append(head, tabs, panel);
  await show();

  async function show() {
    clear(head);
    const sel = h('select', { 'aria-label': 'Perfil', onchange: (e) => { current = e.target.value; show(); } }, ...profiles.map((p) => h('option', { value: p.id, selected: p.id === current }, `${p.name} (${p.level === 'university' ? 'universidad' : 'primaria'})`)));
    head.append(h('label', null, 'Perfil: ', sel));
    clear(tabs);
    for (const [id, label] of [['summary', 'Resumen'], ['concepts', 'Conceptos'], ['profile', 'Perfil de aprendizaje'], ['sessions', 'Sesiones'], ['exams', 'Exámenes'], ['privacy', 'Privacidad y controles']]) {
      tabs.append(h('button', { class: `tab ${tab === id ? 'on' : ''}`, role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; show(); } }, label));
    }
    clear(panel);
    panel.append(h('p', { class: 'loading' }, 'Cargando…'));
    try {
      const rep = await api(`/api/adult/profiles/${current}/report`, { adult: true });
      clear(panel);
      ({ summary, concepts, profile, sessions, exams, privacy })[tab](rep);
    } catch (e) {
      if (e.status === 401) {
        session.adultToken = null;
        return go('#/adult');
      }
      clear(panel);
      panel.append(h('p', null, e.message));
    }
  }

  function list(items, empty = 'Nada por ahora.') {
    return items?.length ? h('ul', null, ...items.map((i) => h('li', null, i))) : h('p', { class: 'muted small' }, empty);
  }

  function summary(r) {
    panel.append(
      h('div', { class: 'grid' },
        card('Lo que ya domina', list(r.mastered, 'Todavía no hay conceptos dominados (hace falta explicar, aplicar y recordar).')),
        card('Lo que comprende parcialmente', list(r.partial)),
        card('Lo que está confundiendo', list(r.confusing.map((c) => `${c.name}: ${c.what.join('; ')}`))),
        card('Necesita refuerzo', list(r.needsWork)),
      ),
      card('Principal dificultad y qué practicar después',
        r.concepts.filter((c) => c.mainDifficulty).length
          ? h('div', null, ...r.concepts.filter((c) => c.mainDifficulty).slice(0, 4).map((c) => h('div', { class: 'item' }, h('strong', null, c.name), h('p', null, c.mainDifficulty), c.practice.length ? h('p', { class: 'small' }, h('strong', null, 'Recomendación: '), c.practice[0]) : null)))
          : h('p', { class: 'muted small' }, 'Aún no hay dificultades registradas.')),
      card('Qué tipo de ayuda funcionó', helpSummary(r)),
      card('Próximos repasos', r.upcoming.length ? h('ul', null, ...r.upcoming.map((u) => h('li', null, `${u.name}: ${daysText(u.inDays)}`))) : h('p', { class: 'muted small' }, 'No hay repasos programados.')),
      h('p', { class: 'small muted' }, `${r.child.sessions} sesiones · nivel de autonomía ${r.child.autonomy}/3 · intereses compartidos: ${r.child.interests.length ? r.child.interests.join(', ') : 'ninguno'}`),
    );
  }

  function helpSummary(r) {
    const tally = {};
    for (const c of r.concepts) for (const hh of c.helpThatWorked) tally[hh.name] = (tally[hh.name] || 0) + hh.times;
    const e = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    return e.length ? h('ul', null, ...e.map(([n, t]) => h('li', null, `${n} (${t} ${t === 1 ? 'vez' : 'veces'})`))) : h('p', { class: 'muted small' }, 'Aún no hay suficiente evidencia.');
  }

  function card(title, content) {
    return h('section', { class: 'card' }, h('h3', null, title), content);
  }

  function concepts(r) {
    if (!r.concepts.length) return panel.append(h('p', null, 'Todavía no hay conceptos estudiados.'));
    for (const c of r.concepts) {
      const d = c.dims;
      panel.append(
        h('article', { class: 'card concept-card' },
          h('h3', null, `${c.emoji} ${c.name}`, h('span', { class: 'small muted' }, ` · ${c.subject} · ${STATE_TEXT[c.state]}`)),
          h('p', null, c.summary),
          h('table', { class: 'dims' },
            h('tbody', null, ...['knowledge', 'comprehension', 'connection', 'application', 'recall'].map((k) => h('tr', null, h('th', null, { knowledge: 'Conocimiento', comprehension: 'Comprensión', connection: 'Conexión', application: 'Aplicación', recall: 'Recuperación' }[k]), h('td', { class: `w-${d[k].word}` }, WORD_ES[d[k].word]), h('td', { class: 'small muted' }, d[k].n ? `${d[k].n} evidencia${d[k].n > 1 ? 's' : ''}` : '')))),
          ),
          c.mainDifficulty ? h('p', null, h('strong', null, 'Principal dificultad: '), c.mainDifficulty) : null,
          c.know.length || c.understands.length ? h('p', { class: 'small' }, h('strong', null, 'Qué sabe y comprende: '), [...c.know, ...c.understands].join('; ')) : null,
          c.canDo.length ? h('p', { class: 'small' }, h('strong', null, 'Qué puede hacer: '), c.canDo.join('; ')) : null,
          c.cannotYet.length ? h('p', { class: 'small' }, h('strong', null, 'Qué todavía no puede hacer: '), c.cannotYet.join('; ')) : null,
          c.resolvedConfusions.length ? h('p', { class: 'small' }, h('strong', null, 'Confusiones ya aclaradas: '), c.resolvedConfusions.join('; ')) : null,
          c.helpThatWorked.length ? h('p', { class: 'small' }, h('strong', null, 'Ayuda que funcionó: '), c.helpThatWorked.map((x) => `${x.name} (${x.times}/${x.tried})`).join(', ')) : null,
          c.practice.length ? h('div', { class: 'small' }, h('strong', null, 'Qué debería practicar después:'), list(c.practice)) : null,
          c.nextReviewAt ? h('p', { class: 'small muted' }, `Recuperación: ${c.reviewDue ? 'toca repasar hoy' : 'próximo repaso ' + fmtDate(c.nextReviewAt)}`) : null,
        ),
      );
    }
  }

  function profile(r) {
    panel.append(
      h('p', { class: 'note' }, 'Esto no son etiquetas: son observaciones basadas en evidencia, con su interpretación posible. Una sola observación no es un patrón; el tutor solo adapta la enseñanza cuando se repite.'),
    );
    if (!r.observations.length) panel.append(h('p', { class: 'muted' }, 'Todavía no hay observaciones.'));
    for (const o of r.observations) {
      panel.append(
        h('article', { class: 'card' },
          h('div', null, h('span', { class: 'k' }, 'OBSERVACIÓN '), o.observation),
          h('div', { class: 'interp' }, h('span', { class: 'k' }, 'INTERPRETACIÓN '), o.interpretation),
          h('p', { class: 'small muted' }, `Evidencia: ${o.count} · confianza ${o.confidence} · última vez ${fmtDate(o.lastSeen)}${o.isPattern ? ' · patrón en uso' : ''}`),
        ),
      );
    }
    const a = r.adaptation;
    panel.append(
      card('Cómo se está adaptando el tutor ahora',
        h('ul', null,
          h('li', null, `Tamaño de los fragmentos: ~${a.chunkWords} palabras${a.chunkSensitive ? ' (reducido por evidencia)' : ''}`),
          h('li', null, a.suggestedHelp ? `Ayuda sugerida primero cuando se atasca: ${a.suggestedHelp}` : 'Ayuda: siempre empieza por la mínima (pista)'),
          h('li', null, a.deeperQuestions ? 'Preguntas más profundas (ejemplos propios y «por qués»)' : 'Preguntas de explicación estándar'),
          h('li', null, a.extraApply ? 'Un ejercicio de aplicación extra por concepto' : 'Un ejercicio de aplicación por concepto'),
          h('li', null, `Repasos: ritmo ${a.reviewFactor < 1 ? 'más corto' : a.reviewFactor > 1 ? 'más espaciado' : 'estándar'}`),
          h('li', null, `Autonomía: ${a.autonomy}/3`),
        )),
    );
  }

  function sessions(r) {
    if (!r.sessions.length) return panel.append(h('p', null, 'Todavía no hay sesiones.'));
    for (const s of r.sessions) {
      const det = h('div');
      panel.append(
        h('article', { class: 'card' },
          h('div', { class: 'row' }, h('strong', { class: 'grow' }, `${{ study: '📚', review: '🔄', exam: '🎯' }[s.mode] || ''} ${s.title}`), h('span', { class: 'small muted' }, `${fmtDate(s.at)} · ${s.asks} respuestas${s.done ? '' : ' · sin terminar'}`), h('button', { class: 'btn', onclick: () => open(s.id, det) }, 'Ver detalle')),
          det,
        ),
      );
    }
    async function open(id, det) {
      if (det.childNodes.length) return clear(det);
      const d = await api(`/api/adult/profiles/${current}/sessions/${id}`, { adult: true });
      det.append(h('div', { class: 'tutor-panel' }, h('h4', null, 'Lo que el tutor observó, paso a paso'), ...d.events.map((e) => {
        if (e.type === 'help') return h('p', { class: 'small' }, `🆘 Ayuda pedida: ${e.kind}${e.level ? ' (nivel ' + e.level + ')' : ''}`);
        if (e.type === 'teach') return h('p', { class: 'small' }, '📘 El tutor explicó lo que faltaba tras varios intentos.');
        const g = e.diag;
        return h('div', { class: 'item' }, h('p', { class: 'small muted' }, `${e.purpose || e.type} · intento ${e.attempt || 1} · ayuda ${e.help ?? g.help}`), h('div', null, h('span', { class: 'k' }, 'OBSERVACIÓN '), g.observation), h('div', { class: 'interp' }, h('span', { class: 'k' }, 'INTERPRETACIÓN '), g.interpretation), h('p', { class: 'small muted' }, `Resultado: ${g.outcomeLabel || g.outcome} · confianza ${g.confidence}`));
      })));
      det.append(h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: async () => { if (confirm('¿Borrar esta sesión?')) { await api(`/api/adult/profiles/${current}/sessions/${id}`, { method: 'DELETE', adult: true }); show(); } } }, 'Borrar esta sesión')));
    }
  }

  function exams(r) {
    if (!r.exams.length) return panel.append(h('p', null, 'No hay exámenes en preparación.'));
    for (const e of r.exams) {
      panel.append(card(`${e.subject} · faltan ${e.daysLeft} días`, h('ul', null, ...e.topics.map((t) => h('li', null, `${t.name}: ${t.diagnosed ? `nivel «${t.levelDesc}», preparación ${t.readiness}%` : 'sin diagnóstico'}${t.needsStudy ? ' — necesita estudio previo' : ''}`)))));
    }
  }

  function privacy(r) {
    const llm = status.llm;
    panel.append(
      card('Qué datos guarda esta aplicación',
        h('div', null,
          list(['Apodo, nivel (primaria/universidad) y, si se comparte, intereses elegidos.', 'Respuestas escritas durante las sesiones y el análisis del tutor (para mostrar el progreso).', 'Los materiales que se pegan o suben.', 'No se piden apellidos, correo, ubicación ni fotos del niño. No hay publicidad ni analíticas de terceros, y los datos educativos no se usan para publicidad.']),
          h('p', { class: 'small muted' }, 'Todo se guarda solo en este dispositivo (archivo local). El adulto puede descargarlo o borrarlo.'),
        )),
      card('Descargar o borrar',
        h('div', { class: 'stack tight' },
          h('button', { class: 'btn', onclick: download }, '⬇️ Descargar todos los datos de este perfil (JSON)'),
          h('button', { class: 'btn danger', onclick: async () => { if (confirm('Esto reinicia el progreso (conceptos, observaciones y sesiones) pero conserva el perfil. ¿Seguir?')) { await api(`/api/adult/profiles/${current}/reset`, { method: 'POST', adult: true, body: {} }); toast('Progreso reiniciado.'); show(); } } }, 'Reiniciar el progreso de aprendizaje'),
          h('button', { class: 'btn danger', onclick: async () => { if (confirm('Se borrará el perfil y TODO lo que contiene. No se puede deshacer. ¿Borrar?')) { await api(`/api/adult/profiles/${current}`, { method: 'DELETE', adult: true }); if (state.profile?.id === current) setProfile(null); toast('Perfil borrado.'); go('#/'); } } }, 'Borrar el perfil y todos sus datos'),
        )),
      card('Ajustes de estudio',
        h('label', { class: 'radio' }, h('input', { type: 'checkbox', checked: r.settings.readingPause, onchange: async (e) => { await api(`/api/adult/profiles/${current}/settings`, { method: 'POST', adult: true, body: { readingPause: e.target.checked } }); } }), ' Pausa de lectura: el botón «Ya lo leí» se activa tras unos segundos, para fomentar la atención sostenida')),
      card('IA externa (opcional)',
        h('div', { class: 'stack tight' },
          h('p', { class: 'small' }, 'El tutor funciona sin conexión con un análisis local sencillo. Si lo activas, el texto del material y las respuestas del niño (sin nombre ni otros datos) se envían a la API de Anthropic para analizarlos mejor. Está desactivado por defecto.'),
          llm.available
            ? h('label', { class: 'radio' }, h('input', { type: 'checkbox', checked: llm.enabled, onchange: async (e) => { await api('/api/adult/settings', { method: 'POST', adult: true, body: { llmEnabled: e.target.checked } }); toast(e.target.checked ? 'IA externa activada.' : 'IA externa desactivada.'); } }), ` Usar IA externa (${llm.model})`)
            : h('p', { class: 'small muted' }, 'No hay clave de API configurada en el servidor (variable ANTHROPIC_API_KEY): el tutor usa solo el análisis local.'),
        )),
      card('Demostración',
        h('div', { class: 'stack tight' },
          h('p', { class: 'small' }, 'Para probar los repasos sin esperar, simula que han pasado días. Solo afecta a las fechas del tutor.'),
          h('div', { class: 'row' }, h('label', null, 'Días simulados: ', h('input', { type: 'number', min: 0, max: 365, value: status.clockOffsetDays, id: 'offset', style: { width: '5em' } })), h('button', { class: 'btn', onclick: async () => { await api('/api/adult/settings', { method: 'POST', adult: true, body: { clockOffsetDays: Number(document.getElementById('offset').value) } }); toast('Reloj actualizado.'); } }, 'Aplicar')),
        )),
      card('PIN', h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); try { await api('/api/adult/pin', { method: 'POST', adult: true, body: { pin: new FormData(e.target).get('pin') } }); toast('PIN cambiado.'); e.target.reset(); } catch (err) { toast(err.message, 'error'); } } }, h('input', { name: 'pin', type: 'password', inputmode: 'numeric', pattern: '\\d{4,8}', required: true, placeholder: 'Nuevo PIN', autocomplete: 'off' }), h('button', { class: 'btn', type: 'submit' }, 'Cambiar PIN'))),
    );
    async function download() {
      const data = await api(`/api/adult/profiles/${current}/export`, { adult: true });
      const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: 'datos-del-nino.json' });
      document.body.append(a);
      a.click();
      a.remove();
    }
  }
}
