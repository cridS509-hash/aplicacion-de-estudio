import { h, clear, toast } from './ui.js';
import { api } from './api.js';
import { profilesView, homeView } from './views/home.js';
import { studyView } from './views/study.js';
import { sessionView } from './views/session.js';
import { mapView } from './views/map.js';
import { examSetupView, examPlanView } from './views/exam.js';
import { adultView } from './views/adult.js';

export const state = {
  profile: null, // {id, name, level}
  demo: localStorage.getItem('tutor.demo') === '1',
};

try {
  const saved = JSON.parse(localStorage.getItem('tutor.profile') || 'null');
  if (saved?.id) state.profile = saved;
} catch {
  /* sin almacenamiento: se continúa sin recordar el perfil */
}

export function setProfile(p) {
  state.profile = p;
  try {
    p ? localStorage.setItem('tutor.profile', JSON.stringify(p)) : localStorage.removeItem('tutor.profile');
  } catch {
    /* ignorar */
  }
}

export function setDemo(v) {
  state.demo = v;
  try {
    localStorage.setItem('tutor.demo', v ? '1' : '0');
  } catch {
    /* ignorar */
  }
}

export const go = (hash) => {
  if (location.hash === hash) render();
  else location.hash = hash;
};

const routes = [
  [/^#\/?$/, () => profilesView()],
  [/^#\/home$/, () => homeView()],
  [/^#\/study$/, () => studyView()],
  [/^#\/session\/([\w-]+)$/, (m) => sessionView(m[1])],
  [/^#\/map$/, () => mapView()],
  [/^#\/exam$/, () => examSetupView()],
  [/^#\/exam\/([\w-]+)$/, (m) => examPlanView(m[1])],
  [/^#\/adult$/, () => adultView()],
];

let token = 0;
export async function render() {
  const main = document.getElementById('main');
  const mine = ++token;
  document.body.dataset.level = state.profile?.level || 'primary';
  const hash = location.hash || '#/';
  const needsProfile = !/^#\/?$/.test(hash) && !/^#\/adult$/.test(hash);
  if (needsProfile && !state.profile) return go('#/');
  for (const [re, fn] of routes) {
    const m = re.exec(hash);
    if (!m) continue;
    clear(main);
    main.append(h('p', { class: 'loading', role: 'status' }, 'Un momento…'));
    try {
      const node = await fn(m);
      if (mine !== token) return;
      clear(main);
      if (node) main.append(node);
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    } catch (e) {
      if (mine !== token) return;
      clear(main);
      if (e.status === 404 && state.profile) {
        setProfile(null);
        return go('#/');
      }
      main.append(h('div', { class: 'card' }, h('h2', null, 'Ups'), h('p', null, e.message), h('a', { class: 'btn', href: '#/' }, 'Volver al inicio')));
    }
    return;
  }
  go('#/');
}

window.addEventListener('hashchange', render);
render();
export { api, toast };
