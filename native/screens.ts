// The browser build's DOM shell (index.html + style.css + src/main.ts/ui.ts)
// as starhermit:ui, built every frame around the 3D board: the top bar (brand,
// score/best/moves/time, Pause and Settings), the screens (title over the key
// art, modes with the setup panel, journey, learn, results over the backdrop,
// how to play), the play layout (the objective rail, the board, the action
// rail with the hint, warning and Daily leaderboard panels, the countdown),
// the pause/settings sheet, the caption line and the toast. The browser's
// media queries are layouts picked by the window's logical size: desktop
// (≥ 1024 px: rails at the sides), compact (rails above and below the board)
// and landscape phone (narrow rails at the sides).
import { frame, openMenu } from "starhermit:engine";
import { requestRebind } from "starhermit:input";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import * as rules from "../src/rules.ts";
import * as content from "../src/content.ts";
import { CHALLENGES, PRACTICE_GOALS, PRACTICE_SIZES, SCORE_CHASE, practiceOptions } from "../src/modes.ts";
import { account, N, T } from "./i18n.ts";
import * as platform from "./platform.ts";
import * as render from "./render.ts";
import {
  app, boardRect, cellLabel, closeSheet, copyInvite, doHint, doUndo, fresh, goTo, keysFor, lbLine, leaveRun, next, openSheet, options,
  pointerActivation, replayTutorial, restartRun, resultsHeadline, resumeRun, retry, run, signIn, stageName, startDaily, startLesson,
  startRun, startStage, themeNow, toMenu,
} from "./main.ts";

// ------------------------------------------------------------------ layout and helpers
interface Layout { lw: number; lh: number; sc: number; ox: number; oy: number; desktop: boolean; landscape: boolean }
function layoutNow(): Layout {
  const f = frame();
  const sc = ui.preferences().scale;
  const sa = f.safeArea;
  const lw = Math.max(1, (f.width - sa.left - sa.right) / sc), lh = Math.max(1, (f.height - sa.top - sa.bottom) / sc);
  const landscape = lw < 1024 && lw > lh;
  return { lw, lh, sc, ox: sa.left, oy: sa.top, desktop: lw >= 1024, landscape };
}
const lastSize = new Map<string, number>();
const prefs = (): ui.UiPreferences => ui.preferences();
function tw(text: string, style: string | (string | ui.Style)[], kind?: "button" | "heading"): number {
  return ui.measureText(text, { ...(kind ? { kind } : {}), style }).width / prefs().scale;
}
let firstId: string | null = null;
interface Btn { id: string; text: string; cls?: string; note?: string; kbd?: string; disabled?: boolean; selected?: boolean; act: () => void }
const PAD_X: Record<string, number> = { btn: 38, primary: 38, small: 28, danger: 28, "icon-btn": 22 };
const btnW = (b: Btn): number => {
  const cls = b.cls ?? "btn";
  return tw(b.text, cls, "button") + (b.note ? tw(b.note, "note") + 8 : 0) + (b.kbd ? tw(b.kbd, "kbd") + 16 : 0) + (PAD_X[cls] ?? 36) + 2;
};
/** A button `width` wide (null: its text's); a long label wraps inside; `note` and `kbd` add the small inline spans. */
function button(b: Btn, width: number | null = null): boolean {
  const cls = b.cls ?? "btn";
  const opts: ui.ButtonOptions = {};
  if (b.disabled) opts.disabled = true;
  if (b.selected !== undefined) opts.selected = b.selected;
  const inner = width != null ? Math.max(20, width - (PAD_X[cls] ?? 36)) : null;
  const wraps = inner != null && btnW(b) > width!;
  const center = cls === "primary" || cls === "icon-btn";
  const weight = cls === "primary" ? "700" : "400";
  if (b.note || b.kbd || wraps) {
    opts.content = () => {
      const size = cls === "small" || cls === "danger" ? 14 : 16;
      const txt = { text: { align: center ? "center" : "start", weight, size } } as ui.Style;
      if (wraps && !b.note && !b.kbd) { ui.style(txt).paragraph(b.text, inner!); return; }
      ui.row(`${b.id}-face`, () => {
        if (wraps) ui.style(txt).paragraph(b.text, Math.max(20, inner! - (b.note ? tw(b.note, "note") + 8 : 0)));
        else ui.style(txt).label(b.text);
        if (b.note) ui.style("note").label(b.note);
        if (b.kbd) ui.style("kbd").label(b.kbd);
      }, { spacing: 8, align: "center" });
    };
  }
  if (!firstId && !b.disabled) firstId = b.id;
  const hit = ui.style(cls, width != null ? { width } : {}).id(b.id).button(b.text, opts);
  if (hit && !fresh(0)) { b.act(); if (app.screen === "play" && pointerActivation()) ui.setFocus(null); }
  return hit;
}
/** Buttons at their own widths in rows that wrap at `width` (CSS flex-wrap). */
function flow(label: string, list: Btn[], width: number, gap = 10, align: "start" | "center" = "start"): void {
  const rows = wrapRows(list.map((b) => Math.min(width, btnW(b))), width, gap);
  let k = 0;
  ui.column(label, () => {
    rows.forEach((n, ri) => ui.row(`${label}-r${ri}`, () => {
      for (let i = 0; i < n; i++, k++) { const b = list[k]!; button(b, btnW(b) > width ? width : null); }
    }, { spacing: gap, align: "center" }));
  }, { spacing: gap, align, width });
}
function wrapRows(widths: number[], max: number, gap: number): number[] {
  const rows: number[] = [];
  let used = 0, n = 0;
  for (const w of widths) {
    if (n && used + gap + w > max) { rows.push(n); used = 0; n = 0; }
    used += (n ? gap : 0) + w;
    n++;
  }
  if (n) rows.push(n);
  return rows;
}
/** Text up to `width` wide: one label when it fits, else a paragraph. */
function para(text: string, width: number, cls = "p", id?: string, center = false): void {
  if (!text) return;
  const styles: (string | ui.Style)[] = [cls];
  if (center) styles.push({ text: { align: "center" } });
  let u = ui.style(...styles);
  if (id) u = u.id(id);
  if (tw(text, styles) <= width) u.label(text);
  else u.paragraph(text, width);
}
function heading(cls: string, text: string, width: number): void {
  if (tw(text, cls, "heading") <= width) ui.style(cls).heading(text);
  else ui.style(cls).paragraph(text, width);
}
/** A labelled select (index.html <label>…<select>). */
function choice(id: string, label: string, opts: string[], index: number, set: (i: number) => void, w: number): void {
  const sw = Math.min(300, Math.max(160, w * 0.6));
  ui.row(`${id}-row`, () => {
    para(label, w - sw - 12, "set-label");
    ui.spacer();
    const pick = ui.id(id).select(label, index, opts, { width: sw } as ui.WidgetOptions);
    if (pick !== index) set(pick);
  }, { width: w, align: "center" });
}

