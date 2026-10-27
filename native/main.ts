// Merge Matrix on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules (src/rules.ts), the content
// (src/content.ts), the modes (src/modes.ts) and the progress
// (src/progress.ts) are the browser build's pure modules, shared with the
// Node tests; this module is what its src/main.ts and session.ts did around
// them: the run (the single validated command path, undo, the speed
// challenge's clock, the countdown, the lesson completion rules, the results,
// achievements, journey and daily progress, personal bests, posting ranked
// runs to the high-score board), the snapshot that survives leaving, the
// screens (title, modes, journey, learn, play, results, help and the
// pause/settings sheet) and input: the move keys and pad, swipes and drags on
// the board, and every button.
import "./i18n.ts";
import {
  clipboard, frame, onPreferencesChange, onQuit, onRender, onResume, onStart, onSuspend, onUpdate, preferences,
} from "starhermit:engine";
import { bindings, isKeyDown, onAction, onPointerButton, onPointerMove, onTouch, vibrate } from "starhermit:input";
import * as ui from "starhermit:ui";
import { onSessionEnded, requestSignIn } from "starhermit:platform";
import * as rules from "../src/rules.ts";
import type { Dir, GameState, RulesOptions } from "../src/rules.ts";
import * as content from "../src/content.ts";
import { boardCounts, computeHint, dailyOptions, moveDiff } from "../src/modes.ts";
import * as P from "../src/progress.ts";
import * as audio from "./audio.ts";
import { account, N, T } from "./i18n.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import * as render from "./render.ts";
import { drawScreens } from "./screens.ts";
import { applyTheme, initStyles } from "./style.ts";

export type Screen = "title" | "modes" | "journey" | "learn" | "play" | "results" | "help";
type Text = () => string;

export const app = {
  screen: "title" as Screen,
  /** The pause sheet (in a run) or the settings sheet (elsewhere) is open; a run is paused under it. */
  sheet: false,
  /** Frame the screen or sheet opened on (the press that opened it must not also act on it). */
  openedFrame: 0,
  focusNext: null as string | null,
  /** Modes: the chosen card's setup ("practice" | "challenge" | "score"), the selects' indices. */
  setup: null as null | "practice" | "challenge" | "score",
  practiceGoal: 2,
  practiceSize: 0,
  challenge: 0,
  toast: null as null | { text: Text; until: number },
  caption: null as null | { text: string; until: number },
  hint: null as Text | null,
  invalid: null as Text | null,
  /** The countdown's number and when it next steps (3, 2, 1 at 450 ms). */
  countdown: null as null | { n: number; next: number },
  /** The Daily's leaderboard panel: shown, and its rows once loaded (null: loading or none). */
  lbPanel: false,
  lbRows: null as platform.BoardRow[] | null,
  /** The results' leaderboard line state (undefined: no line). */
  lbResult: undefined as undefined | null | { posted: boolean; rank: number | null },
  result: null as null | { total: number; prevBest: number; newAch: string[]; next: null | { kind: "journey" | "learn"; id: string } },
  /** The snapshot the title's Resume would continue (refreshed when it changes). */
  resumable: null as null | { snap: P.Snapshot; state: GameState },
};
export const options = platform.options;
const now = (): number => frame().time;

export function goTo(s: Screen, focus: string | null = null): void {
  if (s !== app.screen) {
    // Forward navigation taps, backward navigation blips (main.ts show()).
    if (s === "title" && app.screen !== "title") audio.sfx.uiBack();
    else if (app.screen !== "play") audio.sfx.uiMove();
  }
  app.screen = s;
  opened(focus);
  render.setActive(s === "play" && options.render3d);
}
function opened(focus: string | null): void {
  app.openedFrame = frame().frame;
  app.focusNext = focus ?? "first";
  ui.setFocus(null);
}
export const fresh = (n = 1): boolean => frame().frame - app.openedFrame <= n;
export function announce(text: string): void { if (text) ui.announce(text.slice(0, 480)); }
export function toast(text: Text): void { app.toast = { text, until: now() + 3.2 }; }

