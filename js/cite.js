// BibTeX parsing/export, citation formatting, and DOI lookup.

export const CITATION_STYLES = ['APA', 'MLA', 'Chicago', 'IEEE', 'BibTeX'];

// ---------- names ----------
function splitName(name) {
  name = name.trim();
  if (name.includes(',')) {
    const [last, first] = name.split(',').map((x) => x.trim());
    return { first: first || '', last };
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { first: '', last: parts[0] };
  // keep particles like "van", "de" with the last name
  let i = parts.length - 1;
  while (i > 1 && /^(van|von|de|der|da|di|du|la|le)$/i.test(parts[i - 1])) i--;
  return { first: parts.slice(0, i).join(' '), last: parts.slice(i).join(' ') };
}
const initials = (first) => first.split(/[\s-]+/).filter(Boolean).map((p) => `${p[0].toUpperCase()}.`).join(' ');

function joinList(items, conj = 'and', oxford = true) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}${oxford ? ',' : ''} ${conj} ${items[items.length - 1]}`;
}

const doiUrl = (p) => (p.doi ? `https://doi.org/${p.doi}` : p.url || '');
const end = (s) => (s && !/[.?!]$/.test(s) ? `${s}.` : s);

export function formatCitation(p, style) {
  const names = (p.authors || []).map(splitName);
  const year = p.year || 'n.d.';
  const title = p.title || 'Untitled';
  const venue = p.venue || '';
  const link = doiUrl(p);
  switch (style) {
    case 'APA': {
      const a = names.map((n) => (n.first ? `${n.last}, ${initials(n.first)}` : n.last));
      const authors = a.length > 20 ? `${a.slice(0, 19).join(', ')}, … ${a[a.length - 1]}` : a.length > 1 ? `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}` : a[0] || '';
      return [authors && `${end(authors)}`, `(${year}).`, end(title), venue && end(venue), link].filter(Boolean).join(' ');
    }
    case 'MLA': {
      let authors = '';
      if (names.length === 1) authors = `${names[0].last}${names[0].first ? `, ${names[0].first}` : ''}`;
      else if (names.length === 2) authors = `${names[0].last}, ${names[0].first}, and ${names[1].first} ${names[1].last}`.replace(/\s+/g, ' ');
      else if (names.length > 2) authors = `${names[0].last}, ${names[0].first}, et al`;
      return [authors && end(authors), `“${end(title)}”`, venue && `${venue},`, `${year}${link ? ',' : '.'}`, link && `${link}.`].filter(Boolean).join(' ');
    }
    case 'Chicago': {
      const a = names.map((n, i) => (i === 0 ? `${n.last}${n.first ? `, ${n.first}` : ''}` : `${n.first} ${n.last}`.trim()));
      const authors = a.length > 10 ? `${a.slice(0, 7).join(', ')}, et al` : joinList(a);
      return [authors && end(authors), `${year}.`, `“${end(title)}”`, venue && end(venue), link && `${link}.`].filter(Boolean).join(' ');
    }
    case 'IEEE': {
      const a = names.map((n) => `${n.first ? initials(n.first) + ' ' : ''}${n.last}`);
      const authors = a.length > 6 ? `${a[0]} et al.` : joinList(a);
      return [authors && `${authors},`, `“${title},”`, venue && `${venue},`, `${year}${link ? ',' : '.'}`, link && `doi: ${p.doi || link}.`].filter(Boolean).join(' ');
    }
    case 'BibTeX':
    default:
      return toBibtex(p);
  }
}

// ---------- BibTeX ----------
export function citeKey(p) {
  if (p.citeKey) return p.citeKey;
  const last = p.authors?.[0] ? splitName(p.authors[0]).last : 'anon';
  const word = (p.title || 'paper').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').find((w) => w.length > 3 && !['with', 'from', 'that', 'this', 'into', 'over'].includes(w)) || 'paper';
  return `${last.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}${p.year || ''}${word}`;
}

