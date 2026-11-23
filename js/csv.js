// CSV/TSV parsing and Google Sheets fetching.

/** RFC 4180-ish parser with delimiter auto-detection. Returns { headers, rows }. */
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') >= 0 ? text.indexOf('\n') : text.length);
  const delim = [',', '\t', ';', '|'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) throw new Error('The file appears to be empty.');
  const width = Math.max(...rows.map((r) => r.length));
  const seen = new Map();
  const headers = Array.from({ length: width }, (_, i) => {
    let name = (rows[0][i] || '').trim() || `Column ${i + 1}`;
    if (seen.has(name)) { seen.set(name, seen.get(name) + 1); name = `${name} (${seen.get(name)})`; } else seen.set(name, 1);
    return name;
  });
  const body = rows.slice(1).map((r) => headers.map((_, i) => (r[i] ?? '').trim()));
  return { headers, rows: body };
}

export function toNumber(v) {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let pct = false;
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  s = s.replace(/^[$€£¥]/, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  const n = Number(s);
  return pct ? n / 100 : n;
}

const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$|^\d{1,2}\/\d{1,2}\/\d{2,4}( \d{1,2}:\d{2}(:\d{2})?)?$/;
export function toDate(v) {
  const s = String(v ?? '').trim();
  if (!DATE_RE.test(s)) return NaN;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

/** Infers 'number' | 'date' | 'text' for each column. */
export function columnTypes(data) {
  return data.headers.map((_, i) => {
    const vals = data.rows.map((r) => r[i]).filter((v) => v !== '' && v != null).slice(0, 500);
    if (!vals.length) return 'text';
    const num = vals.filter((v) => !Number.isNaN(toNumber(v))).length;
    if (num / vals.length >= 0.9) return 'number';
    const date = vals.filter((v) => !Number.isNaN(toDate(v))).length;
    if (date / vals.length >= 0.9) return 'date';
    return 'text';
  });
}

/** Turns any Google Sheets URL into CSV export URL candidates. */
export function sheetCsvUrls(url) {
  const u = url.trim();
  const gidMatch = u.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  const pub = u.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (pub) return [`https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?gid=${gid}&single=true&output=csv`];
  const id = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!id) return null;
  return [
    `https://docs.google.com/spreadsheets/d/${id[1]}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=csv&gid=${gid}`,
  ];
}

export async function fetchSheet(url) {
  const candidates = sheetCsvUrls(url);
  if (!candidates) throw new Error('That is not a Google Sheets link. It should look like https://docs.google.com/spreadsheets/d/…');
  let lastErr;
  for (const c of candidates) {
    try {
      const res = await fetch(c, { credentials: 'omit' });
      if (!res.ok) throw new Error(`Google returned ${res.status}`);
      const text = await res.text();
      if (/^\s*<!DOCTYPE html|<html/i.test(text)) throw new Error('Sheet is not public');
      return parseCsv(text);
    } catch (e) { lastErr = e; }
  }
  throw new Error(`Could not read the sheet (${lastErr?.message || 'network error'}). In Google Sheets choose Share → "Anyone with the link can view", or File → Share → Publish to web → CSV, then try again.`);
}
