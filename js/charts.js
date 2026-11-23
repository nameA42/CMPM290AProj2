// Dependency-free SVG chart renderer: line, area, bar, scatter, histogram, box.
import { h, s } from './ui.js';

// Validated categorical palette (fixed order, never cycled) — light and dark steps.
const PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
};
export const MAX_SERIES = 8;

function theme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  return {
    dark,
    palette: dark ? PALETTE.dark : PALETTE.light,
    surface: v('--chart-surface', dark ? '#1a1a19' : '#fcfcfb'),
    text: v('--text', dark ? '#f0efec' : '#0b0b0b'),
    text2: v('--text-2', dark ? '#c3c2b7' : '#52514e'),
    muted: dark ? '#98968f' : '#898781',
    grid: dark ? '#2c2c2a' : '#e1e0d9',
    axis: dark ? '#383835' : '#c3c2b7',
    hover: dark ? 'rgba(255,255,255,0.05)' : 'rgba(11,11,11,0.04)',
  };
}

export function seriesColor(i, overrides) {
  return overrides?.[i] || theme().palette[i % MAX_SERIES];
}

// ---------- number & date formatting ----------
function compact(v) {
  const a = Math.abs(v);
  const f = (n, suf) => `${+(v / n).toFixed(Math.abs(v / n) < 10 ? 1 : 0)}${suf}`;
  if (a >= 1e9) return f(1e9, 'B');
  if (a >= 1e6) return f(1e6, 'M');
  if (a >= 1e4) return f(1e3, 'K');
  return null;
}
function tickFormatter(step, maxAbs) {
  if (maxAbs >= 1e4) return (v) => compact(v) ?? v.toLocaleString();
  const dec = Math.min(6, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  return (v) => v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function fmtValue(v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (Number.isInteger(v)) return v.toLocaleString();
  const a = Math.abs(v);
  return v.toLocaleString(undefined, { maximumFractionDigits: a >= 100 ? 1 : a >= 1 ? 3 : 4 });
}
function fmtDateTick(t, unit) {
  const d = new Date(t);
  if (unit === 'hour') return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (unit === 'day') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (unit === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  return String(d.getFullYear());
}
export function fmtX(v, xType) {
  if (xType === 'date') return new Date(v).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', ...(new Date(v).getHours() || new Date(v).getMinutes() ? { hour: 'numeric', minute: '2-digit' } : {}) });
  if (xType === 'number') return fmtValue(v);
  return String(v);
}

// ---------- ticks ----------
function niceTicks(min, max, count = 5, integer = false) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const err = raw / mag;
  let step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  if (integer && step < 1) step = 1;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toPrecision(12));
  return { ticks, min: lo, max: hi, step };
}
function logTicks(min, max) {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const ticks = [];
  for (let e = lo; e <= hi; e++) ticks.push(10 ** e);
  return { ticks, min: 10 ** lo, max: 10 ** hi, step: 1 };
}
function dateTicks(min, max, maxTicks) {
  const H = 36e5, D = 864e5;
  const units = [
    ['hour', 1, H], ['hour', 3, 3 * H], ['hour', 6, 6 * H], ['hour', 12, 12 * H],
    ['day', 1, D], ['day', 2, 2 * D], ['day', 7, 7 * D], ['day', 14, 14 * D],
    ['month', 1, 30.4 * D], ['month', 2, 61 * D], ['month', 3, 91 * D], ['month', 6, 182 * D],
    ['year', 1, 365 * D], ['year', 2, 730 * D], ['year', 5, 1826 * D], ['year', 10, 3652 * D], ['year', 25, 9131 * D], ['year', 100, 36524 * D],
  ];
  const span = max - min || D;
  const [unit, n] = units.find(([, , ms]) => span / ms <= maxTicks) || units[units.length - 1];
  const ticks = [];
  const d = new Date(min);
  if (unit === 'hour') { d.setMinutes(0, 0, 0); d.setHours(Math.ceil(d.getHours() / n) * n); }
  else if (unit === 'day') { d.setHours(0, 0, 0, 0); if (d.getTime() < min) d.setDate(d.getDate() + 1); }
  else if (unit === 'month') { d.setHours(0, 0, 0, 0); d.setDate(1); if (d.getTime() < min) d.setMonth(d.getMonth() + 1); d.setMonth(Math.ceil(d.getMonth() / n) * n); }
  else { d.setHours(0, 0, 0, 0); d.setMonth(0, 1); if (d.getTime() < min) d.setFullYear(d.getFullYear() + 1); d.setFullYear(Math.ceil(d.getFullYear() / n) * n); }
  let guard = 0;
  while (d.getTime() <= max && guard++ < 200) {
    if (d.getTime() >= min) ticks.push(d.getTime());
    if (unit === 'hour') d.setHours(d.getHours() + n);
    else if (unit === 'day') d.setDate(d.getDate() + n);
    else if (unit === 'month') d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
  }
  return { ticks, unit };
}

// ---------- statistics ----------
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function boxStats(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q1 = quantile(v, 0.25), med = quantile(v, 0.5), q3 = quantile(v, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const inside = v.filter((x) => x >= lo && x <= hi);
  return { n: v.length, min: v[0], max: v[v.length - 1], q1, median: med, q3, lowW: inside[0], highW: inside[inside.length - 1], mean: v.reduce((a, b) => a + b, 0) / (v.length || 1), outliers: v.filter((x) => x < lo || x > hi) };
}
export function linearFit(points) {
  const p = points.filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y));
  const n = p.length;
  if (n < 2) return null;
  const mx = p.reduce((a, d) => a + d.x, 0) / n;
  const my = p.reduce((a, d) => a + d.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const d of p) { sxy += (d.x - mx) * (d.y - my); sxx += (d.x - mx) ** 2; syy += (d.y - my) ** 2; }
  if (!sxx) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : 1 };
}
export function histogramBins(values, binCount) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return [];
  const min = Math.min(...v), max = Math.max(...v);
  const k = binCount || Math.max(5, Math.min(50, Math.ceil(Math.log2(v.length) + 1)));
  const { ticks, step } = niceTicks(min, max, k);
  const bins = ticks.slice(0, -1).map((t) => ({ x0: t, x1: +(t + step).toPrecision(12), count: 0 }));
  if (!bins.length) return [{ x0: min, x1: max, count: v.length }];
  for (const x of v) {
    let i = Math.floor((x - bins[0].x0) / step);
    i = Math.max(0, Math.min(bins.length - 1, i));
    bins[i].count++;
  }
  return bins;
}

