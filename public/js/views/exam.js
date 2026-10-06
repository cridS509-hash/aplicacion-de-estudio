import { h, toast, bar, fmtDate } from '../ui.js';
import { api } from '../api.js';
import { state, go } from '../app.js';

const QTYPES = ['Opción múltiple', 'Completar', 'Verdadero o falso', 'Preguntas abiertas / desarrollo', 'Problemas'];

export async function examSetupView() {
  const uni = state.profile.level === 'university';
  const root = h('section', { class: 'narrow' });
  root.append(h('a', { class: 'back', href: '#/home' }, '← Inicio'), h('h1', null, '🎯 Prepararme para un examen'));
  root.append(h('p', { class: 'muted' }, 'Cuéntame lo que sepas del examen. Primero haré un diagnóstico para ver cómo estás, y después me concentraré en lo más débil.'));
  const chosen = new Set();
  const tomorrow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const form = h('form', { class: 'card stack', onsubmit });
  const qchips = h('div', { class: 'chips' });
  for (const q of QTYPES) qchips.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: (e) => { chosen.has(q) ? chosen.delete(q) : chosen.add(q); e.currentTarget.classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed', String(chosen.has(q))); } }, q));
  form.append(
    h('label', null, 'Materia', h('input', { name: 'subject', required: true, maxlength: 40, placeholder: uni ? 'Por ejemplo: Estadística' : 'Por ejemplo: Ciencias' })),
    h('label', null, 'Temas (uno por línea)', h('textarea', { name: 'topics', rows: 4, placeholder: uni ? 'Valor p\nIntervalos de confianza' : 'Rotación y traslación\nFracciones' })),
    h('label', null, 'Fecha del examen', h('input', { name: 'date', type: 'date', required: true, value: tomorrow })),
    h('label', null, 'Material disponible (opcional)', h('textarea', { name: 'material', rows: 5, placeholder: 'Pega aquí tus apuntes o el texto del tema. Si no, usaré los temas que ya conozco.' })),
    h('label', null, 'Instrucciones del profesor (opcional)', h('textarea', { name: 'instructions', rows: 2, maxlength: 600, placeholder: 'Por ejemplo: «entra el tema 3 completo; se pueden usar calculadoras»' })),
    h('div', null, h('p', { class: 'small' }, 'Tipo de preguntas, si lo sabes:'), qchips),
    h('button', { class: 'btn primary', type: 'submit' }, 'Crear mi plan'),
  );
  root.append(form);
  return root;

  async function onsubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const plan = await api(`/api/profiles/${state.profile.id}/exams`, {
        method: 'POST',
        body: { subject: fd.get('subject'), topics: String(fd.get('topics') || ''), date: fd.get('date'), material: fd.get('material'), instructions: fd.get('instructions'), questionTypes: [...chosen] },
      });
      go(`#/exam/${plan.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
}

export async function examPlanView(id) {
  const pid = state.profile.id;
  const plan = await api(`/api/profiles/${pid}/exams/${id}`);
  const root = h('section', { class: 'narrow' });
  root.append(h('a', { class: 'back', href: '#/home' }, '← Inicio'), h('h1', null, `🎯 ${plan.subject}`), h('p', { class: 'lead' }, plan.daysLeft ? `Faltan ${plan.daysLeft} día${plan.daysLeft === 1 ? '' : 's'} para el examen.` : 'El examen es hoy.'));
  if (plan.instructions) root.append(h('p', { class: 'note' }, `Del profesor: ${plan.instructions}`));
  if (plan.questionTypes.length) root.append(h('p', { class: 'small muted' }, `Tipo de preguntas: ${plan.questionTypes.join(', ')}`));

  const topics = h('div', { class: 'card stack' }, h('h2', null, 'Tus temas'));
  for (const t of plan.topics) {
    topics.append(
      h('div', { class: 'topic' },
        h('strong', null, t.name),
        t.diagnosed ? h('span', { class: 'small muted' }, ` · nivel actual: ${t.levelDesc}`) : h('span', { class: 'small muted' }, ' · todavía sin diagnóstico'),
        t.diagnosed ? bar(t.readiness ?? 0, `Preparación ${t.readiness}%`) : null,
        t.limited ? h('p', { class: 'small note' }, 'No tengo material de este tema para comprobar tus respuestas. Añade tu material (o conecta la IA) para practicar de verdad.') : null,
        t.needsStudy ? h('p', { class: 'small' }, '📚 Conviene estudiar este tema antes de seguir practicando.') : null,
      ),
    );
  }
  root.append(topics);

  root.append(
    h('div', { class: 'card' },
      h('h2', null, 'Cómo vamos a practicar'),
      h('ol', { class: 'levels' }, ...plan.levels.map((l, i) => h('li', null, l.desc))),
      h('p', { class: 'small muted' }, 'Subes de nivel solo cuando lo del nivel actual te sale bien. No te voy a dar las respuestas de inmediato: primero lo intentas tú.'),
    ),
  );

  const sched = h('div', { class: 'card' }, h('h2', null, 'Calendario sugerido'));
  const ul = h('ul', { class: 'sched' });
  for (const d of plan.schedule.slice(0, 8)) ul.append(h('li', null, h('span', { class: 'small muted' }, fmtDate(d.date)), ' ', h('strong', null, d.kind), ' · ', d.focus));
  sched.append(ul);
  root.append(sched);

  const start = async (mode) => {
    try {
      const v = await api(`/api/profiles/${pid}/exams/${id}/sessions`, { method: 'POST', body: { mode } });
      go(`#/session/${v.id}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  root.append(
    h('div', { class: 'row' },
      plan.diagnosticDone
        ? h('button', { class: 'btn primary big', onclick: () => start('practice') }, 'Practicar hoy')
        : h('button', { class: 'btn primary big', onclick: () => start('diagnostic') }, 'Empezar con el diagnóstico'),
    ),
  );
  return root;
}
