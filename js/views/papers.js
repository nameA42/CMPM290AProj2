import { state, save, uid, PAPER_STATUSES, getProject } from '../store.js';
import { h, icon, btn, advanced, field, input, textarea, select, modal, confirmDialog, toast, emptyState, refresh, download, copyText, safeUrl } from '../ui.js';
import { projectDot, tabs, tagList, parseTags } from './common.js';
import { CITATION_STYLES, formatCitation, toBibtex, parseBibtex, paperFromBibtex, lookupDoi } from '../cite.js';
import { createNote } from './notes.js';

const view = { q: '', status: 'All', project: '', tag: '', sort: 'added' };

function matches(p) {
  if (view.status !== 'All' && p.status !== view.status) return false;
  if (view.project && !(p.projectIds || []).includes(view.project)) return false;
  if (view.tag && !(p.tags || []).includes(view.tag)) return false;
  if (view.q) {
    const hay = [p.title, ...(p.authors || []), p.venue, p.year, p.doi, ...(p.tags || []), p.notes].join(' ').toLowerCase();
    return view.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }
  return true;
}

const authorLine = (p) => {
  const a = p.authors || [];
  return a.length > 4 ? `${a.slice(0, 3).join(', ')} et al.` : a.join(', ');
};

export function renderPapers() {
  const sorters = {
    added: (a, b) => (b.added || '').localeCompare(a.added || ''),
    year: (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0),
    title: (a, b) => (a.title || '').localeCompare(b.title || ''),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
  };
  const list = state.papers.filter(matches).sort(sorters[view.sort]);
  const allTags = [...new Set(state.papers.flatMap((p) => p.tags || []))].sort();
  const counts = Object.fromEntries(PAPER_STATUSES.map((s) => [s, state.papers.filter((p) => p.status === s).length]));

  const search = h('div', { class: 'search' }, icon('search', 16), input({
    type: 'search', placeholder: 'Search title, author, venue, tag…', value: view.q, 'aria-label': 'Search papers',
    oninput: (e) => { view.q = e.target.value; const pos = e.target.selectionStart; refresh(); const el = document.querySelector('.search input'); el?.focus(); el?.setSelectionRange(pos, pos); },
  }));

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Papers & Citations'), h('p', { class: 'sub' }, `${state.papers.length} papers in your library`)),
      h('div', { class: 'actions' },
        btn('Import BibTeX', () => openImportModal(), { iconName: 'upload' }),
        btn('Add paper', () => openPaperModal(), { kind: 'primary', iconName: 'plus' }))),
    h('div', { class: 'card' },
      h('div', { class: 'row', style: { marginBottom: '.75rem' } },
        search,
        tabs([{ value: 'All', label: `All ${state.papers.length}` }, ...PAPER_STATUSES.map((s) => ({ value: s, label: `${s} ${counts[s]}` }))], view.status, (v) => { view.status = v; refresh(); })),
      advanced('papers-filters',
        h('div', { class: 'form-grid' },
          field('Project', select([{ value: '', label: 'All projects' }, ...state.projects.map((p) => ({ value: p.id, label: p.title }))], view.project, { onchange: (e) => { view.project = e.target.value; refresh(); } })),
          field('Tag', select([{ value: '', label: 'All tags' }, ...allTags.map((t) => ({ value: t, label: `#${t}` }))], view.tag, { onchange: (e) => { view.tag = e.target.value; refresh(); } })),
          field('Sort by', select([{ value: 'added', label: 'Recently added' }, { value: 'year', label: 'Year (newest)' }, { value: 'title', label: 'Title' }, { value: 'rating', label: 'Rating' }], view.sort, { onchange: (e) => { view.sort = e.target.value; refresh(); } })),
          field('Default citation style', select(CITATION_STYLES, state.settings.citationStyle, { onchange: (e) => { state.settings.citationStyle = e.target.value; save(); } }))),
        h('div', { class: 'row' },
          btn(`Export ${list.length === state.papers.length ? 'all' : 'filtered'} as BibTeX`, () => download('library.bib', list.map(toBibtex).join('\n\n'), 'application/x-bibtex'), { iconName: 'download', size: 'sm' }),
          btn('Export as CSV', () => exportCsv(list), { iconName: 'download', size: 'sm' }),
          btn(`Copy ${state.settings.citationStyle} bibliography`, () => copyText(list.map((p) => formatCitation(p, state.settings.citationStyle)).join('\n\n')), { iconName: 'copy', size: 'sm' }))),
      list.length ? h('div', { style: { marginTop: '.5rem' } }, list.map(paperRow))
        : emptyState(state.papers.length ? 'No papers match these filters' : 'Your library is empty', state.papers.length ? null : 'Add papers by DOI, by hand, or import a .bib file from Zotero, Mendeley or Google Scholar.',
          state.papers.length ? null : btn('Add your first paper', () => openPaperModal(), { kind: 'primary', iconName: 'plus' }))));
}

