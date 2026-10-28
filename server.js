// MESA Technical Quiz 2026 - server
const express = require('express'), fs = require('fs'), crypto = require('crypto');
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const HOST_PW = process.env.HOST_PASSWORD || 'mesa2026';
const SHEET_URL = process.env.SHEET_URL || '';
const SHEET_SECRET = process.env.SHEET_SECRET || '';
const FILE = process.env.DATA_FILE || 'data.json';
const GRACE = 2500; // ms of network slack after the timer ends

let S = { cfg: null, active: 0, results: {}, started: {} };
const tokens = new Set();

/* ---------- persistence: local file + Google Sheet ---------- */
const push = body => {
  if (!SHEET_URL) return;
  fetch(SHEET_URL, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ ...body, secret: SHEET_SECRET }) })
    .catch(e => console.error('sheet push failed', e.message));
};
const save = () => {
  try { fs.writeFileSync(FILE, JSON.stringify(S)); } catch (e) { console.error(e.message); }
};
const pushConfig = () => push({ action: 'config', json: JSON.stringify({ cfg: S.cfg, active: S.active }) });

async function boot() {
  try { if (fs.existsSync(FILE)) S = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { console.error(e.message); }
  if (!S.cfg && SHEET_URL) { // fresh server: restore from the sheet
    try {
      const r = await fetch(`${SHEET_URL}?action=load&secret=${encodeURIComponent(SHEET_SECRET)}`);
      const d = await r.json();
      if (d.config) { const c = JSON.parse(d.config); S.cfg = c.cfg; S.active = c.active || 0; }
      (d.results || []).forEach(row => {
        const t = +row[7], choice = +row[8], round = +row[2], q = +row[3];
        S.results[rid(round, t, q)] = { team: t, round, q, choice, points: +row[6], ts: Date.parse(row[0]) || Date.now() };
      });
      console.log('Restored from Google Sheet');
    } catch (e) { console.error('sheet restore failed', e.message); }
  }
}

/* ---------- quiz logic ---------- */
const rid = (r, t, q) => `r${r}_t${t}_q${q}`;
const ql = (r, t) => S.cfg.questions.filter(q => q.r === r && (q.t === -1 || q.t === t));
const roundScore = (t, r) => Object.values(S.results).filter(x => x.team === t && x.round === r).reduce((a, x) => a + x.points, 0);

function record(t, r, q, choice) {
  const id = rid(r, t, q);
  if (S.results[id]) return S.results[id];
  const x = ql(r, t).find(z => z.q === q);
  const points = choice < 0 ? 0 : (choice === x.c ? S.cfg.pts : S.cfg.neg);
  const row = { team: t, round: r, q, choice, points, ts: Date.now() };
  S.results[id] = row; save();
  push({ action: 'result', row: [new Date(row.ts).toISOString(), S.cfg.teams[t].name, r, q, choice < 0 ? '-' : 'ABCD'[choice], 'ABCD'[x.c], points, t, choice] });
  return row;
}

function nextFor(t, begin) {
  const r = S.active;
  if (!r) return { wait: true };
  const qs = ql(r, t);
  const n = qs.find(q => !S.results[rid(r, t, q.q)]);
  if (!n) return { done: true, round: r, score: roundScore(t, r) };
  const k = rid(r, t, n.q);
  if (!S.started[k]) {
    if (!begin) return { ready: true, round: r, count: qs.length };
    S.started[k] = Date.now() + S.cfg.timer * 1000; save();
  }
  if (Date.now() > S.started[k] + GRACE) { record(t, r, n.q, -1); return nextFor(t, begin); }
  return { q: n.q, of: qs.length, round: r, text: n.text, opts: n.opts, left: Math.max(0, S.started[k] - Date.now()), total: S.cfg.timer * 1000, score: roundScore(t, r) };
}

const teamAuth = (req, res, next) => {
  if (!S.cfg) return res.status(400).json({ error: 'The quiz has not been set up yet.' });
  const t = +req.body.team, tm = S.cfg.teams[t];
  if (!tm || String(tm.pin) !== String(req.body.pin).trim()) return res.status(401).json({ error: 'Wrong team code.' });
  req.t = t; next();
};
const hostAuth = (req, res, next) => tokens.has(req.get('x-token')) ? next() : res.status(401).json({ error: 'Host login required.' });

function board() {
  if (!S.cfg) return [];
  return S.cfg.teams.map((tm, t) => {
    const rounds = {}; let total = 0;
    Object.values(S.results).filter(x => x.team === t).forEach(x => { rounds[x.round] = (rounds[x.round] || 0) + x.points; total += x.points; });
    return { team: tm.name, rounds, total };
  }).sort((a, b) => b.total - a.total);
}

/* ---------- public API ---------- */
app.get('/api/info', (req, res) => res.json(S.cfg
  ? { ready: true, teams: S.cfg.teams.map(t => t.name), active: S.active, rounds: S.cfg.rounds, timer: S.cfg.timer, pts: S.cfg.pts, neg: S.cfg.neg }
  : { ready: false }));
app.get('/api/board', (req, res) => res.json({ rounds: S.cfg ? S.cfg.rounds : 0, rows: board() }));
app.post('/api/play', teamAuth, (req, res) => res.json(nextFor(req.t, !!req.body.begin)));
app.post('/api/answer', teamAuth, (req, res) => {
  const r = S.active, qn = +req.body.q;
  const k = rid(r, req.t, qn), dl = S.started[k];
  if (!dl) return res.status(400).json({ error: 'Question not started.' });
  let choice = +req.body.choice;
  if (!(choice >= 0 && choice <= 3) || Date.now() > dl + GRACE) choice = -1;
  const row = record(req.t, r, qn, choice);
  res.json({ points: row.points, choice: row.choice });
});

/* ---------- host API ---------- */
app.post('/api/host/login', (req, res) => {
  if (req.body.password !== HOST_PW) return res.status(401).json({ error: 'Wrong password.' });
  const t = crypto.randomBytes(16).toString('hex'); tokens.add(t); res.json({ token: t });
});
app.get('/api/host/state', hostAuth, (req, res) => res.json({ cfg: S.cfg, active: S.active, board: board(), count: Object.keys(S.results).length }));
app.post('/api/host/config', hostAuth, (req, res) => {
  const c = req.body.cfg;
  if (!c || !Array.isArray(c.teams) || !Array.isArray(c.questions)) return res.status(400).json({ error: 'Bad config.' });
  c.teams = c.teams.map((n, i) => ({ name: String(n), pin: (S.cfg && S.cfg.teams[i] && S.cfg.teams[i].pin) || String(1000 + crypto.randomInt(9000)) }));
  S.cfg = c; save(); pushConfig(); res.json({ ok: true });
});
app.post('/api/host/active', hostAuth, (req, res) => { S.active = +req.body.round || 0; save(); pushConfig(); res.json({ ok: true }); });
app.post('/api/host/reset', hostAuth, (req, res) => { S.results = {}; S.started = {}; save(); push({ action: 'reset' }); res.json({ ok: true }); });
app.get('/api/host/csv', hostAuth, (req, res) => {
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  let c = 'Team,Round,Question,Selected,Correct,Points\n';
  Object.values(S.results).sort((a, b) => a.team - b.team || a.round - b.round || a.q - b.q).forEach(r => {
    const x = ql(r.round, r.team).find(z => z.q === r.q);
    c += [q(S.cfg.teams[r.team].name), r.round, r.q, r.choice >= 0 ? 'ABCD'[r.choice] : 'No answer', x ? 'ABCD'[x.c] : '', r.points].join(',') + '\n';
  });
  c += '\nTeam,' + Array.from({ length: S.cfg.rounds }, (_, i) => 'Round ' + (i + 1)).join(',') + ',Total\n';
  board().forEach(b => { c += [q(b.team), ...Array.from({ length: S.cfg.rounds }, (_, i) => b.rounds[i + 1] || 0), b.total].join(',') + '\n'; });
  res.type('text/csv').send('\ufeff' + c);
});

boot().then(() => app.listen(process.env.PORT || 3000, () => console.log('MESA Technical Quiz 2026 running')));
