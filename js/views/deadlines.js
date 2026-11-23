import { state, save, allDeadlines, daysUntil, getProject, todayStr, DEADLINE_TYPES } from '../store.js';
import { h, icon, btn, advanced, field, select, emptyState, refresh, download } from '../ui.js';
import { deadlineRow, openDeadlineModal, tabs } from './common.js';

const view = { mode: 'list', project: '', type: '', showDone: false, month: null };

function filtered(includeDone) {
  return allDeadlines({ includeDone })
    .filter((d) => !view.project || d.projectId === view.project)
    .filter((d) => !view.type || d.type === view.type);
}

export function renderDeadlines() {
  const body = view.mode === 'list' ? listView() : calendarView();
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Deadlines'), h('p', { class: 'sub' }, 'Submissions, milestones, meetings and task due dates across all projects.')),
      h('div', { class: 'actions' },
        tabs([{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }], view.mode, (v) => { view.mode = v; refresh(); }),
        btn('Add deadline', () => openDeadlineModal(null, { projectId: view.project }), { kind: 'primary', iconName: 'plus' }))),
    h('div', { class: 'card' },
      body,
      advanced('deadline-filters',
        h('div', { class: 'form-grid' },
          field('Project', select([{ value: '', label: 'All projects' }, ...state.projects.map((p) => ({ value: p.id, label: p.title }))], view.project, { onchange: (e) => { view.project = e.target.value; refresh(); } })),
          field('Type', select([{ value: '', label: 'All types' }, ...DEADLINE_TYPES, 'Task'].map((t) => (typeof t === 'string' ? { value: t, label: t } : t)), view.type, { onchange: (e) => { view.type = e.target.value; refresh(); } }))),
        h('div', { class: 'row' },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: view.showDone, onchange: (e) => { view.showDone = e.target.checked; refresh(); } }), 'Show completed'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.settings.includeTaskDeadlines, onchange: (e) => { state.settings.includeTaskDeadlines = e.target.checked; save(); refresh(); } }), 'Include task due dates')),
        h('div', { class: 'row' },
          btn('Export to calendar (.ics)', exportIcs, { iconName: 'download', size: 'sm' }),
          h('span', { class: 'field-hint' }, 'Import the .ics file into Google Calendar, Outlook or Apple Calendar.')))));
}

function listView() {
  const items = filtered(view.showDone);
  const open = items.filter((d) => !d.done);
  const groups = [
    ['Overdue', (d) => daysUntil(d.date) < 0],
    ['Today', (d) => daysUntil(d.date) === 0],
    ['This week', (d) => daysUntil(d.date) > 0 && daysUntil(d.date) <= 7],
    ['Next 30 days', (d) => daysUntil(d.date) > 7 && daysUntil(d.date) <= 30],
    ['Later', (d) => daysUntil(d.date) > 30],
  ];
  if (!items.length) return emptyState('No deadlines', 'Add submission dates, milestones and meetings — they will show on your home page.', btn('Add deadline', () => openDeadlineModal(), { iconName: 'plus', size: 'sm' }));
  const done = items.filter((d) => d.done);
  return h('div', { class: 'list' },
    groups.map(([label, test]) => {
      const g = open.filter(test);
      return g.length ? [h('div', { class: 'group-title' }, `${label} · ${g.length}`), g.map((d) => deadlineRow(d))] : null;
    }),
    done.length ? [h('div', { class: 'group-title' }, `Completed · ${done.length}`), done.map((d) => deadlineRow(d))] : null);
}

function calendarView() {
  const now = new Date();
  view.month ||= { y: now.getFullYear(), m: now.getMonth() };
  const { y, m } = view.month;
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const items = filtered(true);
  const byDate = new Map();
  for (const d of items) (byDate.get(d.date) || byDate.set(d.date, []).get(d.date)).push(d);
  const today = todayStr();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const list = byDate.get(key) || [];
    cells.push(h('div', {
      class: `cal-cell ${d.getMonth() !== m ? 'other' : ''} ${key === today ? 'today' : ''}`,
      onclick: (e) => { if (e.target.closest('.cal-item')) return; openDeadlineModal(null, { date: key, projectId: view.project }); },
      title: 'Click to add a deadline on this day',
    },
      h('span', { class: 'daynum' }, d.getDate()),
      list.slice(0, 3).map((it) => h('div', {
        class: `cal-item ${it.done ? 'done' : ''}`, style: { borderLeftColor: getProject(it.projectId)?.color || 'var(--muted)' }, title: `${it.title}${it.time ? ' · ' + it.time : ''}`,
        onclick: () => (it.kind === 'task' ? (location.hash = `#/project/${it.projectId}`) : openDeadlineModal(it.ref)),
      }, it.title)),
      list.length > 3 ? h('span', { class: 'small muted' }, `+${list.length - 3} more`) : null));
    if (i >= 34 && d.getMonth() !== m && d.getDay() === 6) break;
  }
  const shift = (n) => { const d = new Date(y, m + n, 1); view.month = { y: d.getFullYear(), m: d.getMonth() }; refresh(); };
  return h('div', { class: 'stack' },
    h('div', { class: 'row between' },
      h('h2', {}, first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
      h('div', { class: 'row', style: { gap: '.25rem' } },
        btn('‹', () => shift(-1), { title: 'Previous month', size: 'sm' }),
        btn('Today', () => { view.month = null; refresh(); }, { size: 'sm' }),
        btn('›', () => shift(1), { title: 'Next month', size: 'sm' }))),
    h('div', { class: 'cal' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => h('div', { class: 'cal-dow' }, d)), cells));
}

function exportIcs() {
  const items = filtered(false);
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Research Dashboard//EN', 'CALSCALE:GREGORIAN'];
  for (const d of items) {
    const date = d.date.replace(/-/g, '');
    const p = getProject(d.projectId);
    lines.push('BEGIN:VEVENT', `UID:${d.id}@research-dashboard`, `DTSTAMP:${stamp}`);
    if (d.time) {
      const t = d.time.replace(':', '') + '00';
      lines.push(`DTSTART:${date}T${t}`, `DURATION:PT1H`);
    } else {
      const [yy, mm, dd] = d.date.split('-').map(Number);
      const next = new Date(yy, mm - 1, dd + 1);
      const nextStr = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
      lines.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${nextStr}`);
    }
    lines.push(`SUMMARY:${esc(d.title)}${p ? esc(` [${p.title}]`) : ''}`, `DESCRIPTION:${esc([d.type, d.notes].filter(Boolean).join(' — '))}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  download('research-deadlines.ics', lines.join('\r\n'), 'text/calendar');
}