// ---------- drawing ----------
const observed = new WeakSet();
const ro = new ResizeObserver((entries) => {
  for (const e of entries) {
    const wrap = e.target;
    if (!wrap.isConnected) { ro.unobserve(wrap); continue; }
    const w = Math.round(e.contentRect.width);
    if (wrap._spec && Math.abs(w - (wrap._w || 0)) > 2) draw(wrap, wrap._spec);
  }
});

/** Renders `spec` into `wrap` (a .chart-wrap element) and keeps it responsive. */
export function drawChart(wrap, spec) {
  wrap._spec = spec;
  draw(wrap, spec);
  if (!observed.has(wrap)) { observed.add(wrap); ro.observe(wrap); }
}

const approxWidth = (str, size = 12) => String(str).length * size * 0.58;
const truncate = (str, n) => (String(str).length > n ? `${String(str).slice(0, n - 1)}…` : String(str));

function roundedBar(x, y0, y1, w, r = 4) {
  const up = y1 <= y0;
  const hgt = Math.abs(y0 - y1);
  r = Math.max(0, Math.min(r, w / 2, hgt));
  if (up) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

function draw(wrap, spec) {
  const t = theme();
  const W = Math.max(280, Math.round(wrap.clientWidth || 640));
  wrap._w = W;
  const H = spec.height || 340;
  const type = spec.type;
  const colors = spec.series.map((_, i) => seriesColor(i, spec.colors));
  const series = spec.series;

  const svg = s('svg', { xmlns: 'http://www.w3.org/2000/svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': spec.title || 'Chart', 'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif' });
  svg.append(s('rect', { x: 0, y: 0, width: W, height: H, fill: t.surface, rx: 10 }));
  let top = 14;
  if (spec.title) { svg.append(s('text', { x: 14, y: 26, 'font-size': 15, 'font-weight': 600, fill: t.text }, spec.title)); top = 40; }

  // legend (2+ series, except box/histogram which label by axis)
  const showLegend = series.length >= 2 && type !== 'box';
  if (showLegend) {
    let lx = 14, ly = top + 6;
    const g = s('g', {});
    series.forEach((se, i) => {
      const label = se.legend || se.name;
      const w = 18 + approxWidth(label, 12) + 16;
      if (lx + w > W - 10 && lx > 14) { lx = 14; ly += 20; }
      if (type === 'line' || type === 'area') g.append(s('rect', { x: lx, y: ly - 2, width: 14, height: 3, rx: 1.5, fill: colors[i] }));
      else if (type === 'scatter') g.append(s('circle', { cx: lx + 6, cy: ly - 1, r: 5, fill: colors[i] }));
      else g.append(s('rect', { x: lx, y: ly - 6, width: 11, height: 11, rx: 3, fill: colors[i] }));
      g.append(s('text', { x: lx + 18, y: ly + 3, 'font-size': 12, fill: t.text2 }, label));
      lx += w;
    });
    svg.append(g);
    top = ly + 16;
  }

  const hasData = type === 'box' || type === 'histogram'
    ? series.some((se) => (se.values || []).some(Number.isFinite))
    : series.some((se) => se.points.some((p) => Number.isFinite(p.y)));
  if (!hasData) {
    svg.append(s('text', { x: W / 2, y: (H + top) / 2, 'text-anchor': 'middle', 'font-size': 13, fill: t.muted }, spec.emptyMessage || 'No numeric data to plot for this selection'));
    return finish(wrap, svg, null);
  }

  // ----- x domain
  let xKind = type === 'bar' || type === 'box' ? 'category' : type === 'histogram' ? 'number' : spec.xType || 'number';
  let categories = [];
  let bins = null;
  if (type === 'histogram') bins = histogramBins(series[0].values, spec.bins);
  if (xKind === 'category') {
    if (type === 'box') categories = series.map((se) => se.name);
    else {
      const seen = new Set();
      for (const se of series) for (const p of se.points) if (!seen.has(String(p.x))) { seen.add(String(p.x)); categories.push(String(p.x)); }
    }
  }

  // ----- y domain
  let ys = [];
  if (type === 'box') series.forEach((se) => { const b = boxStats(se.values); se._box = b; ys.push(b.min, b.max); });
  else if (type === 'histogram') ys = bins.map((b) => b.count).concat(0);
  else series.forEach((se) => se.points.forEach((p) => { if (Number.isFinite(p.y)) { ys.push(p.y); if (Number.isFinite(p.err)) ys.push(p.y - p.err, p.y + p.err); } }));
  const logY = spec.logY && type !== 'histogram';
  if (logY) ys = ys.filter((v) => v > 0);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (!logY && (type === 'bar' || type === 'area' || type === 'histogram' || spec.zeroBased)) { yMin = Math.min(0, yMin); yMax = Math.max(0, yMax); }
  if (Number.isFinite(spec.yMin)) yMin = spec.yMin;
  if (Number.isFinite(spec.yMax)) yMax = spec.yMax;
  if (logY && yMin <= 0) yMin = Math.min(...ys.filter((v) => v > 0));
  const plotHGuess = H - top - 50;
  const yt = logY ? logTicks(yMin, yMax) : niceTicks(yMin, yMax, Math.max(3, Math.min(8, Math.round(plotHGuess / 55))), type === 'histogram');
  if (Number.isFinite(spec.yMin)) yt.min = spec.yMin;
  if (Number.isFinite(spec.yMax)) yt.max = spec.yMax;
  yt.ticks = yt.ticks.filter((v) => v >= yt.min - 1e-12 && v <= yt.max + 1e-12);
  const yFmt = logY ? (v) => compact(v) ?? fmtValue(v) : tickFormatter(yt.step, Math.max(Math.abs(yt.min), Math.abs(yt.max)));

  // ----- margins
  const yLabelW = Math.max(...yt.ticks.map((v) => approxWidth(yFmt(v), 11.5)), 10);
  const left = Math.ceil(yLabelW + 14 + (spec.yLabel ? 20 : 0));
  const right = 18;
  let bottom = 30 + (spec.xLabel ? 20 : 0);
  const plotW = W - left - right;
  let rotate = false;
  let catStep = 1;
  if (xKind === 'category') {
    const band = plotW / Math.max(1, categories.length);
    const longest = Math.max(...categories.map((c) => approxWidth(truncate(c, 16), 11.5)));
    if (longest > band - 6) {
      rotate = true;
      const perLabel = 16;
      catStep = Math.max(1, Math.ceil(perLabel / band));
      bottom += Math.min(90, longest * 0.7);
    }
  }
  const plotTop = top + 8;
  const plotBottom = H - bottom;
  const plotH = plotBottom - plotTop;

  const yScale = logY
    ? (v) => plotBottom - ((Math.log10(v) - Math.log10(yt.min)) / (Math.log10(yt.max) - Math.log10(yt.min) || 1)) * plotH
    : (v) => plotBottom - ((v - yt.min) / (yt.max - yt.min || 1)) * plotH;
  const clampY = (v) => Math.max(plotTop - 4, Math.min(plotBottom + 4, v));

  let xScale, xTicks = [], xFmt, band = 0;
  if (xKind === 'category') {
    band = plotW / Math.max(1, categories.length);
    xScale = (c) => left + band * (categories.indexOf(String(c)) + 0.5);
  } else {
    let xs;
    if (type === 'histogram') xs = [bins[0].x0, bins[bins.length - 1].x1];
    else xs = series.flatMap((se) => se.points.map((p) => p.x)).filter(Number.isFinite);
    let xMin = Math.min(...xs), xMax = Math.max(...xs);
    if (xKind === 'date') {
      if (xMin === xMax) { xMin -= 864e5; xMax += 864e5; }
      const dt = dateTicks(xMin, xMax, Math.max(2, Math.floor(plotW / 90)));
      xTicks = dt.ticks;
      xFmt = (v) => fmtDateTick(v, dt.unit);
    } else {
      const nt = niceTicks(xMin, xMax, Math.max(2, Math.min(10, Math.floor(plotW / 80))), type !== 'histogram' && xs.every(Number.isInteger));
      if (type !== 'histogram' && type !== 'scatter') { /* lines span the data exactly */ } else { xMin = nt.min; xMax = nt.max; }
      if (xMin === xMax) { xMin -= 1; xMax += 1; }
      xTicks = nt.ticks.filter((v) => v >= xMin - 1e-9 && v <= xMax + 1e-9);
      const xf = tickFormatter(nt.step, Math.max(Math.abs(xMin), Math.abs(xMax)));
      xFmt = xf;
    }
    xScale = (v) => left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  }

  // ----- grid & axes
  const grid = s('g', {});
  for (const v of yt.ticks) {
    const y = Math.round(yScale(v)) + 0.5;
    grid.append(s('line', { x1: left, x2: W - right, y1: y, y2: y, stroke: t.grid, 'stroke-width': 1 }));
    grid.append(s('text', { x: left - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: t.muted, style: 'font-variant-numeric: tabular-nums' }, yFmt(v)));
  }
  const baseVal = logY ? yt.min : Math.max(yt.min, Math.min(yt.max, 0));
  const baseY = Math.round(yScale(baseVal)) + 0.5;
  grid.append(s('line', { x1: left, x2: W - right, y1: baseY, y2: baseY, stroke: t.axis, 'stroke-width': 1 }));
  if (xKind === 'category') {
    categories.forEach((c, i) => {
      if (i % catStep) return;
      const x = left + band * (i + 0.5);
      const label = truncate(c, 16);
      grid.append(rotate
        ? s('text', { x, y: plotBottom + 14, 'text-anchor': 'end', 'font-size': 11.5, fill: t.muted, transform: `rotate(-40 ${x} ${plotBottom + 14})` }, label)
        : s('text', { x, y: plotBottom + 18, 'text-anchor': 'middle', 'font-size': 11.5, fill: t.muted }, label));
    });
  } else {
    for (const v of xTicks) {
      const x = xScale(v);
      grid.append(s('line', { x1: x, x2: x, y1: plotBottom, y2: plotBottom + 4, stroke: t.axis }));
      grid.append(s('text', { x, y: plotBottom + 18, 'text-anchor': 'middle', 'font-size': 11.5, fill: t.muted, style: 'font-variant-numeric: tabular-nums' }, xFmt(v)));
    }
  }
  if (spec.yLabel) grid.append(s('text', { x: 14, y: (plotTop + plotBottom) / 2, transform: `rotate(-90 14 ${(plotTop + plotBottom) / 2})`, 'text-anchor': 'middle', 'font-size': 12, fill: t.text2, 'dominant-baseline': 'hanging' }, spec.yLabel));
  if (spec.xLabel) grid.append(s('text', { x: left + plotW / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: t.text2 }, spec.xLabel));
  svg.append(grid);

  const hoverLayer = s('g', { 'pointer-events': 'none' });
  const marks = s('g', {});
  svg.append(hoverLayer, marks);
  const errBar = (g, x, p, color) => {
    if (!Number.isFinite(p.err) || !p.err) return;
    const y1 = clampY(yScale(p.y - p.err)), y2 = clampY(yScale(p.y + p.err));
    g.append(s('path', { d: `M${x},${y1}V${y2}M${x - 4},${y1}H${x + 4}M${x - 4},${y2}H${x + 4}`, stroke: color, 'stroke-width': 1.5, opacity: 0.75, fill: 'none' }));
  };

  let hover = null; // (mx, my) => { html, x?, mark? } | null

  // ----- marks per type
  if (type === 'line' || type === 'area') {
    series.forEach((se, i) => {
      const pts = se.points.filter((p) => Number.isFinite(p.x) || xKind === 'category');
      let d = '', area = '', started = false, segStart = null, lastX = null;
      for (const p of pts) {
        if (!Number.isFinite(p.y) || (logY && p.y <= 0)) {
          if (started && type === 'area') { area += `L${lastX},${baseY}L${segStart},${baseY}Z`; }
          started = false; continue;
        }
        const x = xScale(p.x), y = yScale(p.y);
        if (!started) { d += `M${x},${y}`; if (type === 'area') { area += `M${x},${y}`; segStart = x; } started = true; }
        else { d += `L${x},${y}`; if (type === 'area') area += `L${x},${y}`; }
        lastX = x;
      }
      if (type === 'area' && started) area += `L${lastX},${baseY}L${segStart},${baseY}Z`;
      if (area) marks.append(s('path', { d: area, fill: colors[i], 'fill-opacity': 0.1, stroke: 'none' }));
      marks.append(s('path', { d, fill: 'none', stroke: colors[i], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      pts.forEach((p) => errBar(marks, xScale(p.x), p, colors[i]));
      const valid = pts.filter((p) => Number.isFinite(p.y));
      if (spec.showPoints || valid.length === 1) valid.forEach((p) => marks.append(s('circle', { cx: xScale(p.x), cy: yScale(p.y), r: 4, fill: colors[i], stroke: t.surface, 'stroke-width': 2 })));
      if (spec.trend && xKind !== 'category') drawTrend(marks, se, xScale, yScale, colors[i], logY);
    });
    // crosshair hover
    const xsAll = xKind === 'category' ? categories : [...new Set(series.flatMap((se) => se.points.map((p) => p.x)).filter(Number.isFinite))].sort((a, b) => a - b);
    hover = (mx) => {
      if (!xsAll.length) return null;
      let best = xsAll[0], bd = Infinity;
      for (const xv of xsAll) { const dd = Math.abs(xScale(xv) - mx); if (dd < bd) { bd = dd; best = xv; } }
      const x = xScale(best);
      hoverLayer.replaceChildren(s('line', { x1: x, x2: x, y1: plotTop, y2: plotBottom, stroke: t.axis, 'stroke-width': 1 }));
      const rows = [];
      series.forEach((se, i) => {
        const p = se.points.find((q) => (xKind === 'category' ? String(q.x) === String(best) : q.x === best));
        if (!p || !Number.isFinite(p.y)) return;
        hoverLayer.append(s('circle', { cx: x, cy: yScale(p.y), r: 5, fill: colors[i], stroke: t.surface, 'stroke-width': 2 }));
        rows.push([se.name, p.y, colors[i], p.err]);
      });
      return { head: spec.xLabel && xKind === 'number' ? `${spec.xLabel} ${fmtX(best, xKind)}` : fmtX(best, xKind), rows, x };
    };
  } else if (type === 'bar') {
    const n = series.length;
    const barW = Math.max(2, Math.min(24, (band * 0.8 - (n - 1) * 2) / n));
    const groupW = n * barW + (n - 1) * 2;
    series.forEach((se, i) => {
      for (const p of se.points) {
        if (!Number.isFinite(p.y) || (logY && p.y <= 0)) continue;
        const cx = xScale(p.x);
        const x = cx - groupW / 2 + i * (barW + 2);
        marks.append(s('path', { d: roundedBar(x, baseY, clampY(yScale(p.y)), barW, 4), fill: colors[i] }));
        errBar(marks, x + barW / 2, p, t.text2);
      }
    });
    if (series.length === 1 && categories.length <= 12) {
      // selective direct labels: max value only
      const pts = series[0].points.filter((p) => Number.isFinite(p.y));
      const maxP = pts.reduce((a, b) => (b.y > a.y ? b : a), pts[0]);
      if (maxP) marks.append(s('text', { x: xScale(maxP.x), y: yScale(maxP.y) - 6, 'text-anchor': 'middle', 'font-size': 11.5, fill: t.text2, 'font-weight': 600 }, fmtValue(maxP.y)));
    }
    hover = (mx) => {
      const idx = Math.floor((mx - left) / band);
      if (idx < 0 || idx >= categories.length) return null;
      hoverLayer.replaceChildren(s('rect', { x: left + idx * band, y: plotTop, width: band, height: plotH, fill: t.hover }));
      const cat = categories[idx];
      const rows = series.map((se, i) => { const p = se.points.find((q) => String(q.x) === cat); return p ? [se.name, p.y, colors[i], p.err] : null; }).filter(Boolean);
      return { head: cat, rows, x: left + (idx + 0.5) * band };
    };
  } else if (type === 'scatter') {
    const all = [];
    series.forEach((se, i) => {
      for (const p of se.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || (logY && p.y <= 0)) continue;
        const cx = xScale(p.x), cy = yScale(p.y);
        marks.append(s('circle', { cx, cy, r: 4, fill: colors[i], stroke: t.surface, 'stroke-width': 2, 'fill-opacity': 0.9 }));
        errBar(marks, cx, p, colors[i]);
        all.push({ cx, cy, p, i });
      }
      if (spec.trend) drawTrend(marks, se, xScale, yScale, colors[i], logY);
    });
    hover = (mx, my) => {
      let best = null, bd = 24 * 24;
      for (const a of all) { const dd = (a.cx - mx) ** 2 + (a.cy - my) ** 2; if (dd < bd) { bd = dd; best = a; } }
      if (!best) { hoverLayer.replaceChildren(); return null; }
      hoverLayer.replaceChildren(s('circle', { cx: best.cx, cy: best.cy, r: 7, fill: colors[best.i], stroke: t.surface, 'stroke-width': 2 }));
      return { head: best.p.label || series[best.i].name, rows: [[spec.xLabel || 'x', best.p.x, null, null, xKind], [spec.yLabel || 'y', best.p.y, colors[best.i], best.p.err]], x: best.cx, y: best.cy };
    };
  } else if (type === 'histogram') {
    const color = colors[0];
    bins.forEach((b) => {
      const x0 = xScale(b.x0) + 1, x1 = xScale(b.x1) - 1;
      if (b.count) marks.append(s('path', { d: roundedBar(x0, baseY, yScale(b.count), Math.max(1, x1 - x0), 4), fill: color }));
    });
    hover = (mx) => {
      const b = bins.find((bb) => mx >= xScale(bb.x0) && mx < xScale(bb.x1));
      if (!b) { hoverLayer.replaceChildren(); return null; }
      hoverLayer.replaceChildren(s('rect', { x: xScale(b.x0), y: plotTop, width: xScale(b.x1) - xScale(b.x0), height: plotH, fill: t.hover }));
      return { head: `${fmtValue(b.x0)} – ${fmtValue(b.x1)}`, rows: [['Count', b.count, color]], x: (xScale(b.x0) + xScale(b.x1)) / 2 };
    };
  } else if (type === 'box') {
    const bw = Math.min(44, band * 0.5);
    series.forEach((se, i) => {
      const b = se._box;
      if (!b.n) return;
      const cx = xScale(se.name);
      const c = colors[i];
      const y = (v) => clampY(yScale(v));
      marks.append(
        s('line', { x1: cx, x2: cx, y1: y(b.lowW), y2: y(b.q1), stroke: c, 'stroke-width': 1.5 }),
        s('line', { x1: cx, x2: cx, y1: y(b.q3), y2: y(b.highW), stroke: c, 'stroke-width': 1.5 }),
        s('line', { x1: cx - bw / 4, x2: cx + bw / 4, y1: y(b.lowW), y2: y(b.lowW), stroke: c, 'stroke-width': 1.5 }),
        s('line', { x1: cx - bw / 4, x2: cx + bw / 4, y1: y(b.highW), y2: y(b.highW), stroke: c, 'stroke-width': 1.5 }),
        s('rect', { x: cx - bw / 2, y: y(b.q3), width: bw, height: Math.max(1, y(b.q1) - y(b.q3)), rx: 4, fill: c, 'fill-opacity': 0.14, stroke: c, 'stroke-width': 2 }),
        s('line', { x1: cx - bw / 2, x2: cx + bw / 2, y1: y(b.median), y2: y(b.median), stroke: c, 'stroke-width': 2.5 }));
      b.outliers.forEach((o) => marks.append(s('circle', { cx, cy: y(o), r: 3.5, fill: c, stroke: t.surface, 'stroke-width': 1.5 })));
    });
    hover = (mx) => {
      const idx = Math.floor((mx - left) / band);
      const se = series[idx];
      if (!se) return null;
      hoverLayer.replaceChildren(s('rect', { x: left + idx * band, y: plotTop, width: band, height: plotH, fill: t.hover }));
      const b = se._box;
      return { head: se.name, rows: [['n', b.n], ['Max', b.max], ['Q3', b.q3], ['Median', b.median, colors[idx]], ['Mean', b.mean], ['Q1', b.q1], ['Min', b.min]], x: left + (idx + 0.5) * band };
    };
  }

  return finish(wrap, svg, hover && { hover, plotTop, plotBottom, left, right: W - right, hoverLayer });
}

function drawTrend(g, se, xScale, yScale, color, logY) {
  const pts = se.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const fit = linearFit(pts);
  if (!fit) return;
  const xs = pts.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = fit.intercept + fit.slope * x0, y1 = fit.intercept + fit.slope * x1;
  if (logY && (y0 <= 0 || y1 <= 0)) return;
  g.append(s('line', { x1: xScale(x0), y1: yScale(y0), x2: xScale(x1), y2: yScale(y1), stroke: color, 'stroke-width': 1.5, opacity: 0.85, 'stroke-linecap': 'round' }));
  se._fit = fit;
}

function finish(wrap, svg, interactive) {
  let tip = wrap.querySelector('.chart-tooltip');
  wrap.querySelector('svg')?.remove();
  wrap.prepend(svg);
  if (!tip) { tip = h('div', { class: 'chart-tooltip', role: 'presentation' }); wrap.append(tip); }
  tip.style.display = 'none';
  if (!interactive) return;
  const hit = s('rect', { x: interactive.left, y: interactive.plotTop, width: interactive.right - interactive.left, height: interactive.plotBottom - interactive.plotTop, fill: 'transparent', style: 'cursor: crosshair' });
  svg.append(hit);
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (svg.viewBox.baseVal.width / r.width);
    const my = (e.clientY - r.top) * (svg.viewBox.baseVal.height / r.height);
    const res = interactive.hover(mx, my);
    if (!res) { tip.style.display = 'none'; return; }
    tip.replaceChildren(
      h('div', { class: 'tt-head' }, res.head),
      ...res.rows.map(([name, v, color, err, kind]) => h('div', { class: 'tt-row' },
        color ? h('span', { class: 'sw', style: { background: color } }) : h('span', { class: 'sw' }),
        h('span', {}, name), h('b', {}, kind ? fmtX(v, kind) : fmtValue(v), Number.isFinite(err) && err ? ` ± ${fmtValue(err)}` : ''))));
    tip.style.display = 'block';
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const px = (res.x ?? mx) * (r.width / svg.viewBox.baseVal.width);
    const py = (res.y ?? my) * (r.height / svg.viewBox.baseVal.height);
    let lx = px + 14;
    if (lx + tw > r.width - 4) lx = px - tw - 14;
    tip.style.left = `${Math.max(4, lx)}px`;
    tip.style.top = `${Math.max(4, Math.min(r.height - th - 4, py - th / 2))}px`;
  };
  hit.addEventListener('mousemove', move);
  hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; interactive.hoverLayer.replaceChildren(); });
}

