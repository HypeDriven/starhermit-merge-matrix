// Plays the web package in Chrome on the machine's GPU (~/games/tools/
// gpu-chrome.mjs; GPU_ADAPTER=software for headless SwiftShader), the loader
// index.html that `npm run package` writes, at a desktop viewport, a phone
// (DPR 3) and a phone held sideways (DPR 3). Desktop: the first Learn lesson
// from the title to its results by the arrow keys, then a Practice run with a
// mouse drag on the 3D board (a slide), the pause sheet and Leave. Phones: the
// 60-move Challenge by taps and finger swipes on the board (CDP touch events)
// to Out of moves, Retry, the pause sheet with the 3D board switched off and
// on, Leave run. Screenshots of each step go to --shots. Fails on console
// errors or warnings, the runtime's error screen, or a run that does not finish.
//   node tools/browser-play.mjs [GAME_DIR] [--shots OUT_DIR]
// Serves GAME_DIR on loopback (never tests/, tools/ or dot-names), the engine
// itself from wiki.starhermit.com as the loader pins it.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const dir = resolve(args[0] && !args[0].startsWith('--') ? args[0] : '.');
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const shots = opt('--shots', null);

function findPlaywright() {
  const roots = [dir, resolve(dir, '..'), ...readdirSync(resolve(dir, '..')).map((d) => resolve(dir, '..', d))];
  for (const r of roots) {
    for (const name of ['playwright-core', 'playwright']) {
      const p = join(r, 'node_modules', name);
      if (existsSync(p)) return createRequire(join(r, 'package.json'))(name);
    }
  }
  throw new Error('playwright-core not found');
}
const { chromium } = findPlaywright();

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/plain',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  // The platform's clock (platform.serverTime / serverNow), as the game host answers it.
  if (path === 'api/v1/time') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ serverTime: Date.now(), serverTimeIso: new Date().toISOString() })); return; }
  const parts = path.split('/');
  if (parts.some((p) => p.startsWith('.') || p === '..') || ['tests', 'tools', 'node_modules'].includes(parts[0])) { res.writeHead(404).end(); return; }
  const file = join(dir, path);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const CYCLE = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'];
const DIRS = { left: [-0.3, 0], right: [0.3, 0], up: [0, -0.25], down: [0, 0.25] };
const desktop = [
  ['shot', 'title'], ['role', 'Learn'], ['wait', 1200], ['role', '1. Slide the matrix'], ['wait', 2500], ['shot', 'lesson'],
  ['cycle', 'Lesson complete'], ['wait', 1500], ['shot', 'results'], ['expect', 'Achievement unlocked: First Light'],
  ['role', 'Menu'], ['wait', 1000], ['role', 'Play'], ['wait', 1000], ['role', 'Practice'], ['wait', 800], ['role', 'Start'], ['wait', 2500],
  ['key', 'ArrowLeft'], ['wait', 300], ['key', 'ArrowUp'], ['wait', 300], ['drag', 'right'], ['wait', 800], ['drag', 'down'], ['wait', 800],
  ['shot', 'play'], ['key', 'KeyH'], ['wait', 500], ['key', 'Escape'], ['wait', 800], ['shot', 'paused'], ['expect', 'Paused'],
  ['role', 'Leave run'], ['wait', 1000], ['expect', 'A run is in progress.'],
];
const touch = [
  ['shot', 'title'], ['role', 'Play'], ['wait', 1200], ['role', 'Challenge'], ['wait', 800], ['shot', 'modes'], ['role', 'Start'], ['wait', 3000],
  ['swipes', 'Out of moves'], ['wait', 1500], ['shot', 'results'], ['role', 'Retry'], ['wait', 2500], ['swipe', 'left'], ['wait', 800],
  ['shot', 'play'], ['expect', 'Moves left: 59.'], ['role', 'Pause'], ['wait', 1000], ['shot', 'paused'], ['role', '3D board (WebGL)'], ['wait', 300],
  ['role', 'Resume'], ['wait', 800], ['swipe', 'down'], ['wait', 800], ['shot', 'flat'], ['expect', 'Moves left: 58.'], ['role', 'Pause'], ['wait', 800],
  ['role', '3D board (WebGL)'], ['wait', 300], ['role', 'Leave run'], ['wait', 1000], ['expect', 'A run is in progress.'],
];
const views = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, steps: desktop },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, steps: touch },
  { name: 'landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, steps: touch },
];