function paperRow(p) {
  return h('div', { class: 'paper' },
    h('div', { class: 'grow' },
      h('div', { class: 'title', role: 'button', tabindex: 0, onclick: () => openPaperModal(p), onkeydown: (e) => { if (e.key === 'Enter') openPaperModal(p); } }, p.title || 'Untitled'),
      h('div', { class: 'authors' }, authorLine(p), p.year ? ` · ${p.year}` : '', p.venue ? ` · ${p.venue}` : ''),
      h('div', { class: 'row', style: { gap: '.35rem', marginTop: '.35rem' } },
        (p.projectIds || []).map(getProject).filter(Boolean).map((pr) => h('a', { class: 'chip', href: `#/project/${pr.id}` }, projectDot(pr), pr.title)),
        tagList(p.tags),
        p.rating ? h('span', { class: 'chip', title: `Rated ${p.rating} of 5` }, '★'.repeat(p.rating)) : null,
        p.notes ? h('span', { class: 'chip' }, icon('note', 12), 'Notes') : null)),
    h('div', { class: 'row', style: { gap: '.25rem', flexWrap: 'nowrap' } },
      select(PAPER_STATUSES, p.status, { class: 'input status-select', 'aria-label': 'Reading status', onchange: (e) => { p.status = e.target.value; save(); refresh(); } }),
      p.url || p.doi ? h('a', { class: 'btn ghost sm', href: p.url || `https://doi.org/${p.doi}`, target: '_blank', rel: 'noopener noreferrer', title: 'Open paper', 'aria-label': 'Open paper' }, icon('external', 15)) : null,
      btn('', () => openCiteModal(p), { kind: 'ghost', iconName: 'quote', title: 'Cite', size: 'sm' })));
}

