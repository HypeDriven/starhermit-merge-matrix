/**
 * Merge Matrix — end-to-end playthrough test (dev only, not shipped).
 *
 * Drives the real visible UI in headless Chrome (playwright-core + system Chrome):
 *   title → help → journey → stage 1 → countdown → play (arrow keys + swipe) →
 *   win at the 128 milestone → results → next stage → pause/resume → settings
 *   → hint/undo → leave → title.
 *
 * The game is fully playable offline (practice/journey/learn are local-first);
 * the StarHermit /api endpoints (daily submission, leaderboard) are absent here
 * and the game degrades gracefully — no backend required for this playthrough.
 * server.js is the StarHermit authoritative game script, so this test embeds its
 * own minimal static file server on an ephemeral port.
 *
 * Two passes: desktop 1280×800 and mobile 390×844 (hasTouch). Both must pass.
 * Run: npm run test:e2e
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = (stage, vp) => `/tmp/merge-matrix-e2e-${stage}-${vp}.png`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.ts': 'text/plain', '.webp': 'image/webp',
};

const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions/i;

function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/api/v1/time') {
        // minimal platform-time stub (matches server.js) so offline boot stays clean
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ now: Date.now() }));
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end('{"error":"offline"}');
        return;
      }
      let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (!p) p = 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) throw new Error('bad path');
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ---- 2048-style preview helpers mirroring src/rules.ts, used to pick moves
   from the board the player sees (the #dom-board DOM mirror). ---- */
function slideLine(line) {
  const nz = line.filter((v) => v !== 0);
  const res = [];
  let gained = 0;
  for (let i = 0; i < nz.length; i++) {
    if (i + 1 < nz.length && nz[i] === nz[i + 1]) { res.push(nz[i] * 2); gained += nz[i] * 2; i++; }
    else res.push(nz[i]);
  }
  while (res.length < line.length) res.push(0);
  const changed = line.some((v, i) => res[i] !== v);
  return { res, gained, changed };
}

function peek(board, dir) {
  const n = board.length;
  const out = board.map((r) => r.slice());
  let gained = 0, changed = false;
  const lineAt = (i) => {
    if (dir === 'left') return board[i].slice();
    if (dir === 'right') return board[i].slice().reverse();
    const col = [];
    for (let r = 0; r < n; r++) col.push(board[r][i]);
    return dir === 'up' ? col : col.reverse();
  };
  for (let i = 0; i < n; i++) {
    const { res, gained: g, changed: c } = slideLine(lineAt(i));
    gained += g; changed = changed || c;
    const seq = (dir === 'right' || dir === 'down') ? res.slice().reverse() : res;
    for (let k = 0; k < n; k++) {
      if (dir === 'left' || dir === 'right') out[i][k] = seq[k];
      else out[k][i] = seq[k];
    }
  }
  return { board: out, gained, changed };
}

function pickMove(board) {
  const n = board.length;
  let best = null, bestScore = -1;
  for (const dir of ['up', 'down', 'left', 'right']) {
    const p = peek(board, dir);
    if (!p.changed) continue;
    let empties = 0, max = 0, maxR = 0, maxC = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = p.board[i][j];
      if (!v) empties++;
      if (v > max) { max = v; maxR = i; maxC = j; }
    }
    let s = p.gained * 10 + empties * 5;
    if (maxR === n - 1 && maxC === 0) s += max * 2; // keep the big block in the bottom-left
    if (s > bestScore) { bestScore = s; best = dir; }
  }
  return best;
}

const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

async function readBoard(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('#dom-board .cell')];
    const size = Math.sqrt(cells.length);
    const board = Array.from({ length: size }, () => Array(size).fill(0));
    for (const c of cells) board[+c.dataset.r][+c.dataset.c] = +c.dataset.v;
    return board;
  });
}