const { launchChrome } = await import('/home/albert/games/tools/gpu-chrome.mjs');
const { browser, gpu, close } = await launchChrome(chromium);
console.log(`# chrome on ${gpu}`);
let failed = false;
for (const v of views) {
  const ctx = await browser.newContext({ viewport: v.viewport, isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: v.deviceScaleFactor });
  const page = await ctx.newPage();
  const cdp = v.hasTouch ? await ctx.newCDPSession(page) : null;
  const problems = [];
  const environment = /^No available adapters\.$|GL Driver Message/;
  page.on('console', (m) => {
    const platformRoute = /\/api\//.test(m.location()?.url ?? '');
    if ((m.type() === 'error' || m.type() === 'warning') && !environment.test(m.text()) && !platformRoute) problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !/\/api\//.test(r.url())) problems.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  const started = await page.waitForFunction(() => ['running', 'error'].includes(document.documentElement.dataset.starhermit), null, { timeout: 90000 }).then(() => true, () => false);
  await page.waitForTimeout(4000); // the first press can be lost while the runtime starts up
  const press = async (loc) => (v.hasTouch ? loc.tap({ timeout: 10000 }) : loc.click({ timeout: 10000 }));
  const seen = async (text) => (await page.getByText(text).count().catch(() => 0)) > 0 || (await page.getByLabel(text).count().catch(() => 0)) > 0;
  const board = async () => page.getByLabel('Merge Matrix board').first().boundingBox({ timeout: 5000 }).catch(() => null);
  async function swipe(dir) {
    const box = await board();
    if (!box) { problems.push('board not found'); return; }
    const [dx, dy] = DIRS[dir];
    const x0 = box.x + box.width / 2 - dx * box.width / 2, y0 = box.y + box.height / 2 - dy * box.height / 2;
    const pts = Array.from({ length: 7 }, (_, i) => ({ x: x0 + dx * box.width * i / 6, y: y0 + dy * box.height * i / 6 }));
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
      for (const p of pts.slice(1)) { await page.waitForTimeout(16); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] }); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
      for (const p of pts.slice(1)) { await page.waitForTimeout(16); await page.mouse.move(p.x, p.y); }
      await page.mouse.up();
    }
  }
  for (const [op, a] of v.steps) {
    try {
      if (op === 'key') { await page.keyboard.down(a); await page.waitForTimeout(80); await page.keyboard.up(a); await page.waitForTimeout(80); }
      if (op === 'wait') await page.waitForTimeout(a);
      if (op === 'role') await press(page.getByRole(a.startsWith('3D') ? 'checkbox' : 'button', { name: a, exact: true }).first());
      if (op === 'drag' || op === 'swipe') await swipe(a);
      if (op === 'cycle' || op === 'swipes') {
        let ok = false;
        for (let i = 0; i < 240 && !ok; i++) {
          if (op === 'cycle') { await page.keyboard.down(CYCLE[i % 4]); await page.waitForTimeout(60); await page.keyboard.up(CYCLE[i % 4]); await page.waitForTimeout(140); }
          else { await swipe(['left', 'down', 'right', 'up'][i % 4]); await page.waitForTimeout(250); }
          if (i % 4 === 3) ok = await seen(a);
        }
        if (!ok) problems.push(`never reached "${a}"`);
      }
      if (op === 'expect' && !(await seen(a))) problems.push(`expected "${a}" on screen`);
      if (op === 'shot' && shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${v.name}-${a}.png`) }); }
    } catch (e) { problems.push(`${op} ${typeof a === 'string' ? a : JSON.stringify(a)}: ${e.message.split('\n')[0]}`); }
  }
  const state = await page.evaluate(() => document.documentElement.dataset.starhermit ?? '');
  const ok = started && state === 'running' && problems.length === 0;
  failed ||= !ok;
  console.log(`${ok ? 'ok' : 'not ok'} - ${v.name} played: started=${started} state=${state || '-'}`);
  for (const p of problems) console.log(`  ${p}`);
  await ctx.close();
}
await close();
server.close();
process.exit(failed ? 1 : 0);