function exportCsv(list) {
  const cols = ['title', 'authors', 'year', 'venue', 'doi', 'url', 'status', 'tags', 'rating'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [cols.join(','), ...list.map((p) => cols.map((c) => esc(Array.isArray(p[c]) ? p[c].join('; ') : p[c])).join(','))];
  download('library.csv', rows.join('\n'), 'text/csv');
}

export function openPaperModal(existing, defaults = {}) {
  const p = existing || { id: uid(), title: '', authors: [], year: '', venue: '', doi: '', url: '', pdf: '', tags: [], status: 'To read', rating: 0, abstract: '', notes: '', projectIds: [], type: 'article', added: new Date().toISOString(), ...defaults };
  const f = {
    doi: input({ value: p.doi, placeholder: '10.1145/… or https://doi.org/…' }),
    title: input({ value: p.title }),
    authors: textarea({ value: (p.authors || []).join('\n'), rows: 3, placeholder: 'One author per line, e.g. Ada Lovelace' }),
    year: input({ value: p.year, inputmode: 'numeric', placeholder: '2025' }),
    venue: input({ value: p.venue, placeholder: 'Journal or conference' }),
    url: input({ value: p.url, placeholder: 'https://…' }),
    pdf: input({ value: p.pdf || '', placeholder: 'Link to PDF in Google Drive, arXiv, etc.' }),
    status: select(PAPER_STATUSES, p.status),
    tags: input({ value: (p.tags || []).join(', '), placeholder: 'e.g. methods, baseline' }),
    notes: textarea({ value: p.notes, rows: 4, placeholder: 'Key findings, how it relates to your work…' }),
    abstract: textarea({ value: p.abstract, rows: 4 }),
    type: select([{ value: 'article', label: 'Journal article' }, { value: 'inproceedings', label: 'Conference paper' }, { value: 'book', label: 'Book' }, { value: 'incollection', label: 'Book chapter' }, { value: 'phdthesis', label: 'Thesis' }, { value: 'techreport', label: 'Report' }, { value: 'misc', label: 'Preprint / other' }], p.type || 'article'),
    citeKey: input({ value: p.citeKey || '', placeholder: 'Auto-generated if empty' }),
    volume: input({ value: p.volume || '' }),
    pages: input({ value: p.pages || '' }),
  };
  let rating = p.rating || 0;
  const stars = h('div', { class: 'row', style: { gap: '2px' } });
  const drawStars = () => stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', {
    type: 'button', class: 'btn ghost sm', style: { color: n <= rating ? 'var(--warning)' : 'var(--muted)', fontSize: '1.1rem', padding: '0 .2rem' }, 'aria-label': `${n} star${n > 1 ? 's' : ''}`,
    onclick: () => { rating = rating === n ? 0 : n; drawStars(); },
  }, n <= rating ? '★' : '☆')));
  drawStars();
  const projChecks = state.projects.filter((pr) => pr.status !== 'archived' || p.projectIds?.includes(pr.id)).map((pr) => {
    const cb = h('input', { type: 'checkbox', checked: (p.projectIds || []).includes(pr.id), value: pr.id });
    return h('label', { class: 'check' }, cb, projectDot(pr), pr.title);
  });
  const fetchBtn = btn('Fetch details', async () => {
    fetchBtn.disabled = true;
    try {
      const meta = await lookupDoi(f.doi.value);
      f.doi.value = meta.doi;
      for (const k of ['title', 'year', 'venue', 'url', 'abstract', 'volume', 'pages']) if (meta[k]) f[k].value = meta[k];
      if (meta.authors.length) f.authors.value = meta.authors.join('\n');
      f.type.value = meta.type;
      toast('Details filled in from Crossref');
    } catch (e) { toast(e.message, 'error'); }
    fetchBtn.disabled = false;
  }, { size: '', iconName: 'search' });

  const body = h('div', { class: 'form-grid' },
    h('div', { class: 'full field' }, h('span', { class: 'field-label' }, 'DOI'), h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, f.doi, fetchBtn), h('span', { class: 'field-hint' }, 'Paste a DOI and fetch the title, authors and venue automatically.')),
    h('div', { class: 'full' }, field('Title', f.title)),
    h('div', { class: 'full' }, field('Authors', f.authors)),
    field('Year', f.year), field('Venue', f.venue),
    field('Reading status', f.status), field('Tags', f.tags),
    h('div', { class: 'full' }, field('Your notes', f.notes)),
    projChecks.length ? h('div', { class: 'full field' }, h('span', { class: 'field-label' }, 'Projects'), h('div', { class: 'row' }, projChecks)) : null,
    h('div', { class: 'full' }, advanced('paper-modal',
      h('div', { class: 'form-grid' },
        field('URL', f.url), field('PDF link', f.pdf),
        field('Entry type', f.type), field('Citation key', f.citeKey),
        field('Volume', f.volume), field('Pages', f.pages),
        h('div', { class: 'full field' }, h('span', { class: 'field-label' }, 'Rating'), stars),
        h('div', { class: 'full' }, field('Abstract', f.abstract))))));

  const actions = [];
  if (existing) {
    actions.push({ label: 'Delete', kind: 'danger', onClick: async (close) => {
      if (await confirmDialog(`Remove "${p.title}" from your library?`)) { state.papers = state.papers.filter((x) => x.id !== p.id); save(); close(); refresh(); }
    } });
    actions.push({ label: 'Reading note', onClick: (close) => { close(); createNote({ paperId: p.id, projectId: p.projectIds?.[0] || '', title: `Notes: ${p.title}` }); } });
  }
  actions.push({ label: 'Cancel', onClick: (c) => c() });
  actions.push({ label: existing ? 'Save' : 'Add to library', kind: 'primary', onClick: (close) => {
    if (!f.title.value.trim()) { f.title.focus(); return toast('A title is required', 'error'); }
    Object.assign(p, {
      title: f.title.value.trim(),
      authors: f.authors.value.split(/\n|;/).map((a) => a.trim()).filter(Boolean),
      year: f.year.value.trim(), venue: f.venue.value.trim(), doi: f.doi.value.trim(),
      url: f.url.value.trim() ? safeUrl(f.url.value) || '' : '', pdf: f.pdf.value.trim() ? safeUrl(f.pdf.value) || '' : '',
      status: f.status.value, tags: parseTags(f.tags.value), notes: f.notes.value, abstract: f.abstract.value,
      type: f.type.value, citeKey: f.citeKey.value.trim(), volume: f.volume.value.trim(), pages: f.pages.value.trim(), rating,
      projectIds: projChecks.map((l) => l.querySelector('input')).filter((cb) => cb.checked).map((cb) => cb.value),
    });
    if (!existing) state.papers.unshift(p);
    save(); close(); refresh();
    if (!existing) toast('Paper added');
  } });
  modal(existing ? 'Edit paper' : 'Add paper', body, actions, { wide: true });
}