// ------------------------------------------------------------------ keys
const KEY_GLYPHS: Record<string, string> = { "Arrow Up": "↑", "Arrow Down": "↓", "Arrow Left": "←", "Arrow Right": "→", Escape: "Esc" };
/** main.ts keysFor: an action's effective keys, e.g. "↑/W". */
export function keysFor(action: string): string {
  let list: readonly { device: string; label: string }[] = [];
  try { list = bindings(action); } catch { list = []; }
  const names = list.filter((b) => b.device === "keyboard").map((b) => KEY_GLYPHS[b.label] ?? b.label);
  return [...new Set(names)].join("/") || "—";
}

// ------------------------------------------------------------------ themes and text
export function themeNow(): content.ThemeDef {
  const id = ui.preferences().highContrast ? "mono" : options.theme;
  return content.THEMES.find((t) => t.id === id) ?? content.THEMES[0]!;
}
export const DIR_NAMES: Record<Dir, string> = { up: N("up"), down: N("down"), left: N("left"), right: N("right") };
export function stageName(s: content.StageDef): string {
  return s.mastery ? T("Mastery {n}", { n: Math.floor(s.index / 8) + 1 }) : T("Stage {n}", { n: s.index + 1 });
}
export function boardSummary(st: GameState): string {
  const c = boardCounts(st);
  return T("{size}×{size} board, {empty} empty cells, tiles: {tiles}. Largest {max}.", { size: st.size, empty: c.empty, tiles: c.tiles, max: st.maxTile });
}
export function cellLabel(v: number, r: number, c: number): string {
  return v === 0 ? T("empty, row {r} column {c}", { r: r + 1, c: c + 1 }) : T("{v}, row {r} column {c}", { v, r: r + 1, c: c + 1 });
}

// ------------------------------------------------------------------ the run
export const run = {
  mode: "practice" as P.Mode,
  contentId: "",
  ranked: false,
  opts: { seed: 0 } as RulesOptions,
  state: null as GameState | null,
  /** Resolved (results shown) — exactly once per run. */
  finished: false,
  /** A move ended the run: the results take over at this time, after the last move lands. */
  finishAt: null as number | null,
  lesson: null as content.LessonDef | null,
};
let lastMoveKey = "";
let lastMoveAt = -1;

function setupBoard(st: GameState): void {
  render.setTheme(themeNow());
  render.buildBoard(st.size);
  render.setBoard(st.board);
}

export function startRun(mode: P.Mode, contentId: string, opts: RulesOptions, ranked: boolean): void {
  run.mode = mode;
  run.contentId = contentId;
  run.ranked = ranked;
  run.opts = opts;
  run.state = rules.createGame(opts);
  run.finished = false;
  run.finishAt = null;
  if (mode !== "learn") run.lesson = null;
  app.sheet = false;
  app.hint = null;
  app.invalid = null;
  app.lbPanel = false;
  app.lbRows = null;
  setupBoard(run.state);
  goTo("play", "");
  app.focusNext = null;
  runCountdown();
  audio.start();
  persistSnapshot();
  if (ranked && mode === "daily") loadLeaderboard();
}
export function startLesson(l: content.LessonDef): void {
  run.lesson = l;
  startRun("learn", l.id, content.lessonOptions(l), false);
}

function runCountdown(): void {
  if (preferences().reducedMotion) { app.countdown = null; announce(T("Go")); return; }
  app.countdown = { n: 3, next: now() + 0.45 };
  audio.sfx.countdown(3);
}
function stepCountdown(): void {
  const c = app.countdown;
  if (!c || now() < c.next) return;
  c.n--;
  c.next += 0.45;
  if (c.n <= 0) { app.countdown = null; audio.sfx.countdownGo(); announce(T("Go")); return; }
  audio.sfx.countdown(c.n);
}

