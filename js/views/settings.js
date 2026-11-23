import { state, save, replaceState, resetState, storageBytes, PHASES, PROJECT_COLORS } from '../store.js';
import { h, icon, btn, advanced, field, input, textarea, select, confirmDialog, toast, download, refresh } from '../ui.js';
import { tabs } from './common.js';
import { allData, putData, clearData } from '../idb.js';
import { loadSample } from '../sample.js';
import { CITATION_STYLES } from '../cite.js';

const themeChanged = () => window.dispatchEvent(new Event('app:theme'));

async function exportBackup() {
  const datasets = await allData();
  const payload = { app: 'research-dashboard', exported: new Date().toISOString(), state, datasets };
  download(`research-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload), 'application/json');
  toast('Backup downloaded');
}

async function importBackup(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); } catch { return toast('That file is not valid JSON', 'error'); }
  const next = payload.state || payload;
  if (!next || !Array.isArray(next.projects)) return toast('This does not look like a Research Dashboard backup', 'error');
  if (!(await confirmDialog('Restoring replaces everything currently in this browser with the backup. Continue?', { okLabel: 'Restore backup' }))) return;
  await clearData();
  for (const [id, data] of Object.entries(payload.datasets || {})) await putData(id, data);
  replaceState(next);
  window.dispatchEvent(new Event('app:theme'));
  toast('Backup restored');
}

export function renderSettings() {
  const s = state.settings;
  const kb = (storageBytes() / 1024).toFixed(1);
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: (e) => e.target.files[0] && importBackup(e.target.files[0]) });
  const accents = [...PROJECT_COLORS.slice(0, 3), PROJECT_COLORS[6], '#0b0b0b'];

  return h('div', { class: 'page', style: { maxWidth: '820px' } },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Settings'), h('p', { class: 'sub' }, 'Personalize the dashboard and manage your data.'))),

    h('section', { class: 'card stack' },
      h('h2', {}, 'Profile & appearance'),
      field('Your name', input({ value: s.name, placeholder: 'Shown in the home page greeting', style: { maxWidth: '320px' }, onchange: (e) => { s.name = e.target.value.trim(); save(); } })),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Theme'),
        h('div', {}, tabs([{ value: 'system', label: 'Match system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], s.theme, (v) => { s.theme = v; save(); themeChanged(); }))),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Accent color'),
        h('div', { class: 'swatches' },
          accents.map((c) => h('button', { type: 'button', class: `swatch ${s.accent === c ? 'on' : ''}`, style: { background: c }, 'aria-label': `Accent ${c}`, onclick: () => { s.accent = c; save(); themeChanged(); } })),
          h('input', { type: 'color', class: 'input', value: s.accent, title: 'Custom color', onchange: (e) => { s.accent = e.target.value; save(); themeChanged(); } })))),

    h('section', { class: 'card stack' },
      h('h2', {}, 'Your data'),
      h('div', { class: 'notice' }, icon('alert', 16), h('div', {},
        h('strong', {}, 'Everything is stored locally in this browser. '),
        'Nothing is sent to a server. Clearing your browser data, or using a different browser or computer, means starting fresh — so export a backup regularly.')),
      h('div', { class: 'row' },
        btn('Export backup', exportBackup, { iconName: 'download', kind: 'primary' }),
        btn('Restore from backup', () => fileIn.click(), { iconName: 'upload' }),
        fileIn),
      advanced('settings-data',
        h('p', { class: 'small muted' }, `Library and projects use about ${kb} KB of browser storage. Datasets are kept separately in IndexedDB.`),
        h('h4', {}, 'When does the app use the network?'),
        h('ul', { class: 'small muted', style: { margin: 0, paddingLeft: '1.2rem' } },
          h('li', {}, 'Only when you click: “Fetch details” (DOI lookup via Crossref), “Load GitHub activity” (public GitHub API) and importing/refreshing a Google Sheet.'),
          h('li', {}, 'Google Drive, GitHub and Overleaf links simply open in a new tab — no sign-in or access to your accounts is ever requested.')),
        h('div', { class: 'row' },
          btn('Load sample project', async () => { await loadSample(); toast('Sample data added'); location.hash = '#/'; }, { iconName: 'plus' }),
          btn('Erase all data', async () => {
            if (!(await confirmDialog('Permanently erase all projects, papers, notes, deadlines and datasets from this browser? This cannot be undone. Consider exporting a backup first.', { okLabel: 'Erase everything' }))) return;
            await clearData(); resetState(); themeChanged(); toast('All data erased');
          }, { kind: 'danger', iconName: 'trash' })))),

    h('section', { class: 'card stack' },
      h('h2', {}, 'Defaults'),
      field('Citation style', select(CITATION_STYLES, s.citationStyle, { style: { maxWidth: '220px' }, onchange: (e) => { s.citationStyle = e.target.value; save(); } })),
      advanced('settings-defaults',
        h('h4', {}, 'Phase names for new projects'),
        h('div', { class: 'form-grid' }, PHASES.map((p, i) => field(`Phase ${i + 1}`, input({ value: s.phaseNames[i] || p.name, onchange: (e) => { s.phaseNames[i] = e.target.value.trim() || p.name; save(); } })))),
        h('p', { class: 'field-hint' }, 'Existing projects keep their names; rename a project’s phases under its Overview → Advanced.'),
        field('Manuscript sections for new projects (one per line)', textarea({ rows: 7, value: s.defaultSections.join('\n'), onchange: (e) => { s.defaultSections = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); save(); } })),
        btn('Reset defaults', () => { s.phaseNames = PHASES.map((p) => p.name); s.defaultSections = ['Abstract', 'Introduction', 'Related Work', 'Method', 'Results', 'Discussion', 'Conclusion']; save(); refresh(); }, { size: 'sm' }))),

    h('p', { class: 'small muted' }, 'Keyboard: press ', h('kbd', {}, 'Esc'), ' to close dialogs.'));
}
