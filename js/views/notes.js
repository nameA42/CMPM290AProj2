import { state, save, uid, getNote, getProject, getPaper } from '../store.js';
import { h, icon, btn, advanced, field, input, textarea, select, confirmDialog, emptyState, refresh, timeAgo, markdown, debounce, download } from '../ui.js';
import { projectDot, tabs, tagList, parseTags } from './common.js';

const view = { q: '', project: '', mode: 'write' };

export function createNote(defaults = {}) {
  const now = new Date().toISOString();
  const n = { id: uid(), title: '', body: '', projectId: '', paperId: '', tags: [], pinned: false, created: now, updated: now, ...defaults };
  state.notes.unshift(n);
  save();
  view.mode = 'write';
  location.hash = `#/notes/${n.id}`;
}

export function renderNotes(id) {
  const notes = state.notes
    .filter((n) => !view.project || n.projectId === view.project)
    .filter((n) => !view.q || `${n.title} ${n.body} ${(n.tags || []).join(' ')}`.toLowerCase().includes(view.q.toLowerCase()))
    .sort((a, b) => (b.pinned - a.pinned) || b.updated.localeCompare(a.updated));
  const current = id ? getNote(id) : notes[0];

  const listPane = h('div', { class: 'card', style: { padding: '.75rem' } },
    h('div', { class: 'stack', style: { gap: '.5rem', marginBottom: '.5rem' } },
      h('div', { class: 'search', style: { maxWidth: 'none' } }, icon('search', 16), input({
        type: 'search', placeholder: 'Search notes', value: view.q, 'aria-label': 'Search notes',
        oninput: (e) => { view.q = e.target.value; refresh(); const el = document.querySelector('.search input'); el?.focus(); el?.setSelectionRange(view.q.length, view.q.length); },
      })),
      select([{ value: '', label: 'All projects' }, ...state.projects.map((p) => ({ value: p.id, label: p.title }))], view.project, { 'aria-label': 'Filter by project', onchange: (e) => { view.project = e.target.value; refresh(); } })),
    notes.length ? h('div', { class: 'note-list' }, notes.map((n) => h('a', { class: `note-link ${current?.id === n.id ? 'active' : ''}`, href: `#/notes/${n.id}` },
      h('div', { class: 'title' }, n.pinned ? icon('pin', 13) : null, n.projectId ? projectDot(getProject(n.projectId)) : null, h('span', {}, n.title || 'Untitled note')),
      h('div', { class: 'excerpt' }, `${timeAgo(n.updated)} · ${n.body.replace(/[#*`>\-[\]]/g, '').slice(0, 80) || 'Empty'}`)))) : h('p', { class: 'muted small', style: { padding: '.5rem' } }, state.notes.length ? 'No matching notes.' : 'No notes yet.'));

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Notes'), h('p', { class: 'sub' }, 'Meeting notes, reading notes, ideas. Supports simple Markdown.')),
      h('div', { class: 'actions' }, btn('New note', () => createNote({ projectId: view.project }), { kind: 'primary', iconName: 'plus' }))),
    h('div', { class: 'notes-layout' }, listPane, current ? editor(current) : h('div', { class: 'card' }, emptyState('No note selected', 'Create a note to get started.', btn('New note', () => createNote(), { iconName: 'plus' })))));
}

function editor(n) {
  const touchSave = debounce(() => { n.updated = new Date().toISOString(); save(); }, 400);
  const title = input({ class: 'input note-title-input', value: n.title, placeholder: 'Note title', 'aria-label': 'Note title', oninput: (e) => { n.title = e.target.value; touchSave(); } });
  title.addEventListener('change', () => refresh());
  const body = view.mode === 'write'
    ? textarea({ class: 'input note-body', value: n.body, rows: 18, placeholder: '# Heading\n- bullet\n- [ ] todo\n**bold**, *italic*, `code`, [link](https://…)', 'aria-label': 'Note body', oninput: (e) => { n.body = e.target.value; touchSave(); } })
    : h('div', { class: 'md note-body', html: markdown(n.body) || '<p class="muted">Nothing here yet.</p>' });
  const paper = n.paperId ? getPaper(n.paperId) : null;

  return h('div', { class: 'card stack' },
    h('div', { class: 'row between' },
      tabs([{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }], view.mode, (v) => { view.mode = v; refresh(); }),
      h('div', { class: 'row', style: { gap: '.25rem' } },
        h('span', { class: 'muted small' }, `Saved · ${timeAgo(n.updated)}`),
        btn('', () => { n.pinned = !n.pinned; save(); refresh(); }, { kind: 'ghost', iconName: 'pin', title: n.pinned ? 'Unpin' : 'Pin to top', size: 'sm' }),
        btn('', async () => { if (await confirmDialog('Delete this note?')) { state.notes = state.notes.filter((x) => x !== n); save(); location.hash = '#/notes'; } }, { kind: 'ghost', iconName: 'trash', title: 'Delete note', size: 'sm' }))),
    title,
    h('div', { class: 'row small' },
      select([{ value: '', label: 'No project' }, ...state.projects.map((p) => ({ value: p.id, label: p.title }))], n.projectId, { style: { width: 'auto' }, 'aria-label': 'Project', onchange: (e) => { n.projectId = e.target.value; save(); refresh(); } }),
      paper ? h('span', { class: 'chip' }, icon('book', 12), paper.title.slice(0, 50)) : null,
      tagList(n.tags)),
    body,
    advanced('note-adv',
      h('div', { class: 'form-grid' },
        field('Tags', input({ value: (n.tags || []).join(', '), placeholder: 'meeting, idea, todo', onchange: (e) => { n.tags = parseTags(e.target.value); save(); refresh(); } })),
        field('Linked paper', select([{ value: '', label: '— None —' }, ...state.papers.map((p) => ({ value: p.id, label: p.title.slice(0, 70) }))], n.paperId || '', { onchange: (e) => { n.paperId = e.target.value; save(); refresh(); } }))),
      h('div', { class: 'row' },
        btn('Download as Markdown', () => download(`${(n.title || 'note').replace(/[^\w-]+/g, '_')}.md`, `# ${n.title}\n\n${n.body}`, 'text/markdown'), { iconName: 'download', size: 'sm' }),
        h('span', { class: 'muted small' }, `Created ${new Date(n.created).toLocaleString()}`))));
}
