import { state, save, allDeadlines, daysUntil, projectProgress, getProject } from '../store.js';
import { h, icon, btn, advanced, field, input, emptyState, refresh, timeAgo, fmtDate } from '../ui.js';
import { deadlineRow, projectSummaryRow, openDeadlineModal, openProjectModal, projectDot } from './common.js';
import { openPaperModal } from './papers.js';
import { createNote } from './notes.js';
import { loadSample } from '../sample.js';

function greeting() {
  const hr = new Date().getHours();
  const part = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  return state.settings.name ? `${part}, ${state.settings.name}` : part;
}

function stat(label, value, note, cls = '') {
  return h('div', { class: `card stat ${cls}` }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), note ? h('div', { class: 'stat-note' }, note) : null);
}

function dayStrip(items) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const due = items.filter((x) => x.date === key);
    days.push(h('div', {
      class: `strip-day ${i === 0 ? 'today' : ''} ${due.length ? 'has' : ''}`,
      title: due.length ? due.map((x) => `• ${x.title}`).join('\n') : 'Nothing due',
    },
      h('div', { class: 'dow' }, d.toLocaleDateString(undefined, { weekday: 'short' })),
      h('div', { class: 'num' }, d.getDate()),
      h('div', { class: 'marks' }, due.slice(0, 4).map((x) => h('span', { class: 'dot', style: { width: '6px', height: '6px', background: getProject(x.projectId)?.color || 'var(--accent)' } })))));
  }
  return h('div', { class: 'strip' }, days);
}

