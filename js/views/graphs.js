// Graph studio for the Analysis phase: datasets (CSV upload, paste, Google Sheets) + chart builder.
import { state, save, uid, touch } from '../store.js';
import { h, icon, btn, advanced, field, input, textarea, select, modal, confirmDialog, toast, emptyState, download, timeAgo } from '../ui.js';
import { parseCsv, columnTypes, toNumber, toDate, fetchSheet } from '../csv.js';
import { drawChart, specTable, svgMarkup, pngBlob, MAX_SERIES, linearFit, quantile, seriesColor } from '../charts.js';
import { getData, putData, deleteData } from '../idb.js';

export const CHART_TYPES = [
  { value: 'line', label: 'Line', hint: 'Change over an ordered x (time, epochs, dose)' },
  { value: 'bar', label: 'Bar', hint: 'Compare values across categories' },
  { value: 'scatter', label: 'Scatter', hint: 'Relationship between two numeric columns' },
  { value: 'area', label: 'Area', hint: 'Cumulative or volume over time' },
  { value: 'histogram', label: 'Histogram', hint: 'Distribution of one numeric column' },
  { value: 'box', label: 'Box plot', hint: 'Compare distributions (median, quartiles, outliers)' },
];
const AGGREGATES = [
  { value: 'auto', label: 'Automatic (mean when x repeats)' },
  { value: 'none', label: 'None — plot every row' },
  { value: 'mean', label: 'Mean' }, { value: 'mean_sd', label: 'Mean ± standard deviation' }, { value: 'mean_se', label: 'Mean ± standard error' },
  { value: 'median', label: 'Median' }, { value: 'sum', label: 'Sum' }, { value: 'count', label: 'Count' }, { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' },
];
const FILTER_OPS = ['=', '≠', '>', '≥', '<', '≤', 'contains'];

const drafts = new Map(); // projectId -> { datasetId, config, editingId, showTable }

function defaultConfig(data) {
  const types = columnTypes(data);
  const numeric = data.headers.filter((_, i) => types[i] === 'number');
  const xIdx = types.findIndex((t) => t !== 'number');
  const x = xIdx >= 0 ? data.headers[xIdx] : data.headers[0];
  const xType = types[data.headers.indexOf(x)];
  return {
    type: xType === 'text' ? 'bar' : 'line',
    x,
    y: numeric.filter((c) => c !== x).slice(0, 3),
    title: '', xLabel: '', yLabel: '',
    aggregate: 'auto', groupBy: '', errCol: '',
    filter: { col: '', op: '=', value: '' },
    logY: false, yMin: '', yMax: '', bins: '', trend: false, showPoints: false, xAsCategory: false, height: 340, colors: [],
  };
}

// ---------- data -> chart spec ----------
function agg(values, how) {
  const v = values.filter(Number.isFinite);
  if (how === 'count') return { y: values.length };
  if (!v.length) return { y: NaN };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
  switch (how) {
    case 'sum': return { y: v.reduce((a, b) => a + b, 0) };
    case 'median': return { y: quantile([...v].sort((a, b) => a - b), 0.5) };
    case 'min': return { y: Math.min(...v) };
    case 'max': return { y: Math.max(...v) };
    case 'mean_sd': return { y: mean, err: sd };
    case 'mean_se': return { y: mean, err: sd / Math.sqrt(v.length) };
    default: return { y: mean };
  }
}

export function buildSpec(data, cfg) {
  const notices = [];
  const col = (name) => data.headers.indexOf(name);
  const types = columnTypes(data);
  let rows = data.rows;

  const f = cfg.filter || {};
  if (f.col && col(f.col) >= 0 && f.value !== '') {
    const fi = col(f.col), fv = String(f.value), fn = toNumber(fv);
    rows = rows.filter((r) => {
      const v = r[fi] ?? '', n = toNumber(v);
      switch (f.op) {
        case '=': return v === fv || (!Number.isNaN(n) && n === fn);
        case '≠': return !(v === fv || (!Number.isNaN(n) && n === fn));
        case '>': return n > fn;
        case '≥': return n >= fn;
        case '<': return n < fn;
        case '≤': return n <= fn;
        default: return v.toLowerCase().includes(fv.toLowerCase());
      }
    });
    notices.push(`Filtered to ${rows.length} of ${data.rows.length} rows.`);
  }

  let yCols = (cfg.y || []).filter((c) => col(c) >= 0);
  const type = cfg.type;
  const base = { type, title: cfg.title, xLabel: cfg.xLabel, yLabel: cfg.yLabel, logY: cfg.logY, yMin: cfg.yMin === '' ? undefined : Number(cfg.yMin), yMax: cfg.yMax === '' ? undefined : Number(cfg.yMax), height: Number(cfg.height) || 340, colors: cfg.colors, showPoints: cfg.showPoints, trend: cfg.trend, bins: Number(cfg.bins) || undefined };
  if (!yCols.length) return { ...base, series: [], emptyMessage: 'Pick at least one numeric column to plot', notices };

  const groupIdx = cfg.groupBy ? col(cfg.groupBy) : -1;
  // series definitions: either one per y column, or one per group value of the first y column
  let defs;
  if (groupIdx >= 0) {
    if (yCols.length > 1) notices.push(`Grouped by “${cfg.groupBy}”: only the first y column (${yCols[0]}) is used.`);
    const groups = [...new Set(rows.map((r) => r[groupIdx]))];
    if (groups.length > MAX_SERIES) notices.push(`“${cfg.groupBy}” has ${groups.length} groups; showing the first ${MAX_SERIES}. Filter the data to compare others.`);
    defs = groups.slice(0, MAX_SERIES).map((g) => ({ name: g || '(blank)', rows: rows.filter((r) => r[groupIdx] === g), yi: col(yCols[0]) }));
  } else {
    if (yCols.length > MAX_SERIES) { notices.push(`Showing the first ${MAX_SERIES} of ${yCols.length} columns. Make a second chart for the rest.`); yCols = yCols.slice(0, MAX_SERIES); }
    defs = yCols.map((c) => ({ name: c, rows, yi: col(c) }));
  }
  if (type === 'scatter' && defs.length > 3) notices.push('Scatter plots are easiest to read with 3 or fewer series — consider filtering.');

  if (type === 'histogram') {
    if (defs.length > 1) notices.push('Histograms show one column at a time; using the first series. Use a box plot to compare distributions.');
    const d = defs[0];
    return { ...base, xLabel: cfg.xLabel || d.name, yLabel: cfg.yLabel || 'Count', series: [{ name: d.name, values: d.rows.map((r) => toNumber(r[d.yi])) }], notices };
  }
  if (type === 'box') {
    return { ...base, xLabel: cfg.xLabel || (groupIdx >= 0 ? cfg.groupBy : ''), yLabel: cfg.yLabel || (groupIdx >= 0 ? yCols[0] : ''), series: defs.map((d) => ({ name: d.name, values: d.rows.map((r) => toNumber(r[d.yi])) })), notices };
  }

  const xi = col(cfg.x);
  const xColType = xi >= 0 ? types[xi] : 'number';
  let xType = type === 'bar' || cfg.xAsCategory ? 'category' : xColType === 'text' ? 'category' : xColType;
  if (type === 'scatter' && xType === 'category') notices.push('Scatter plots need a numeric or date x column — try a bar chart for categories.');
  const xVal = (r, i) => (xi < 0 ? i + 1 : xType === 'number' ? toNumber(r[xi]) : xType === 'date' ? toDate(r[xi]) : r[xi]);
  const ei = cfg.errCol ? col(cfg.errCol) : -1;
  const labelIdx = types.findIndex((t, i) => t === 'text' && i !== xi && i !== groupIdx);

  let how = cfg.aggregate || 'auto';
  if (how === 'auto') {
    const anyRepeat = defs.some((d) => { const seen = new Set(); return d.rows.some((r, i) => { const k = String(xVal(r, i)); if (seen.has(k)) return true; seen.add(k); return false; }); });
    how = anyRepeat && type !== 'scatter' ? 'mean' : 'none';
    if (how === 'mean') notices.push(`Some x values repeat, so rows were averaged. Change this under Advanced → Aggregate.`);
  }

  const series = defs.map((d) => {
    let points;
    if (how === 'none') {
      points = d.rows.map((r, i) => ({ x: xVal(r, i), y: toNumber(r[d.yi]), err: ei >= 0 ? toNumber(r[ei]) : undefined, label: labelIdx >= 0 ? r[labelIdx] : undefined }));
    } else {
      const groups = new Map();
      d.rows.forEach((r, i) => {
        const x = xVal(r, i);
        const k = String(x);
        if (!groups.has(k)) groups.set(k, { x, vals: [] });
        groups.get(k).vals.push(toNumber(r[d.yi]));
      });
      points = [...groups.values()].map((g) => ({ x: g.x, ...agg(g.vals, how) }));
    }
    if (xType !== 'category') points = points.filter((p) => Number.isFinite(p.x)).sort((a, b) => a.x - b.x);
    const s = { name: d.name, points };
    if (cfg.trend && xType !== 'category') {
      const fit = linearFit(points);
      if (fit) { s.legend = `${d.name} (R² = ${fit.r2.toFixed(3)})`; s.fit = fit; }
    }
    return s;
  });
  if (cfg.trend && series.length === 1 && series[0].fit) notices.push(`Linear fit: y = ${fmt(series[0].fit.slope)}·x ${series[0].fit.intercept >= 0 ? '+' : '−'} ${fmt(Math.abs(series[0].fit.intercept))}, R² = ${series[0].fit.r2.toFixed(3)}${xType === 'date' ? ' (x in milliseconds)' : ''}`);
  return { ...base, xType, xLabel: cfg.xLabel || (xi >= 0 ? cfg.x : 'Row'), series, notices };
}
const fmt = (v) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : +v.toPrecision(4));

