import { h, daysText, toast } from '../ui.js';
import { api } from '../api.js';
import { state, go } from '../app.js';

export async function mapView() {
  const uni = state.profile.level === 'university';
  const { subjects } = await api(`/api/profiles/${state.profile.id}/map`);
  const root = h('section', { class: 'narrow' });
  root.append(h('a', { class: 'back', href: '#/home' }, '← Inicio'), h('h1', null, uni ? 'Mapa de la materia' : 'Mi mapa de aprendizaje'));
  if (!subjects.length) {
    root.append(h('p', { class: 'muted' }, 'Todavía no hay nada aquí. Estudia un tema y verás cómo va creciendo.'));
    return root;
  }
  const legend = uni
    ? ['🟢 Comprendo', '🟡 Reconozco', '🔴 No lo comprendo']
    : ['🟢 Ya lo entiendo', '🟡 Lo voy entendiendo', '🔴 Necesita refuerzo'];
  root.append(h('p', { class: 'legend' }, legend.join('   ')));
  for (const s of subjects) {
    const sec = h('section', { class: 'subject' }, h('h2', null, s.subject));
    for (const c of s.concepts) {
      const det = h('details', { class: 'concept' },
        h('summary', null, h('span', { class: 'dot' }, c.emoji), h('span', { class: 'grow' }, h('strong', null, c.name), h('span', { class: 'small muted block' }, c.summary))),
        h('div', { class: 'detail' },
          list('Lo que ya sé', [...c.know, ...c.understands]),
          list('Lo que puedo hacer', c.canDo),
          list('Lo que confundo', c.confuses),
          list('Todavía no puedo', c.cannotYet),
          c.helpThatWorked.length ? h('p', { class: 'small' }, h('strong', null, 'Me ayudó: '), c.helpThatWorked.map((x) => x.name).join(', ')) : null,
          c.next ? h('p', { class: 'small' }, h('strong', null, 'Lo siguiente: '), c.next) : null,
          c.daysUntil !== null ? h('p', { class: 'small muted' }, c.reviewDue ? 'Toca repasarlo hoy.' : `Próximo repaso: ${daysText(c.daysUntil)}.`) : null,
          h('button', { class: 'btn', onclick: () => review(c.key) }, '🔄 Repasar ahora'),
        ),
      );
      sec.append(det);
    }
    root.append(sec);
  }
  return root;

  function list(title, items) {
    if (!items?.length) return null;
    return h('div', null, h('h3', null, title), h('ul', null, ...items.map((i) => h('li', null, i))));
  }
  async function review(key) {
    try {
      const v = await api(`/api/profiles/${state.profile.id}/review`, { method: 'POST', body: { conceptKeys: [key] } });
      go(`#/session/${v.id}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }
}
