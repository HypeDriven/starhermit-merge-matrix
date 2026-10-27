/**
 * Merge Matrix — the modes' run options and the play helpers, pure (shared by
 * the engine client and the Node tests): Practice's goal and board choices,
 * the four Challenges, Score chase, the Daily's options, the hint and the
 * board summary counts (the browser build's main.ts / ui.ts tables).
 */
import { dailySeed, legalMoves, peekMove, type Dir, type GameState, type RulesOptions } from './rules.ts';

const N = (key: string): string => key;

/** Practice: the goal tile and the board size (index.html #practice-goal / #practice-size). */
export const PRACTICE_GOALS: [number, string][] = [[512, N('512 — quick')], [1024, N('1024 — standard')], [2048, N('2048 — classic')], [4096, N('4096 — deep')]];
export const PRACTICE_SIZES: [number, string][] = [[4, N('4 × 4')], [3, N('3 × 3 — tight')], [5, N('5 × 5 — wide')]];

/** Challenge kinds (index.html #challenge-kind), seeded and fixed. */
export const CHALLENGES: { kind: string; label: string; id: string; opts: RulesOptions }[] = [
  { kind: 'moves', label: N('Move limit — reach 512 in 60 moves'), id: 'challenge-moves', opts: { seed: 424242, size: 4, goalTile: 512, moveLimit: 60, allowUndo: true } },
  { kind: 'moves-hard', label: N('Move limit — reach 1024 in 100 moves'), id: 'challenge-moves-hard', opts: { seed: 515151, size: 4, goalTile: 1024, moveLimit: 100, allowUndo: true } },
  { kind: 'speed', label: N('Speed — reach 256 within 2 minutes'), id: 'challenge-speed', opts: { seed: 626262, size: 4, goalTile: 256, timeLimitMs: 120000, allowUndo: false } },
  { kind: 'wide', label: N('Wide matrix — reach 2048 on 5 × 5'), id: 'challenge-wide', opts: { seed: 737373, size: 5, goalTile: 2048, allowUndo: true } },
];

/** Score chase: one seeded board, no undo, ranked (posted to the high-score board). */
export const SCORE_CHASE = { id: 'score-chase', opts: { seed: 90210, size: 4, goalTile: 4096, allowUndo: false } as RulesOptions };

export function practiceOptions(goal: number, size: number, seed: number): { id: string; opts: RulesOptions } {
  return { id: `practice-${goal}-${size}`, opts: { seed: seed >>> 0, size, goalTile: goal, allowUndo: true } };
}

/** The Daily: one immutable seed per UTC day, ranked, no undo. */
export function dailyOptions(dateUtc: string): RulesOptions {
  return { seed: dailySeed(dateUtc), size: 4, goalTile: 2048, allowUndo: false, moveLimit: 0, timeLimitMs: 0 };
}

/** The hint (ui.ts computeHint): the legal direction with the best immediate merges, then the most free cells. */
export function computeHint(st: GameState): { dir: Dir; empties: number; only: boolean } | null {
  const legal = legalMoves(st);
  if (legal.length === 0) return null;
  let best: { dir: Dir; gain: number; empties: number } | null = null;
  for (const d of legal) {
    const p = peekMove(st.board, d);
    let empties = 0;
    for (const row of p.board) for (const v of row) if (v === 0) empties++;
    const gain = p.gained * 100 + empties;
    if (!best || gain > best.gain) best = { dir: d, gain, empties };
  }
  return best ? { dir: best.dir, empties: best.empties, only: false } : { dir: legal[0]!, empties: 0, only: true };
}

/** The board summary's numbers (ui.ts boardSummary): empty cells and the five largest values with counts. */
export function boardCounts(st: GameState): { empty: number; tiles: string } {
  const counts = new Map<number, number>();
  let empty = 0;
  for (const row of st.board) for (const v of row) {
    if (v === 0) empty++;
    else counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const tiles = [...counts.entries()].sort((a, b) => b[0] - a[0]).slice(0, 5).map(([v, n]) => `${n}×${v}`).join(', ');
  return { empty, tiles };
}

/** Which cells a move spawned and merged (main.ts doMove's diff), for the pop-in and the merge pulse. */
export function moveDiff(before: number[][], after: number[][]): { spawned: Set<string>; merged: Set<string> } {
  const spawned = new Set<string>(), merged = new Set<string>();
  for (let i = 0; i < after.length; i++) for (let j = 0; j < after.length; j++) {
    if (before[i]![j] === 0 && after[i]![j] !== 0) spawned.add(`${i},${j}`);
  }
  for (let i = 0; i < after.length; i++) for (let j = 0; j < after.length; j++) {
    if (after[i]![j]! > before[i]![j]! && !spawned.has(`${i},${j}`)) merged.add(`${i},${j}`);
  }
  return { spawned, merged };
}