// ---------- table view & export ----------
export function specTable(spec) {
  if (spec.type === 'box') {
    const cols = ['Series', 'n', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Mean'];
    return h('table', {}, h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: i ? 'num' : '' }, c)))),
      h('tbody', {}, spec.series.map((se) => { const b = boxStats(se.values); return h('tr', {}, h('td', {}, se.name), [b.n, b.min, b.q1, b.median, b.q3, b.max, b.mean].map((v) => h('td', { class: 'num' }, fmtValue(v)))); })));
  }
  if (spec.type === 'histogram') {
    const bins = histogramBins(spec.series[0].values, spec.bins);
    return h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Bin'), h('th', { class: 'num' }, 'Count'))),
      h('tbody', {}, bins.map((b) => h('tr', {}, h('td', {}, `${fmtValue(b.x0)} – ${fmtValue(b.x1)}`), h('td', { class: 'num' }, b.count)))));
  }
  const xs = [];
  const seen = new Set();
  for (const se of spec.series) for (const p of se.points) { const k = String(p.x); if (!seen.has(k)) { seen.add(k); xs.push(p.x); } }
  const kind = spec.type === 'bar' ? 'category' : spec.xType;
  return h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, spec.xLabel || 'x'), spec.series.map((se) => h('th', { class: 'num' }, se.name)))),
    h('tbody', {}, xs.slice(0, 1000).map((x) => h('tr', {}, h('td', {}, fmtX(x, kind)),
      spec.series.map((se) => { const p = se.points.find((q) => String(q.x) === String(x)); return h('td', { class: 'num' }, p ? fmtValue(p.y) + (p.err ? ` ± ${fmtValue(p.err)}` : '') : ''); })))));
}

export function svgMarkup(wrap) {
  const svg = wrap.querySelector('svg').cloneNode(true);
  svg.querySelectorAll('rect[fill="transparent"]').forEach((r) => r.remove());
  svg.querySelector('g[pointer-events="none"]')?.replaceChildren();
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

export function pngBlob(wrap, scale = 2) {
  const markup = svgMarkup(wrap);
  const svg = wrap.querySelector('svg');
  const w = svg.viewBox.baseVal.width, hgt = svg.viewBox.baseVal.height;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * scale; c.height = hgt * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, hgt);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('PNG export failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}