/** The theme's text and accent colours (style.ts tokens) for hand-drawn pieces. */
function inkColor(): string { const t = themeNow(); return t.id === "mono" ? "#ffffff" : t.textLight ? "#e8ecf6" : "#1b2540"; }
function accentColor(): string { const t = themeNow(); return t.id === "mono" ? "#ffdf00" : t.accent; }

// ------------------------------------------------------------------ the frame
export function drawScreens(): void {
  const L = layoutNow();
  const f = frame();
  firstId = null;
  const top = topBar(L);
  const s = app.screen;
  if (s === "play" && run.state) playScreen(L, top);
  else {
    draw.box(0, top * L.sc + L.oy, f.width, f.height, "page");
    const builders: Record<string, (w: number, L: Layout) => void> = {
      title: titleScreen, modes: modesScreen, journey: journeyScreen, learn: learnScreen, results: resultsScreen, help: helpScreen,
    };
    page(s, L, top, builders[s] ?? titleScreen);
  }
  if (app.sheet) sheet(L);
  caption(L);
  toast(L);
  if (app.focusNext) {
    const age = f.frame - app.openedFrame;
    const target = app.focusNext === "first" ? firstId : app.focusNext;
    if (age >= 1 && target) ui.setFocus(target);
    if (age >= 3) app.focusNext = null;
  }
}

/** The top bar (index.html #topbar): brand, the run's numbers, Pause (in a run) and Settings. Its height. */
function topBar(L: Layout): number {
  const f = frame();
  const st = run.state;
  const inRun = app.screen === "play" && !!st;
  const total = st ? rules.scoreTotal(st) : 0;
  const best = st ? Math.max(platform.progress.bestScores[run.contentId] ?? 0, total) : 0;
  const stats: [string, string, string][] = [["hud-score", T("Score"), String(total)], ["hud-best", T("Best"), String(best)], ["hud-moves", T("Moves"), String(st?.moves ?? 0)]];
  if (inRun && st && st.timeLimitMs > 0) {
    const s = Math.ceil(Math.max(0, st.timeLimitMs - st.elapsedMs) / 1000);
    stats.push(["hud-timer", T("Time"), `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`]);
  }
  const statW = stats.reduce((a, [, k, v]) => a + tw(k, "stat-k") + 5 + tw(v, "stat-v") + 12, -12);
  const btnsW = (inRun ? 52 : 0) + 44;
  const brandW = tw("Merge Matrix", "brand");
  const twoRows = brandW + statW + btnsW + 32 + 32 > L.lw;
  const h = twoRows ? 104 : 60;
  draw.box(0, 0, f.width, L.oy + h * L.sc, "topbar");
  ui.place("topbar", { anchor: "top-start", x: 16, y: 8 }, () => {
    const statsRow = (): void => {
      ui.id("statusbar").row(T("Status"), () => {
        for (const [id, k, v] of stats) {
          ui.row(`${id}-pair`, () => {
            ui.style("stat-k").label(k);
            ui.style("stat-v").id(id).label(v);
          }, { spacing: 5, align: "center" });
        }
      }, { spacing: 12, align: "center" });
    };
    const buttons = (): void => {
      ui.row("top-actions", () => {
        if (inRun) {
          const hit = ui.style("icon-btn", { width: 44 }).id("btn-pause").button(T("Pause"), {
            content: () => { ui.widget("pause-glyph", { role: "none", size: { width: 14, height: 16 }, draw: (r) => {
              const w = r.width * 0.32;
              const ink = inkColor();
              draw.rect(r.x, r.y, w, r.height, ink);
              draw.rect(r.x + r.width - w, r.y, w, r.height, ink);
            } }); },
          });
          if (hit && !fresh(0)) openSheet();
        }
        const hit = ui.style("icon-btn", { width: 44 }).id("btn-settings-top").button(T("Settings"), { content: () => { ui.style({ text: { size: 18, align: "center" } }).label("⚙"); } });
        if (hit && !fresh(0)) openSheet();
      }, { spacing: 8, align: "center" });
    };
    ui.column("topbar-col", () => {
      ui.row("topbar-r1", () => {
        ui.style("brand").label("Merge Matrix");
        ui.spacer();
        if (!twoRows) statsRow();
        buttons();
      }, { width: L.lw - 32, height: 44, align: "center", spacing: 16 });
      if (twoRows) ui.row("topbar-r2", () => statsRow(), { width: L.lw - 32, height: 36, align: "center" });
    }, { spacing: 0 });
  });
  return h;
}

