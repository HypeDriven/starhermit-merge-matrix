import { describe, it, expect } from 'vitest';
import {
  createGame, applyMove, undo, tick, legalMoves, slideLine, scoreTotal, stateHash,
  serialize, deserialize, buildReplay, verifyReplay, dailySeed, type GameState,
} from '../src/rules';
import { JOURNEY, LESSONS, THEMES, ACHIEVEMENTS, validateStage, stageOptions, difficultyOf } from '../src/content';

function playRandom(seed: number, n: number): GameState {
  const st = createGame({ seed });
  const dirs = ['up', 'down', 'left', 'right'] as const;
  let x = seed;
  for (let i = 0; i < n && !st.over; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    applyMove(st, dirs[x % 4]);
  }
  return st;
}

describe('slideLine', () => {
  it('merges equal neighbors once per move', () => {
    expect(slideLine([2, 2, 2, 0])[0]).toEqual([4, 2, 0, 0]);
    expect(slideLine([2, 2, 2, 2])[0]).toEqual([4, 4, 0, 0]);
    expect(slideLine([4, 4, 8, 8])[0]).toEqual([8, 16, 0, 0]);
  });
  it('scores merged values', () => {
    expect(slideLine([2, 2, 4, 4])[1]).toBe(12);
  });
  it('reports no change for blocked lines', () => {
    expect(slideLine([2, 4, 8, 16])[3]).toBe(false);
    expect(slideLine([0, 0, 2, 0])[0]).toEqual([2, 0, 0, 0]);
  });
});

describe('game lifecycle', () => {
  it('creates a board with exactly two tiles', () => {
    const st = createGame({ seed: 1 });
    let n = 0;
    for (const row of st.board) for (const v of row) if (v !== 0) n++;
    expect(n).toBe(2);
    expect(legalMoves(st).length).toBeGreaterThan(0);
  });
  it('rejects no-op moves and counts invalid actions', () => {
    const st = createGame({ seed: 7 });
    st.board = [[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    const r = applyMove(st, 'left');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-move');
    expect(st.invalidActions).toBe(1);
  });
  it('rejects bad directions and moves after game over', () => {
    const st = createGame({ seed: 7 });
    expect(applyMove(st, 'sideways' as never).reason).toBe('bad-direction');
    st.over = true;
    expect(applyMove(st, 'left').reason).toBe('game-over');
  });
  it('undo restores the exact prior state', () => {
    const st = createGame({ seed: 42 });
    const h0 = stateHash(st);
    applyMove(st, 'left');
    applyMove(st, 'up');
    undo(st);
    undo(st);
    expect(stateHash(st)).toBe(h0);
    expect(st.moves).toBe(0);
  });
  it('awards milestone bonus once at the goal tile', () => {
    const st = createGame({ seed: 3, goalTile: 8 });
    st.board = [[4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    applyMove(st, 'left');
    expect(st.won).toBe(true);
    expect(st.score.milestoneBonus).toBe(80);
  });
  it('enforces move limits with a terminal reason', () => {
    const st = createGame({ seed: 5, moveLimit: 2 });
    applyMove(st, 'left');
    applyMove(st, 'up');
    expect(st.moves).toBe(2);
    expect(st.over).toBe(true);
    expect(st.terminalReason).toMatch(/move-limit|goal-reached/);
  });
  it('time limit ends the game via authoritative tick', () => {
    const st = createGame({ seed: 9, timeLimitMs: 1000 });
    tick(st, 500);
    expect(st.over).toBe(false);
    tick(st, 600);
    expect(st.over).toBe(true);
    expect(st.terminalReason).toBe('time-expired');
  });
});

describe('determinism and replay', () => {
  it('same seed + commands produce identical state hashes', () => {
    for (const seed of [1, 12345, 999999]) {
      const a = playRandom(seed, 60);
      const b = playRandom(seed, 60);
      expect(stateHash(a)).toBe(stateHash(b));
    }
  });
  it('different seeds diverge', () => {
    expect(stateHash(playRandom(1, 30))).not.toBe(stateHash(playRandom(2, 30)));
  });
  it('replay envelopes verify and tampering fails', () => {
    const opts = { seed: 777 };
    const env = buildReplay(opts, ['left', 'up', 'right', 'down', 'left']);
    expect(verifyReplay(env)).not.toBeNull();
    env.commands[2] = 'up';
    expect(verifyReplay(env)).toBeNull();
  });
  it('serialization round-trips', () => {
    const st = playRandom(314, 25);
    const back = deserialize(serialize(st));
    expect(back).not.toBeNull();
    expect(stateHash(back!)).toBe(stateHash(st));
  });
  it('daily seed is stable and day-scoped', () => {
    expect(dailySeed('2026-08-30')).toBe(dailySeed('2026-08-30'));
    expect(dailySeed('2026-08-30')).not.toBe(dailySeed('2026-08-31'));
  });
  it('score is the sum of integer components', () => {
    const st = playRandom(11, 40);
    expect(scoreTotal(st)).toBe(st.score.mergePoints + st.score.milestoneBonus + st.score.efficiencyBonus);
  });
});

describe('fuzz', () => {
  it('random long sessions never hang, NaN, or soft-lock silently', () => {
    for (let seed = 0; seed < 50; seed++) {
      const st = playRandom(seed + 1, 500);
      for (const row of st.board) for (const v of row) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      if (st.over) expect(st.terminalReason).toBeTruthy();
    }
  });
});

describe('content', () => {
  it('ships 40 journey stages with valid options', () => {
    expect(JOURNEY.length).toBe(40);
    for (const s of JOURNEY) {
      expect(s.goalTile).toBeGreaterThanOrEqual(128);
      expect(difficultyOf(s)).toBeGreaterThan(0);
    }
    expect(JOURNEY.filter((s) => s.mastery).length).toBe(5);
  });
  it('ships 3 lessons, 5 themes, 5 achievements with stable keys', () => {
    expect(LESSONS.length).toBe(3);
    expect(THEMES.length).toBe(5);
    expect(ACHIEVEMENTS.length).toBe(5);
    for (const a of ACHIEVEMENTS) expect(a.key).toMatch(/^[a-z0-9-]+$/);
  });
  it('validators pass every journey stage (legality, no initial soft lock)', () => {
    for (const s of JOURNEY) {
      const issues = validateStage(s).filter((i) => i.issue !== 'greedy-unreached');
      expect(issues, `${s.id}: ${JSON.stringify(issues)}`).toEqual([]);
    }
  }, 30000);
  it('every stage starts with legal moves', () => {
    for (const s of JOURNEY) {
      expect(legalMoves(createGame(stageOptions(s))).length).toBeGreaterThan(0);
    }
  });
});
