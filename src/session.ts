/**
 * Merge Matrix — session, persistence, settings, progression, replay.
 * Local-first: practice runs fully offline; hosted daily validation goes through /api.
 */
import {
  createGame, applyMove, undo as rulesUndo, tick as rulesTick, legalMoves, serialize, deserialize,
  scoreTotal, stateHash, buildReplay, dailySeed, type GameState, type Dir, type RulesOptions,
  type ReplayEnvelope,
} from './rules.js';
import { JOURNEY, ACHIEVEMENTS } from './content.js';

const LS = {
  settings: 'mm-settings-v1',
  progress: 'mm-progress-v1',
  snapshot: 'mm-snapshot-v1',
};

export interface Settings {
  music: number; fx: number; ambience: number; // 0..1
  muted: boolean;
  theme: string;
  quality: 'low' | 'medium' | 'high';
  reducedMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  leftHanded: boolean;
  holdToRepeat: boolean;
  haptics: boolean;
  captions: boolean;
  render3d: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  music: 0.5, fx: 0.8, ambience: 0.4, muted: false,
  theme: 'matrix', quality: 'high', reducedMotion: false, highContrast: false,
  largeText: false, leftHanded: false, holdToRepeat: false, haptics: true,
  captions: false, render3d: true,
};

export interface Progress {
  version: number;
  journeyCompleted: number[];     // stage indices
  bestScores: Record<string, number>;
  achievements: Record<string, number>; // key → unlock timestamp
  dailyDays: string[];            // UTC days played
  tutorialDone: boolean;
  gamesPlayed: number;
}

export interface ActiveSession {
  mode: 'learn' | 'journey' | 'daily' | 'practice' | 'challenge';
  contentId: string;      // lesson id / stage id / 'daily-YYYY-MM-DD' / 'practice-*'
  contentVersion: number;
  ranked: boolean;
  opts: RulesOptions;
  state: GameState;
  lastTickAt: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function writeJson(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full/blocked */ }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(readJson<Partial<Settings>>(LS.settings) ?? {}) };
}

export function saveSettings(s: Settings): void {
  writeJson(LS.settings, s);
}

export function loadProgress(): Progress {
  const p = readJson<Progress>(LS.progress);
  if (p && p.version === 1) return p;
  return { version: 1, journeyCompleted: [], bestScores: {}, achievements: {}, dailyDays: [], tutorialDone: false, gamesPlayed: 0 };
}

export function saveProgress(p: Progress): void {
  writeJson(LS.progress, p);
}

export function unlockAchievement(p: Progress, key: string): boolean {
  if (!ACHIEVEMENTS.some((a) => a.key === key)) return false;
  if (p.achievements[key] != null) return false; // idempotent
  p.achievements[key] = Date.now();
  saveProgress(p);
  return true;
}

/** Evaluate long-term achievements against current progress + finished state. */
export function evaluateAchievements(p: Progress, sess: ActiveSession): string[] {
  const newly: string[] = [];
  const grant = (k: string) => { if (unlockAchievement(p, k)) newly.push(k); };
  const st = sess.state;
  if (st.won) grant('first-clear');
  if (sess.mode === 'journey') {
    const stage = JOURNEY.find((s) => s.id === sess.contentId);
    if (stage?.mastery && st.won) grant('mechanic-mastery');
    if (p.journeyCompleted.length >= 20) grant('journey-half');
  }
  if (st.maxTile >= 4096) grant('tile-4096');
  if (p.dailyDays.length >= 7) grant('streak-7');
  return newly;
}

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dailyOptions(dateUtc = utcToday()): RulesOptions {
  return { seed: dailySeed(dateUtc), size: 4, goalTile: 2048, allowUndo: false, moveLimit: 0, timeLimitMs: 0 };
}

let active: ActiveSession | null = null;

export function startSession(mode: ActiveSession['mode'], contentId: string, opts: RulesOptions, ranked: boolean): ActiveSession {
  active = {
    mode, contentId, contentVersion: 1, ranked, opts,
    state: createGame(opts),
    lastTickAt: Date.now(),
  };
  persistSnapshot();
  return active;
}

export function getActive(): ActiveSession | null {
  return active;
}

export function resumeSnapshot(): ActiveSession | null {
  const d = readJson<{ mode: ActiveSession['mode']; contentId: string; ranked: boolean; opts: RulesOptions; state: string; savedAt: number }>(LS.snapshot);
  if (!d) return null;
  const st = deserialize(d.state);
  if (!st || st.over) { clearSnapshot(); return null; }
  active = { mode: d.mode, contentId: d.contentId, contentVersion: 1, ranked: d.ranked, opts: d.opts, state: st, lastTickAt: Date.now() };
  return active;
}

export function persistSnapshot(): void {
  if (!active || active.state.over) return;
  writeJson(LS.snapshot, {
    mode: active.mode, contentId: active.contentId, ranked: active.ranked,
    opts: active.opts, state: serialize(active.state), savedAt: Date.now(),
  });
}

export function clearSnapshot(): void {
  try { localStorage.removeItem(LS.snapshot); } catch {}
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
  gained?: number;
  gameOver?: boolean;
  won?: boolean;
  invalidCount: number;
}

/** The single validated command path — UI and replay both go through here. */
export function command(dir: Dir): CommandResult {
  if (!active) return { ok: false, reason: 'no-session', invalidCount: 0 };
  const st = active.state;
  advanceClock();
  const r = applyMove(st, dir);
  const res: CommandResult = {
    ok: r.ok, reason: r.reason, gained: r.move?.gained,
    gameOver: st.over, won: st.won, invalidCount: st.invalidActions,
  };
  persistSnapshot();
  return res;
}

export function commandUndo(): CommandResult {
  if (!active) return { ok: false, reason: 'no-session', invalidCount: 0 };
  const r = rulesUndo(active.state);
  persistSnapshot();
  return { ok: r.ok, reason: r.reason, gameOver: active.state.over, won: active.state.won, invalidCount: active.state.invalidActions };
}

/** Advance the authoritative clock against wall time (solo: paused when hidden). */
export function advanceClock(): void {
  if (!active) return;
  const now = Date.now();
  const dt = now - active.lastTickAt;
  active.lastTickAt = now;
  if (document.hidden) return; // backgrounding pauses solo simulation
  rulesTick(active.state, dt);
}

export function legal(): Dir[] {
  return active ? legalMoves(active.state) : [];
}

export function replayEnvelope(): ReplayEnvelope | null {
  if (!active) return null;
  const cmds = active.state.log.map((m) => m.dir);
  return buildReplay(active.opts, cmds);
}

export function currentHash(): string {
  return active ? stateHash(active.state) : '';
}

export { scoreTotal, stateHash };