// ---------- dataset management ----------
async function addDataset(project, name, data, source = 'file', url = '') {
  if (!data.rows.length) throw new Error('No data rows found under the header row.');
  const id = uid();
  await putData(id, data);
  const meta = { id, projectId: project.id, name, source, url, nrows: data.rows.length, ncols: data.headers.length, added: new Date().toISOString(), updated: new Date().toISOString() };
  state.datasets.push(meta);
  touch(project);
  save();
  return meta;
}

function openSheetModal(project, onDone) {
  const url = input({ placeholder: 'https://docs.google.com/spreadsheets/d/…/edit#gid=0' });
  const name = input({ placeholder: 'e.g. Trial results' });
  const status = h('div');
  modal('Link a Google Sheet', h('div', { class: 'stack' },
    field('Sheet URL', url, 'Copy the link from your browser’s address bar. The tab shown (gid) is the one imported.'),
    field('Dataset name', name),
    h('div', { class: 'notice' }, icon('alert', 16), h('div', {},
      h('strong', {}, 'The sheet must be viewable without signing in. '),
      'In Google Sheets, click Share → General access → “Anyone with the link” (Viewer), or use File → Share → Publish to web. The data is downloaded once into this browser; click Refresh later to re-sync.')),
    status), [
    { label: 'Cancel', onClick: (c) => c() },
    { label: 'Import sheet', kind: 'primary', onClick: async (close) => {
      if (!url.value.trim()) return url.focus();
      status.replaceChildren(h('p', { class: 'muted small' }, 'Fetching sheet…'));
      try {
        const data = await fetchSheet(url.value);
        const meta = await addDataset(project, name.value.trim() || 'Google Sheet', data, 'sheet', url.value.trim());
        close(); toast(`Imported ${meta.nrows} rows`); onDone(meta);
      } catch (e) { status.replaceChildren(h('div', { class: 'notice err' }, icon('alert', 16), h('span', {}, e.message))); }
    } },
  ], { wide: true });
}

