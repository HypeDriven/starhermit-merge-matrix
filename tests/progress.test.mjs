// The save and its migration (src/progress.ts) and the modes' helpers
// (src/modes.ts): merging two devices' progress, the browser build's cloud
// document (the JS SDK's game:<slug> slot) and settings-KV options, the run
// snapshot, achievements, the hint and the move diff. The signed-in paths
// (foreign save, legacy settings, score posting) cannot be driven headlessly,
// so their data handling is covered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/progress.ts';
import * as M from '../src/modes.ts';
import * as R from '../src/rules.ts';

const prog = (o = {}) => ({ ...P.defaultProgress(), ...o });

test('two devices merge: union of stages and days, best scores max, earliest unlock, tutorial either', () => {
  const a = prog({ journeyCompleted: [0, 2], bestScores: { j01: 100, x: 5 }, achievements: { 'first-clear': 50 }, dailyDays: ['2026-10-01'], gamesPlayed: 3 });
  const b = prog({ journeyCompleted: [1, 2], bestScores: { j01: 80, y: 9 }, achievements: { 'first-clear': 20, 'tile-4096': 99 }, dailyDays: ['2026-10-02'], tutorialDone: true, gamesPlayed: 7 });
  const m = P.mergeProgress(a, b);
  assert.deepEqual(m.journeyCompleted, [0, 1, 2]);
  assert.deepEqual(m.bestScores, { j01: 100, x: 5, y: 9 });
  assert.deepEqual(m.achievements, { 'first-clear': 20, 'tile-4096': 99 });
  assert.deepEqual(m.dailyDays, ['2026-10-01', '2026-10-02']);
  assert.equal(m.tutorialDone, true);
  assert.equal(m.gamesPlayed, 7);
  assert.ok(P.sameData(P.mergeSaves(P.saveData(a), P.saveData(b)), P.saveData(m)));
});

test('the browser build\'s cloud document migrates; junk is refused', () => {
  const old = { version: 1, progress: { version: 1, journeyCompleted: [0, 1, 99, 'x'], bestScores: { 'daily-2026-10-01': 1234, bad: 'x' }, achievements: { 'first-clear': 1, nope: 2 }, dailyDays: ['2026-10-01', 'nonsense'], tutorialDone: true, gamesPlayed: 4 }, savedAt: 1 };
  const p = P.readForeign(JSON.stringify(old));
  assert.deepEqual(p.journeyCompleted, [0, 1]);
  assert.deepEqual(p.bestScores, { 'daily-2026-10-01': 1234 });
  assert.deepEqual(p.achievements, { 'first-clear': 1 });
  assert.deepEqual(p.dailyDays, ['2026-10-01']);
  assert.equal(p.tutorialDone, true);
  assert.equal(p.gamesPlayed, 4);
  for (const bad of [null, '', '{', '[]', JSON.stringify({ version: 2, progress: {} }), JSON.stringify({ version: 1, progress: { version: 2 } })]) assert.equal(P.readForeign(bad), null);
});

test('saves read back; a broken save is an empty record', () => {
  const p = prog({ bestScores: { a: 3 } });
  assert.deepEqual(P.readSave(P.saveData(p)), p);
  assert.deepEqual(P.readSave(null), P.defaultProgress());
  assert.deepEqual(P.readSave({ version: 9 }), P.defaultProgress());
});

test('legacy settings-KV options: only the game\'s own, valid values', () => {
  assert.deepEqual(P.pickOptions({ theme: 'ember', render3d: false, leftHanded: true, haptics: 'yes', captions: true, music: 0.3 }),
    { theme: 'ember', render3d: false, leftHanded: true, captions: true });
  assert.deepEqual(P.pickOptions({ theme: 'mono' }), {}); // High contrast is the runtime's option now
  assert.deepEqual(P.pickOptions({ theme: 'nope' }), {});
  for (const k of P.OPTION_KEYS) assert.ok(P.BROWSER_KEYS.includes(k));
});

test('a snapshot resumes only an unfinished run', () => {
  const st = R.createGame({ seed: 5 });
  R.applyMove(st, 'left');
  const snap = { mode: 'practice', contentId: 'practice-2048-4', ranked: false, opts: { seed: 5 }, state: R.serialize(st), savedAt: 1 };
  assert.equal(R.stateHash(P.readSnapshot(snap).state), R.stateHash(st));
  st.over = true;
  assert.equal(P.readSnapshot({ ...snap, state: R.serialize(st) }), null);
  assert.equal(P.readSnapshot({ ...snap, mode: 'arcade' }), null);
  assert.equal(P.readSnapshot(null), null);
});

test('achievements unlock once', () => {
  const p = prog({ dailyDays: ['1', '2', '3', '4', '5', '6', '7'], journeyCompleted: Array.from({ length: 20 }, (_, i) => i) });
  const st = R.createGame({ seed: 1 });
  st.won = true;
  st.maxTile = 4096;
  const got = P.evaluateAchievements(p, 'journey', 'j08', st, 42);
  assert.deepEqual(got.sort(), ['first-clear', 'journey-half', 'mechanic-mastery', 'streak-7', 'tile-4096']);
  assert.deepEqual(P.evaluateAchievements(p, 'journey', 'j08', st, 43), []);
  assert.equal(p.achievements['first-clear'], 42);
});

test('modes: options, the hint, the move diff', () => {
  assert.deepEqual(M.dailyOptions('2026-10-27'), { seed: R.dailySeed('2026-10-27'), size: 4, goalTile: 2048, allowUndo: false, moveLimit: 0, timeLimitMs: 0 });
  assert.deepEqual(M.practiceOptions(512, 3, 7), { id: 'practice-512-3', opts: { seed: 7, size: 3, goalTile: 512, allowUndo: true } });
  assert.equal(M.CHALLENGES.find((c) => c.kind === 'speed').opts.timeLimitMs, 120000);
  const st = R.createGame({ seed: 1 });
  st.board = [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 4]];
  const h = M.computeHint(st);
  assert.ok(h.dir === 'left' || h.dir === 'right');
  assert.equal(h.empties, 14);
  st.board = [[2, 4], [4, 2]]; st.size = 2;
  assert.equal(M.computeHint(st), null);
  const d = M.moveDiff([[2, 2], [0, 0]], [[4, 0], [0, 2]]);
  assert.deepEqual([...d.merged], ['0,0']);
  assert.deepEqual([...d.spawned], ['1,1']);
  assert.deepEqual(M.boardCounts({ board: [[4, 2], [2, 0]] }), { empty: 1, tiles: '1×4, 2×2' });
});