const bibEscape = (s) => String(s).replace(/([&%$#_])/g, '\\$1');

export function toBibtex(p) {
  const type = p.type || (p.venue ? 'article' : 'misc');
  const venueField = { article: 'journal', inproceedings: 'booktitle', incollection: 'booktitle', book: 'publisher', phdthesis: 'school', mastersthesis: 'school', techreport: 'institution' }[type] || 'howpublished';
  const fields = [
    ['title', `{${p.title || ''}}`],
    ['author', (p.authors || []).map((a) => { const n = splitName(a); return n.first ? `${n.last}, ${n.first}` : n.last; }).join(' and ')],
    ['year', p.year],
    [venueField, p.venue],
    ['volume', p.volume], ['number', p.number], ['pages', p.pages],
    ['doi', p.doi],
    ['url', p.url],
  ].filter(([, v]) => v);
  return `@${type}{${citeKey(p)},\n${fields.map(([k, v]) => `  ${k} = {${k === 'url' || k === 'doi' ? v : bibEscape(v).replace(/\\([{}])/g, '$1')}}`).join(',\n')}\n}`;
}

/** Parses BibTeX text into an array of { type, key, fields }. */
export function parseBibtex(text) {
  const entries = [];
  const strings = {};
  let i = 0;
  const n = text.length;
  const skipWs = () => { while (i < n && /\s/.test(text[i])) i++; };
  const readBraced = () => {
    // assumes text[i] === '{'
    let depth = 0; const start = i + 1;
    for (; i < n; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { i++; return text.slice(start, i - 1); } }
    }
    return text.slice(start);
  };
  const readQuoted = () => {
    const start = ++i; let depth = 0;
    for (; i < n; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      else if (text[i] === '"' && depth === 0) { i++; return text.slice(start, i - 1); }
    }
    return text.slice(start);
  };
  const readValue = () => {
    const parts = [];
    for (;;) {
      skipWs();
      if (text[i] === '{') parts.push(readBraced());
      else if (text[i] === '"') parts.push(readQuoted());
      else {
        const m = /^[^,}#\s]+/.exec(text.slice(i));
        if (!m) break;
        i += m[0].length;
        parts.push(strings[m[0].toLowerCase()] ?? m[0]);
      }
      skipWs();
      if (text[i] === '#') { i++; continue; }
      break;
    }
    return parts.join('');
  };
  while (i < n) {
    const at = text.indexOf('@', i);
    if (at < 0) break;
    i = at + 1;
    const tm = /^\s*([a-zA-Z]+)\s*([{(])/.exec(text.slice(i));
    if (!tm) continue;
    const type = tm[1].toLowerCase();
    i += tm[0].length;
    const close = tm[2] === '{' ? '}' : ')';
    if (type === 'comment' || type === 'preamble') { i--; if (text[i] === '{') readBraced(); continue; }
    skipWs();
    let key = '';
    if (type !== 'string') {
      const km = /^[^,\s}]*/.exec(text.slice(i));
      key = km[0];
      i += key.length;
      skipWs();
      if (text[i] === ',') i++;
    }
    const fields = {};
    for (;;) {
      skipWs();
      if (i >= n || text[i] === close) { i++; break; }
      const fm = /^([^=\s,}]+)\s*=/.exec(text.slice(i));
      if (!fm) { i++; continue; }
      i += fm[0].length;
      const value = readValue();
      fields[fm[1].toLowerCase()] = value;
      skipWs();
      if (text[i] === ',') i++;
    }
    if (type === 'string') Object.assign(strings, Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v])));
    else entries.push({ type, key, fields });
  }
  return entries;
}

const LATEX_ACCENTS = { '"': '̈', "'": '́', '`': '̀', '^': '̂', '~': '̃', c: '̧', '=': '̄', '.': '̇', u: '̆', v: '̌', H: '̋' };
export function cleanLatex(s = '') {
  return s
    .replace(/\{\\([`'"^~=.]|[cuvH](?=\s|\{))\s*\{?([a-zA-Z])\}?\}/g, (_, a, c) => (c + LATEX_ACCENTS[a]).normalize('NFC'))
    .replace(/\\([`'"^~=.])\{?([a-zA-Z])\}?/g, (_, a, c) => (c + LATEX_ACCENTS[a]).normalize('NFC'))
    .replace(/\\(&|%|\$|#|_)/g, '$1')
    .replace(/\\textendash|--/g, '–')
    .replace(/\\(emph|textit|textbf|textsc)\{([^}]*)\}/g, '$2')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function paperFromBibtex(entry) {
  const f = entry.fields;
  return {
    title: cleanLatex(f.title),
    authors: f.author ? f.author.split(/\s+and\s+/i).map((a) => { const n = splitName(cleanLatex(a)); return `${n.first} ${n.last}`.trim(); }).filter(Boolean) : [],
    year: (f.year || f.date || '').match(/\d{4}/)?.[0] || '',
    venue: cleanLatex(f.journal || f.booktitle || f.publisher || f.school || f.institution || f.howpublished || ''),
    volume: f.volume || '', number: f.number || '', pages: (f.pages || '').replace('--', '–'),
    doi: (f.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//, ''),
    url: f.url || '',
    abstract: cleanLatex(f.abstract || ''),
    type: entry.type,
    citeKey: entry.key,
    tags: f.keywords ? f.keywords.split(/[,;]/).map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean) : [],
  };
}

// ---------- DOI lookup via Crossref (public, CORS-enabled) ----------
export function normalizeDoi(input) {
  const m = String(input).trim().match(/10\.\d{4,9}\/\S+/);
  return m ? m[0].replace(/[.,;]$/, '') : null;
}

export async function lookupDoi(input) {
  const doi = normalizeDoi(input);
  if (!doi) throw new Error('That does not look like a DOI (it should start with 10.).');
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'DOI not found on Crossref.' : `Crossref returned ${res.status}.`);
  const w = (await res.json()).message;
  const typeMap = { 'journal-article': 'article', 'proceedings-article': 'inproceedings', 'book-chapter': 'incollection', book: 'book', 'posted-content': 'misc', report: 'techreport', dissertation: 'phdthesis' };
  return {
    title: (w.title?.[0] || '').replace(/<[^>]+>/g, ''),
    authors: (w.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ') || a.name).filter(Boolean),
    year: String(w.issued?.['date-parts']?.[0]?.[0] || w.published?.['date-parts']?.[0]?.[0] || ''),
    venue: w['container-title']?.[0] || w.publisher || '',
    volume: w.volume || '', number: w.issue || '', pages: w.page || '',
    doi,
    url: w.URL || `https://doi.org/${doi}`,
    abstract: (w.abstract || '').replace(/<[^>]+>/g, '').trim(),
    type: typeMap[w.type] || 'misc',
  };
}
