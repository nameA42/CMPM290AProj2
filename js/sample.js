// Sample content so new users can explore every feature.
import { state, save, uid, newProject } from './store.js';
import { putData } from './idb.js';

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sampleDataset() {
  // Deterministic pseudo-random numbers so the sample looks the same every time.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  const headers = ['participant', 'condition', 'day', 'recall_pct', 'reaction_ms', 'sleep_hours'];
  const rows = [];
  const effect = { Sleep: 6, Nap: 3, Wake: 0 };
  let pid = 1;
  for (const condition of ['Sleep', 'Nap', 'Wake']) {
    for (let k = 0; k < 12; k++, pid++) {
      const ability = gauss() * 6;
      const sleepHours = condition === 'Sleep' ? 7 + gauss() * 0.8 : condition === 'Nap' ? 1.2 + gauss() * 0.3 : 0;
      for (let day = 1; day <= 5; day++) {
        const recall = 52 + ability + effect[condition] * Math.log(day + 1) + day * 1.5 + gauss() * 4;
        const rt = 720 - recall * 2.4 + gauss() * 35;
        rows.push([`P${String(pid).padStart(2, '0')}`, condition, String(day), recall.toFixed(1), rt.toFixed(0), sleepHours.toFixed(1)]);
      }
    }
  }
  return { headers, rows };
}

