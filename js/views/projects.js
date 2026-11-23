import {
  state, save, uid, PHASES, LINK_TYPES, SECTION_STATUSES, EXPERIMENT_STATUSES, PAPER_STATUSES,
  getProject, phaseProgress, projectProgress, allDeadlines, touch, todayStr,
} from '../store.js';
import {
  h, icon, btn, advanced, field, input, textarea, select, modal, confirmDialog, toast, fmtDate,
  progressBar, emptyState, refresh, safeUrl, download, copyText, timeAgo, debounce,
} from '../ui.js';
import { phaseBar, projectDot, deadlineRow, openDeadlineModal, openProjectModal, tabs } from './common.js';
import { openPaperModal, openCiteModal, pickPapersModal } from './papers.js';
import { createNote } from './notes.js';
import { graphStudio } from './graphs.js';
import { toBibtex, citeKey } from '../cite.js';
import { deleteData } from '../idb.js';

let projectFilter = 'active';

// ===================================================== list
export function renderProjects() {
  const list = state.projects.filter((p) => projectFilter === 'all' || (projectFilter === 'archived' ? p.status === 'archived' : p.status !== 'archived'));
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Projects'), h('p', { class: 'sub' }, 'Each project moves through four phases: Gathering Materials, Experimentation, Analysis and Paper Writing.')),
      h('div', { class: 'actions' },
        tabs([{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All' }], projectFilter, (v) => { projectFilter = v; refresh(); }),
        btn('New project', () => openProjectModal(), { kind: 'primary', iconName: 'plus' }))),
    list.length
      ? h('div', { class: 'grid cards' }, list.map(projectCard))
      : h('div', { class: 'card' }, emptyState(projectFilter === 'archived' ? 'No archived projects' : 'No projects yet', 'Projects hold your tasks, experiments, figures and manuscript progress.', btn('Create a project', () => openProjectModal(), { kind: 'primary', iconName: 'plus' }))));
}

function projectCard(p) {
  const pct = projectProgress(p);
  const next = allDeadlines().find((d) => d.projectId === p.id);
  return h('a', { class: 'card project-card', href: `#/project/${p.id}` },
    h('div', { class: 'row between' },
      h('div', { class: 'row', style: { gap: '.5rem', minWidth: 0 } }, projectDot(p), h('h3', {}, p.title)),
      p.status === 'archived' ? h('span', { class: 'chip' }, 'Archived') : h('span', { class: 'pct' }, `${pct}%`)),
    p.description ? h('p', { class: 'desc' }, p.description) : null,
    phaseBar(p),
    h('div', { class: 'row between small muted' },
      h('span', { class: 'row', style: { gap: '.35rem' } }, ...p.links.filter((l) => l.type !== 'other').map((l) => h('span', { title: LINK_TYPES[l.type] }, icon(l.type, 15)))),
      next ? h('span', {}, `Next: ${next.title} · ${fmtDate(next.date, { month: 'short', day: 'numeric' })}`) : h('span', {}, `Updated ${timeAgo(p.updated)}`)));
}

// ===================================================== detail
export function renderProject(id, tab) {
  const p = getProject(id);
  if (!p) return h('div', { class: 'page' }, h('h1', {}, 'Project not found'), h('p', {}, h('a', { href: '#/projects' }, '← Back to projects')));
  const phaseIndex = PHASES.findIndex((ph) => ph.key === tab);

  let content;
  if (phaseIndex >= 0) content = phaseView(p, phaseIndex);
  else content = overview(p);

  return h('div', { class: 'page' }, projectHeader(p), stepper(p, tab), content);
}

function projectHeader(p) {
  const pct = projectProgress(p);
  const linkFor = (type) => p.links.find((l) => l.type === type);
  const linkButtons = ['drive', 'github', 'overleaf'].map((type) => {
    const l = linkFor(type);
    return l
      ? h('a', { class: 'link-btn', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, icon(type, 16), l.label || LINK_TYPES[type], icon('external', 13))
      : h('button', { class: 'link-btn missing', type: 'button', onclick: () => openLinkModal(p, null, type) }, icon('plus', 14), `Link ${LINK_TYPES[type]}`);
  });
  const others = p.links.filter((l) => l.type === 'other').map((l) =>
    h('a', { class: 'link-btn', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), l.label || new URL(l.url).hostname, icon('external', 13)));
  return h('div', { class: 'card project-head' },
    h('div', { class: 'row between' },
      h('div', { class: 'row', style: { gap: '.6rem', minWidth: 0 } },
        h('a', { href: '#/projects', class: 'btn ghost icon-btn', title: 'All projects', 'aria-label': 'All projects' }, '←'),
        projectDot(p), h('h1', {}, p.title), p.status === 'archived' ? h('span', { class: 'chip' }, 'Archived') : null),
      h('div', { class: 'actions' }, btn('Edit', () => openProjectModal(p), { iconName: 'edit', size: 'sm' }))),
    p.description ? h('p', { class: 'muted', style: { margin: 0 } }, p.description) : null,
    h('div', { class: 'row', style: { gap: '1rem' } },
      h('div', { class: 'grow' }, progressBar(pct, { label: 'Overall progress' })),
      h('span', { class: 'pct' }, `${pct}% overall`),
      h('span', { class: 'muted small' }, `Current phase: ${p.phases[p.currentPhase].name}`)),
    h('div', { class: 'link-bar' }, linkButtons, others, btn('', () => openLinkModal(p), { kind: 'ghost', iconName: 'plus', title: 'Add another link', size: 'sm' })));
}

function stepper(p, tab) {
  return h('div', { class: 'stepper', role: 'tablist' },
    h('a', { class: `step overview ${tab === 'overview' ? 'active' : ''}`, href: `#/project/${p.id}`, role: 'tab' }, icon('layers'), h('span', { class: 'small', style: { fontWeight: 600 } }, 'Overview')),
    p.phases.map((ph, i) => {
      const pct = phaseProgress(p, i);
      return h('a', { class: `step ${tab === ph.key ? 'active' : ''}`, href: `#/project/${p.id}/${ph.key}`, role: 'tab' },
        h('div', { class: 'step-top' }, `Phase ${i + 1}`, i === p.currentPhase ? h('span', { class: 'current-badge' }, 'Current') : null, pct === 100 ? icon('check', 14) : null),
        h('div', { class: 'step-name', title: ph.name }, ph.name),
        h('div', { class: 'row', style: { gap: '.5rem' } }, h('div', { class: 'grow' }, progressBar(pct, { label: `${ph.name} progress` })), h('span', { class: 'small pct' }, `${pct}%`)));
    }));
}

// ----------------------------------------------------- links
function openLinkModal(p, existing, presetType = 'other') {
  const l = existing || { id: uid(), type: presetType, label: '', url: '' };
  const hints = {
    drive: 'Paste a shared folder or file link from Google Drive.',
    github: 'Repository URL, e.g. https://github.com/user/repo',
    overleaf: 'Open your project in Overleaf and copy the URL from the address bar.',
    other: 'Any URL: Zotero group, Notion page, lab wiki, dataset portal…',
  };
  const typeSel = select(Object.entries(LINK_TYPES).map(([value, label]) => ({ value, label })), l.type);
  const url = input({ value: l.url, placeholder: 'https://…' });
  const label = input({ value: l.label, placeholder: 'Optional display name' });
  const hint = h('span', { class: 'field-hint' }, hints[l.type]);
  typeSel.onchange = () => (hint.textContent = hints[typeSel.value]);
  modal(existing ? 'Edit link' : 'Add link', h('div', { class: 'stack' }, field('Type', typeSel), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'URL'), url, hint), field('Label', label)), [
    { label: 'Cancel', onClick: (c) => c() },
    { label: 'Save link', kind: 'primary', onClick: (close) => {
      const u = safeUrl(url.value);
      if (!u) { url.focus(); return toast('Enter a valid http(s) URL', 'error'); }
      Object.assign(l, { type: typeSel.value, url: u, label: label.value.trim() });
      if (!existing) p.links.push(l);
      touch(p); save(); close(); refresh();
    } },
  ]);
}