function persistSnapshot(): void {
  const st = run.state;
  if (!st || st.over) return;
  const snap: P.Snapshot = { mode: run.mode, contentId: run.contentId, ranked: run.ranked, opts: run.opts, state: rules.serialize(st), savedAt: Date.now() };
  platform.storeSnapshot(snap);
}
function refreshResumable(): void { app.resumable = P.readSnapshot(platform.loadSnapshot()); }

export function canMove(): boolean { return app.screen === "play" && !app.sheet && !!run.state; }

export function doMove(dir: Dir): void {
  const st = run.state;
  if (!st || !canMove()) return;
  // Action identifiers prevent accidental double commits (the same refused move within 120 ms).
  const k = `${st.moves}:${dir}`;
  if (k === lastMoveKey && now() - lastMoveAt < 0.12) return;
  lastMoveKey = k;
  lastMoveAt = now();
  const prev = st.board;
  const r = rules.applyMove(st, dir);
  persistSnapshot();
  if (!r.ok) {
    if (r.reason === "no-move") {
      showInvalid(() => T("Nothing slides {dir} — try another direction.", { dir: T(DIR_NAMES[dir]) }));
      audio.sfx.invalid();
    }
    return;
  }
  const d = moveDiff(prev, st.board);
  render.setBoard(st.board, d.spawned, d.merged);
  audio.sfx.ack();
  audio.sfx.slide();
  const gained = r.move?.gained ?? 0;
  if (gained > 0) {
    audio.sfx.merge(r.move?.merges[0]?.value ?? 4);
    render.pulseGlow(Math.min(1, gained / 256));
  }
  if (options.haptics) { try { vibrate(10); } catch { /* unsupported */ } }
  announce(T("Moved {dir}. Score {score}. {summary}", { dir: T(DIR_NAMES[dir]), score: rules.scoreTotal(st), summary: boardSummary(st) }));
  app.invalid = null;
  checkLessonProgress();
  if (st.over && run.finishAt === null) run.finishAt = now() + 0.45;
}

export function doUndo(): void {
  const st = run.state;
  if (!st || !canMove()) return;
  const r = rules.undo(st);
  persistSnapshot();
  if (r.ok) {
    audio.sfx.undo();
    render.setBoard(st.board);
    announce(T("Undid the last move."));
  } else {
    showInvalid(r.reason === "undo-unavailable" ? () => T("Undo is not available in this mode.") : () => T("Cannot undo now."));
    audio.sfx.invalid();
  }
}

export function doHint(): void {
  const st = run.state;
  if (!st || app.screen !== "play") return;
  const h = computeHint(st);
  app.hint = h
    ? () => T("Try {dir} — {why}.", { dir: T(DIR_NAMES[h.dir]), why: h.only ? T("only legal direction") : T("frees {n} cells with the best immediate merges", { n: h.empties }) })
    : () => T("No legal moves remain.");
  audio.sfx.hint();
  announce(app.hint());
}
function showInvalid(msg: Text): void { app.invalid = msg; announce(msg()); }

/** Learn: a lesson completes on its own rule (main.ts checkLessonProgress). */
function checkLessonProgress(): void {
  const l = run.lesson, st = run.state;
  if (!l || !st || run.mode !== "learn") return;
  let done = st.moves >= l.requireMoves;
  if (l.id === "lesson-merge") done = done && st.log.some((m) => m.merges.length > 0);
  if (l.id === "lesson-survive") done = st.maxTile >= 32;
  if (done && !st.over) {
    st.won = true;
    st.over = true;
    st.terminalReason = "goal-reached";
    st.score.milestoneBonus += 100;
    run.finishAt = now() + 0.3;
  }
}