export async function loadSample() {
  const p = newProject({
    title: 'Sleep & memory consolidation study',
    description: 'Does a full night of sleep improve word-pair recall more than a nap or staying awake? Within-lab study, 36 participants.',
    color: '#2a78d6',
    currentPhase: 2,
  });
  const t = (text, done = false, due = '') => ({ id: uid(), text, done, due });
  p.phases[0].tasks = [t('Literature review on sleep-dependent consolidation', true), t('Finalize word-pair stimuli', true), t('IRB approval', true), t('Recruit 36 participants', true)];
  p.phases[0].progressOverride = 100;
  p.phases[1].tasks = [t('Pilot with 4 participants', true), t('Run Sleep condition', true), t('Run Nap condition', true), t('Run Wake condition', true), t('Back up raw data to Drive', true)];
  p.phases[2].tasks = [t('Clean data & exclude outliers', true), t('Mixed-effects model for recall', false, dayOffset(3)), t('Make figures for results section', false, dayOffset(6)), t('Robustness check: reaction times', false)];
  p.phases[3].tasks = [t('Outline with advisor', false, dayOffset(9)), t('Draft methods section', false)];
  p.phases[2].notes = 'Excluded P07 (did not follow sleep protocol). Consider day as a continuous predictor.';
  p.experiments = [
    { id: uid(), name: 'Pilot study', status: 'Done', date: dayOffset(-60), hypothesis: 'Procedure takes under 45 minutes per session.', setup: '4 lab members, 40 word pairs, recall after 12 h.', results: 'Average 38 min. Shortened instructions.', codeRef: 'pilot-v1', fields: {} },
    { id: uid(), name: 'Main study — all conditions', status: 'Done', date: dayOffset(-21), hypothesis: 'Sleep > Nap > Wake on day-5 recall.', setup: '36 participants randomly assigned (12 per condition), 5 daily sessions.', results: 'Sleep group shows highest recall; see Analysis figures.', codeRef: 'main a3f9c21', fields: {} },
  ];
  p.writing.venue = 'Journal of Sleep Research';
  p.writing.sections.forEach((s, i) => { if (i === 0) s.status = 'Outlining'; if (i === 1) { s.status = 'Drafting'; s.words = 640; } if (i === 3) { s.status = 'Drafting'; s.words = 900; } s.target = [250, 1000, 900, 1200, 1500, 1200, 400][i] || 0; });
  p.links = [
    { id: uid(), type: 'drive', label: 'Study materials', url: 'https://drive.google.com/' },
    { id: uid(), type: 'github', label: 'Analysis code', url: 'https://github.com/' },
    { id: uid(), type: 'overleaf', label: 'Manuscript', url: 'https://www.overleaf.com/' },
  ];
  const dsId = uid();
  const data = sampleDataset();
  await putData(dsId, data);
  state.datasets.push({ id: dsId, projectId: p.id, name: 'recall_scores', source: 'file', url: '', nrows: data.rows.length, ncols: data.headers.length, added: new Date().toISOString(), updated: new Date().toISOString() });
  const baseCfg = { title: '', xLabel: '', yLabel: '', aggregate: 'auto', groupBy: '', errCol: '', filter: { col: '', op: '=', value: '' }, logY: false, yMin: '', yMax: '', bins: '', trend: false, showPoints: true, xAsCategory: false, height: 340, colors: [] };
  p.charts = [
    { id: uid(), title: 'Recall by day and condition', datasetId: dsId, created: new Date().toISOString(), config: { ...baseCfg, type: 'line', x: 'day', y: ['recall_pct'], groupBy: 'condition', aggregate: 'mean_se', title: 'Recall by day and condition', xLabel: 'Day', yLabel: 'Recall (%)' } },
    { id: uid(), title: 'Day-5 recall distribution', datasetId: dsId, created: new Date().toISOString(), config: { ...baseCfg, type: 'box', x: '', y: ['recall_pct'], groupBy: 'condition', filter: { col: 'day', op: '=', value: '5' }, title: 'Day-5 recall distribution', yLabel: 'Recall (%)' } },
  ];
  state.projects.push(p);

  const now = new Date().toISOString();
  const papers = [
    { title: 'Sleep-dependent learning and memory consolidation', authors: ['Matthew P. Walker', 'Robert Stickgold'], year: '2004', venue: 'Neuron', doi: '10.1016/j.neuron.2004.08.031', status: 'Read', tags: ['review', 'consolidation'], rating: 5, type: 'article' },
    { title: 'The memory function of sleep', authors: ['Susanne Diekelmann', 'Jan Born'], year: '2010', venue: 'Nature Reviews Neuroscience', doi: '10.1038/nrn2762', status: 'Cited', tags: ['review'], rating: 4, type: 'article' },
    { title: 'About sleep’s role in memory', authors: ['Björn Rasch', 'Jan Born'], year: '2013', venue: 'Physiological Reviews', doi: '10.1152/physrev.00032.2012', status: 'To read', tags: ['review', 'mechanisms'], rating: 0, type: 'article' },
  ];
  for (const pa of papers) state.papers.unshift({ id: uid(), url: '', pdf: '', abstract: '', notes: '', projectIds: [p.id], added: now, ...pa });

  state.deadlines.push(
    { id: uid(), title: 'Advisor meeting: preliminary results', date: dayOffset(2), time: '14:00', type: 'Meeting', projectId: p.id, phase: 2, priority: 'Normal', notes: 'Bring recall figures.', done: false },
    { id: uid(), title: 'Lab presentation', date: dayOffset(12), time: '', type: 'Milestone', projectId: p.id, phase: 2, priority: 'Normal', notes: '', done: false },
    { id: uid(), title: 'Submit to Journal of Sleep Research', date: dayOffset(45), time: '', type: 'Submission', projectId: p.id, phase: 3, priority: 'High', notes: '', done: false },
    { id: uid(), title: 'Upload raw data to OSF', date: dayOffset(-1), time: '', type: 'Milestone', projectId: p.id, phase: 2, priority: 'Normal', notes: '', done: false },
  );
  state.notes.unshift({ id: uid(), title: 'Advisor meeting notes', body: '## Agenda\n- Review exclusion criteria\n- Decide on **mixed-effects** vs repeated-measures ANOVA\n\n## Action items\n- [x] Share cleaned dataset\n- [ ] Draft results figure', projectId: p.id, paperId: '', tags: ['meeting'], pinned: true, created: now, updated: now });
  save();
}