function parseGithub(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

const ghCache = new Map();
function githubActivity(p) {
  const gl = p.links.find((l) => l.type === 'github');
  const out = h('div', { class: 'stack' });
  if (!gl || !parseGithub(gl.url)) {
    out.append(h('p', { class: 'muted small' }, 'Link a public GitHub repository to see recent commits and open issues.'));
    return out;
  }
  const { owner, repo } = parseGithub(gl.url);
  const show = (data) => {
    out.replaceChildren(
      h('div', { class: 'row small' },
        h('span', { class: 'chip' }, icon('star', 12), `${data.repo.stargazers_count} stars`),
        h('span', { class: 'chip' }, `${data.repo.open_issues_count} open issues/PRs`),
        h('span', { class: 'chip' }, `Pushed ${timeAgo(data.repo.pushed_at)}`),
        data.repo.language ? h('span', { class: 'chip' }, data.repo.language) : null),
      h('div', { class: 'list' }, data.commits.map((c) => h('a', { class: 'list-item', href: c.html_url, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--text)' } },
        h('code', { class: 'small muted' }, c.sha.slice(0, 7)),
        h('div', { class: 'grow' }, h('div', { class: 'title small' }, c.commit.message.split('\n')[0]), h('div', { class: 'meta' }, `${c.commit.author?.name || ''} · ${timeAgo(c.commit.author?.date)}`))))));
  };
  const load = async () => {
    out.replaceChildren(h('p', { class: 'muted small' }, 'Loading from GitHub…'));
    try {
      const [r, c] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}`),
        fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`),
      ]);
      if (!r.ok) throw new Error(r.status === 404 ? 'Repository not found or private.' : `GitHub returned ${r.status}.`);
      const data = { repo: await r.json(), commits: c.ok ? await c.json() : [] };
      ghCache.set(gl.url, data);
      show(data);
    } catch (e) {
      out.replaceChildren(h('div', { class: 'notice err' }, icon('alert', 16), h('span', {}, `${e.message} Private repos need to be opened on GitHub directly.`)));
    }
  };
  if (ghCache.has(gl.url)) show(ghCache.get(gl.url));
  else out.append(h('p', { class: 'muted small' }, `Fetch public activity for ${owner}/${repo} from the GitHub API. Nothing about you is sent.`), btn('Load GitHub activity', load, { size: 'sm', iconName: 'github' }));
  return out;
}