function openPasteModal(project, onDone) {
  const ta = textarea({ rows: 10, placeholder: 'condition,trial,score\ncontrol,1,0.82\ntreatment,1,0.91', style: { fontFamily: 'var(--mono)', fontSize: '.82rem' } });
  const name = input({ value: 'Pasted data' });
  modal('Paste data', h('div', { class: 'stack' }, field('CSV or tab-separated text (first row = column names)', ta, 'Tip: copy cells directly from Excel or Google Sheets and paste here.'), field('Dataset name', name)), [
    { label: 'Cancel', onClick: (c) => c() },
    { label: 'Add dataset', kind: 'primary', onClick: async (close) => {
      try { const meta = await addDataset(project, name.value.trim() || 'Pasted data', parseCsv(ta.value), 'paste'); close(); onDone(meta); }
      catch (e) { toast(e.message, 'error'); }
    } },
  ], { wide: true });
}

async function importFiles(project, files, onDone) {
  for (const file of files) {
    if (/\.(xlsx?|ods|numbers)$/i.test(file.name)) { toast(`${file.name}: save it as CSV first (File → Save As → CSV)`, 'error'); continue; }
    try {
      const meta = await addDataset(project, file.name.replace(/\.[^.]+$/, ''), parseCsv(await file.text()), 'file');
      toast(`Loaded ${file.name} — ${meta.nrows} rows`);
      onDone(meta);
    } catch (e) { toast(`${file.name}: ${e.message}`, 'error'); }
  }
}