/** A screen (index.html .screen): a centred column at most 700 wide below the top bar, scrolling when taller. */
function page(key: string, L: Layout, top: number, build: (w: number, L: Layout) => void): void {
  const padY = 16;
  const outer = Math.min(700, L.lw - 32);
  const avail = L.lh - top - 2 * padY;
  const h = lastSize.get(key) ?? 0;
  const scroll = h > avail;
  const inner = outer - (scroll ? 14 : 0);
  ui.place(`page-${key}`, { anchor: "top", y: top + padY }, () => {
    const body = (): void => {
      const r = ui.column(`${key}-col`, () => build(inner, L), { width: inner, spacing: 12 });
      lastSize.set(key, r.height / L.sc);
    };
    if (scroll) ui.scrollArea(`${key}-scroll`, { width: outer, height: avail }, body, fresh(3) ? { scrollTo: { top: 0 } } : undefined);
    else body();
  });
}

// ------------------------------------------------------------------ title, modes, journey, learn, help
function titleScreen(w: number): void {
  const p = platform.progress;
  // The key art with the bobbing 2-2-4-8 hero tiles (decorative).
  const art = prefs().highContrast ? "title-art-plain" : "title-art";
  ui.style(art).column("title-art", () => {
    ui.row("title-hero", () => {
      const t = frame().time;
      const motion = !prefs().reducedMotion;
      ["2", "2", "4", "8"].forEach((d, i) => {
        ui.widget(`hero-${i}`, { role: "none", size: { width: 52, height: 64 }, draw: (r) => {
          const sc = r.width / 52;
          const dy = motion ? -8 * (0.5 - 0.5 * Math.cos(((t - i * 0.2) / 2.4) * 2 * Math.PI)) * sc : 0;
          draw.box(r.x, r.y + 6 * sc + dy, r.width, 52 * sc, "hero");
          const color = [accentColor(), "#3f8cff", "#ffe066", "#ff8c5a"][i]!;
          draw.text(d, r.x + r.width / 2, r.y + 6 * sc + dy + 12 * sc, { size: 22 * sc, weight: "800", align: "center", color });
        } });
      });
    }, { spacing: 8, align: "center", justify: "center", width: w });
  }, { width: w, align: "center", padding: { top: 28, bottom: 16 } } as ui.Layout);
  const mw = Math.min(416, w);
  if (app.resumable) para(T("A run is in progress."), w, "note", "resume-note");
  const list: Btn[] = [];
  if (app.resumable) list.push({ id: "btn-resume", text: T("Resume run"), cls: "primary", act: resumeRun });
  list.push(
    { id: "btn-play", text: T("Play"), cls: "primary", act: () => goTo("modes") },
    { id: "btn-daily", text: T("Daily challenge"), note: `· ${platform.utcDate()}`, act: startDaily },
    { id: "btn-journey", text: T("Journey"), note: T("{done}/40 stages", { done: p.journeyCompleted.length }), act: () => goTo("journey") },
    { id: "btn-learn", text: T("Learn"), act: () => goTo("learn") },
    { id: "btn-help", text: T("How to play"), act: () => goTo("help") },
  );
  if (!platform.signedIn()) list.push({ id: "btn-signin", text: account().signIn, act: signIn });
  if (platform.inviteLink()) list.push({ id: "btn-invite", text: account().invite, act: copyInvite });
  ui.row("menu-row", () => {
    ui.id("menu").column(T("Main"), () => { for (const b of list) button(b, mw); }, { width: mw, spacing: 8, align: "center" });
  }, { width: w, justify: "center" });
  const sync = platform.syncState();
  const who = platform.signedIn() ? platform.displayName(T("Player")) : T("Guest profile");
  const where = sync === "local" ? T("progress saves on this device") : sync === "saving" ? T("saving progress…")
    : sync === "offline" ? T("sync offline — progress saves on this device") : T("progress synced to your account");
  para(`${who} · ${where}`, w, "note", "profile-line");
}