// ----------------------------------------------------- overview
function overview(p) {
  const items = allDeadlines({ includeDone: false }).filter((d) => d.projectId === p.id);
  const notes = state.notes.filter((n) => n.projectId === p.id).sort((a, b) => b.updated.localeCompare(a.updated));

  const deadlines = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('calendar'), 'Deadlines'), btn('Add', () => openDeadlineModal(null, { projectId: p.id }), { size: 'sm', iconName: 'plus' })),
    items.length ? h('div', { class: 'list' }, items.map((d) => deadlineRow(d, { showProject: false }))) : emptyState('No upcoming deadlines for this project'));

  const phasesCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('layers'), 'Phases')),
    h('div', { class: 'list' }, p.phases.map((ph, i) => {
      const open = ph.tasks.filter((t) => !t.done).length;
      return h('a', { class: 'list-item', href: `#/project/${p.id}/${ph.key}`, style: { color: 'var(--text)' } },
        h('span', { class: 'chip' }, i + 1),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, ph.name, i === p.currentPhase ? h('span', { class: 'current-badge', style: { marginLeft: '.5rem' } }, 'Current') : null),
          h('div', { class: 'meta' }, `${open} open task${open === 1 ? '' : 's'}`, ph.start || ph.end ? `· ${ph.start ? fmtDate(ph.start) : '…'} – ${ph.end ? fmtDate(ph.end) : '…'}` : '')),
        h('div', { style: { width: '120px' } }, progressBar(phaseProgress(p, i))),
        h('span', { class: 'pct small', style: { width: '3ch', textAlign: 'right' } }, `${phaseProgress(p, i)}%`));
    })));

  const linksCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('link'), 'Links & resources'), btn('Add link', () => openLinkModal(p), { size: 'sm', iconName: 'plus' })),
    p.links.length ? h('div', { class: 'list' }, p.links.map((l) => h('div', { class: 'list-item' },
      icon(l.type === 'other' ? 'link' : l.type, 18),
      h('div', { class: 'grow' }, h('a', { class: 'title', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label || LINK_TYPES[l.type]), h('div', { class: 'meta', style: { wordBreak: 'break-all' } }, l.url)),
      h('div', { class: 'hover-actions' },
        btn('', () => openLinkModal(p, l), { kind: 'ghost', iconName: 'edit', title: 'Edit link', size: 'sm' }),
        btn('', () => { p.links = p.links.filter((x) => x !== l); save(); refresh(); }, { kind: 'ghost', iconName: 'trash', title: 'Remove link', size: 'sm' }))))) : emptyState('No links yet', 'Connect your Google Drive folder, GitHub repo and Overleaf project.'),
    advanced(`gh-${p.id}`, h('h4', {}, 'GitHub activity'), githubActivity(p)));

  const notesCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('note'), 'Notes'), btn('New note', () => createNote({ projectId: p.id }), { size: 'sm', iconName: 'plus' })),
    notes.length ? h('div', { class: 'list' }, notes.slice(0, 6).map((n) => h('a', { class: 'list-item', href: `#/notes/${n.id}`, style: { color: 'var(--text)' } },
      h('div', { class: 'grow' }, h('div', { class: 'title' }, n.title || 'Untitled note'), h('div', { class: 'meta' }, timeAgo(n.updated)))))) : emptyState('No notes for this project'));

  const settings = advanced(`proj-settings-${p.id}`,
    h('h4', {}, 'Project settings'),
    h('div', { class: 'row' },
      btn(p.status === 'archived' ? 'Unarchive' : 'Archive project', () => { p.status = p.status === 'archived' ? 'active' : 'archived'; save(); refresh(); }, { iconName: 'folder' }),
      btn('Duplicate as template', () => duplicateProject(p), { iconName: 'copy' }),
      btn('Export project (JSON)', () => download(`${slug(p.title)}.json`, JSON.stringify({ project: p, deadlines: state.deadlines.filter((d) => d.projectId === p.id), notes }, null, 2), 'application/json'), { iconName: 'download' }),
      btn('Delete project', async () => {
        if (!(await confirmDialog(`Delete "${p.title}" and its deadlines, datasets and charts? Notes and papers are kept.`))) return;
        for (const ds of state.datasets.filter((d) => d.projectId === p.id)) deleteData(ds.id);
        state.datasets = state.datasets.filter((d) => d.projectId !== p.id);
        state.deadlines = state.deadlines.filter((d) => d.projectId !== p.id);
        state.notes.forEach((n) => { if (n.projectId === p.id) n.projectId = ''; });
        state.papers.forEach((pa) => { pa.projectIds = (pa.projectIds || []).filter((x) => x !== p.id); });
        state.projects = state.projects.filter((x) => x !== p);
        save(); location.hash = '#/projects';
      }, { kind: 'danger', iconName: 'trash' })),
    h('h4', {}, 'Phase names'),
    h('div', { class: 'form-grid' }, p.phases.map((ph, i) => field(`Phase ${i + 1}`, input({ value: ph.name, onchange: (e) => { ph.name = e.target.value.trim() || PHASES[i].name; save(); refresh(); } })))));

  return h('div', { class: 'stack', style: { gap: '1.25rem' } },
    h('div', { class: 'grid halves' }, deadlines, phasesCard, linksCard, notesCard),
    settings);
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project'; }

