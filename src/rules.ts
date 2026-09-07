/**
 * Merge Matrix — pure deterministic rules engine.
 * No DOM, no rendering, no timers. All randomness flows through seeded streams.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export const RULES_VERSION = 1;

/** mulberry32 seeded stream. State is a single uint32 — fully serializable. */
export class Rng {
  state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  clone(): Rng {
    const r = new Rng(0);
    r.state = this.state;
    return r;
  }
}

export interface ScoreBreakdown {
  mergePoints: number;      // sum of all merged tile values
  milestoneBonus: number;   // bonus for reaching the goal tile
  efficiencyBonus: number;  // challenge/par bonuses (move limit, speed)
}

export interface ScoreComponents {
  breakdown: ScoreBreakdown;
  total: number;
}

export interface SpawnRecord {
  r: number;
  c: number;
  v: number;
}

export interface MoveRecord {
  dir: Dir;
  gained: number;
  merges: { value: number; count: number }[];
  spawn: SpawnRecord | null;
}

export interface RulesOptions {
  seed: number;
  size?: number;          // board edge length, default 4
  goalTile?: number;      // tile that completes the primary objective, default 2048
  moveLimit?: number;     // challenge constraint: max moves (0 = unlimited)
  timeLimitMs?: number;   // challenge constraint: authoritative elapsed budget (0 = unlimited)
  allowUndo?: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  size: number;
  goalTile: number;
  moveLimit: number;
  timeLimitMs: number;
  allowUndo: boolean;
  board: number[][];      // 0 = empty
  moves: number;          // monotonically increasing turn number
  score: ScoreBreakdown;
  invalidActions: number;
  rngState: number;
  won: boolean;           // primary objective reached (play may continue in endless)
  over: boolean;
  terminalReason: string | null;
  maxTile: number;
  undoStack: { board: number[][]; score: ScoreBreakdown; rngState: number; moves: number; maxTile: number }[];
  log: MoveRecord[];      // ordered input log for replay
  elapsedMs: number;      // authoritative elapsed time (advanced by caller via tick)
}

export function createGame(opts: RulesOptions): GameState {
  const size = Math.max(2, Math.min(8, opts.size ?? 4));
  const st: GameState = {
    version: RULES_VERSION,
    seed: opts.seed >>> 0,
    size,
    goalTile: opts.goalTile ?? 2048,
    moveLimit: opts.moveLimit ?? 0,
    timeLimitMs: opts.timeLimitMs ?? 0,
    allowUndo: opts.allowUndo ?? true,
    board: Array.from({ length: size }, () => new Array<number>(size).fill(0)),
    moves: 0,
    score: { mergePoints: 0, milestoneBonus: 0, efficiencyBonus: 0 },
    invalidActions: 0,
    rngState: 0,
    won: false,
    over: false,
    terminalReason: null,
    maxTile: 0,
    undoStack: [],
    log: [],
    elapsedMs: 0,
  };
  const rng = new Rng(st.seed);
  // two starting tiles, seeded
  spawnTile(st, rng);
  spawnTile(st, rng);
  st.rngState = rng.state;
  st.maxTile = boardMax(st.board);
  return st;
}

function rng(st: GameState): Rng {
  const r = new Rng(0);
  r.state = st.rngState;
  return r;
}

function spawnTile(st: GameState, r: Rng): SpawnRecord | null {
  const empty: [number, number][] = [];
  for (let i = 0; i < st.size; i++)
    for (let j = 0; j < st.size; j++)
      if (st.board[i][j] === 0) empty.push([i, j]);
  if (empty.length === 0) return null;
  const [ri, ci] = empty[r.int(empty.length)];
  const v = r.next() < 0.9 ? 2 : 4;
  st.board[ri][ci] = v;
  return { r: ri, c: ci, v };
}