const MODE_CARDS: ["practice" | "challenge" | "score", string, string][] = [
  ["practice", N("Practice"), N("Unranked. Pick a goal, undo allowed, restart freely.")],
  ["challenge", N("Challenge"), N("Move-limited runs. Beat the goal inside the budget.")],
  ["score", N("Score chase"), N("Seeded board, no undo. Compare on the leaderboard.")],
];
const MODE_RULES: Record<string, string> = {
  practice: N("Unranked · undo allowed · about 5–15 minutes · solo."),
  challenge: N("Unranked · constrained goal · undo allowed except speed · solo."),
  score: N("Ranked · shared seed · no undo · one board per difficulty."),
};
/** Cards in a grid of `min`-wide columns (CSS repeat(auto-fit, minmax(min, 1fr))). */
function cardGrid(id: string, w: number, min: number, n: number, cell: (i: number, cw: number) => void, gap = 11): void {
  const cols = Math.max(1, Math.min(n, Math.floor((w + gap) / (min + gap))));
  const cw = (w - gap * (cols - 1)) / cols;
  ui.grid(id, () => { for (let i = 0; i < n; i++) cell(i, cw); }, { columns: cols, gap, width: w, align: "stretch" });
}
function textCard(id: string, title: string, text: string, cw: number, act: (() => void) | null, selected = false): void {
  const face = (): void => {
    ui.column(`${id}-face`, () => {
      para(title, cw - 34, "card-title");
      para(text, cw - 34, "card-text");
    }, { width: cw - 34, spacing: 5 });
  };
  if (!act) { ui.style("card", { width: cw }).column(id, face, { width: cw }); return; }
  if (!firstId) firstId = id;
  const hit = ui.style("mode-card", { width: cw }).id(id).button(title, { content: face, selected });
  if (hit && !fresh(0)) act();
}
function modesScreen(w: number): void {
  heading("h2", T("Choose a mode"), w);
  cardGrid("mode-cards", w, 200, MODE_CARDS.length, (i, cw) => {
    const [mode, name, desc] = MODE_CARDS[i]!;
    textCard(`mode-${mode}`, T(name), T(desc), cw, () => { app.setup = mode; app.focusNext = "btn-mode-start"; app.openedFrame = frame().frame; }, app.setup === mode);
  });
  const mode = app.setup;
  if (mode) {
    ui.style("panel", { width: w }).id("mode-setup").column(T("Setup"), () => {
      const iw = w - 34;
      heading("h3", T("Setup"), iw);
      para(T(MODE_RULES[mode]!), iw, "note", "mode-rules");
      if (mode === "practice") {
        choice("practice-goal", T("Goal tile"), PRACTICE_GOALS.map(([, l]) => T(l)), app.practiceGoal, (i) => { app.practiceGoal = i; }, iw);
        choice("practice-size", T("Board"), PRACTICE_SIZES.map(([, l]) => T(l)), app.practiceSize, (i) => { app.practiceSize = i; }, iw);
      }
      if (mode === "challenge") choice("challenge-kind", T("Challenge"), CHALLENGES.map((c) => T(c.label)), app.challenge, (i) => { app.challenge = i; }, iw);
      para(mode === "score" ? T("Signed in, this result is posted to the high-score leaderboard.") : T("This run does not affect competitive rating."), iw, "note", "ranked-note");
      button({ id: "btn-mode-start", text: T("Start"), cls: "primary", act: startModeFromSetup }, iw);
      button({ id: "btn-mode-back", text: T("Back"), act: () => { app.setup = null; } }, iw);
    }, { width: w, spacing: 10 });
  }
  button({ id: "btn-modes-back", text: T("Back"), act: toMenu }, w);
}
function startModeFromSetup(): void {
  const mode = app.setup;
  if (mode === "practice") {
    const goal = PRACTICE_GOALS[app.practiceGoal]![0], size = PRACTICE_SIZES[app.practiceSize]![0];
    const p = practiceOptions(goal, size, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    startRun("practice", p.id, p.opts, false);
  } else if (mode === "challenge") {
    const c = CHALLENGES[app.challenge] ?? CHALLENGES[0]!;
    startRun("challenge", c.id, c.opts, false);
  } else if (mode === "score") startRun("challenge", SCORE_CHASE.id, SCORE_CHASE.opts, true);
}

function journeyScreen(w: number): void {
  const p = platform.progress;
  heading("h2", T("Journey"), w);
  para(T("Forty stages. Each band teaches one idea, combines it, then tests mastery every 8th stage."), w, "note");
  const gap = 8;
  const cols = Math.max(1, Math.floor((w + gap) / (64 + gap)));
  const cw = (w - gap * (cols - 1)) / cols;
  ui.id("journey-grid").grid(T("Journey"), () => {
    for (const s of content.JOURNEY) {
      const done = p.journeyCompleted.includes(s.index);
      const bits = [stageName(s), T("goal {n}", { n: s.goalTile }), `${s.size}×${s.size}`];
      if (s.moveLimit) bits.push(T("{n} moves max", { n: s.moveLimit }));
      bits.push(T("theme {name}", { name: T(content.THEMES.find((t) => t.id === s.theme)?.name ?? s.theme) }), done ? T("completed") : T("not completed"));
      const cls = done ? "jcell-done" : s.mastery ? "jcell-mastery" : "jcell";
      if (!firstId) firstId = `stage-${s.index + 1}`;
      const hit = ui.style(cls, { width: cw, height: cw }).id(`stage-${s.index + 1}`).button(bits.join(", "), {
        content: () => { ui.style(cls).label(String(s.index + 1)); },
      });
      if (hit && !fresh(0)) startStage(s);
    }
  }, { columns: cols, gap, width: w });
  button({ id: "btn-journey-back", text: T("Back"), act: toMenu }, w);
}

function learnScreen(w: number): void {
  heading("h2", T("Learn"), w);
  cardGrid("lesson-list", w, 200, content.LESSONS.length, (i, cw) => {
    const l = content.LESSONS[i]!;
    textCard(`lesson-${i + 1}`, `${l.index + 1}. ${T(l.title)}`, T(l.text), cw, () => startLesson(l));
  });
  button({ id: "btn-learn-back", text: T("Back"), act: toMenu }, w);
}

function helpScreen(w: number): void {
  heading("h2", T("How to play"), w);
  const cards: [string, string][] = [
    [T("Slide"), T("Arrow keys, WASD, swipe, or the on-board drag. Every block slides until it hits the edge or another block.")],
    [T("Merge"), T("Two blocks with the same number that collide combine into one of double value. Each block merges at most once per move.")],
    [T("New blocks"), T("After every valid move, a new 2 (90%) or 4 (10%) appears in a random empty cell, chosen by the run’s seed.")],
    [T("Scoring"), T("You score the value of every merge. Reaching the goal tile adds a milestone bonus; constrained modes add an efficiency bonus.")],
    [T("Losing"), T("The run ends when no move changes the board — a full grid with no adjacent equals.")],
    [T("Controls"), T("{slide}: slide · {undo}: undo (where allowed) · {hint}: hint · {pause}: pause · swipe or drag on the board · every action also has a button.", {
      slide: `${keysFor("up")} ${keysFor("left")} ${keysFor("down")} ${keysFor("right")}`, undo: keysFor("undo"), hint: keysFor("hint"), pause: keysFor("pause"),
    })],
    [T("Seeds & fairness"), T("Practice and Journey seeds are fixed. The daily seed is shared per UTC day, so everyone plays the same board.")],
  ];
  cardGrid("help-cards", w, 200, cards.length, (i, cw) => textCard(`help-${i}`, cards[i]![0], cards[i]![1], cw, null));
  button({ id: "btn-help-back", text: T("Back"), act: toMenu }, w);
}

// ------------------------------------------------------------------ results
function resultsScreen(w: number): void {
  const st = run.state, r = app.result;
  if (!st || !r) return;
  const art = prefs().highContrast ? "results-plain" : "results-art";
  const iw = w - 32;
  ui.style(art, { width: w }).column("results-box", () => {
    heading("h2", T("Results"), iw);
    para(resultsHeadline(), iw, "headline", "results-headline");
    const tw2 = Math.min(iw, 260);
    ui.id("score-table").column(T("Score breakdown"), () => {
      const rows: [string, string, number][] = [["res-merge", N("Merge points"), st.score.mergePoints], ["res-milestone", N("Milestone bonus"), st.score.milestoneBonus], ["res-efficiency", N("Efficiency bonus"), st.score.efficiencyBonus]];
      for (const [id, k, v] of rows) scoreRow(id, T(k), String(v), tw2, "score-k", "score-v", "score-row");
      scoreRow("res-total", T("Total"), String(r.total), tw2, "total-k", "total-k", "score-total");
    }, { width: tw2 });
    para(T("{moves} moves · {invalid} invalid attempts · largest block {max} · seed {seed} · replay hash {hash}",
      { moves: st.moves, invalid: st.invalidActions, max: st.maxTile, seed: st.seed, hash: rules.stateHash(st) }), iw, "note", "res-detail");
    if (r.newAch.length) {
      const names = r.newAch.map((k) => T(content.ACHIEVEMENTS.find((a) => a.key === k)?.name ?? k)).join(", ");
      para(T("Achievement unlocked: {names}", { names }), iw, "note-good", "res-achievements");
    }
    para(r.total > r.prevBest ? T("New personal best for this board.") : T("Personal best here: {n}.", { n: r.prevBest }), iw, "note", "res-compare");
    if (run.mode === "daily") {
      para(platform.signedIn() ? T("Daily score kept as your personal best and synced to your account.") : T("Daily score stored locally as your personal best."), iw, "note", "res-board-note");
    }
    const lb = lbLine();
    if (lb) para(lb, iw, "note", "res-lb");
    button({ id: "btn-retry", text: T("Retry"), cls: "primary", act: retry }, iw);
    if (r.next) button({ id: "btn-next", text: r.next.kind === "learn" ? T("Next lesson") : T("Next stage"), act: next }, iw);
    button({ id: "btn-results-menu", text: T("Menu"), act: toMenu }, iw);
  }, { width: w, spacing: 12 });
}
function scoreRow(id: string, k: string, v: string, w: number, kc: string, vc: string, rowCls: string): void {
  ui.style(rowCls, { width: w }).row(id, () => {
    para(k, w - 90, kc);
    ui.spacer();
    ui.style(vc).id(`${id}-v`).label(v);
  }, { width: w, align: "center" });
}

// ------------------------------------------------------------------ play
function playScreen(L: Layout, top: number): void {
  const f = frame();
  const st = run.state!;
  const pad = 16, gap = 13;
  const left = options.leftHanded;
  let pf: { x: number; y: number; w: number; h: number };
  if (!options.render3d) draw.box(0, L.oy + top * L.sc, f.width, f.height, "page");
  if (L.desktop || L.landscape) {
    const railW = L.desktop ? 220 : Math.min(140, Math.max(110, L.lw * 0.17));
    const y = top + pad;
    const h = L.lh - y - pad;
    pf = { x: pad + railW + gap, y, w: L.lw - 2 * pad - 2 * (railW + gap), h };
    sideRail(left ? "right" : "left", pad, y, railW, h, L, objectiveRail, "top-start");
    sideRail(left ? "left" : "right", pad, y, railW, h, L, actionRail, "top-end");
  } else {
    // Compact (the media query ≤ 1023 px): the objective above the board, the actions below.
    const inner = L.lw - 2 * pad;
    const topKey = left ? "rail-bottom" : "rail-top";
    const bottomKey = left ? "rail-top" : "rail-bottom";
    const th = lastSize.get(topKey) ?? 60, bh = lastSize.get(bottomKey) ?? 60;
    const y0 = top + 8;
    pf = { x: pad, y: y0 + th + 8, w: inner, h: Math.max(120, L.lh - y0 - th - bh - 24) };
    ui.place(topKey, { anchor: "top-start", x: pad, y: y0 }, () => {
      const r = ui.column(`${topKey}-col`, () => (left ? actionRow(inner) : objectiveRow(inner)), { width: inner, spacing: 6 });
      lastSize.set(topKey, r.height / L.sc);
    });
    ui.place(bottomKey, { anchor: "top-start", x: pad, y: pf.y + pf.h + 8 }, () => {
      const r = ui.column(`${bottomKey}-col`, () => (left ? objectiveRow(inner) : actionRow(inner)), { width: inner, spacing: 6, align: "center" });
      lastSize.set(bottomKey, r.height / L.sc);
    });
  }
  const sc = L.sc, wx = L.ox + pf.x * sc, wy = L.oy + pf.y * sc, ww = Math.max(1, pf.w * sc), wh = Math.max(1, pf.h * sc);
  boardRect.x = wx; boardRect.y = wy; boardRect.w = ww; boardRect.h = wh;
  if (options.render3d) {
    render.setPlayfield(wx, wy, ww, wh);
    // The scene shows through the playfield; the page colour around it.
    draw.box(0, L.oy + top * L.sc, f.width, wy - L.oy - top * L.sc, "page");
    draw.box(0, wy + wh, f.width, f.height - wy - wh, "page");
    draw.box(0, wy, wx, wh, "page");
    draw.box(wx + ww, wy, f.width - wx - ww, wh, "page");
    ui.target(T("Merge Matrix board"), { x: wx, y: wy, width: ww, height: wh }, { role: "label" });
    render.cellRects().forEach((row, r) => row.forEach((rect, c) => {
      ui.id(`cell-${r}-${c}`).target(cellLabel(st.board[r]![c]!, r, c), rect, { role: "label" });
    }));
  } else {
    ui.target(T("Merge Matrix board"), { x: wx, y: wy, width: ww, height: wh }, { role: "label" });
    flatBoard(pf, L);
  }
  if (app.countdown) {
    draw.box(wx, wy, ww, wh, "dim");
    draw.text(String(app.countdown.n), wx + ww / 2, wy + wh / 2 - 40 * sc, { size: 64 * sc, weight: "900", align: "center", color: accentColor() });
  }
}

/** The flat board (the 3D board off: index.html #dom-board.dom-primary): cells with their numbers in the theme's colours. */
function flatBoard(pf: { x: number; y: number; w: number; h: number }, L: Layout): void {
  const st = run.state!;
  const t = themeNow();
  const n = st.size;
  const side = Math.max(60, Math.min(pf.w * 0.98, pf.h * 0.98, n * 96));
  const g = 8;
  const cw = (side - 2 * g - (n - 1) * g) / n;
  ui.place("dom-board", { anchor: "top-start", x: pf.x + (pf.w - side) / 2, y: pf.y + (pf.h - side) / 2 }, () => {
    ui.style("board-flat", { width: side, height: side, padding: g }).id("dom-board-grid").grid(T("Board"), () => {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const v = st.board[r]![c]!;
        ui.id(`cell-${r}-${c}`).widget(cellLabel(v, r, c), { role: "image", size: { width: cw, height: cw }, draw: (rect) => {
          draw.roundRect(rect.x, rect.y, rect.width, rect.height, 10 * L.sc, v === 0 ? t.cell : render.tileColorOf(t, v));
          if (v) {
            const size = Math.min(rect.height * 0.42, rect.width * (v >= 1000 ? 0.28 : v >= 100 ? 0.34 : 0.42));
            draw.text(String(v), rect.x + rect.width / 2, rect.y + (rect.height - size * 1.2) / 2, { size, weight: "800", align: "center", color: t.textLight ? "#ffffff" : "#1b2540" });
          }
        } });
      }
    }, { columns: n, gap: g, width: side });
  });
}

