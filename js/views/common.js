// Components shared across views.
import { state, save, uid, PHASES, DEADLINE_TYPES, PROJECT_COLORS, getProject, phaseProgress, projectProgress, urgency, newProject, allDeadlines, todayStr } from '../store.js';
import { h, icon, btn, field, input, textarea, select, modal, confirmDialog, toast, fmtDate, fmtTime, statusChip, refresh, advanced } from '../ui.js';

export function phaseBar(project, { labels = true } = {}) {
  const segs = project.phases.map((ph, i) => {
    const pct = phaseProgress(project, i);
    return h('div', { class: 'seg', title: `${ph.name}: ${pct}%` }, h('div', { style: { width: `${pct}%` } }));
  });
  return h('div', {},
    h('div', { class: 'phasebar', role: 'img', 'aria-label': project.phases.map((ph, i) => `${ph.name} ${phaseProgress(project, i)}%`).join(', ') }, segs),
    labels ? h('div', { class: 'phasebar-labels' }, project.phases.map((ph, i) => h('span', { class: i === project.currentPhase ? 'current' : '' }, PHASES[i].short))) : null);
}

export function projectDot(project) {
  return h('span', { class: 'dot', style: { background: project?.color || 'var(--muted)' } });
}

export function nextDeadlineFor(projectId) {
  return allDeadlines().find((d) => d.projectId === projectId);
}

export function projectSummaryRow(p) {
  const pct = projectProgress(p);
  const next = nextDeadlineFor(p.id);
  return h('a', { class: 'project-row', href: `#/project/${p.id}` },
    h('div', { class: 'row between' },
      h('div', { class: 'row', style: { gap: '.5rem', minWidth: 0 } }, projectDot(p), h('span', { class: 'title' }, p.title)),
      h('span', { class: 'pct' }, `${pct}%`)),
    phaseBar(p),
    h('div', { class: 'row between small muted' },
      h('span', {}, `Current phase: ${p.phases[p.currentPhase].name}`),
      next ? h('span', { class: 'row', style: { gap: '.4rem' } }, h('span', {}, next.title), statusChip(urgency(next.date))) : h('span', {}, 'No upcoming deadlines')));
}