async function swipe(page, dir) {
  // real pointer drag across the board (pointerdown/up handler in main.ts)
  const box = await page.locator('#board-wrap').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const d = 90;
  const dx = dir === 'left' ? -d : dir === 'right' ? d : 0;
  const dy = dir === 'up' ? -d : dir === 'down' ? d : 0;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

const allErrors = [];

async function runPass(browser, vpName, viewport, hasTouch) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !browserNoise.test(m.text())) errors.push(`console: ${m.text()}`);
  });

  const step = async (name, fn) => {
    await fn();
    console.log(`ok - [${vpName}] ${name}`);
  };

  try {
    await step('load + title visible', async () => {
      await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'load' });
      await page.waitForSelector('#screen-title:not([hidden])', { timeout: 10000 });
      await page.waitForSelector('#btn-play:visible');
      await page.screenshot({ path: SHOT('title', vpName) });
    });

    await step('help screen opens and closes', async () => {
      await page.click('#btn-help');
      await page.waitForSelector('#screen-help:not([hidden])');
      const cards = await page.locator('#help-cards .card').count();
      if (cards < 5) throw new Error(`expected help cards, got ${cards}`);
      await page.click('#btn-help-back');
      await page.waitForSelector('#screen-title:not([hidden])');
    });

    await step('journey grid shows 40 stages', async () => {
      await page.click('#btn-journey');
      await page.waitForSelector('#screen-journey:not([hidden])');
      const cells = await page.locator('#journey-grid .jcell').count();
      if (cells !== 40) throw new Error(`expected 40 stages, got ${cells}`);
      await page.screenshot({ path: SHOT('journey', vpName) });
    });

    await step('start journey stage 1 → play screen', async () => {
      await page.locator('#journey-grid .jcell').first().click();
      await page.waitForSelector('#screen-play:not([hidden])');
      await page.waitForSelector('#countdown:not([hidden])');
      await page.waitForSelector('#countdown', { state: 'hidden', timeout: 8000 }); // 3-2-1 over
      const obj = await page.textContent('#objective-text');
      if (!/128/.test(obj)) throw new Error(`unexpected objective: ${obj}`);
      const cells = await page.locator('#dom-board .cell').count();
      if (cells !== 16) throw new Error(`expected 16 board cells, got ${cells}`);
      await page.screenshot({ path: SHOT('play', vpName) });
    });

    await step('pause → resume via overlay', async () => {
      await page.click('#btn-pause');
      await page.waitForSelector('#overlay-pause:not([hidden])');
      await page.screenshot({ path: SHOT('pause', vpName) });
      await page.click('#btn-resume-play');
      await page.waitForSelector('#overlay-pause', { state: 'hidden' });
    });

    await step('settings open/close (mute toggle)', async () => {
      await page.click('#btn-settings-top');
      await page.waitForSelector('#overlay-pause:not([hidden])');
      await page.click('#overlay-pause .settings-block summary'); // expand Audio section
      await page.check('#set-muted');
      const muted = await page.evaluate(() => JSON.parse(localStorage.getItem('mm-settings-v1')).muted);
      if (muted !== true) throw new Error('mute setting not persisted');
      await page.uncheck('#set-muted');
      await page.screenshot({ path: SHOT('settings', vpName) });
      await page.click('#btn-resume-play');
      await page.waitForSelector('#overlay-pause', { state: 'hidden' });
    });

    await step('hint button produces advice', async () => {
      await page.click('#btn-hint');
      await page.waitForSelector('#hint-box:not([hidden])');
      const hint = await page.textContent('#hint-box');
      if (!/Try (up|down|left|right)/.test(hint)) throw new Error(`bad hint: ${hint}`);
      console.log(`  hint: ${hint}`);
    });

    await step('swipe gesture moves the board', async () => {
      const before = JSON.stringify(await readBoard(page));
      // swipe toward a legal direction; fall back through all four if blocked
      const board = await readBoard(page);
      const dir = ['down', 'left', 'right', 'up'].find((d) => peek(board, d).changed);
      await swipe(page, dir);
      await page.waitForTimeout(250);
      const after = JSON.stringify(await readBoard(page));
      if (before === after) throw new Error('swipe did not change the board');
    });

    await step('undo reverts the swipe', async () => {
      const before = await page.textContent('#hud-moves');
      await page.click('#btn-undo');
      await page.waitForTimeout(150);
      const after = await page.textContent('#hud-moves');
      if (+after !== +before - 1) throw new Error(`undo did not revert moves (${before} -> ${after})`);
    });

    await step('play stage 1 to the 128 milestone via arrow keys', async () => {
      // ~479 moves at the 120 ms input debounce; software-WebGL CI can need > 250 ms per move
      const deadline = Date.now() + 300000;
      let moves = 0;
      for (;;) {
        if (await page.locator('#screen-results:not([hidden])').count()) break;
        if (Date.now() > deadline) throw new Error('timed out waiting for results');
        if (moves > 600) throw new Error('exceeded 600 moves without a result');
        const board = await readBoard(page);
        const dir = pickMove(board);
        if (!dir) break; // no legal move — board full, run will end
        await page.keyboard.press(ARROW[dir]);
        moves++;
        if (moves === 40) await page.screenshot({ path: SHOT('midgame', vpName) });
        await page.waitForTimeout(140); // input debounce is 120ms per action id
      }
      console.log(`  moves played: ${moves}`);
      await page.waitForSelector('#screen-results:not([hidden])', { timeout: 5000 });
    });

    await step('results screen shows milestone win', async () => {
      const headline = await page.textContent('#results-headline');
      console.log(`  headline: ${headline}`);
      if (!/Milestone reached — 128!/.test(headline)) {
        throw new Error(`expected a 128 milestone win, got: ${headline}`);
      }
      const total = await page.textContent('#res-total');
      if (+total <= 0) throw new Error('total score is zero');
      const detail = await page.textContent('#res-detail');
      if (!/seed 1000/.test(detail)) throw new Error(`unexpected seed in detail: ${detail}`);
      await page.screenshot({ path: SHOT('results', vpName) });
      // a run must resolve exactly once: the rAF loop and doMove's delayed call
      // both reach finishRun, and a second pass would double-count the run and
      // hijack whatever session the player starts in the next ~450ms
      const played = await page.evaluate(() => JSON.parse(localStorage.getItem('mm-progress-v1')).gamesPlayed);
      if (played !== 1) throw new Error(`finishRun ran more than once (gamesPlayed=${played})`);
    });

    await step('next stage button starts stage 2', async () => {
      await page.waitForSelector('#btn-next:not([hidden])');
      await page.click('#btn-next');
      await page.waitForSelector('#screen-play:not([hidden])');
      const obj = await page.textContent('#objective-text');
      if (!/Reach a 128 block/.test(obj)) throw new Error(`unexpected stage 2 objective: ${obj}`);
      const snapId = await page.evaluate(() => JSON.parse(localStorage.getItem('mm-snapshot-v1'))?.contentId);
      if (snapId !== 'j02') throw new Error(`expected stage 2 session j02, got ${snapId}`);
      // clicking through fast must not be hijacked by the finished run's delayed callback
      await page.waitForTimeout(700);
      if (await page.locator('#screen-results:not([hidden])').count()) {
        throw new Error('the previous run\'s finish callback hijacked stage 2');
      }
      // a few real moves on stage 2, then pause and leave
      for (let i = 0; i < 3; i++) {
        const board = await readBoard(page);
        const dir = pickMove(board);
        if (!dir) break;
        await page.keyboard.press(ARROW[dir]);
        await page.waitForTimeout(140);
      }
      await page.screenshot({ path: SHOT('stage2', vpName) });
      await page.evaluate(async () => {
        const { getActive } = await import('/dist/session.js');
        const st = getActive().state;
        st.board = Array.from({ length: st.size }, () => Array(st.size).fill(0));
        st.board[0][0] = st.goalTile / 2;
        st.board[0][1] = st.goalTile / 2;
        st.moveLimit = st.moves + 1; // the final move both reaches the goal and exhausts the limit
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        if (!getActive().state.over) throw new Error('winning fixture did not finish');
        document.getElementById('btn-leave').click();
      });
      await page.waitForSelector('#screen-title:not([hidden])');
      await page.waitForTimeout(650);
      if (await page.locator('#screen-title').isHidden()) throw new Error('delayed results reopened after leaving');
      const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('mm-progress-v1')));
      if (!progress.journeyCompleted.includes(0)) throw new Error('stage 1 completion not persisted');
      await page.screenshot({ path: SHOT('back-to-title', vpName) });
    });
  } finally {
    if (errors.length) {
      allErrors.push(`--- ${vpName} pass ---`, ...errors);
    }
    await context.close();
  }
}

const server = await serve();
const PORT = server.address().port;
console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`);

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});

let failed = null;
try {
  await runPass(browser, 'desktop', { width: 1280, height: 800 }, false);
  if (allErrors.length) throw new Error('page errors in desktop pass');
  await runPass(browser, 'mobile', { width: 390, height: 844 }, true);
} catch (e) {
  failed = e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

if (allErrors.length) {
  console.error('\nPAGE ERRORS:\n' + allErrors.join('\n'));
}
if (failed) {
  console.error('\nE2E FAIL: ' + (failed.stack || failed));
}
if (allErrors.length || failed) process.exit(1);
console.log('\nE2E PASS — Merge Matrix playable end-to-end on desktop and mobile, no page errors');