function duplicateProject(p) {
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = uid();
  copy.title = `${p.title} (copy)`;
  copy.created = copy.updated = new Date().toISOString();
  copy.currentPhase = 0;
  copy.charts = [];
  copy.experiments = [];
  copy.phases.forEach((ph) => { ph.progressOverride = null; ph.notes = ''; ph.tasks.forEach((t) => { t.id = uid(); t.done = false; t.due = ''; }); });
  copy.writing.sections.forEach((s) => { s.id = uid(); s.status = 'Not started'; s.words = 0; });
  state.projects.push(copy);
  save();
  toast('Project duplicated');
  location.hash = `#/project/${copy.id}`;
}

// ----------------------------------------------------- phase view
function phaseView(p, i) {
  const ph = p.phases[i];
  const def = PHASES[i];
  const pct = phaseProgress(p, i);
  const isCurrent = p.currentPhase === i;

  const header = h('section', { class: 'card' },
    h('div', { class: 'row between' },
      h('div', {},
        h('div', { class: 'small muted' }, `Phase ${i + 1} of 4`),
        h('h2', { style: { fontSize: '1.35rem' } }, ph.name),
        h('p', { class: 'muted', style: { margin: '.25rem 0 0' } }, def.blurb)),
      h('div', { class: 'actions' },
        isCurrent ? h('span', { class: 'chip accent' }, 'Current phase') : btn('Set as current phase', () => { p.currentPhase = i; touch(p); save(); refresh(); }, { size: 'sm' }),
        ph.progressOverride === 100
          ? btn('Reopen phase', () => { ph.progressOverride = null; save(); refresh(); }, { size: 'sm' })
          : btn('Mark phase complete', () => {
            ph.progressOverride = 100;
            if (isCurrent && i < 3) p.currentPhase = i + 1;
            touch(p); save(); refresh();
            toast(i < 3 ? `Nice! Moving on to ${p.phases[i + 1].name}.` : 'Project phases complete!');
          }, { size: 'sm', kind: 'primary', iconName: 'check' }))),
    h('div', { class: 'row', style: { marginTop: '1rem' } }, h('div', { class: 'grow' }, progressBar(pct)), h('span', { class: 'pct' }, `${pct}%`),
      ph.progressOverride != null && ph.progressOverride !== 100 ? h('span', { class: 'chip' }, 'Manual') : null),
    advanced(`phase-${p.id}-${i}`,
      h('div', { class: 'form-grid' },
        field('Phase name', input({ value: ph.name, onchange: (e) => { ph.name = e.target.value.trim() || def.name; save(); refresh(); } })),
        h('div'),
        field('Start date', input({ type: 'date', value: ph.start, onchange: (e) => { ph.start = e.target.value; save(); } })),
        field('Target end date', input({ type: 'date', value: ph.end, onchange: (e) => { ph.end = e.target.value; save(); } }), 'Shown in the phase list on the overview.')),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, `Progress override: ${ph.progressOverride == null ? 'automatic (from tasks)' : ph.progressOverride + '%'}`),
        h('div', { class: 'row' },
          h('input', { type: 'range', min: 0, max: 100, step: 5, value: ph.progressOverride ?? pct, class: 'grow', onchange: (e) => { ph.progressOverride = Number(e.target.value); save(); refresh(); } }),
          btn('Use automatic', () => { ph.progressOverride = null; save(); refresh(); }, { size: 'sm' })),
        h('span', { class: 'field-hint' }, 'Automatic progress counts finished tasks plus phase-specific items (experiments, manuscript sections).'))));

  const specific = {
    gathering: gatheringSection,
    experimentation: experimentSection,
    analysis: (proj) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, icon('chart'), 'Graph studio'), h('span', { class: 'muted small' }, 'Upload a CSV or link a Google Sheet, then build figures.')), graphStudio(proj)),
    writing: writingSection,
  }[def.key](p);

  const specificFirst = def.key === 'analysis' || def.key === 'writing';
  return h('div', { class: 'stack', style: { gap: '1.25rem' } },
    header,
    specificFirst ? specific : null,
    h('div', { class: 'grid two' }, tasksCard(p, i), phaseNotesCard(p, i)),
    specificFirst ? null : specific);
}