export function deadlineRow(d, { showProject = true } = {}) {
  const p = d.projectId ? getProject(d.projectId) : null;
  const u = urgency(d.date, d.done);
  const toggle = h('input', {
    type: 'checkbox', checked: !!d.done, 'aria-label': `Mark "${d.title}" done`,
    onchange: (e) => { d.ref.done = e.target.checked; save(); refresh(); },
  });
  const open = () => {
    if (d.kind === 'task') location.hash = `#/project/${d.projectId}/${PHASES[d.phase].key}`;
    else openDeadlineModal(d.ref);
  };
  return h('div', { class: `list-item ${d.done ? 'done' : ''}` },
    toggle,
    h('div', { class: 'date-col' }, fmtDate(d.date, { month: 'short', day: 'numeric' }), d.time ? h('div', { class: 'muted' }, fmtTime(d.time)) : null),
    h('div', { class: 'grow', style: { cursor: 'pointer' }, onclick: open, role: 'button', tabindex: 0, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
      h('div', { class: 'title' }, d.title),
      h('div', { class: 'meta' },
        showProject && p ? h('span', { class: 'row', style: { gap: '.3rem', flexWrap: 'nowrap' } }, projectDot(p), p.title) : null,
        h('span', {}, d.kind === 'task' ? `Task · ${p?.phases[d.phase]?.name || ''}` : d.type),
        d.priority === 'High' ? h('span', { class: 'chip' }, 'High priority') : null)),
    statusChip(u));
}

export function openDeadlineModal(existing, defaults = {}) {
  const d = existing || { id: uid(), title: '', date: todayStr(), time: '', type: 'Milestone', projectId: '', phase: '', priority: 'Normal', notes: '', done: false, ...defaults };
  const f = {
    title: input({ value: d.title, placeholder: 'e.g. Submit camera-ready to NeurIPS' }),
    date: input({ type: 'date', value: d.date }),
    time: input({ type: 'time', value: d.time || '' }),
    type: select(DEADLINE_TYPES, d.type),
    project: select([{ value: '', label: '— No project —' }, ...state.projects.filter((p) => p.status !== 'archived' || p.id === d.projectId).map((p) => ({ value: p.id, label: p.title }))], d.projectId || ''),
    phase: select([{ value: '', label: '— Any phase —' }, ...PHASES.map((p, i) => ({ value: String(i), label: p.name }))], d.phase === '' || d.phase == null ? '' : String(d.phase)),
    priority: select(['Low', 'Normal', 'High'], d.priority || 'Normal'),
    notes: textarea({ value: d.notes || '', rows: 3, placeholder: 'Details, links, submission portal…' }),
  };
  const body = h('div', { class: 'form-grid' },
    h('div', { class: 'full' }, field('Title', f.title)),
    field('Date', f.date), field('Project', f.project),
    advanced('deadline-modal',
      h('div', { class: 'form-grid' }, field('Time (optional)', f.time), field('Type', f.type), field('Phase', f.phase), field('Priority', f.priority),
        h('div', { class: 'full' }, field('Notes', f.notes)))));
  body.lastChild.classList.add('full');
  const actions = [];
  if (existing) actions.push({ label: 'Delete', kind: 'danger', onClick: async (close) => {
    if (await confirmDialog(`Delete deadline "${d.title}"?`)) { state.deadlines = state.deadlines.filter((x) => x.id !== d.id); save(); close(); refresh(); }
  } });
  actions.push({ label: 'Cancel', onClick: (close) => close() });
  actions.push({ label: existing ? 'Save' : 'Add deadline', kind: 'primary', onClick: (close) => {
    if (!f.title.value.trim()) { f.title.focus(); return toast('Give the deadline a title', 'error'); }
    if (!f.date.value) { f.date.focus(); return toast('Pick a date', 'error'); }
    Object.assign(d, { title: f.title.value.trim(), date: f.date.value, time: f.time.value, type: f.type.value, projectId: f.project.value, phase: f.phase.value === '' ? '' : Number(f.phase.value), priority: f.priority.value, notes: f.notes.value });
    if (!existing) state.deadlines.push(d);
    save(); close(); refresh();
  } });
  modal(existing ? 'Edit deadline' : 'New deadline', body, actions);
}

export function openProjectModal(existing) {
  const p = existing || newProject();
  let color = p.color;
  const f = {
    title: input({ value: existing ? p.title : '', placeholder: 'e.g. Sleep and memory consolidation study' }),
    desc: textarea({ value: p.description, rows: 3, placeholder: 'Research question, goals, collaborators…' }),
    drive: input({ value: p.links.find((l) => l.type === 'drive')?.url || '', placeholder: 'https://drive.google.com/…' }),
    github: input({ value: p.links.find((l) => l.type === 'github')?.url || '', placeholder: 'https://github.com/user/repo' }),
    overleaf: input({ value: p.links.find((l) => l.type === 'overleaf')?.url || '', placeholder: 'https://www.overleaf.com/project/…' }),
  };
  const swatches = h('div', { class: 'swatches' }, PROJECT_COLORS.map((c) => h('button', {
    type: 'button', class: `swatch ${c === color ? 'on' : ''}`, style: { background: c }, 'aria-label': `Color ${c}`,
    onclick: (e) => { color = c; swatches.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); },
  })));
  const body = h('div', { class: 'stack' },
    field('Project name', f.title),
    field('Description', f.desc),
    h('div', { class: 'form-grid' },
      field('Google Drive folder', f.drive), field('GitHub repository', f.github),
      h('div', { class: 'full' }, field('Overleaf project', f.overleaf, 'Links are optional — add or change them any time.'))),
    advanced('project-modal', field('Color', swatches)));
  modal(existing ? 'Edit project' : 'New project', body, [
    { label: 'Cancel', onClick: (close) => close() },
    { label: existing ? 'Save' : 'Create project', kind: 'primary', onClick: (close) => {
      if (!f.title.value.trim()) { f.title.focus(); return toast('Give the project a name', 'error'); }
      p.title = f.title.value.trim();
      p.description = f.desc.value.trim();
      p.color = color;
      for (const type of ['drive', 'github', 'overleaf']) {
        const url = f[type].value.trim();
        const existingLink = p.links.find((l) => l.type === type);
        if (url && existingLink) existingLink.url = url;
        else if (url) p.links.push({ id: uid(), type, label: '', url });
        else if (existingLink) p.links = p.links.filter((l) => l !== existingLink);
      }
      if (!existing) state.projects.push(p);
      save(); close();
      if (!existing) location.hash = `#/project/${p.id}`; else refresh();
    } },
  ]);
}

export function tabs(items, active, onSelect) {
  return h('div', { class: 'pill-group', role: 'tablist' }, items.map((it) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': it.value === active ? 'true' : 'false', class: it.value === active ? 'on' : '', onclick: () => onSelect(it.value),
  }, it.label)));
}

export function tagList(tags = []) {
  return tags.map((t) => h('span', { class: 'chip tag' }, `#${t}`));
}

export function parseTags(str) {
  return [...new Set(str.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean))];
}

export { icon, btn };
