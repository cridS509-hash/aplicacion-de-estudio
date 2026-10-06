import { h, toast, clear } from '../ui.js';
import { api } from '../api.js';
import { state, go } from '../app.js';

export async function studyView() {
  const level = state.profile.level;
  const uni = level === 'university';
  const { samples } = await api(`/api/samples/${level}`);
  const root = h('section', { class: 'narrow' });
  root.append(h('a', { class: 'back', href: '#/home' }, '← Inicio'));
  root.append(h('h1', null, uni ? '¿Qué vas a estudiar?' : '¿Qué quieres aprender hoy?'));
  const holder = h('div');
  root.append(holder);
  renderEntry();
  return root;

  function renderEntry() {
    clear(holder);
    const ta = h('textarea', { id: 'material', rows: 7, maxlength: 60000, placeholder: uni ? 'Pega aquí tus apuntes o el texto del tema, o escribe el nombre del tema…' : 'Escribe o pega aquí lo que vas a estudiar, o escribe el nombre de un tema…', 'aria-label': 'Material de estudio' });
    const fileIn = h('input', { type: 'file', accept: '.txt,.md,text/plain', hidden: true, onchange: onFile });
    const photoIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: onPhoto });
    holder.append(
      h('div', { class: 'card stack' },
        ta,
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => fileIn.click() }, '📎 Subir un archivo'),
          h('button', { class: 'btn', type: 'button', onclick: () => photoIn.click() }, '📷 Foto de mi material'),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn primary', type: 'button', onclick: () => preview({ text: ta.value }) }, 'Continuar'),
        ),
        fileIn, photoIn,
      ),
    );
    // Temas: pocos al principio, el resto bajo demanda
    const subjects = [...new Set(samples.map((s) => s.subject))];
    const chips = h('div', { class: 'chips' });
    const topics = h('div', { class: 'chips' });
    let subject = null;
    const showTopics = (all) => {
      clear(topics);
      const list = samples.filter((s) => !subject || s.subject === subject);
      for (const s of (all ? list : list.slice(0, 3))) topics.append(h('button', { class: 'chip', type: 'button', onclick: () => preview({ sampleId: s.id }) }, s.title));
      if (!all && list.length > 3) topics.append(h('button', { class: 'chip ghost', type: 'button', onclick: () => showTopics(true) }, 'Ver más temas'));
    };
    const renderSubjects = () => {
      clear(chips);
      for (const s of subjects) chips.append(h('button', { class: `chip ${subject === s ? 'on' : ''}`, type: 'button', 'aria-pressed': String(subject === s), onclick: () => { subject = subject === s ? null : s; renderSubjects(); showTopics(!!subject); } }, s));
    };
    renderSubjects();
    showTopics(false);
    holder.append(
      h('div', { class: 'stack tight' }, h('p', { class: 'muted' }, 'O elige una materia y un tema:'), chips, topics),
    );

    async function onFile(e) {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 300_000) return toast('Ese archivo es muy grande. Prueba con una parte.', 'error');
      ta.value = await f.text();
    }
    async function onPhoto(e) {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          toast('Leyendo la foto…');
          const r = await api(`/api/profiles/${state.profile.id}/photo`, { method: 'POST', body: { image: reader.result } });
          ta.value = r.text;
        } catch (err) {
          toast(err.message, 'error');
        }
      };
      reader.readAsDataURL(f);
    }
  }

  async function preview(body) {
    if (!body.sampleId && !(body.text || '').trim()) return toast('Escribe, pega o elige algo para empezar.', 'error');
    try {
      const p = await api(`/api/profiles/${state.profile.id}/material`, { method: 'POST', body });
      renderPreview(p);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderPreview(p) {
    clear(holder);
    const title = h('input', { value: p.title, maxlength: 80, 'aria-label': 'Tema' });
    holder.append(
      h('div', { class: 'card stack' },
        h('h2', null, 'Esto es lo que encontré'),
        h('label', null, 'Tema', title),
        h('p', { class: 'muted' }, `${p.subject} · ${p.concepts.length === 1 ? '1 tema' : `${p.concepts.length} temas`} · lo veremos en ${p.concepts.reduce((a, c) => a + c.chunks, 0)} ${p.concepts.reduce((a, c) => a + c.chunks, 0) === 1 ? 'parte' : 'partes'} pequeñas`),
        ...p.notes.map((n) => h('p', { class: 'note' }, n)),
        h('p', null, state.profile.level === 'university' ? 'Antes de explicarte nada, comprobaré qué sabes.' : 'Antes de leerlo, voy a preguntarte qué sabes tú.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: renderEntry }, 'Cambiar'),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn primary', type: 'button', onclick: () => start(p, title.value) }, 'Empezar'),
        ),
      ),
    );
  }

  async function start(p, title) {
    try {
      if (title.trim() && title.trim() !== p.title) await api(`/api/profiles/${state.profile.id}/lessons/${p.lessonId}/rename`, { method: 'POST', body: { title } });
      const v = await api(`/api/profiles/${state.profile.id}/sessions`, { method: 'POST', body: { lessonId: p.lessonId } });
      go(`#/session/${v.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
}