/** Resolves a finished run exactly once: records, achievements, the results screen, the leaderboard post. */
function finishRun(): void {
  const st = run.state;
  if (!st || run.finished || !st.over) return;
  run.finished = true;
  run.finishAt = null;
  const p = platform.progress;
  const total = rules.scoreTotal(st);
  const prevBest = p.bestScores[run.contentId] ?? 0;
  if (prevBest < total) p.bestScores[run.contentId] = total;
  p.gamesPlayed++;
  if (run.mode === "daily") {
    const day = run.contentId.replace(/^daily-/, "");
    if (!p.dailyDays.includes(day)) { p.dailyDays.push(day); p.dailyDays.sort(); }
  }
  let next: null | { kind: "journey" | "learn"; id: string } = null;
  if (run.mode === "journey" && st.won) {
    const stage = content.JOURNEY.find((s) => s.id === run.contentId);
    if (stage && !p.journeyCompleted.includes(stage.index)) { p.journeyCompleted.push(stage.index); p.journeyCompleted.sort((a, b) => a - b); }
    const n = stage ? content.JOURNEY[stage.index + 1] : undefined;
    if (n) next = { kind: "journey", id: n.id };
  }
  if (run.mode === "learn" && st.won) {
    p.tutorialDone = true;
    const idx = content.LESSONS.findIndex((l) => l.id === run.contentId);
    const n = content.LESSONS[idx + 1];
    if (n) next = { kind: "learn", id: n.id };
  }
  app.countdown = null;
  const newAch = P.evaluateAchievements(p, run.mode, run.contentId, st, Date.now());
  platform.saveProgress();
  platform.storeSnapshot(null);
  app.result = { total, prevBest, newAch, next };
  if (newAch.length > 0) audio.sfx.achievement();
  if (total > prevBest && newAch.length === 0) audio.sfx.newBest();
  app.lbResult = undefined;
  if (run.ranked && platform.signedIn()) {
    // Signed in, ranked runs (Daily, Score chase) post their total to the high-score board (score-script.js).
    app.lbResult = null;
    const posted = run;
    void platform.postLeaderboard(total).then((r) => { if (posted === run && app.result) app.lbResult = r; });
  }
  app.sheet = false;
  goTo("results", "btn-retry");
  announce(T("{headline}. Total score {total}.", { headline: resultsHeadline(), total }));
  if (st.won) audio.sfx.milestone(); else audio.sfx.gameOver();
}
export function resultsHeadline(): string {
  const st = run.state;
  if (!st) return "";
  return st.won
    ? (run.mode === "learn" ? T("Lesson complete") : T("Milestone reached — {n}!", { n: st.goalTile }))
    : st.terminalReason === "move-limit-exhausted" ? T("Out of moves")
    : st.terminalReason === "time-expired" ? T("Time expired")
    : T("Matrix full — run over");
}
export function lbLine(): string | null {
  const r = app.lbResult;
  if (r === undefined) return null;
  return !r ? account().lbPosting : !r.posted ? account().lbNotPosted : r.rank ? account().lbRank.replace("{rank}", String(r.rank)) : account().lbPosted;
}

function loadLeaderboard(): void {
  app.lbPanel = true;
  app.lbRows = null;
  const at = run.contentId;
  platform.boardEntries(10).then((rows) => { if (run.contentId === at) app.lbRows = rows; }, () => undefined);
}

