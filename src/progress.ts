/**
 * Merge Matrix — the player's progress and the game's own options, pure (no
 * engine, no DOM), shared by the engine client (native/platform.ts) and the
 * Node tests: the save document, merging two devices' progress, reading the
 * browser build's cloud document (the JS SDK's game:<slug> slot) and its
 * settings-KV options, achievements, the run snapshot's check.
 */
import { JOURNEY, ACHIEVEMENTS, THEMES } from './content.ts';
import { deserialize, type GameState, type RulesOptions } from './rules.ts';

export interface Progress {
  version: number;
  journeyCompleted: number[];     // stage indices
  bestScores: Record<string, number>;
  achievements: Record<string, number>; // key → unlock timestamp
  dailyDays: string[];            // UTC days played
  tutorialDone: boolean;
  gamesPlayed: number;
}

export type Mode = 'learn' | 'journey' | 'daily' | 'practice' | 'challenge';

/** The run in progress (kept on the device, as the browser build's localStorage snapshot was). */
export interface Snapshot {
  mode: Mode;
  contentId: string;
  ranked: boolean;
  opts: RulesOptions;
  state: string; // rules.serialize
  savedAt: number;
}

/** The game's own options (the runtime's Options own sound, graphics, language, motion, contrast, text size). */
export interface Options {
  theme: string;
  render3d: boolean;
  leftHanded: boolean;
  haptics: boolean;
  captions: boolean;
}
export const DEFAULT_OPTIONS: Options = { theme: 'matrix', render3d: true, leftHanded: false, haptics: true, captions: false };
export const OPTION_KEYS = Object.keys(DEFAULT_OPTIONS) as (keyof Options)[];
/** Every key the browser build patched into the account's settings KV (session.ts Settings). */
export const BROWSER_KEYS = ['music', 'fx', 'ambience', 'muted', 'theme', 'gfx', 'reducedMotion', 'highContrast', 'largeText',
  'leftHanded', 'holdToRepeat', 'haptics', 'captions', 'render3d', 'quality'];

/** The save document (starhermit:storage saves, schema 1): the browser build's cloud document's shape. */
export interface SaveDoc { version: 1; progress: Progress }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

export function defaultProgress(): Progress {
  return { version: 1, journeyCompleted: [], bestScores: {}, achievements: {}, dailyDays: [], tutorialDone: false, gamesPlayed: 0 };
}

/** A progress record from untrusted data (a save, another device, the browser build), invalid fields dropped. */
export function readProgress(raw: unknown): Progress {
  const p = defaultProgress();
  if (!isObj(raw)) return p;
  if (Array.isArray(raw.journeyCompleted)) {
    p.journeyCompleted = [...new Set(raw.journeyCompleted.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < JOURNEY.length))].sort((a, b) => a - b);
  }
  if (isObj(raw.bestScores)) for (const [k, v] of Object.entries(raw.bestScores)) if (num(v) > 0) p.bestScores[k] = num(v);
  if (isObj(raw.achievements)) {
    for (const [k, v] of Object.entries(raw.achievements)) if (ACHIEVEMENTS.some((a) => a.key === k) && typeof v === 'number') p.achievements[k] = v;
  }
  if (Array.isArray(raw.dailyDays)) p.dailyDays = [...new Set(raw.dailyDays.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d)))].sort();
  p.tutorialDone = raw.tutorialDone === true;
  p.gamesPlayed = Math.max(0, Math.floor(num(raw.gamesPlayed)));
  return p;
}

/**
 * Merge two progress records (this device's and another device's) so neither
 * side's progress is lost: union of completed stages and daily days, the
 * higher best score per board, the earliest unlock time per achievement, the
 * larger games-played count, tutorial done if either is.
 */