export function openCiteModal(p) {
  let style = state.settings.citationStyle;
  const box = h('div', { class: 'cite-box' });
  const pills = h('div');
  const draw = () => {
    box.textContent = formatCitation(p, style);
    pills.replaceChildren(tabs(CITATION_STYLES.map((s) => ({ value: s, label: s })), style, (v) => { style = v; draw(); }));
  };
  draw();
  modal('Cite this paper', h('div', { class: 'stack' }, pills, box, h('p', { class: 'field-hint' }, 'Formatting is a best effort — double-check against your venue’s style guide.')), [
    { label: 'Close', onClick: (c) => c() },
    { label: 'Copy', kind: 'primary', onClick: () => copyText(box.textContent) },
  ]);
}

function openImportModal() {
  const ta = textarea({ rows: 10, placeholder: '@article{key,\n  title = {…},\n  author = {…},\n  year = {2024}\n}', style: { fontFamily: 'var(--mono)', fontSize: '.82rem' } });
  const file = h('input', { type: 'file', accept: '.bib,.txt,text/plain', class: 'input', onchange: async (e) => { if (e.target.files[0]) ta.value = await e.target.files[0].text(); } });
  const proj = select([{ value: '', label: '— None —' }, ...state.projects.filter((p) => p.status !== 'archived').map((p) => ({ value: p.id, label: p.title }))], '');
  modal('Import BibTeX', h('div', { class: 'stack' },
    h('p', { class: 'muted small' }, 'Export a .bib file from Zotero, Mendeley, Google Scholar or Overleaf, then choose it or paste its contents.'),
    field('BibTeX file', file), field('…or paste BibTeX', ta), field('Add imported papers to project', proj)), [
    { label: 'Cancel', onClick: (c) => c() },
    { label: 'Import', kind: 'primary', onClick: (close) => {
      const entries = parseBibtex(ta.value);
      if (!entries.length) return toast('No BibTeX entries found', 'error');
      const existingDois = new Set(state.papers.map((p) => p.doi).filter(Boolean));
      const existingTitles = new Set(state.papers.map((p) => p.title.toLowerCase()));
      let added = 0, skipped = 0;
      for (const e of entries) {
        const data = paperFromBibtex(e);
        if (!data.title || (data.doi && existingDois.has(data.doi)) || existingTitles.has(data.title.toLowerCase())) { skipped++; continue; }
        state.papers.unshift({ id: uid(), status: 'To read', rating: 0, notes: '', pdf: '', projectIds: proj.value ? [proj.value] : [], added: new Date().toISOString(), ...data });
        existingTitles.add(data.title.toLowerCase());
        added++;
      }
      save(); close(); refresh();
      toast(`Imported ${added} paper${added === 1 ? '' : 's'}${skipped ? ` (${skipped} duplicate${skipped === 1 ? '' : 's'} skipped)` : ''}`);
    } },
  ], { wide: true });
}

export function pickPapersModal(project) {
  const available = state.papers.filter((p) => !(p.projectIds || []).includes(project.id));
  if (!available.length) {
    toast(state.papers.length ? 'All library papers are already linked' : 'Your library is empty — add a paper first');
    return;
  }
  let q = '';
  const listEl = h('div', { class: 'stack', style: { maxHeight: '50vh', overflow: 'auto', gap: '.25rem' } });
  const checks = new Map();
  const draw = () => listEl.replaceChildren(...available.filter((p) => !q || `${p.title} ${(p.authors || []).join(' ')}`.toLowerCase().includes(q)).map((p) => {
    if (!checks.has(p.id)) checks.set(p.id, h('input', { type: 'checkbox' }));
    return h('label', { class: 'check', style: { padding: '.35rem 0', alignItems: 'flex-start' } }, checks.get(p.id), h('span', {}, h('strong', {}, p.title), h('br'), h('span', { class: 'small muted' }, authorLine(p), p.year ? ` · ${p.year}` : '')));
  }));
  draw();
  const search = input({ type: 'search', placeholder: 'Filter…', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  modal('Add papers to project', h('div', { class: 'stack' }, search, listEl), [
    { label: 'Cancel', onClick: (c) => c() },
    { label: 'Add selected', kind: 'primary', onClick: (close) => {
      let n = 0;
      for (const p of available) if (checks.get(p.id)?.checked) { (p.projectIds ||= []).push(project.id); n++; }
      save(); close(); refresh();
      if (n) toast(`Linked ${n} paper${n === 1 ? '' : 's'}`);
    } },
  ], { wide: true });
}