export function retry(): void {
  if (run.mode === "learn") {
    const l = content.LESSONS.find((x) => x.id === run.contentId);
    if (l) { startLesson(l); return; }
  }
  if (run.state) startRun(run.mode, run.contentId, run.opts, run.ranked);
  else goTo("title");
}
export function next(): void {
  const n = app.result?.next;
  if (!n) return;
  if (n.kind === "learn") { const l = content.LESSONS.find((x) => x.id === n.id); if (l) startLesson(l); return; }
  const s = content.JOURNEY.find((x) => x.id === n.id);
  if (s) startRun("journey", s.id, content.stageOptions(s), false);
}
export function startStage(s: content.StageDef): void { startRun("journey", s.id, content.stageOptions(s), false); }
export function startDaily(): void {
  const day = platform.utcDate();
  startRun("daily", `daily-${day}`, dailyOptions(day), true);
}
export function resumeRun(): void {
  const r = app.resumable;
  if (!r) return;
  run.mode = r.snap.mode;
  run.contentId = r.snap.contentId;
  run.ranked = !!r.snap.ranked;
  run.opts = r.snap.opts;
  run.state = r.state;
  run.finished = false;
  run.finishAt = null;
  run.lesson = run.mode === "learn" ? content.LESSONS.find((l) => l.id === run.contentId) ?? null : null;
  app.sheet = false;
  app.hint = null;
  app.invalid = null;
  app.countdown = null;
  app.lbPanel = false;
  setupBoard(r.state);
  goTo("play", "");
  app.focusNext = null;
  audio.start();
}
export function restartRun(): void {
  app.sheet = false;
  audio.setSuspended(false);
  retry();
}
export function leaveRun(): void {
  persistSnapshot();
  app.sheet = false;
  audio.setSuspended(false);
  app.countdown = null;
  refreshResumable();
  goTo("title");
}
export function toMenu(): void { refreshResumable(); goTo("title"); }

/** The pause sheet in a run, the settings sheet elsewhere (main.ts togglePause). */
export function openSheet(): void {
  if (app.sheet) return;
  app.sheet = true;
  opened("btn-resume-play");
  persistSnapshot();
  audio.setSuspended(true);
}
export function closeSheet(): void {
  if (!app.sheet) return;
  app.sheet = false;
  audio.setSuspended(false);
  opened(null);
  app.focusNext = null;
}
export function replayTutorial(): void { closeSheet(); goTo("learn"); }

// ------------------------------------------------------------------ the platform
export function signIn(): void { void requestSignIn().catch(() => undefined); }
export function copyInvite(): void {
  const link = platform.inviteLink();
  if (!link) return;
  let ok = false;
  try { clipboard.writeText(link); ok = true; } catch { ok = false; }
  toast(ok ? () => account().copied : () => account().copyFailed);
}

// ------------------------------------------------------------------ input
// Keys and pad buttons (starhermit.txt control.* / engine.gamepad.*). While a widget has key focus (Tab), the
// arrows are the UI's; WASD and the pad still slide. A click or tap on a rail button hands the arrows back.
const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
onAction((e) => {
  if (!e.pressed) return;
  if (e.action === "pause") {
    if (fresh(0)) return;
    if (app.sheet) closeSheet();
    else if (app.screen === "play" && run.state) openSheet();
    return;
  }
  if (!canMove()) return;
  if (e.source === "keyboard" && ui.focused() !== null && ARROWS.some((k) => isKeyDown(k))) return;
  switch (e.action) {
    case "up": case "down": case "left": case "right": doMove(e.action); break;
    case "undo": doUndo(); break;
    case "hint": doHint(); break;
    default: break;
  }
});