function sideRail(key: string, x: number, y: number, w: number, h: number, L: Layout, build: (w: number) => void, anchor: "top-start" | "top-end"): void {
  const natural = lastSize.get(key) ?? 0;
  const scroll = natural > h;
  const inner = w - 16 - (scroll ? 14 : 0);
  ui.place(key, { anchor, x, y }, () => {
    const body = (): void => {
      const r = ui.column(`${key}-col`, () => build(inner), { width: inner, spacing: 8, padding: 8 } as ui.Layout);
      lastSize.set(key, r.height / L.sc);
    };
    if (scroll) ui.scrollArea(`${key}-scroll`, { width: w, height: h }, body);
    else body();
  });
}

function objectiveText(): { text: string; progress: string } {
  const st = run.state!;
  const goal = T("Reach a {n} block.", { n: st.goalTile }) +
    (st.moveLimit > 0 ? " " + T("Moves left: {n}.", { n: Math.max(0, st.moveLimit - st.moves) }) : "") +
    (st.timeLimitMs > 0 ? " " + T("Time limit {n}s.", { n: Math.ceil(st.timeLimitMs / 1000) }) : "");
  return { text: goal, progress: T("Largest block: {max} · {n} legal directions", { max: st.maxTile, n: rules.legalMoves(st).length }) };
}
/** The left rail (index.html .rail-left): the objective, its progress and the lesson box. */
function objectiveRail(w: number): void {
  const o = objectiveText();
  heading("h3", T("Objective"), w);
  para(o.text, w, "p", "objective-text");
  para(o.progress, w, "note", "objective-progress");
  lessonBox(w);
}
function objectiveRow(w: number): void {
  const o = objectiveText();
  const hw = tw(T("Objective"), "h3", "heading");
  if (hw + 10 + tw(o.text, "note") <= w) {
    ui.row("objective-row", () => { ui.style("h3").heading(T("Objective")); ui.style("p", { text: { size: 14 } }).id("objective-text").label(o.text); }, { spacing: 10, align: "center" });
  } else { heading("h3", T("Objective"), w); para(o.text, w, "note", "objective-text"); }
  para(o.progress, w, "note", "objective-progress");
  lessonBox(w);
}
function lessonBox(w: number): void {
  const l = run.lesson;
  if (!l || run.mode !== "learn" || run.state?.over) return;
  ui.style("panel", { width: w }).id("lesson-box").column(T(l.title), () => {
    para(T(l.title), w - 34, "h3", "lesson-title");
    para(T(l.text), w - 34, "p", "lesson-text");
  }, { width: w, spacing: 6 });
}
function actionButtons(kbd = true): Btn[] {
  const st = run.state!;
  const k = (a: string): string | undefined => (kbd ? keysFor(a) : undefined);
  return [
    { id: "btn-undo", text: T("Undo"), ...(kbd ? { kbd: k("undo")! } : {}), cls: "small", disabled: !st.allowUndo || st.undoStack.length === 0 || st.over, act: doUndo },
    { id: "btn-hint", text: T("Hint"), ...(kbd ? { kbd: k("hint")! } : {}), cls: "small", act: doHint },
    { id: "btn-restart", text: T("Restart"), cls: "small", act: restartRun },
    { id: "btn-leave", text: T("Leave"), cls: "danger", act: leaveRun },
  ];
}
/** The right rail (index.html .rail-right): the action buttons, the hint and warning panels, the Daily's leaderboard. */
function actionRail(w: number): void {
  ui.id("rail-actions").column(T("Actions"), () => { for (const b of actionButtons(w >= 180)) button(b, w); }, { width: w, spacing: 12 });
  railPanels(w);
}
function actionRow(w: number): void {
  flow("rail-actions", actionButtons(), w, 10, "center");
  railPanels(w);
}
function railPanels(w: number): void {
  if (app.hint) ui.style("panel", { width: w }).id("hint-box").column(app.hint(), () => para(app.hint!(), w - 34, "p", "hint-text"), { width: w });
  if (app.invalid) ui.style("panel-warn", { width: w }).id("invalid-box").column(app.invalid(), () => para(app.invalid!(), w - 34, "warn-text", "invalid-text"), { width: w });
  if (app.lbPanel) {
    ui.style("panel", { width: w }).id("friends-panel").column(T("Leaderboard"), () => {
      heading("h3", T("Leaderboard"), w - 34);
      const rows = app.lbRows;
      if (rows) rows.forEach((e, i) => para(`${e.name}: ${e.score}`, w - 34, "p", `lb-${i}`));
      else {
        para(T("Personal best: {n}", { n: platform.progress.bestScores[run.contentId] ?? 0 }), w - 34, "p", "lb-best");
        para(T("(global leaderboard unavailable — local records only)"), w - 34, "note", "lb-none");
      }
    }, { width: w, spacing: 6 });
  }
}

