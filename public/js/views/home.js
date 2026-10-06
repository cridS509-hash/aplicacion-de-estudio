import { h, toast, daysText } from '../ui.js';
import { api } from '../api.js';
import { state, setProfile, go } from '../app.js';

export async function profilesView() {
  const { profiles } = await api('/api/profiles');
  const root = h('section', { class: 'narrow center' });
  root.append(h('h1', null, 'Tu tutor para aprender a aprender'));
  root.append(h('p', { class: 'lead' }, 'Te ayudo a descubrir lo que ya sabes, a entender lo que todavía no y a recordarlo después.'));

  if (profiles.length) {
    root.append(h('h2', null, '¿Quién va a estudiar?'));
    const list = h('div', { class: 'stack' });
    for (const p of profiles) {
      list.append(
        h('button', { class: 'btn big', onclick: () => { setProfile(p); go('#/home'); } }, `${p.level === 'university' ? '🎓' : '🙂'} ${p.name}`),
      );
    }
    root.append(list);
  }

  const form = h('form', { class: 'card stack left', onsubmit: onCreate });
  form.append(
    h('h2', null, profiles.length ? 'Añadir a otra persona' : 'Vamos a empezar'),
    h('label', null, 'Escribe un nombre o apodo (no hace falta el real)', h('input', { name: 'name', maxlength: 24, required: true, autocomplete: 'off', placeholder: 'Por ejemplo: Ana' })),
    h('fieldset', null,
      h('legend', null, '¿Qué vas a estudiar?'),
      h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'level', value: 'primary', checked: true }), ' Materias de la escuela (9 a 12 años)'),
      h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'level', value: 'university' }), ' Materias de la universidad'),
    ),
    h('p', { class: 'small muted' }, 'Solo guardamos tu apodo y lo que haces al estudiar, en este dispositivo. Un adulto puede verlo, descargarlo o borrarlo.'),
    h('button', { class: 'btn primary', type: 'submit' }, 'Empezar'),
  );
  root.append(form);
  root.append(h('p', { class: 'small' }, h('a', { href: '#/adult' }, '🔒 Zona para adultos')));
  return root;

  async function onCreate(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const p = await api('/api/profiles', { method: 'POST', body: { name: fd.get('name'), level: fd.get('level'), ageBand: fd.get('level') === 'primary' ? '9-12' : null } });
      setProfile(p);
      go('#/home');
    } catch (err) {
      toast(err.message, 'error');
    }
  }
}

export async function homeView() {
  const d = await api(`/api/profiles/${state.profile.id}/home`);
  const uni = d.profile.level === 'university';
  const root = h('section', { class: 'narrow' });
  root.append(h('p', { class: 'hello' }, uni ? `Hola, ${d.profile.name}.` : `Hola, ${d.profile.name} 👋`));
  root.append(h('h1', null, uni ? '¿Qué vas a estudiar hoy?' : '¿Qué quieres aprender hoy?'));

  if (d.continueSession) {
    root.append(
      h('a', { class: 'banner', href: `#/session/${d.continueSession.id}` }, h('span', null, `▶ Seguir con «${d.continueSession.title}»`), h('span', { class: 'muted' }, 'Quedaste a la mitad')),
    );
  }

  const main = h('div', { class: 'stack' });
  main.append(
    h('a', { class: 'btn big primary', href: '#/study' }, '📚 Estudiar un material'),
    h('a', { class: 'btn big', href: '#/exam' }, '🎯 Prepararme para un examen'),
    h('button', { class: 'btn big', onclick: startReview }, '🔄 Repasar algo que aprendí', d.dueCount ? h('span', { class: 'badge' }, `${d.dueCount} para hoy`) : null),
  );
  root.append(main);

  if (d.exams.length) {
    root.append(h('div', { class: 'chips' }, ...d.exams.map((e) => h('a', { class: 'chip', href: `#/exam/${e.id}` }, `🎯 ${e.subject}: ${daysText(e.daysLeft) === 'hoy' ? 'examen hoy' : `faltan ${e.daysLeft} días`}`))));
  }

  const learn = h('section', { class: 'card' });
  learn.append(h('h2', null, 'Tu aprendizaje'));
  if (!d.learning.length) learn.append(h('p', { class: 'muted' }, uni ? 'Aquí verás lo que dominas y lo que toca repasar.' : 'Cuando estudies algo, aquí verás cómo vas y qué repasar.'));
  else {
    const ul = h('ul', { class: 'learn' });
    for (const c of d.learning) {
      ul.append(
        h('li', null,
          h('span', { class: 'dot', 'aria-hidden': 'true' }, c.emoji),
          h('div', null, h('strong', null, c.name), h('div', { class: 'small muted' }, c.summary, c.due ? ' · toca repasarlo hoy' : c.daysUntil ? ` · repaso ${daysText(c.daysUntil)}` : '')),
        ),
      );
    }
    learn.append(ul, h('a', { href: '#/map' }, 'Ver mi mapa de aprendizaje →'));
  }
  root.append(learn);

  root.append(
    h('footer', { class: 'foot' },
      h('a', { href: '#/' , onclick: () => setProfile(null) }, 'Cambiar de perfil'),
      h('span', null, ' · '),
      h('a', { href: '#/adult' }, '🔒 Zona para adultos'),
    ),
  );
  return root;

  async function startReview() {
    try {
      const v = await api(`/api/profiles/${state.profile.id}/review`, { method: 'POST', body: {} });
      go(`#/session/${v.id}`);
    } catch (err) {
      toast(err.message, 'info');
    }
  }
}