// ---------- studio ----------
export function graphStudio(project) {
  const root = h('div', { class: 'stack', style: { gap: '1.25rem' } }, h('p', { class: 'muted' }, 'Loading graph studio…'));
  if (!drafts.has(project.id)) drafts.set(project.id, { datasetId: null, config: null, editingId: null, showTable: false });
  const draft = drafts.get(project.id);
  const rerender = () => renderStudio(project, draft, root, rerender).catch((e) => { console.error(e); root.replaceChildren(h('div', { class: 'notice err' }, icon('alert', 16), h('span', {}, `Graph studio error: ${e.message}`))); });
  rerender();
  return root;
}

async function renderStudio(project, draft, root, rerender) {
  const datasets = state.datasets.filter((d) => d.projectId === project.id);
  if (draft.datasetId && !datasets.some((d) => d.id === draft.datasetId)) { draft.datasetId = null; draft.config = null; }
  if (!draft.datasetId && datasets.length) draft.datasetId = datasets[datasets.length - 1].id;
  const meta = datasets.find((d) => d.id === draft.datasetId);
  const data = meta ? await getData(meta.id) : null;
  if (meta && data && !draft.config) draft.config = defaultConfig(data);

  const select_ = (m) => { draft.datasetId = m.id; draft.config = null; draft.editingId = null; rerender(); };
  const fileInput = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values', multiple: true, style: { display: 'none' }, onchange: (e) => importFiles(project, [...e.target.files], select_) });
  const drop = h('div', { class: 'dropzone' },
    h('div', { class: 'row', style: { justifyContent: 'center', gap: '.4rem' } },
      btn('Upload CSV', () => fileInput.click(), { size: 'sm', iconName: 'upload', kind: 'primary' }),
      btn('Google Sheet', () => openSheetModal(project, select_), { size: 'sm', iconName: 'table' }),
      btn('Paste', () => openPasteModal(project, select_), { size: 'sm' })),
    h('p', { class: 'small muted', style: { margin: '.5rem 0 0' } }, 'or drop CSV/TSV files here'),
    fileInput);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); importFiles(project, [...e.dataTransfer.files], select_); });

  const datasetList = datasets.length ? h('div', { class: 'stack', style: { gap: '.35rem' } }, datasets.map((d) => h('div', {
    class: `dataset-item ${d.id === draft.datasetId ? 'active' : ''}`, role: 'button', tabindex: 0,
    onclick: () => select_(d), onkeydown: (e) => { if (e.key === 'Enter') select_(d); },
  }, icon(d.source === 'sheet' ? 'table' : 'chart', 16), h('div', { class: 'grow' }, h('div', { class: 'small', style: { fontWeight: 600 } }, d.name), h('div', { class: 'small muted' }, `${d.nrows} rows × ${d.ncols} cols`))))) : null;

  const pending = [];
  const savedSection = await savedCharts(project, draft, rerender, pending);
  const drawSaved = () => requestAnimationFrame(() => pending.forEach((fn) => fn()));

  if (!meta || !data) {
    root.replaceChildren(
      h('div', { class: 'studio' },
        h('div', { class: 'studio-controls' }, h('h3', {}, 'Data'), datasetList, drop),
        h('div', { class: 'chart-wrap', style: { minHeight: '300px', display: 'grid', placeItems: 'center' } },
          emptyState('Add data to start graphing', 'Upload a CSV, paste cells from a spreadsheet, or link a Google Sheet. Data stays in this browser.'))),
      savedSection);
    drawSaved();
    return;
  }

  const cfg = draft.config;
  const types = columnTypes(data);
  const numericCols = data.headers.filter((_, i) => types[i] === 'number');
  const update = (patch) => { Object.assign(cfg, patch); rerender(); };
  const colOpts = (extra = []) => [...extra, ...data.headers.map((c, i) => ({ value: c, label: `${c}${types[i] === 'number' ? ' (#)' : types[i] === 'date' ? ' (date)' : ''}` }))];
  const usesX = !['histogram', 'box'].includes(cfg.type);
  const typeInfo = CHART_TYPES.find((c) => c.value === cfg.type);

  const yChecks = h('div', { class: 'col-checks' }, numericCols.length ? numericCols.filter((c) => !usesX || c !== cfg.x).map((c) => h('label', { class: 'check small' },
    h('input', { type: 'checkbox', checked: cfg.y.includes(c), onchange: (e) => update({ y: e.target.checked ? [...cfg.y, c] : cfg.y.filter((x) => x !== c) }) }),
    h('span', { class: 'dot', style: { background: cfg.y.includes(c) && !cfg.groupBy ? seriesColor(cfg.y.indexOf(c), cfg.colors) : 'transparent', border: '1px solid var(--border-strong)' } }), c)) : h('span', { class: 'small muted' }, 'No numeric columns detected.'));

  const controls = h('div', { class: 'studio-controls' },
    h('h3', {}, 'Data'), datasetList, drop,
    h('hr'),
    h('h3', {}, 'Chart'),
    field('Chart type', select(CHART_TYPES.map((t) => ({ value: t.value, label: t.label })), cfg.type, { onchange: (e) => update({ type: e.target.value }) }), typeInfo?.hint),
    usesX ? field('X axis', select(colOpts([{ value: '', label: '(row number)' }]), cfg.x, { onchange: (e) => update({ x: e.target.value, y: cfg.y.filter((c) => c !== e.target.value) }) })) : null,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, cfg.type === 'histogram' ? 'Column' : usesX ? 'Y axis (one series per column)' : 'Columns to compare'), yChecks),
    field('Title', input({ value: cfg.title, placeholder: 'Chart title', onchange: (e) => update({ title: e.target.value }) })),
    advanced(`studio-${project.id}`,
      h('div', { class: 'form-grid' },
        field('X axis label', input({ value: cfg.xLabel, placeholder: 'auto', onchange: (e) => update({ xLabel: e.target.value }) })),
        field('Y axis label', input({ value: cfg.yLabel, placeholder: 'auto', onchange: (e) => update({ yLabel: e.target.value }) }))),
      usesX ? field('Aggregate repeated x values', select(AGGREGATES, cfg.aggregate, { onchange: (e) => update({ aggregate: e.target.value }) }), 'Mean ± SD / SE adds error bars automatically.') : null,
      cfg.type !== 'histogram' ? field('Split into series by column', select([{ value: '', label: '— None —' }, ...colOpts()].filter((o) => o.value !== cfg.x || !o.value), cfg.groupBy, { onchange: (e) => update({ groupBy: e.target.value }) }), 'For “long” data, e.g. one series per condition or participant group.') : null,
      usesX && cfg.type !== 'area' ? field('Error bar column', select([{ value: '', label: '— None —' }, ...colOpts()], cfg.errCol, { onchange: (e) => update({ errCol: e.target.value }) }), 'Uses ± this value per row (when not aggregating).') : null,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Filter rows'),
        h('div', { class: 'row', style: { gap: '.35rem', flexWrap: 'nowrap' } },
          select([{ value: '', label: 'Column…' }, ...data.headers], cfg.filter.col, { style: { flex: 2 }, onchange: (e) => update({ filter: { ...cfg.filter, col: e.target.value } }) }),
          select(FILTER_OPS, cfg.filter.op, { style: { flex: 1 }, onchange: (e) => update({ filter: { ...cfg.filter, op: e.target.value } }) }),
          input({ value: cfg.filter.value, placeholder: 'value', style: { flex: 2 }, onchange: (e) => update({ filter: { ...cfg.filter, value: e.target.value } }) }))),
      h('div', { class: 'form-grid' },
        field('Y min', input({ type: 'number', value: cfg.yMin, placeholder: 'auto', onchange: (e) => update({ yMin: e.target.value }) })),
        field('Y max', input({ type: 'number', value: cfg.yMax, placeholder: 'auto', onchange: (e) => update({ yMax: e.target.value }) })),
        cfg.type === 'histogram' ? field('Number of bins', input({ type: 'number', min: 2, max: 100, value: cfg.bins, placeholder: 'auto', onchange: (e) => update({ bins: e.target.value }) })) : null,
        field('Height (px)', input({ type: 'number', min: 200, max: 900, step: 20, value: cfg.height, onchange: (e) => update({ height: Number(e.target.value) || 340 }) }))),
      h('div', { class: 'stack', style: { gap: '.4rem' } },
        cfg.type !== 'histogram' ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: cfg.logY, onchange: (e) => update({ logY: e.target.checked }) }), 'Logarithmic y axis') : null,
        ['line', 'scatter', 'area'].includes(cfg.type) ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: cfg.trend, onchange: (e) => update({ trend: e.target.checked }) }), 'Linear trend line (with R²)') : null,
        ['line', 'area'].includes(cfg.type) ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: cfg.showPoints, onchange: (e) => update({ showPoints: e.target.checked }) }), 'Show data points') : null,
        ['line', 'area', 'scatter'].includes(cfg.type) ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: cfg.xAsCategory, onchange: (e) => update({ xAsCategory: e.target.checked }) }), 'Treat x as categories') : null),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Series colors'),
        h('div', { class: 'row', style: { gap: '.35rem' } },
          Array.from({ length: Math.max(1, cfg.groupBy ? 3 : cfg.y.length) }, (_, i) => h('input', { type: 'color', class: 'input', value: seriesColor(i, cfg.colors), title: `Series ${i + 1}`, onchange: (e) => { const c = [...(cfg.colors || [])]; c[i] = e.target.value; update({ colors: c }); } })),
          btn('Reset', () => update({ colors: [] }), { size: 'sm', kind: 'ghost' })),
        h('span', { class: 'field-hint' }, 'Default colors are tuned for color-blind readers.'))),
    h('div', { class: 'row' },
      btn(draft.editingId ? 'Update saved chart' : 'Save chart to project', () => {
        const spec = buildSpec(data, cfg);
        const title = cfg.title || spec.series.map((s) => s.name).join(', ') || 'Chart';
        if (draft.editingId) {
          const c = project.charts.find((x) => x.id === draft.editingId);
          if (c) Object.assign(c, { title, datasetId: meta.id, config: JSON.parse(JSON.stringify(cfg)), updated: new Date().toISOString() });
          draft.editingId = null;
          toast('Chart updated');
        } else {
          project.charts.push({ id: uid(), title, datasetId: meta.id, config: JSON.parse(JSON.stringify(cfg)), created: new Date().toISOString() });
          toast('Chart saved to project');
        }
        touch(project); save(); rerender();
      }, { kind: 'primary', iconName: 'check' }),
      draft.editingId ? btn('Cancel editing', () => { draft.editingId = null; draft.config = defaultConfig(data); rerender(); }, { kind: 'ghost' }) : null));

  // preview
  const spec = buildSpec(data, cfg);
  const wrap = h('div', { class: 'chart-wrap' });
  const tableHost = h('div');
  const preview = h('div', { class: 'stack' },
    h('div', { class: 'row between' },
      h('div', { class: 'small muted' }, draft.editingId ? h('span', { class: 'chip accent' }, 'Editing saved chart') : `Preview · ${meta.name}`),
      h('div', { class: 'row', style: { gap: '.25rem' } },
        btn(draft.showTable ? 'Hide table' : 'Table view', () => { draft.showTable = !draft.showTable; rerender(); }, { size: 'sm', iconName: 'table' }),
        btn('PNG', () => exportPng(wrap, cfg.title || meta.name), { size: 'sm', iconName: 'download' }),
        btn('SVG', () => download(`${fileName(cfg.title || meta.name)}.svg`, svgMarkup(wrap), 'image/svg+xml'), { size: 'sm', iconName: 'download' }))),
    wrap,
    spec.notices?.length ? h('div', { class: 'stack', style: { gap: '.35rem' } }, spec.notices.map((n) => h('div', { class: 'notice' }, icon('alert', 15), h('span', {}, n)))) : null,
    tableHost,
    datasetPanel(project, meta, data, types, rerender));

  root.replaceChildren(h('div', { class: 'studio' }, controls, preview), savedSection);
  drawSaved();
  requestAnimationFrame(() => {
    drawChart(wrap, spec);
    if (draft.showTable) tableHost.replaceChildren(h('div', { class: 'table-wrap' }, specTable(buildSpec(data, cfg))));
  });
}