// ------------------------------------------------------------------ the pause / settings sheet
const OPTION_CHECKS: [keyof platform.Options, string][] = [
  ["captions", N("Captions for sounds")], ["render3d", N("3D board (WebGL)")], ["leftHanded", N("Left-handed action rail")], ["haptics", N("Haptics on touch")],
];
function sheet(L: Layout): void {
  const f = frame();
  const inRun = app.screen === "play" && !!run.state && !run.finished;
  // The scrim takes the pointer over the whole window (index.html .overlay), so nothing under it is pressed.
  ui.place("sheet-scrim", { anchor: "top-start", x: 0, y: 0 }, () => {
    ui.style("scrim", { width: L.lw, height: L.lh }).column("sheet-scrim-box", () => undefined, { width: L.lw, height: L.lh });
  });
  void f;
  const outer = Math.min(448, L.lw - 32);
  const avail = L.lh - 32;
  const h = lastSize.get("sheet") ?? 0;
  const scroll = h + 40 > avail;
  const inner = outer - 40 - (scroll ? 14 : 0);
  ui.place("sheet", "center", () => {
    ui.style("sheet", { width: outer }).id("overlay-pause").column(inRun ? T("Paused") : T("Settings"), () => {
      const body = (): void => {
        const r = ui.column("sheet-col", () => sheetBody(inner - 10, inRun), { width: inner, spacing: 10, padding: 5 });
        lastSize.set("sheet", r.height / L.sc);
      };
      if (scroll) ui.scrollArea("sheet-scroll", { width: outer - 40, height: avail - 40 }, body, fresh(3) ? { scrollTo: { top: 0 } } : undefined);
      else body();
    }, { width: outer });
  });
}
function sheetBody(w: number, inRun: boolean): void {
  heading("h2", inRun ? T("Paused") : T("Settings"), w);
  button({ id: "btn-resume-play", text: inRun ? T("Resume") : T("Close"), cls: "primary", act: closeSheet }, w);
  heading("h3", T("Audio"), w);
  checks(w, OPTION_CHECKS.slice(0, 1));
  heading("h3", T("Graphics"), w);
  const themes = content.THEMES.filter((t) => t.id !== "mono");
  const ti = Math.max(0, themes.findIndex((t) => t.id === options.theme));
  choice("set-theme", T("Theme"), themes.map((t) => T(t.name)), ti, (i) => platform.setOption("theme", themes[i]!.id), w);
  checks(w, OPTION_CHECKS.slice(1, 2));
  heading("h3", T("Accessibility & controls"), w);
  checks(w, OPTION_CHECKS.slice(2));
  para(T("Sound, graphics quality, language, reduced motion, high contrast and larger text are in the StarHermit Options."), w, "note", "options-note");
  flow("sheet-options", [
    { id: "btn-options", text: T("Audio, graphics & accessibility"), cls: "small", act: () => openMenu() },
    { id: "btn-rebind", text: T("Controls"), cls: "small", act: () => requestRebind() },
    { id: "btn-replay-tutorial", text: T("Replay tutorial"), cls: "small", act: replayTutorial },
  ], w, 10);
  if (inRun) {
    flow("pause-run-actions", [
      { id: "btn-pause-restart", text: T("Restart run"), act: restartRun },
      { id: "btn-pause-leave", text: T("Leave run"), cls: "danger", act: leaveRun },
    ], w, 10);
  }
}
function checks(w: number, list: [keyof platform.Options, string][]): void {
  ui.column(`checks-${list[0]![0]}`, () => {
    for (const [key, label] of list) {
      const cur = !!options[key];
      const nxt = ui.id(`set-${key}`).checkbox(T(label), cur);
      if (nxt !== cur && !fresh(0)) platform.setOption(key, nxt as never);
    }
  }, { spacing: 2, width: w });
}

// ------------------------------------------------------------------ caption and toast
function caption(L: Layout): void {
  const c = app.caption;
  if (!c) return;
  const text = `♪ ${c.text}`;
  const w = Math.min(L.lw - 32, tw(text, "caption-text") + 28);
  ui.place("caption-line", { anchor: "bottom", y: 8 }, () =>
    ui.style("caption", { width: w }).row("caption-row", () => para(text, w - 26, "caption-text", "caption-text", true), { width: w, align: "center" }));
}
function toast(L: Layout): void {
  const t = app.toast;
  if (!t) return;
  const text = t.text();
  const w = Math.min(L.lw * 0.92, 420);
  ui.place("toast", { anchor: "bottom", y: 16 }, () => ui.style("toast", { width: w }).column("toast-col", () => para(text, w - 34, "p", "sh-toast", true), { width: w, align: "center" }));
}

