// Central app state, persisted to localStorage. Large datasets live in IndexedDB (see idb.js).
const KEY = 'research-dashboard.v1';

export const PHASES = [
  { key: 'gathering', name: 'Gathering Materials', short: 'Gathering', blurb: 'Literature, datasets, tools and background reading.' },
  { key: 'experimentation', name: 'Experimentation', short: 'Experiments', blurb: 'Design, run and log experiments.' },
  { key: 'analysis', name: 'Analysis', short: 'Analysis', blurb: 'Process results and build figures.' },
  { key: 'writing', name: 'Paper Writing', short: 'Writing', blurb: 'Draft, revise and submit the paper.' },
];

export const SECTION_STATUSES = ['Not started', 'Outlining', 'Drafting', 'Revising', 'Done'];
export const PAPER_STATUSES = ['To read', 'Reading', 'Read', 'Cited'];
export const EXPERIMENT_STATUSES = ['Planned', 'Running', 'Done', 'Failed'];
export const DEADLINE_TYPES = ['Milestone', 'Submission', 'Meeting', 'Review', 'Other'];
export const LINK_TYPES = {
  drive: 'Google Drive',
  github: 'GitHub',
  overleaf: 'Overleaf',
  other: 'Other link',
};
export const PROJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

export const events = new EventTarget();

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultSettings() {
  return {
    name: '',
    theme: 'system', // system | light | dark
    accent: '#2a78d6',
    upcomingDays: 14,
    citationStyle: 'APA',
    includeTaskDeadlines: true,
    home: { strip: true, notes: true, reading: true },
    phaseNames: PHASES.map((p) => p.name),
    defaultSections: ['Abstract', 'Introduction', 'Related Work', 'Method', 'Results', 'Discussion', 'Conclusion'],
  };
}

function defaultState() {
  return { version: 1, settings: defaultSettings(), projects: [], papers: [], notes: [], deadlines: [], datasets: [] };
}

export function newProject(fields = {}) {
  const s = state.settings;
  const now = new Date().toISOString();
  return normalizeProject({
    id: uid(),
    title: 'Untitled project',
    description: '',
    color: PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length],
    status: 'active',
    created: now,
    updated: now,
    currentPhase: 0,
    links: [],
    phases: PHASES.map((p, i) => ({ key: p.key, name: s.phaseNames[i] || p.name, tasks: [], notes: '', progressOverride: null, start: '', end: '' })),
    experiments: [],
    experimentFields: [],
    charts: [],
    writing: {
      venue: '',
      targetWords: 0,
      sections: s.defaultSections.map((name) => ({ id: uid(), name, status: 'Not started', words: 0, target: 0 })),
    },
    ...fields,
  });
}

function normalizeProject(p) {
  p.links ||= [];
  p.experiments ||= [];
  p.experimentFields ||= [];
  p.charts ||= [];
  p.writing ||= { venue: '', targetWords: 0, sections: [] };
  p.writing.sections ||= [];
  p.phases ||= [];
  PHASES.forEach((def, i) => {
    if (!p.phases[i]) p.phases[i] = { key: def.key, name: def.name, tasks: [], notes: '', progressOverride: null, start: '', end: '' };
    p.phases[i].tasks ||= [];
  });
  if (typeof p.currentPhase !== 'number') p.currentPhase = 0;
  return p;
}

function migrate(s) {
  const d = defaultState();
  const out = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  out.settings.home = { ...d.settings.home, ...(s.settings?.home || {}) };
  for (const k of ['projects', 'papers', 'notes', 'deadlines', 'datasets']) if (!Array.isArray(out[k])) out[k] = [];
  out.projects.forEach(normalizeProject);
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('Could not read saved data', e);
  }
  return defaultState();
}

export let state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    events.dispatchEvent(new CustomEvent('error', { detail: 'Could not save: browser storage is full. Export a backup and remove large items.' }));
  }
  events.dispatchEvent(new Event('change'));
}

export function replaceState(next) {
  state = migrate(next);
  save();
}

export function resetState() {
  state = defaultState();
  save();
}

export function storageBytes() {
  return (localStorage.getItem(KEY) || '').length * 2;
}

// ---------- lookups ----------
export const getProject = (id) => state.projects.find((p) => p.id === id);
export const getPaper = (id) => state.papers.find((p) => p.id === id);
export const getNote = (id) => state.notes.find((n) => n.id === id);

export function touch(project) {
  project.updated = new Date().toISOString();
}

// ---------- progress ----------
const SECTION_WEIGHT = { 'Not started': 0, Outlining: 0.2, Drafting: 0.5, Revising: 0.8, Done: 1 };

export function phaseProgress(project, index) {
  const phase = project.phases[index];
  if (phase.progressOverride != null) return phase.progressOverride;
  let total = phase.tasks.length;
  let done = phase.tasks.filter((t) => t.done).length;
  if (phase.key === 'writing' && project.writing.sections.length) {
    total += project.writing.sections.length;
    done += project.writing.sections.reduce((a, s) => a + (SECTION_WEIGHT[s.status] ?? 0), 0);
  }
  if (phase.key === 'experimentation' && project.experiments.length) {
    total += project.experiments.length;
    done += project.experiments.filter((e) => e.status === 'Done' || e.status === 'Failed').length;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

export function projectProgress(project) {
  const vals = project.phases.map((_, i) => phaseProgress(project, i));
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ---------- deadlines ----------
export function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

/** All dated items (explicit deadlines + task due dates), normalised. */
export function allDeadlines({ includeDone = false, includeTasks = state.settings.includeTaskDeadlines } = {}) {
  const items = state.deadlines.map((d) => ({ ...d, kind: 'deadline', ref: d }));
  if (includeTasks) {
    for (const p of state.projects) {
      if (p.status === 'archived') continue;
      p.phases.forEach((ph, i) => {
        for (const t of ph.tasks) {
          if (t.due) items.push({ id: t.id, title: t.text, date: t.due, time: '', projectId: p.id, phase: i, type: 'Task', done: t.done, kind: 'task', ref: t });
        }
      });
    }
  }
  return items
    .filter((d) => d.date && (includeDone || !d.done))
    .filter((d) => !d.projectId || getProject(d.projectId)?.status !== 'archived')
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

export function urgency(dateStr, done) {
  if (done) return { level: 'done', label: 'Done' };
  const n = daysUntil(dateStr);
  if (n < 0) return { level: 'critical', label: `${-n}d overdue` };
  if (n === 0) return { level: 'critical', label: 'Today' };
  if (n === 1) return { level: 'serious', label: 'Tomorrow' };
  if (n <= 3) return { level: 'serious', label: `In ${n} days` };
  if (n <= 7) return { level: 'warning', label: `In ${n} days` };
  return { level: 'calm', label: `In ${n} days` };
}
