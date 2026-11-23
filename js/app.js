import { state, events } from './store.js';
import { h, icon, toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderProjects, renderProject } from './views/projects.js';
import { renderPapers } from './views/papers.js';
import { renderNotes } from './views/notes.js';
import { renderDeadlines } from './views/deadlines.js';
import { renderSettings } from './views/settings.js';

const NAV = [
  { href: '#/', label: 'Home', icon: 'home', match: /^$/ },
  { href: '#/projects', label: 'Projects', icon: 'folder', match: /^projects?/ },
  { href: '#/deadlines', label: 'Deadlines', icon: 'calendar', match: /^deadlines/ },
  { href: '#/papers', label: 'Papers & Citations', icon: 'book', match: /^papers/ },
  { href: '#/notes', label: 'Notes', icon: 'note', match: /^notes/ },
  { href: '#/settings', label: 'Settings', icon: 'settings', match: /^settings/ },
];

const ROUTES = [
  [/^$/, () => renderHome()],
  [/^projects$/, () => renderProjects()],
  [/^project\/([^/]+)(?:\/([^/]+))?$/, (m) => renderProject(m[1], m[2] || 'overview')],
  [/^papers$/, () => renderPapers()],
  [/^notes(?:\/([^/]+))?$/, (m) => renderNotes(m[1])],
  [/^deadlines$/, () => renderDeadlines()],
  [/^settings$/, () => renderSettings()],
];

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let lastPath = null;

function currentPath() {
  return decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/$/, '');
}

export function render() {
  const path = currentPath();
  const samePage = path === lastPath;
  const scroll = window.scrollY;
  let view = null;
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) { view = fn(m); break; }
  }
  if (!view) view = h('div', { class: 'page' }, h('h1', {}, 'Page not found'), h('p', {}, h('a', { href: '#/' }, 'Go home')));
  main.replaceChildren(view);
  nav.replaceChildren(...NAV.map((n) => h('a', { href: n.href, class: n.match.test(path) ? 'active' : '', 'aria-current': n.match.test(path) ? 'page' : null }, icon(n.icon), h('span', {}, n.label))));
  if (samePage) window.scrollTo(0, scroll);
  else { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  lastPath = path;
  document.body.classList.remove('nav-open');
}

export function applyTheme() {
  const { theme, accent } = state.settings;
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  const changed = document.documentElement.dataset.theme !== resolved;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.setProperty('--accent', accent || '#2a78d6');
  return changed;
}

window.addEventListener('hashchange', render);
window.addEventListener('app:refresh', render);
window.addEventListener('app:theme', () => { applyTheme(); render(); });
events.addEventListener('error', (e) => toast(e.detail, 'error'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (applyTheme()) render(); });
document.getElementById('menuBtn').append(icon('menu', 20));
document.getElementById('menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));

applyTheme();
render();