// Swipes on the board (main.ts bindPointer): a press on the board that moves 24 px or more before its release slides
// that way (a tap does nothing). Presses are queued and decided once the frame's UI is built, so a press on a
// widget is the widget's.
interface Press { kind: "down" | "move" | "up" | "cancel"; x: number; y: number }
const queued: Press[] = [];
let down: null | { x: number; y: number } = null;
let lastTouch = -10;
let pointerUpFrame = -10;
/** A pointer button or finger lifted this frame or the last (a click or tap activates on its release). */
export function pointerActivation(): boolean { return frame().frame - pointerUpFrame <= 1; }
onPointerButton((e) => {
  if (!e.pressed) pointerUpFrame = frame().frame;
  if (e.button !== 0 || now() - lastTouch < 0.6) return;
  queued.push({ kind: e.pressed ? "down" : "up", x: e.x, y: e.y });
});
onPointerMove((x, y) => { if (down && now() - lastTouch >= 0.6) queued.push({ kind: "move", x, y }); });
onTouch((e) => {
  if (!e.primary || e.control) return;
  lastTouch = now();
  if (e.phase === "end") pointerUpFrame = frame().frame;
  queued.push({ kind: e.phase === "start" ? "down" : e.phase === "move" ? "move" : e.phase === "end" ? "up" : "cancel", x: e.x, y: e.y });
});
/** The board's window rectangle this frame (screens.ts sets it), for swipes. */
export const boardRect = { x: 0, y: 0, w: 0, h: 0 };
function boardInput(): void {
  for (const q of queued.splice(0)) {
    if (q.kind === "cancel") { down = null; continue; }
    if (q.kind === "move") continue;
    if (q.kind === "down") {
      down = null;
      const inside = q.x >= boardRect.x && q.y >= boardRect.y && q.x <= boardRect.x + boardRect.w && q.y <= boardRect.y + boardRect.h;
      // No widget sits on the board (the cell targets and the flat board's cells take no presses; ui.pointerOver()
      // reads true over those targets on the web runtime), and the sheet's scrim stops canMove().
      if (!canMove() || !inside) continue;
      down = { x: q.x, y: q.y };
      audio.start();
      continue;
    }
    const d = down;
    down = null;
    if (!d) continue;
    const sc = frame().scale;
    const dx = (q.x - d.x) / sc, dy = (q.y - d.y) / sc;
    if (Math.hypot(dx, dy) < 24) continue; // a tap: no move
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    ui.setFocus(null);
  }
}

// ------------------------------------------------------------------ lifecycle
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const k = `${f.quality}:${f.levelIndex}`;
  if (k === lookKey) return;
  lookKey = k;
  render.applyLook(lookFor(f.quality, f.levelIndex));
}
let themeKey = "";
function applyThemes(): void {
  const t = themeNow();
  if (t.id === themeKey) return;
  themeKey = t.id;
  applyTheme(t);
  render.setTheme(t);
}
audio.onCaption((key, vars) => { if (options.captions) app.caption = { text: T(key, vars ?? null), until: now() + 0.9 }; });

onStart(() => {
  initStyles();
  platform.initPlatform();
  audio.loadSfx();
  audio.start();
  render.setReducedMotion(preferences().reducedMotion);
  applyLook();
  applyThemes();
  refreshResumable();
  goTo("title");
});
platform.onOptionsChange(() => {
  applyThemes();
  render.setActive(app.screen === "play" && options.render3d);
});
platform.onMerged(() => { /* the screens read platform.progress each frame */ });
onPreferencesChange((p) => render.setReducedMotion(p.reducedMotion));
onSessionEnded(() => toast(() => account().signedOut));
// A hidden window pauses a run (main.ts visibilitychange) and holds the sound.
onSuspend(() => {
  if (app.screen === "play" && run.state && !app.sheet) openSheet();
  persistSnapshot();
  audio.setSuspended(true);
  platform.flush();
});
onResume(() => { if (!app.sheet) audio.setSuspended(false); });
onQuit(() => { persistSnapshot(); platform.flush(); });

let frameDt = 0;
onUpdate((dt) => {
  frameDt = dt;
  applyLook();
  applyThemes();
  audio.update();
  const t = now();
  if (app.toast && app.toast.until < t) app.toast = null;
  if (app.caption && app.caption.until < t) app.caption = null;
  const st = run.state;
  if (app.screen === "play" && st) {
    stepCountdown();
    // The speed challenge's clock runs while the run shows (not under the pause sheet).
    if (!app.sheet && !st.over) rules.tick(st, dt * 1000);
    if (st.over && !run.finished && (run.finishAt === null ? true : t >= run.finishAt)) finishRun();
    let empties = 0;
    for (const row of st.board) for (const v of row) if (v === 0) empties++;
    audio.setMusicIntensity(1 - empties / (st.size * st.size));
  }
});
onRender(() => {
  drawScreens();
  boardInput();
  render.update(frameDt);
});