function datasetPanel(project, meta, data, types, rerender) {
  const preview = h('div', { class: 'table-wrap', style: { maxHeight: '320px' } }, h('table', {},
    h('thead', {}, h('tr', {}, data.headers.map((c, i) => h('th', { class: types[i] === 'number' ? 'num' : '' }, c)))),
    h('tbody', {}, data.rows.slice(0, 50).map((r) => h('tr', {}, r.map((v, i) => h('td', { class: types[i] === 'number' ? 'num' : '' }, v)))))));
  return h('details', { class: 'advanced' },
    h('summary', {}, icon('table', 14), h('span', {}, `Dataset: ${meta.name} (${meta.nrows} rows)`)),
    h('div', { class: 'advanced-body' },
      preview,
      data.rows.length > 50 ? h('p', { class: 'field-hint' }, `Showing the first 50 of ${data.rows.length} rows.`) : null,
      h('div', { class: 'row' },
        field('Rename', input({ value: meta.name, style: { maxWidth: '240px' }, onchange: (e) => { meta.name = e.target.value.trim() || meta.name; save(); rerender(); } })),
        h('div', { class: 'row', style: { marginTop: '1.2rem' } },
          meta.source === 'sheet' ? btn('Refresh from Google Sheets', async () => {
            try {
              const fresh = await fetchSheet(meta.url);
              await putData(meta.id, fresh);
              Object.assign(meta, { nrows: fresh.rows.length, ncols: fresh.headers.length, updated: new Date().toISOString() });
              save(); toast('Sheet refreshed'); rerender();
            } catch (e) { toast(e.message, 'error'); }
          }, { size: 'sm', iconName: 'refresh' }) : null,
          btn('Download CSV', () => {
            const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
            download(`${fileName(meta.name)}.csv`, [data.headers, ...data.rows].map((r) => r.map(esc).join(',')).join('\n'), 'text/csv');
          }, { size: 'sm', iconName: 'download' }),
          btn('Delete dataset', async () => {
            const used = project.charts.filter((c) => c.datasetId === meta.id).length;
            if (!(await confirmDialog(`Delete dataset "${meta.name}"?${used ? ` ${used} saved chart${used > 1 ? 's use' : ' uses'} it and will stop rendering.` : ''}`))) return;
            await deleteData(meta.id);
            state.datasets = state.datasets.filter((d) => d !== meta);
            save(); rerender();
          }, { size: 'sm', kind: 'danger', iconName: 'trash' }))),
      h('p', { class: 'field-hint' }, `Added ${timeAgo(meta.added)}${meta.source === 'sheet' ? ` · last synced ${timeAgo(meta.updated)}` : ''}. Column types: ${data.headers.map((c, i) => `${c} (${types[i]})`).join(', ')}.`)));
}