export function renderHome() {
  const s = state.settings;
  const active = state.projects.filter((p) => p.status !== 'archived');
  const upcomingAll = allDeadlines();
  const overdue = upcomingAll.filter((d) => daysUntil(d.date) < 0);
  const windowItems = upcomingAll.filter((d) => daysUntil(d.date) >= 0 && daysUntil(d.date) <= s.upcomingDays);
  const toRead = state.papers.filter((p) => p.status === 'To read' || p.status === 'Reading');
  const avg = active.length ? Math.round(active.reduce((a, p) => a + projectProgress(p), 0) / active.length) : 0;

  const head = h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, greeting()), h('p', { class: 'sub' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))),
    h('div', { class: 'actions' },
      btn('Deadline', () => openDeadlineModal(), { iconName: 'plus' }),
      btn('Paper', () => openPaperModal(), { iconName: 'plus' }),
      btn('Note', () => createNote(), { iconName: 'plus' }),
      btn('Project', () => openProjectModal(), { iconName: 'plus', kind: 'primary' })));

  if (!state.projects.length && !state.deadlines.length && !state.papers.length) {
    return h('div', { class: 'page' }, head,
      h('div', { class: 'card welcome' },
        h('h2', {}, 'Welcome to your research dashboard'),
        h('p', { class: 'muted' }, 'Everything you add is saved in this browser only — nothing is uploaded. Export a backup from Settings any time.'),
        h('ol', {},
          h('li', {}, 'Create a project. Each one is split into four phases: Gathering Materials → Experimentation → Analysis → Paper Writing.'),
          h('li', {}, 'Link its Google Drive folder, GitHub repo and Overleaf project.'),
          h('li', {}, 'Add deadlines and tasks — they show up right here.')),
        h('div', { class: 'actions' },
          btn('Create your first project', () => openProjectModal(), { kind: 'primary', iconName: 'plus' }),
          btn('Explore with sample data', async () => { await loadSample(); refresh(); }))));
  }

  const deadlinesCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', {}, icon('calendar'), 'Upcoming deadlines'),
      h('a', { href: '#/deadlines', class: 'small' }, 'View all →')),
    s.home.strip ? h('div', { style: { marginBottom: '1rem' } }, dayStrip(upcomingAll)) : null,
    overdue.length || windowItems.length
      ? h('div', { class: 'list' },
        overdue.length ? h('div', { class: 'group-title' }, 'Overdue') : null,
        overdue.map((d) => deadlineRow(d)),
        overdue.length && windowItems.length ? h('div', { class: 'group-title' }, `Next ${s.upcomingDays} days`) : null,
        windowItems.map((d) => deadlineRow(d)))
      : emptyState(`Nothing due in the next ${s.upcomingDays} days`, upcomingAll.length ? `Next up: ${upcomingAll[0].title} on ${fmtDate(upcomingAll[0].date)}` : 'Add a deadline to keep track of submissions and milestones.',
        btn('Add deadline', () => openDeadlineModal(), { iconName: 'plus', size: 'sm' })));

  const projectsCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('layers'), 'Project progress'), h('a', { href: '#/projects', class: 'small' }, 'All projects →')),
    active.length ? h('div', {}, active.map(projectSummaryRow)) : emptyState('No active projects', null, btn('New project', () => openProjectModal(), { iconName: 'plus', size: 'sm' })));

  const side = [];
  if (s.home.reading) {
    side.push(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, icon('book'), 'Reading queue'), h('a', { href: '#/papers', class: 'small' }, 'Library →')),
      toRead.length ? h('div', { class: 'list' }, toRead.slice(0, 5).map((p) => h('div', { class: 'list-item' },
        h('span', { class: `chip ${p.status === 'Reading' ? 'accent' : ''}` }, p.status),
        h('div', { class: 'grow' }, h('div', { class: 'title', style: { cursor: 'pointer' }, onclick: () => openPaperModal(p) }, p.title),
          h('div', { class: 'meta' }, (p.authors || []).slice(0, 2).join(', ') + ((p.authors || []).length > 2 ? ' et al.' : '') + (p.year ? ` · ${p.year}` : '')))))) : emptyState('Reading queue is empty')));
  }
  if (s.home.notes) {
    const recent = [...state.notes].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 4);
    side.push(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, icon('note'), 'Recent notes'), h('a', { href: '#/notes', class: 'small' }, 'All notes →')),
      recent.length ? h('div', { class: 'list' }, recent.map((n) => h('a', { class: 'list-item', href: `#/notes/${n.id}`, style: { color: 'var(--text)' } },
        n.projectId ? projectDot(getProject(n.projectId)) : h('span', { class: 'dot', style: { background: 'var(--border-strong)' } }),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, n.title || 'Untitled note'), h('div', { class: 'meta' }, timeAgo(n.updated)))))) : emptyState('No notes yet')));
  }

  const customize = advanced('home',
    h('h4', {}, 'Customize home page'),
    h('div', { class: 'row' },
      ...[['strip', 'Show 14-day strip'], ['reading', 'Show reading queue'], ['notes', 'Show recent notes']].map(([k, label]) =>
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.home[k], onchange: (e) => { s.home[k] = e.target.checked; save(); refresh(); } }), label))),
    h('div', { class: 'row' },
      field('Upcoming window (days)', input({ type: 'number', min: 1, max: 365, value: s.upcomingDays, style: { width: '120px' }, onchange: (e) => { s.upcomingDays = Math.max(1, Number(e.target.value) || 14); save(); refresh(); } })),
      h('label', { class: 'check', style: { marginTop: '1.2rem' } }, h('input', { type: 'checkbox', checked: s.includeTaskDeadlines, onchange: (e) => { s.includeTaskDeadlines = e.target.checked; save(); refresh(); } }), 'Include task due dates')));

  return h('div', { class: 'page' },
    head,
    h('div', { class: 'grid stats' },
      stat('Overdue', overdue.length, overdue.length ? 'Needs attention' : 'All caught up', overdue.length ? 'alert' : ''),
      stat(`Due in ${s.upcomingDays} days`, windowItems.length, windowItems[0] ? `Next: ${windowItems[0].title}` : 'Clear schedule'),
      stat('Active projects', active.length, active.length ? `Average progress ${avg}%` : null),
      stat('Papers to read', toRead.length, `${state.papers.length} in library`)),
    h('div', { class: 'grid two' },
      h('div', { class: 'stack', style: { gap: '1.25rem' } }, deadlinesCard, projectsCard),
      h('div', { class: 'stack', style: { gap: '1.25rem' } }, ...side)),
    customize);
}