function tasksCard(p, i) {
  const ph = p.phases[i];
  const text = input({ placeholder: 'Add a task and press Enter' });
  const due = input({ type: 'date', title: 'Optional due date', style: { width: '150px' } });
  const add = () => {
    if (!text.value.trim()) return;
    ph.tasks.push({ id: uid(), text: text.value.trim(), done: false, due: due.value });
    touch(p); save(); refresh();
    setTimeout(() => document.querySelector('[data-task-input]')?.focus(), 0);
  };
  text.setAttribute('data-task-input', '');
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const open = ph.tasks.filter((t) => !t.done).length;
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('check'), 'Tasks'), h('span', { class: 'muted small' }, `${ph.tasks.length - open} of ${ph.tasks.length} done`)),
    ph.tasks.length ? h('div', {}, ph.tasks.map((t, idx) => h('div', { class: `task ${t.done ? 'done' : ''}` },
      h('input', { type: 'checkbox', checked: t.done, 'aria-label': `Done: ${t.text}`, onchange: (e) => { t.done = e.target.checked; touch(p); save(); refresh(); } }),
      h('span', { class: 'text' }, t.text),
      t.due ? h('span', { class: 'chip' }, icon('calendar', 12), fmtDate(t.due, { month: 'short', day: 'numeric' })) : null,
      h('div', { class: 'row', style: { gap: 0 } },
        btn('', () => editTask(p, t), { kind: 'ghost', iconName: 'edit', title: 'Edit task', size: 'sm' }),
        idx > 0 ? btn('', () => { [ph.tasks[idx - 1], ph.tasks[idx]] = [ph.tasks[idx], ph.tasks[idx - 1]]; save(); refresh(); }, { kind: 'ghost', title: 'Move up', size: 'sm', iconName: 'up' }) : null,
        btn('', () => { ph.tasks.splice(idx, 1); save(); refresh(); }, { kind: 'ghost', iconName: 'trash', title: 'Delete task', size: 'sm' }))))) : h('p', { class: 'muted small' }, 'No tasks yet. Break this phase into small, checkable steps.'),
    h('div', { class: 'task-add' }, text, due, btn('Add', add, { iconName: 'plus' })),
    h('p', { class: 'field-hint', style: { marginTop: '.4rem' } }, 'Tasks with a due date also appear in your deadlines.'));
}

function editTask(p, t) {
  const text = input({ value: t.text });
  const due = input({ type: 'date', value: t.due || '' });
  modal('Edit task', h('div', { class: 'stack' }, field('Task', text), field('Due date', due)), [
    { label: 'Cancel', onClick: (c) => c() },
    { label: 'Save', kind: 'primary', onClick: (c) => { t.text = text.value.trim() || t.text; t.due = due.value; touch(p); save(); c(); refresh(); } },
  ]);
}