/** Slide/merge one line toward index 0. Returns [result, gained, mergeValues, changed]. */
export function slideLine(line: number[]): [number[], number, number[], boolean] {
  const nz = line.filter((v) => v !== 0);
  const res: number[] = [];
  let gained = 0;
  const merges: number[] = [];
  for (let i = 0; i < nz.length; i++) {
    if (i + 1 < nz.length && nz[i] === nz[i + 1]) {
      const m = nz[i] * 2;
      res.push(m);
      gained += m;
      merges.push(m);
      i++;
    } else {
      res.push(nz[i]);
    }
  }
  while (res.length < line.length) res.push(0);
  let changed = false;
  for (let i = 0; i < line.length; i++) if (res[i] !== line[i]) { changed = true; break; }
  return [res, gained, merges, changed];
}

export function legalMoves(st: GameState): Dir[] {
  if (st.over) return [];
  return DIRS.filter((d) => peekMove(st.board, d).changed);
}

export function peekMove(board: number[][], dir: Dir): { board: number[][]; gained: number; merges: number[]; changed: boolean } {
  const size = board.length;
  const b = board.map((row) => row.slice());
  let gained = 0;
  let changed = false;
  const merges: number[] = [];
  const horiz = dir === 'left' || dir === 'right';
  const forward = dir === 'left' || dir === 'up';
  for (let k = 0; k < size; k++) {
    const line: number[] = [];
    for (let i = 0; i < size; i++) line.push(horiz ? b[k][i] : b[i][k]);
    const src = forward ? line : line.reverse();
    const [res, g, m, ch] = slideLine(src);
    const out = forward ? res : res.reverse();
    for (let i = 0; i < size; i++) {
      if (horiz) b[k][i] = out[i]; else b[i][k] = out[i];
    }
    gained += g;
    merges.push(...m);
    if (ch) changed = true;
  }
  return { board: b, gained, merges, changed };
}

export type InvalidReason =
  | 'game-over'
  | 'no-move'        // direction changes nothing
  | 'move-limit'
  | 'time-limit'
  | 'undo-unavailable'
  | 'bad-direction';

export interface ApplyResult {
  ok: boolean;
  reason?: InvalidReason;
  state: GameState;
  move?: MoveRecord;
}

function boardMax(b: number[][]): number {
  let m = 0;
  for (const row of b) for (const v of row) if (v > m) m = v;
  return m;
}

function checkTerminal(st: GameState): void {
  if (st.moveLimit > 0 && st.moves >= st.moveLimit) {
    st.over = true;
    st.terminalReason = st.won ? 'goal-reached' : 'move-limit-exhausted';
    return;
  }
  if (legalMoves({ ...st, over: false }).length === 0) {
    st.over = true;
    st.terminalReason = st.won ? 'goal-reached' : 'board-full';
    return;
  }
  if (st.timeLimitMs > 0 && st.elapsedMs >= st.timeLimitMs) {
    st.over = true;
    st.terminalReason = st.won ? 'goal-reached' : 'time-expired';
  }
}

export function applyMove(st: GameState, dir: Dir): ApplyResult {
  if (st.over) return { ok: false, reason: 'game-over', state: st };
  if (!DIRS.includes(dir)) return { ok: false, reason: 'bad-direction', state: st };
  if (st.moveLimit > 0 && st.moves >= st.moveLimit) {
    return { ok: false, reason: 'move-limit', state: st };
  }
  const p = peekMove(st.board, dir);
  if (!p.changed) {
    st.invalidActions++;
    return { ok: false, reason: 'no-move', state: st };
  }
  // snapshot for undo
  if (st.allowUndo) {
    st.undoStack.push({
      board: st.board.map((r) => r.slice()),
      score: { ...st.score },
      rngState: st.rngState,
      moves: st.moves,
      maxTile: st.maxTile,
    });
    if (st.undoStack.length > 64) st.undoStack.shift();
  }
  const r = rng(st);
  st.board = p.board;
  st.score.mergePoints += p.gained;
  const spawn = spawnTile(st, r);
  st.rngState = r.state;
  st.moves++;
  const mergeMap = new Map<number, number>();
  for (const m of p.merges) mergeMap.set(m, (mergeMap.get(m) ?? 0) + 1);
  const rec: MoveRecord = {
    dir,
    gained: p.gained,
    merges: [...mergeMap.entries()].map(([value, count]) => ({ value, count })),
    spawn,
  };
  st.log.push(rec);
  st.maxTile = boardMax(st.board);
  if (!st.won && st.maxTile >= st.goalTile) {
    st.won = true;
    st.score.milestoneBonus += st.goalTile * 10;
    // efficiency: reward finishing under a par budget when constrained
    if (st.moveLimit > 0) st.score.efficiencyBonus += Math.max(0, st.moveLimit - st.moves) * 25;
  }
  checkTerminal(st);
  return { ok: true, state: st, move: rec };
}

