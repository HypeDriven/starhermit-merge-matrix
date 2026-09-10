/**
 * Merge Matrix — authoritative server (StarHermit Game Script).
 * Standalone Node HTTP server: serves the static distribution and provides:
 *   GET  /api/v1/time            platform time for countdown/daily sync
 *   GET  /api/v1/daily?day=      daily content descriptor (immutable seed per UTC day)
 *   POST /api/v1/daily/submit    replay-validated daily score submission
 *   GET  /api/v1/leaderboard     global board (friends filter placeholder requires host identity)
 *   GET  /api/v1/achievements    static achievement metadata
 * No secrets, no external dependencies. Data persists under ./.data/.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA = path.join(ROOT, '.data');
const PORT = Number(process.env.PORT || 8080);
const RULES_VERSION = 1;

/* ---------- deterministic rules copy (kept in sync with src/rules.ts) ---------- */

function mulberry(seed) {
  let state = seed >>> 0;
  return {
    next() {
      let t = (state += 0x6d2b79f5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return Math.floor(this.next() * n); },
    get state() { return state; },
  };
}

function slideLine(line) {
  const nz = line.filter((v) => v !== 0);
  const res = [];
  let gained = 0;
  for (let i = 0; i < nz.length; i++) {
    if (i + 1 < nz.length && nz[i] === nz[i + 1]) { res.push(nz[i] * 2); gained += nz[i] * 2; i++; }
    else res.push(nz[i]);
  }
  while (res.length < line.length) res.push(0);
  let changed = false;
  for (let i = 0; i < line.length; i++) if (res[i] !== line[i]) { changed = true; break; }
  return [res, gained, changed];
}

function peekMove(board, dir) {
  const size = board.length;
  const b = board.map((r) => r.slice());
  let gained = 0, changed = false;
  const horiz = dir === 'left' || dir === 'right';
  const fwd = dir === 'left' || dir === 'up';
  for (let k = 0; k < size; k++) {
    const line = [];
    for (let i = 0; i < size; i++) line.push(horiz ? b[k][i] : b[i][k]);
    const src = fwd ? line : line.reverse();
    const [res, g, ch] = slideLine(src);
    const out = fwd ? res : res.reverse();
    for (let i = 0; i < size; i++) { if (horiz) b[k][i] = out[i]; else b[i][k] = out[i]; }
    gained += g; if (ch) changed = true;
  }
  return { board: b, gained, changed };
}

function dailySeed(dateUtc) {
  let h = 0x811c9dc5;
  const s = 'merge-matrix-daily:' + dateUtc;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function stateHash(st) {
  let h = 0x811c9dc5;
  const mix = (n) => {
    h ^= n & 0xffff; h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (n >>> 16) & 0xffff; h = Math.imul(h, 0x01000193) >>> 0;
  };
  mix(st.size); mix(st.moves); mix(st.rngState);
  mix(st.score.mergePoints + st.score.milestoneBonus + st.score.efficiencyBonus);
  mix(st.maxTile); mix(st.over ? 1 : 0);
  for (const row of st.board) for (const v of row) mix(v);
  return h.toString(16).padStart(8, '0');
}

function createGame(opts) {
  const size = Math.max(2, Math.min(8, opts.size ?? 4));
  const st = {
    size, seed: opts.seed >>> 0, goalTile: opts.goalTile ?? 2048,
    moveLimit: opts.moveLimit ?? 0, timeLimitMs: opts.timeLimitMs ?? 0,
    board: Array.from({ length: size }, () => new Array(size).fill(0)),
    moves: 0, score: { mergePoints: 0, milestoneBonus: 0, efficiencyBonus: 0 },
    won: false, over: false, terminalReason: null, maxTile: 0, rngState: 0,
  };
  const r = mulberry(st.seed);
  spawn(st, r); spawn(st, r);
  st.rngState = r.state;
  let max = 0;
  for (const row of st.board) for (const v of row) if (v > max) max = v;
  st.maxTile = max;
  return st;
}

function spawn(st, r) {
  const empty = [];
  for (let i = 0; i < st.size; i++) for (let j = 0; j < st.size; j++) if (st.board[i][j] === 0) empty.push([i, j]);
  if (!empty.length) return;
  const [ri, ci] = empty[r.int(empty.length)];
  st.board[ri][ci] = r.next() < 0.9 ? 2 : 4;
}

function hasMove(board) {
  return ['up', 'down', 'left', 'right'].some((d) => peekMove(board, d).changed);
}

function applyMove(st, dir) {
  if (st.over) return false;
  if (!['up', 'down', 'left', 'right'].includes(dir)) return false;
  const p = peekMove(st.board, dir);
  if (!p.changed) return false; // invalid actions do not advance the rng stream
  const r2 = mulberry(st.rngState);
  st.board = p.board;
  st.score.mergePoints += p.gained;
  spawn(st, r2);
  st.rngState = r2.state;
  st.moves++;
  let max = 0;
  for (const row of st.board) for (const v of row) if (v > max) max = v;
  st.maxTile = max;
  if (!st.won && max >= st.goalTile) {
    st.won = true;
    st.score.milestoneBonus += st.goalTile * 10;
    if (st.moveLimit > 0) st.score.efficiencyBonus += Math.max(0, st.moveLimit - st.moves) * 25;
  }
  if (st.moveLimit > 0 && st.moves >= st.moveLimit) { st.over = true; st.terminalReason = st.won ? 'goal-reached' : 'move-limit-exhausted'; }
  else if (!hasMove(st.board)) { st.over = true; st.terminalReason = st.won ? 'goal-reached' : 'board-full'; }
  return true;
}

function verifyReplay(env) {
  if (!env || env.schema !== 1 || env.rulesVersion !== RULES_VERSION) return null;
  if (!Number.isFinite(env.seed) || !env.terminal) return null;
  if (!Array.isArray(env.commands) || !Array.isArray(env.hashes)) return null;
  if (env.commands.length !== env.hashes.length || env.commands.length > 100000) return null;
  if (env.options != null && typeof env.options !== 'object') return null;
  const st = createGame({ ...env.options, seed: env.seed });
  if (stateHash(st) !== env.initialHash) return null;
  for (let i = 0; i < env.commands.length; i++) {
    applyMove(st, env.commands[i]);
    if (stateHash(st) !== env.hashes[i]) return null;
  }
  if (st.terminalReason !== env.terminal.reason) return null;
  const total = st.score.mergePoints + st.score.milestoneBonus + st.score.efficiencyBonus;
  if (total !== env.terminal.score) return null;
  return st;
}

/* ---------- persistence ---------- */

function ensureData() { fs.mkdirSync(DATA, { recursive: true }); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch { return fallback; }
}
function writeJson(file, v) { fs.writeFileSync(path.join(DATA, file), JSON.stringify(v, null, 1)); }

const ACHIEVEMENTS = [
  { key: 'first-clear', name: 'First Light', desc: 'Complete your first stage or reach your first goal tile.' },
  { key: 'mechanic-mastery', name: 'Matrix Adept', desc: 'Complete a mastery stage in Journey.' },
  { key: 'streak-7', name: 'Seven-Day Circuit', desc: 'Play the daily challenge on 7 different days.' },
  { key: 'tile-4096', name: 'Deep Signal', desc: 'Create a 4096 tile in any mode.' },
  { key: 'journey-half', name: 'Long Haul', desc: 'Complete 20 Journey stages.' },
];

/* ---------- http ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm',
  '.opus': 'audio/ogg', '.webp': 'image/webp', '.glb': 'model/gltf-binary',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body);
}

function rateLimited(ip) {
  const now = Date.now();
  const bucket = readJson('ratelimit.json', {});
  const rec = bucket[ip] ?? { count: 0, reset: now + 60000 };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + 60000; }
  rec.count++;
  bucket[ip] = rec;
  if (Object.keys(bucket).length > 10000) { for (const k of Object.keys(bucket)) if (bucket[k].reset < now) delete bucket[k]; }
  writeJson('ratelimit.json', bucket);
  return rec.count > 240; // 240 requests/min per ip
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { reject(new Error('payload-too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validDay(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day); }

const server = http.createServer((req, res) => {
  // a rejected handler would otherwise leave the request hanging with no response
  handle(req, res).catch((err) => {
    console.error('request failed:', err && err.message);
    if (!res.headersSent) sendJson(res, 500, { error: 'server-error' });
    else res.end();
  });
});

async function handle(req, res) {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return sendJson(res, 400, { error: 'bad-request' }); }
  const ip = req.socket.remoteAddress ?? 'local';

  if (url.pathname.startsWith('/api/')) {
    if (rateLimited(ip)) return sendJson(res, 429, { error: 'rate-limited' });

    if (url.pathname === '/api/v1/time' && req.method === 'GET') {
      return sendJson(res, 200, { now: Date.now() });
    }
    if (url.pathname === '/api/v1/daily' && req.method === 'GET') {
      const day = url.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      if (!validDay(day)) return sendJson(res, 400, { error: 'bad-day' });
      return sendJson(res, 200, {
        day, contentVersion: 1, rulesVersion: RULES_VERSION,
        seed: dailySeed(day), size: 4, goalTile: 2048, allowUndo: false,
      });
    }
    if (url.pathname === '/api/v1/daily/submit' && req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'bad-payload' }); }
      const { day, replay, score, contentVersion } = body ?? {};
      if (!validDay(day) || !replay) return sendJson(res, 400, { error: 'bad-payload' });
      if (contentVersion !== 1) return sendJson(res, 409, { error: 'stale-version' });
      // identity: anonymous session id, never a credential
      const sid = crypto.createHash('sha256').update(String(body.sessionId ?? ip)).digest('hex').slice(0, 12);
      // duplicate commands rejected idempotently by command id
      const subs = readJson('submissions.json', {});
      const subKey = `${day}:${sid}`;
      if (body.commandId && subs[subKey]?.commandId === body.commandId) {
        return sendJson(res, 200, { ok: true, duplicate: true, rank: subs[subKey].rank });
      }
      const expectedSeed = dailySeed(day);
      if (replay.seed !== expectedSeed) return sendJson(res, 422, { error: 'seed-mismatch' });
      // the daily board is fixed: reject replays that redefine the rules (e.g. an
      // inflated goalTile would mint an arbitrarily large milestone bonus)
      const o = replay.options ?? {};
      if ((o.size ?? 4) !== 4 || (o.goalTile ?? 2048) !== 2048 ||
          (o.moveLimit ?? 0) !== 0 || (o.timeLimitMs ?? 0) !== 0) {
        return sendJson(res, 422, { error: 'options-mismatch' });
      }
      const finalState = verifyReplay(replay);
      if (!finalState) return sendJson(res, 422, { error: 'replay-invalid' });
      const total = finalState.score.mergePoints + finalState.score.milestoneBonus + finalState.score.efficiencyBonus;
      if (total !== score) return sendJson(res, 422, { error: 'score-mismatch' });
      if (total > 500000) return sendJson(res, 422, { error: 'implausible-score' });

      const board = readJson('leaderboard.json', {});
      board[day] = board[day] ?? [];
      const entry = {
        sid, name: body.name && typeof body.name === 'string' ? body.name.slice(0, 24) : `guest-${sid.slice(0, 6)}`,
        score: total, moves: finalState.moves, invalidActions: Number(body.invalidActions ?? 0),
        elapsedMs: Number(body.elapsedMs ?? 0), seed: expectedSeed, rulesVersion: RULES_VERSION,
        contentVersion: 1, assists: { undo: false }, at: Date.now(),
        checksum: crypto.createHash('sha256').update(JSON.stringify(replay.commands)).digest('hex').slice(0, 16),
      };
      // one entry per identity per day: keep the better run
      const existing = board[day].findIndex((e) => e.sid === sid);
      if (existing >= 0 && board[day][existing].score >= total) {
        const rank = board[day].filter((e) => e.score > board[day][existing].score).length + 1;
        return sendJson(res, 200, { ok: true, rank, improved: false });
      }
      if (existing >= 0) board[day].splice(existing, 1);
      board[day].push(entry);
      // ties: fewer invalid actions, lower elapsed, then stable id
      board[day].sort((a, b) => b.score - a.score || a.invalidActions - b.invalidActions || a.elapsedMs - b.elapsedMs || (a.sid < b.sid ? -1 : 1));
      board[day] = board[day].slice(0, 200);
      writeJson('leaderboard.json', board);
      const rank = board[day].findIndex((e) => e.sid === sid) + 1;
      subs[subKey] = { commandId: body.commandId ?? null, rank };
      writeJson('submissions.json', subs);
      return sendJson(res, 200, { ok: true, rank, validated: true });
    }
    if (url.pathname === '/api/v1/leaderboard' && req.method === 'GET') {
      const day = url.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const board = readJson('leaderboard.json', {});
      const entries = (board[day] ?? []).map((e) => ({ name: e.name, score: e.score, moves: e.moves }));
      return sendJson(res, 200, { day, entries, casual: false });
    }
    if (url.pathname === '/api/v1/achievements' && req.method === 'GET') {
      return sendJson(res, 200, { achievements: ACHIEVEMENTS });
    }
    return sendJson(res, 404, { error: 'not-found' });
  }

  /* static files */
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return sendJson(res, 400, { error: 'bad-path' }); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  // stay inside ROOT, and never expose dot-directories (.git, .data) or node_modules
  const rel = path.relative(ROOT, file);
  const segments = rel.split(path.sep);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel) ||
      segments.some((s) => s.startsWith('.') || s === 'node_modules' || s === 'tests' || s === 'tools')) {
    return sendJson(res, 403, { error: 'forbidden' });
  }
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'not-found' });
    const ext = path.extname(file);
    const immutable = ext === '.js' && file.includes(`${path.sep}dist${path.sep}`);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  });
}

ensureData();
server.listen(PORT, () => {
  console.log(`Merge Matrix server listening on http://localhost:${PORT}`);
});
