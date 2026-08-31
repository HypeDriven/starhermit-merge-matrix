/**
 * Merge Matrix — session, persistence, settings, progression, replay.
 * Local-first: practice runs fully offline; hosted daily validation goes through /api.
 */
import { createGame, applyMove, undo as rulesUndo, tick as rulesTick, legalMoves, serialize, deserialize, scoreTotal, stateHash, buildReplay, dailySeed, } from './rules.js';
import { JOURNEY, ACHIEVEMENTS } from './content.js';
const LS = {
    settings: 'mm-settings-v1',
    progress: 'mm-progress-v1',
    snapshot: 'mm-snapshot-v1',
};
export const DEFAULT_SETTINGS = {
    music: 0.5, fx: 0.8, ambience: 0.4, muted: false,
    theme: 'matrix', quality: 'high', reducedMotion: false, highContrast: false,
    largeText: false, leftHanded: false, holdToRepeat: false, haptics: true,
    captions: false, render3d: true,
};
function readJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function writeJson(key, v) {
    try {
        localStorage.setItem(key, JSON.stringify(v));
    }
    catch { /* storage full/blocked */ }
}
export function loadSettings() {
    return { ...DEFAULT_SETTINGS, ...(readJson(LS.settings) ?? {}) };
}
export function saveSettings(s) {
    writeJson(LS.settings, s);
}
export function loadProgress() {
    const p = readJson(LS.progress);
    if (p && p.version === 1)
        return p;
    return { version: 1, journeyCompleted: [], bestScores: {}, achievements: {}, dailyDays: [], tutorialDone: false, gamesPlayed: 0 };
}
export function saveProgress(p) {
    writeJson(LS.progress, p);
}
export function unlockAchievement(p, key) {
    if (!ACHIEVEMENTS.some((a) => a.key === key))
        return false;
    if (p.achievements[key] != null)
        return false; // idempotent
    p.achievements[key] = Date.now();
    saveProgress(p);
    return true;
}
/** Evaluate long-term achievements against current progress + finished state. */
export function evaluateAchievements(p, sess) {
    const newly = [];
    const grant = (k) => { if (unlockAchievement(p, k))
        newly.push(k); };
    const st = sess.state;
    if (st.won)
        grant('first-clear');
    if (sess.mode === 'journey') {
        const stage = JOURNEY.find((s) => s.id === sess.contentId);
        if (stage?.mastery && st.won)
            grant('mechanic-mastery');
        if (p.journeyCompleted.length >= 20)
            grant('journey-half');
    }
    if (st.maxTile >= 4096)
        grant('tile-4096');
    if (p.dailyDays.length >= 7)
        grant('streak-7');
    return newly;
}
export function utcToday() {
    return new Date().toISOString().slice(0, 10);
}
export function dailyOptions(dateUtc = utcToday()) {
    return { seed: dailySeed(dateUtc), size: 4, goalTile: 2048, allowUndo: false, moveLimit: 0, timeLimitMs: 0 };
}
let active = null;
export function startSession(mode, contentId, opts, ranked) {
    active = {
        mode, contentId, contentVersion: 1, ranked, opts,
        state: createGame(opts),
        lastTickAt: Date.now(),
    };
    persistSnapshot();
    return active;
}
export function getActive() {
    return active;
}
export function resumeSnapshot() {
    const d = readJson(LS.snapshot);
    if (!d)
        return null;
    const st = deserialize(d.state);
    if (!st || st.over) {
        clearSnapshot();
        return null;
    }
    active = { mode: d.mode, contentId: d.contentId, contentVersion: 1, ranked: d.ranked, opts: d.opts, state: st, lastTickAt: Date.now() };
    return active;
}
export function persistSnapshot() {
    if (!active || active.state.over)
        return;
    writeJson(LS.snapshot, {
        mode: active.mode, contentId: active.contentId, ranked: active.ranked,
        opts: active.opts, state: serialize(active.state), savedAt: Date.now(),
    });
}
export function clearSnapshot() {
    try {
        localStorage.removeItem(LS.snapshot);
    }
    catch { }
}
/** The single validated command path — UI and replay both go through here. */
export function command(dir) {
    if (!active)
        return { ok: false, reason: 'no-session', invalidCount: 0 };
    const st = active.state;
    advanceClock();
    const r = applyMove(st, dir);
    const res = {
        ok: r.ok, reason: r.reason, gained: r.move?.gained,
        gameOver: st.over, won: st.won, invalidCount: st.invalidActions,
    };
    persistSnapshot();
    return res;
}
export function commandUndo() {
    if (!active)
        return { ok: false, reason: 'no-session', invalidCount: 0 };
    const r = rulesUndo(active.state);
    persistSnapshot();
    return { ok: r.ok, reason: r.reason, gameOver: active.state.over, won: active.state.won, invalidCount: active.state.invalidActions };
}
/** Advance the authoritative clock against wall time (solo: paused when hidden). */
export function advanceClock() {
    if (!active)
        return;
    const now = Date.now();
    const dt = now - active.lastTickAt;
    active.lastTickAt = now;
    if (document.hidden)
        return; // backgrounding pauses solo simulation
    rulesTick(active.state, dt);
}
export function legal() {
    return active ? legalMoves(active.state) : [];
}
export function replayEnvelope() {
    if (!active)
        return null;
    const cmds = active.state.log.map((m) => m.dir);
    return buildReplay(active.opts, cmds);
}
export function currentHash() {
    return active ? stateHash(active.state) : '';
}
export { scoreTotal, stateHash };