function phaseNotesCard(p, i) {
  const ph = p.phases[i];
  const saveNotes = debounce((v) => { ph.notes = v; save(); }, 500);
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('note'), 'Phase notes'), h('span', { class: 'muted small' }, 'Saved automatically')),
    textarea({ value: ph.notes, rows: 10, placeholder: 'Scratchpad for this phase — decisions, blockers, ideas…', oninput: (e) => saveNotes(e.target.value) }));
}

// ----------------------------------------------------- gathering
function gatheringSection(p) {
  const papers = state.papers.filter((pa) => (pa.projectIds || []).includes(p.id));
  const drive = p.links.find((l) => l.type === 'drive');
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', {}, icon('book'), 'Reading list'),
      h('div', { class: 'actions' },
        drive ? h('a', { class: 'btn sm', href: drive.url, target: '_blank', rel: 'noopener noreferrer' }, icon('drive', 15), 'Materials folder') : null,
        btn('Add from library', () => pickPapersModal(p), { size: 'sm' }),
        btn('New paper', () => openPaperModal(null, { projectIds: [p.id] }), { size: 'sm', kind: 'primary', iconName: 'plus' }))),
    papers.length ? h('div', { class: 'table-wrap', style: { maxHeight: 'none' } }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Title'), h('th', {}, 'Year'), h('th', {}, 'Status'), h('th', {}, ''))),
      h('tbody', {}, papers.map((pa) => h('tr', {},
        h('td', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); openPaperModal(pa); } }, pa.title), h('div', { class: 'small muted' }, (pa.authors || []).slice(0, 3).join(', ') + ((pa.authors || []).length > 3 ? ' et al.' : ''))),
        h('td', { class: 'num' }, pa.year || ''),
        h('td', {}, select(PAPER_STATUSES, pa.status, { class: 'input status-select', style: { width: 'auto' }, onchange: (e) => { pa.status = e.target.value; save(); refresh(); } })),
        h('td', { style: { whiteSpace: 'nowrap' } },
          btn('', () => openCiteModal(pa), { kind: 'ghost', iconName: 'quote', title: 'Cite', size: 'sm' }),
          btn('', () => { pa.projectIds = pa.projectIds.filter((x) => x !== p.id); save(); refresh(); }, { kind: 'ghost', iconName: 'x', title: 'Remove from project', size: 'sm' }))))))) : emptyState('No papers linked yet', 'Add papers from your library or create new entries for this project.'),
    advanced(`gather-${p.id}`, bibExport(p, papers)));
}

function bibExport(p, papers) {
  return h('div', { class: 'stack' },
    h('h4', {}, 'Bibliography for this project'),
    h('div', { class: 'row' },
      btn('Download references.bib', () => download('references.bib', papers.map(toBibtex).join('\n\n'), 'application/x-bibtex'), { iconName: 'download', size: 'sm' }),
      btn('Copy \\cite{…} keys', () => copyText(`\\cite{${papers.map(citeKey).join(', ')}}`), { iconName: 'copy', size: 'sm' })),
    h('p', { class: 'field-hint' }, 'Upload references.bib to your Overleaf project to cite these papers.'));
}

