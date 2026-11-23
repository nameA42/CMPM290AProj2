// DOM helpers, modals, toasts, formatting and icons.

const PROP_KEYS = new Set(['value', 'checked', 'selected', 'disabled', 'indeterminate']);

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  const deferred = [];
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (PROP_KEYS.has(k)) deferred.push([k, v]);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  for (const [k, v] of deferred) el[k] = v;
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

// ---------- icons (stroke icons, 24px grid) ----------
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  folder: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  book: 'M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z',
  note: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  up: 'M12 19V5M6 11l6-6 6 6',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  flask: 'M9 3h6M10 3v6L4 19a1 1 0 00.9 1.5h14.2A1 1 0 0020 19l-6-10V3',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  quote: 'M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  pin: 'M12 17v5M8 3h8l-1 6 3 4H6l3-4z',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 5v6h-6',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
};
const BRAND = {
  github: 'M12 2a10 10 0 00-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.7 9.7 0 015 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0012 2z',
  drive: 'M8.3 3h7.4l6.3 11-3.7 6.5H5.7L2 14zM8.3 3l6.3 11H22M15.7 3L9.4 14 5.7 20.5M2 14h12.6',
  overleaf: 'M12 21c-4.4 0-8-3.4-8-7.6C4 8 9 4.4 17 3c-1.5 2-2 3.5-1.6 5.3A7.5 7.5 0 0120 14c0 3.9-3.6 7-8 7zM12 17.5a3.3 3.3 0 100-6.6 3.3 3.3 0 000 6.6z',
};

export function icon(name, size = 18) {
  if (BRAND[name] && name === 'github') {
    return s('svg', { class: 'icon', width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: BRAND.github, fill: 'currentColor' }));
  }
  const d = ICONS[name] || BRAND[name] || ICONS.link;
  return s('svg', { class: 'icon', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d }));
}

export function btn(label, onClick, { kind = '', iconName, title, size = '', type = 'button' } = {}) {
  return h('button', { type, class: `btn ${kind} ${size}`.trim(), onclick: onClick, title: title || null, 'aria-label': !label ? title : null },
    iconName ? icon(iconName, size === 'sm' ? 15 : 17) : null, label ? h('span', {}, label) : null);
}

// ---------- "Advanced" disclosure that remembers its open state across re-renders ----------
const openAdvanced = new Set();
export function advanced(key, ...kids) {
  const d = h('details', { class: 'advanced', open: openAdvanced.has(key) || null },
    h('summary', {}, icon('settings', 14), h('span', {}, 'Advanced')),
    h('div', { class: 'advanced-body' }, ...kids));
  d.addEventListener('toggle', () => (d.open ? openAdvanced.add(key) : openAdvanced.delete(key)));
  return d;
}

// ---------- form fields ----------
export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
}
export function input(attrs = {}) {
  return h('input', { class: 'input', type: 'text', ...attrs });
}
export function textarea(attrs = {}) {
  return h('textarea', { class: 'input', rows: 4, ...attrs });
}
export function select(options, value, attrs = {}) {
  return h('select', { class: 'input', ...attrs, value },
    options.map((o) => (typeof o === 'string' ? h('option', { value: o }, o) : h('option', { value: o.value }, o.label))));
}

// ---------- modal ----------
export function modal(title, body, actions = [], { wide = false } = {}) {
  const prevFocus = document.activeElement;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'modal-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), btn('', close, { kind: 'ghost', iconName: 'x', title: 'Close' })),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => btn(a.label, () => a.onClick(close), { kind: a.kind || '' }))) : null));
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  setTimeout(() => overlay.querySelector('input:not([type=checkbox]),textarea,select')?.focus(), 30);
  return { close, el: overlay };
}

export function confirmDialog(message, { okLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal('Are you sure?', h('p', {}, message), [
      { label: 'Cancel', onClick: (close) => { answered = true; resolve(false); close(); } },
      { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: (close) => { answered = true; resolve(true); close(); } },
    ]);
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (!answered) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

export function toast(message, kind = '') {
  let host = document.querySelector('.toasts');
  if (!host) document.body.append((host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })));
  const t = h('div', { class: `toast ${kind}` }, message);
  host.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}

// ---------- formatting ----------
export function fmtDate(str, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
export function fmtTime(t) {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  return new Date(2000, 0, 1, hh, mm).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export function timeAgo(iso) {
  const sec = (Date.now() - new Date(iso)) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function statusChip(u) {
  const iconFor = { critical: 'alert', serious: 'clock', warning: 'clock', calm: 'calendar', done: 'check' };
  return h('span', { class: `chip status-${u.level}` }, icon(iconFor[u.level] || 'clock', 13), u.label);
}

export function progressBar(pct, { label } = {}) {
  return h('div', { class: 'meter', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label || 'Progress' },
    h('div', { class: 'meter-fill', style: { width: `${pct}%` } }));
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Minimal, safe markdown: escape first, then add formatting. */
export function markdown(src) {
  const lines = escapeHtml(src || '').split('\n');
  const out = [];
  let list = null;
  let inCode = false;
  const inline = (t) => t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    if (line.startsWith('```')) { closeList(); out.push(inCode ? '</code></pre>' : '<pre><code>'); inCode = !inCode; continue; }
    if (inCode) { out.push(line + '\n'); continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { closeList(); out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`); }
    else if ((m = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)/i))) { if (list !== 'ul') { closeList(); out.push('<ul class="md-tasks">'); list = 'ul'; } out.push(`<li>${m[1].trim() ? '☑' : '☐'} ${inline(m[2])}</li>`); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (line.startsWith('&gt; ')) { closeList(); out.push(`<blockquote>${inline(line.slice(5))}</blockquote>`); }
    else if (!line.trim()) { closeList(); }
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('');
}

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
  catch { toast('Could not copy — select and copy manually', 'error'); }
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), text ? h('p', { class: 'muted' }, text) : null, action || null);
}

export function safeUrl(url) {
  try {
    const u = new URL(url.trim().match(/^[a-z]+:/i) ? url.trim() : `https://${url.trim()}`);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch { return null; }
}

export function debounce(fn, ms = 400) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Ask the router to re-render the current view (keeps scroll position). */
export function refresh() {
  window.dispatchEvent(new Event('app:refresh'));
}