async function savedCharts(project, draft, rerender, pending) {
  const section = h('div', { class: 'stack' },
    h('div', { class: 'row between' }, h('h3', {}, `Saved figures (${project.charts.length})`), project.charts.length ? h('span', { class: 'small muted' }, 'Export as PNG for slides or SVG for papers.') : null));
  if (!project.charts.length) { section.append(h('p', { class: 'muted small' }, 'Charts you save appear here so you can come back to them.')); return section; }
  const grid = h('div', { class: 'saved-charts' });
  section.append(grid);
  for (const c of project.charts) {
    const meta = state.datasets.find((d) => d.id === c.datasetId);
    const data = meta ? await getData(meta.id) : null;
    const wrap = h('div', { class: 'chart-wrap' });
    grid.append(h('div', { class: 'chart-card' },
      h('div', { class: 'row between' },
        h('strong', { class: 'small' }, c.title),
        h('div', { class: 'row', style: { gap: 0 } },
          data ? btn('', () => { draft.datasetId = meta.id; draft.config = JSON.parse(JSON.stringify(c.config)); draft.editingId = c.id; rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); }, { kind: 'ghost', iconName: 'edit', title: 'Edit chart', size: 'sm' }) : null,
          data ? btn('', () => exportPng(wrap, c.title), { kind: 'ghost', iconName: 'download', title: 'Download PNG', size: 'sm' }) : null,
          data ? btn('', () => download(`${fileName(c.title)}.svg`, svgMarkup(wrap), 'image/svg+xml'), { kind: 'ghost', iconName: 'layers', title: 'Download SVG', size: 'sm' }) : null,
          btn('', async () => { if (await confirmDialog(`Delete chart "${c.title}"?`)) { project.charts = project.charts.filter((x) => x !== c); if (draft.editingId === c.id) draft.editingId = null; save(); rerender(); } }, { kind: 'ghost', iconName: 'trash', title: 'Delete chart', size: 'sm' }))),
      data ? wrap : h('div', { class: 'notice warn' }, icon('alert', 15), h('span', {}, 'The dataset for this chart was deleted.'))));
    if (data) pending.push(() => drawChart(wrap, { ...buildSpec(data, { ...c.config, height: 260 }), title: '' }));
  }
  return section;
}

const fileName = (s) => (s || 'chart').replace(/[^\w-]+/g, '_').slice(0, 60);
async function exportPng(wrap, title) {
  try { download(`${fileName(title)}.png`, await pngBlob(wrap, 2)); }
  catch (e) { toast(e.message, 'error'); }
}