// ----------------------------------------------------- experimentation
let expFilter = 'All';
function experimentSection(p) {
  const list = p.experiments.filter((e) => expFilter === 'All' || e.status === expFilter);
  const gh = p.links.find((l) => l.type === 'github');
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', {}, icon('flask'), 'Experiment log'),
      h('div', { class: 'actions' },
        tabs(['All', ...EXPERIMENT_STATUSES].map((v) => ({ value: v, label: v })), expFilter, (v) => { expFilter = v; refresh(); }),
        gh ? h('a', { class: 'btn sm', href: gh.url, target: '_blank', rel: 'noopener noreferrer' }, icon('github', 15), 'Code') : null,
        btn('New experiment', () => openExperimentModal(p), { size: 'sm', kind: 'primary', iconName: 'plus' }))),
    list.length ? h('div', { class: 'stack' }, list.map((e) => h('div', { class: 'exp-card' },
      h('div', { class: 'row between' },
        h('div', { class: 'row', style: { gap: '.5rem' } }, h('strong', {}, e.name), h('span', { class: `chip ${e.status === 'Done' ? 'status-done' : e.status === 'Failed' ? 'status-critical' : e.status === 'Running' ? 'accent' : ''}` }, e.status), e.date ? h('span', { class: 'small muted' }, fmtDate(e.date)) : null),
        h('div', { class: 'row', style: { gap: 0 } },
          btn('', () => openExperimentModal(p, e), { kind: 'ghost', iconName: 'edit', title: 'Edit', size: 'sm' }),
          btn('', async () => { if (await confirmDialog(`Delete experiment "${e.name}"?`)) { p.experiments = p.experiments.filter((x) => x !== e); save(); refresh(); } }, { kind: 'ghost', iconName: 'trash', title: 'Delete', size: 'sm' }))),
      h('dl', {},
        ...[['Hypothesis', e.hypothesis], ['Setup', e.setup], ['Results', e.results], ...p.experimentFields.map((f) => [f, e.fields?.[f]]), ['Code ref', e.codeRef]]
          .filter(([, v]) => v).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))))) : emptyState(p.experiments.length ? `No ${expFilter.toLowerCase()} experiments` : 'No experiments logged', 'Record the hypothesis, setup and results of each run.'),
    advanced(`exp-${p.id}`,
      h('h4', {}, 'Custom experiment fields'),
      h('p', { class: 'field-hint' }, 'Add fields that every experiment should record, such as learning rate, random seed, sample size or participant group.'),
      h('div', { class: 'row' }, p.experimentFields.map((f) => h('span', { class: 'chip' }, f, h('button', { class: 'btn ghost sm', style: { padding: 0 }, 'aria-label': `Remove field ${f}`, onclick: () => { p.experimentFields = p.experimentFields.filter((x) => x !== f); save(); refresh(); } }, icon('x', 12))))),
      (() => {
        const inp = input({ placeholder: 'Field name, e.g. Random seed', style: { maxWidth: '260px' } });
        const add = () => { const v = inp.value.trim(); if (v && !p.experimentFields.includes(v)) { p.experimentFields.push(v); save(); refresh(); } };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        return h('div', { class: 'row' }, inp, btn('Add field', add, { size: 'sm', iconName: 'plus' }));
      })(),
      btn('Export experiment log (CSV)', () => {
        const cols = ['name', 'status', 'date', 'hypothesis', 'setup', 'results', 'codeRef'];
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [[...cols, ...p.experimentFields].map(esc).join(','), ...p.experiments.map((e) => [...cols.map((c) => e[c]), ...p.experimentFields.map((f) => e.fields?.[f])].map(esc).join(','))];
        download('experiments.csv', rows.join('\n'), 'text/csv');
      }, { size: 'sm', iconName: 'download' })));
}

function openExperimentModal(p, existing) {
  const e = existing || { id: uid(), name: '', status: 'Planned', date: todayStr(), hypothesis: '', setup: '', results: '', codeRef: '', fields: {} };
  e.fields ||= {};
  const f = {
    name: input({ value: e.name, placeholder: 'e.g. Baseline with augmentation' }),
    status: select(EXPERIMENT_STATUSES, e.status),
    date: input({ type: 'date', value: e.date }),
    hypothesis: textarea({ value: e.hypothesis, rows: 2 }),
    setup: textarea({ value: e.setup, rows: 3, placeholder: 'Method, parameters, data used…' }),
    results: textarea({ value: e.results, rows: 3, placeholder: 'Outcome, metrics, observations…' }),
    codeRef: input({ value: e.codeRef, placeholder: 'Commit hash, branch or notebook link' }),
  };
  const custom = p.experimentFields.map((name) => [name, input({ value: e.fields[name] || '' })]);
  modal(existing ? 'Edit experiment' : 'New experiment', h('div', { class: 'form-grid' },
    h('div', { class: 'full' }, field('Name', f.name)),
    field('Status', f.status), field('Date', f.date),
    h('div', { class: 'full' }, field('Hypothesis', f.hypothesis)),
    h('div', { class: 'full' }, field('Setup', f.setup)),
    h('div', { class: 'full' }, field('Results', f.results)),
    ...custom.map(([name, el]) => field(name, el)),
    h('div', { class: 'full' }, field('Code reference', f.codeRef))), [
    { label: 'Cancel', onClick: (c) => c() },
    { label: 'Save', kind: 'primary', onClick: (close) => {
      if (!f.name.value.trim()) { f.name.focus(); return toast('Name the experiment', 'error'); }
      for (const k of Object.keys(f)) e[k] = f[k].value.trim?.() ?? f[k].value;
      for (const [name, el] of custom) e.fields[name] = el.value.trim();
      if (!existing) p.experiments.unshift(e);
      touch(p); save(); close(); refresh();
    } },
  ], { wide: true });
}