/** Advance authoritative clock; may terminate timed games. */
export function tick(st: GameState, dtMs: number): void {
  if (st.over) return;
  st.elapsedMs += Math.max(0, Math.floor(dtMs));
  if (st.timeLimitMs > 0 && st.elapsedMs >= st.timeLimitMs) {
    st.over = true;
    st.terminalReason = st.won ? 'goal-reached' : 'time-expired';
  }
}

export function undo(st: GameState): ApplyResult {
  if (st.over) return { ok: false, reason: 'game-over', state: st };
  if (!st.allowUndo || st.undoStack.length === 0) return { ok: false, reason: 'undo-unavailable', state: st };
  const s = st.undoStack.pop()!;
  st.board = s.board;
  st.score = s.score;
  st.rngState = s.rngState;
  st.moves = s.moves;
  st.maxTile = s.maxTile;
  st.log.pop();
  st.won = st.maxTile >= st.goalTile;
  return { ok: true, state: st };
}

export function scoreTotal(st: GameState | ScoreBreakdown): number {
  const s = 'score' in st ? st.score : st;
  return s.mergePoints + s.milestoneBonus + s.efficiencyBonus;
}

/** Stable FNV-1a hash of the observable state, for replay verification. */
export function stateHash(st: GameState): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n & 0xffff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (n >>> 16) & 0xffff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  mix(st.size); mix(st.moves); mix(st.rngState);
  mix(scoreTotal(st)); mix(st.maxTile); mix(st.over ? 1 : 0);
  for (const row of st.board) for (const v of row) mix(v);
  return h.toString(16).padStart(8, '0');
}

export function serialize(st: GameState): string {
  return JSON.stringify(st);
}

export function deserialize(json: string): GameState | null {
  try {
    const d = JSON.parse(json);
    if (!d || d.version !== RULES_VERSION || !Array.isArray(d.board)) return null;
    return d as GameState;
  } catch {
    return null;
  }
}

export interface ReplayEnvelope {
  schema: 1;
  rulesVersion: number;
  seed: number;
  options: Omit<RulesOptions, 'seed'>;
  initialHash: string;
  commands: Dir[];
  hashes: string[];      // state hash after each command
  terminal: { reason: string | null; score: number; moves: number };
}

export function buildReplay(opts: RulesOptions, commands: Dir[]): ReplayEnvelope {
  const st = createGame(opts);
  const initialHash = stateHash(st);
  const hashes: string[] = [];
  for (const c of commands) {
    applyMove(st, c);
    hashes.push(stateHash(st));
  }
  const { seed, ...rest } = opts;
  return {
    schema: 1,
    rulesVersion: RULES_VERSION,
    seed: opts.seed,
    options: rest,
    initialHash,
    commands,
    hashes,
    terminal: { reason: st.terminalReason, score: scoreTotal(st), moves: st.moves },
  };
}

/** Re-run a replay envelope; returns final state if every hash matches, else null. */
export function verifyReplay(env: ReplayEnvelope): GameState | null {
  if (env.schema !== 1 || env.rulesVersion !== RULES_VERSION) return null;
  const st = createGame({ ...env.options, seed: env.seed });
  if (stateHash(st) !== env.initialHash) return null;
  for (let i = 0; i < env.commands.length; i++) {
    applyMove(st, env.commands[i]);
    if (stateHash(st) !== env.hashes[i]) return null;
  }
  if (st.terminalReason !== env.terminal.reason) return null;
  if (scoreTotal(st) !== env.terminal.score) return null;
  return st;
}

/** Daily seed: one immutable seed per UTC day. */
export function dailySeed(dateUtc: string): number {
  // dateUtc: 'YYYY-MM-DD'
  let h = 0x811c9dc5;
  const s = 'merge-matrix-daily:' + dateUtc;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