export function mergeProgress(local: Progress, remote: Progress | null | undefined): Progress {
  if (!remote || remote.version !== 1) return local;
  const bestScores: Record<string, number> = { ...(remote.bestScores ?? {}) };
  for (const [k, v] of Object.entries(local.bestScores ?? {})) bestScores[k] = Math.max(num(v), num(bestScores[k]));
  const achievements: Record<string, number> = { ...(remote.achievements ?? {}) };
  for (const [k, v] of Object.entries(local.achievements ?? {})) {
    achievements[k] = achievements[k] == null ? v : Math.min(num(v), num(achievements[k]));
  }
  return {
    version: 1,
    journeyCompleted: [...new Set([...(remote.journeyCompleted ?? []), ...(local.journeyCompleted ?? [])])].sort((a, b) => a - b),
    bestScores,
    achievements,
    dailyDays: [...new Set([...(remote.dailyDays ?? []), ...(local.dailyDays ?? [])])].sort(),
    tutorialDone: !!(local.tutorialDone || remote.tutorialDone),
    gamesPlayed: Math.max(num(local.gamesPlayed), num(remote.gamesPlayed)),
  };
}

export function saveData(progress: Progress): SaveDoc { return { version: 1, progress }; }
/** The progress in a save document (an empty record for none or a broken one). */
export function readSave(data: unknown): Progress {
  return isObj(data) && data.version === 1 ? readProgress(data.progress) : defaultProgress();
}
/** Two save documents merged (saves.onConflict, another device's save). */
export function mergeSaves(local: unknown, remote: unknown): SaveDoc {
  return saveData(mergeProgress(readSave(local), readSave(remote)));
}
export function sameData(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** The browser build's cloud document ({ version: 1, progress, savedAt }, written by the JS SDK's saveJSON). */
export function readForeign(text: string | null): Progress | null {
  let doc: unknown;
  try { doc = typeof text === 'string' ? JSON.parse(text) : null; } catch { return null; }
  if (!isObj(doc) || doc.version !== 1 || !isObj(doc.progress) || doc.progress.version !== 1) return null;
  return readProgress(doc.progress);
}

/** The game's options in a record (the browser build's settings KV values), invalid values left out. */
export function pickOptions(raw: unknown): Partial<Options> {
  const out: Partial<Options> = {};
  if (!isObj(raw)) return out;
  if (typeof raw.theme === 'string' && THEMES.some((t) => t.id === raw.theme && t.id !== 'mono')) out.theme = raw.theme;
  for (const k of ['render3d', 'leftHanded', 'haptics', 'captions'] as const) if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean;
  return out;
}

/** A stored snapshot that still holds a run in progress, else null. */
export function readSnapshot(raw: unknown): { snap: Snapshot; state: GameState } | null {
  if (!isObj(raw) || typeof raw.state !== 'string' || typeof raw.contentId !== 'string' || !isObj(raw.opts)) return null;
  if (!['learn', 'journey', 'daily', 'practice', 'challenge'].includes(String(raw.mode))) return null;
  const state = deserialize(raw.state);
  if (!state || state.over) return null;
  return { snap: raw as unknown as Snapshot, state };
}

/** Grants an achievement once (idempotent); true when newly unlocked. */
export function unlockAchievement(p: Progress, key: string, now: number): boolean {
  if (!ACHIEVEMENTS.some((a) => a.key === key)) return false;
  if (p.achievements[key] != null) return false;
  p.achievements[key] = now;
  return true;
}

/** Long-term achievements against progress + a finished run (session.ts evaluateAchievements). */
export function evaluateAchievements(p: Progress, mode: Mode, contentId: string, st: GameState, now: number): string[] {
  const newly: string[] = [];
  const grant = (k: string): void => { if (unlockAchievement(p, k, now)) newly.push(k); };
  if (st.won) grant('first-clear');
  if (mode === 'journey') {
    const stage = JOURNEY.find((s) => s.id === contentId);
    if (stage?.mastery && st.won) grant('mechanic-mastery');
    if (p.journeyCompleted.length >= 20) grant('journey-half');
  }
  if (st.maxTile >= 4096) grant('tile-4096');
  if (p.dailyDays.length >= 7) grant('streak-7');
  return newly;
}