// ----------------------------------------------------- writing
function writingSection(p) {
  const w = p.writing;
  const overleaf = p.links.find((l) => l.type === 'overleaf');
  const totalWords = w.sections.reduce((a, s) => a + (Number(s.words) || 0), 0);
  const target = Number(w.targetWords) || w.sections.reduce((a, s) => a + (Number(s.target) || 0), 0);
  const submission = allDeadlines().find((d) => d.projectId === p.id && d.type === 'Submission');
  const papers = state.papers.filter((pa) => (pa.projectIds || []).includes(p.id));

  const manuscript = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('pen'), 'Manuscript'),
      overleaf ? h('a', { class: 'btn primary', href: overleaf.url, target: '_blank', rel: 'noopener noreferrer' }, icon('overleaf', 16), 'Open in Overleaf', icon('external', 13))
        : btn('Link Overleaf project', () => openLinkModal(p, null, 'overleaf'), { iconName: 'plus' })),
    h('div', { class: 'form-grid' },
      field('Target venue', input({ value: w.venue, placeholder: 'e.g. CHI 2027, Nature Methods', onchange: (e) => { w.venue = e.target.value; save(); } })),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Submission deadline'),
        submission ? h('div', { class: 'row' }, h('span', {}, `${submission.title} · ${fmtDate(submission.date)}`)) : btn('Add submission deadline', () => openDeadlineModal(null, { projectId: p.id, type: 'Submission', phase: 3, title: w.venue ? `Submit to ${w.venue}` : 'Paper submission', priority: 'High' }), { size: 'sm', iconName: 'calendar' }))),
    h('div', { style: { marginTop: '1rem' } },
      h('div', { class: 'row between small' }, h('span', {}, 'Word count'), h('span', { class: 'pct' }, target ? `${totalWords.toLocaleString()} / ${target.toLocaleString()}` : totalWords.toLocaleString())),
      target ? progressBar(Math.min(100, Math.round((totalWords / target) * 100)), { label: 'Word count progress' }) : null));

  const sections = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, icon('layers'), 'Sections'), h('span', { class: 'muted small' }, 'Update status as you draft in Overleaf')),
    h('div', { class: 'table-wrap sections-table', style: { maxHeight: 'none' } }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Section'), h('th', {}, 'Status'), h('th', { class: 'num' }, 'Words'), h('th', { class: 'num' }, 'Target'), h('th', {}, ''))),
      h('tbody', {}, w.sections.map((s, idx) => h('tr', {},
        h('td', {}, input({ value: s.name, 'aria-label': 'Section name', onchange: (e) => { s.name = e.target.value; save(); } })),
        h('td', {}, select(SECTION_STATUSES, s.status, { 'aria-label': 'Section status', onchange: (e) => { s.status = e.target.value; touch(p); save(); refresh(); } })),
        h('td', { class: 'num' }, input({ type: 'number', min: 0, value: s.words || '', style: { width: '90px', textAlign: 'right' }, 'aria-label': 'Words', onchange: (e) => { s.words = Number(e.target.value) || 0; save(); refresh(); } })),
        h('td', { class: 'num' }, input({ type: 'number', min: 0, value: s.target || '', style: { width: '90px', textAlign: 'right' }, 'aria-label': 'Target words', onchange: (e) => { s.target = Number(e.target.value) || 0; save(); refresh(); } })),
        h('td', { style: { whiteSpace: 'nowrap' } },
          idx > 0 ? btn('', () => { [w.sections[idx - 1], w.sections[idx]] = [w.sections[idx], w.sections[idx - 1]]; save(); refresh(); }, { kind: 'ghost', iconName: 'up', title: 'Move up', size: 'sm' }) : null,
          btn('', () => { w.sections.splice(idx, 1); save(); refresh(); }, { kind: 'ghost', iconName: 'trash', title: 'Remove section', size: 'sm' }))))))),
    h('div', { style: { marginTop: '.75rem' } }, btn('Add section', () => { w.sections.push({ id: uid(), name: 'New section', status: 'Not started', words: 0, target: 0 }); save(); refresh(); }, { size: 'sm', iconName: 'plus' })),
    advanced(`writing-${p.id}`,
      field('Total word target (overrides the sum of section targets)', input({ type: 'number', min: 0, value: w.targetWords || '', style: { maxWidth: '200px' }, onchange: (e) => { w.targetWords = Number(e.target.value) || 0; save(); refresh(); } })),
      bibExport(p, papers)));

  return h('div', { class: 'grid halves' }, manuscript, sections);
}
