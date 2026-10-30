# Merge Matrix — Game Design Document (running spec)

This document describes the game as it ships today. Present tense means implemented and
reachable from the UI. Anything deliberately designed but not yet built is confined to
§17 "Design intent not yet implemented".

---

## 1. Overview

**Pitch.** Slide a glass matrix, fuse equal blocks, and push one signal deeper than the
grid can hold — with a seeded board that anyone can replay move for move.

| Field | Value |
|---|---|
| Genre | Deterministic slide-and-merge number puzzle (2048 lineage, seeded/verified) |
| Players | 1, with asynchronous daily comparison |
| Session length | 3–6 min (lesson or challenge), 8–20 min (2048 practice run) |
| Platforms | StarHermit engine script game (engine 1.30.0, host API 1.32, `engine.minor=32`): natively in the StarHermit client and in desktop and mobile browsers on the engine's web runtime; portrait and landscape |
| Rendering | `starhermit:scene` (three.js r185 parity) 3D board drawn into the playfield between the `starhermit:ui` top bar and rails; a flat board drawn in the UI when the 3D board is switched off |
| Build | TypeScript run directly by the runtime (`engine.entry=native/main.ts`); `tsc --noEmit` type-checks against `.starhermit/starhermit.d.ts`; `npm run package` writes the web loader `index.html` and `starhermit-files.json` |

### File map

| Path | Responsibility |
|---|---|
| `starhermit.txt` | Manifest: engine pin, capabilities (platform, storage, clipboard), `control.*` keys and `engine.gamepad.*` pad defaults, `server=score-script.js`, cover |
| `index.html`, `starhermit-files.json` | The web loader and the file index, written by `npm run package` (never edited by hand) |
| `native/main.ts` | Entry: the run (command path, undo, clock, countdown, lesson rules, results, records, achievements, leaderboard post), snapshot, screen state, input (actions, swipes), lifecycle |
| `native/screens.ts` | The whole UI in `starhermit:ui`: top bar, title, modes + setup, journey, learn, help, results, play layouts and rails, flat board, pause/settings sheet, caption, toast |
| `native/render.ts` | The 3D board on `starhermit:scene`: slab, instanced cells, tiles with canvas number textures, lights, environment, ground grid, particles, pop/pulse/glow/shake, camera framing into the playfield, accessibility cell rectangles |
| `native/quality.ts` | The old four presets and budgets keyed by the runtime's quality tier and level |
| `native/audio.ts` | Authored clips per event, rendered music notes and ambience loop, captions |
| `native/platform.ts` | Save (`saves`) with foreign-save migration and conflict merge, device snapshot, game options (`settings`) with legacy-KV migration, player, invite, platform clock, leaderboard read and score post |
| `native/i18n.ts`, `native/style.ts` | `T()` over `lang/strings.js` in the runtime's interface language; the converted style sheet and the theme tokens |
| `src/rules.ts` | Pure rules engine: board, slide/merge, scoring, RNG, undo, replay envelope, daily seed (unchanged from the browser build) |
| `src/content.ts` | Versioned content: 5 themes, 3 lessons, 40 journey stages, 5 achievements, offline stage validator |
| `src/modes.ts` | Practice/Challenge/Score chase/Daily options, the hint, board counts, the move diff |
| `src/progress.ts` | Progress record, merge, save document, foreign-save and legacy-option readers, snapshot check, achievements |
| `src/sh-strings.ts` | Account strings (sign-in, invite, toasts, the results leaderboard line) in the nine locales |
| `lang/strings.js` | Translation tables (English keys, nine locales), a classic script the engine loads with `loadClassic` |
| `assets/ui-style.json` | The UI styles, converted from `tools/ui-style.css` by `npm run css` (`starhermit css`) |
| `score-script.js` | StarHermit platform script (`server=`): range-checks a ranked run's total and posts it to the `high-score` leaderboard |
| `server.js` | Local static host from the browser build (not part of the package); its legacy `/api/v1` routes are not called |
| `tests/` | `rules.test.mjs`, `progress.test.mjs`, `i18n.test.mjs` (node --test), `native.mjs` (tsc, `starhermit check`, the `tests/native/*.play` render checks, web index up to date) |
| `tools/` | `package-web.mjs`, `css.mjs`, `browser-play.mjs` (GPU Chrome play of the web package), `ui-style.css` |
| `sfx/` | 17 Opus clips, `manifest.txt` (canonical), `manifest.json`, `manifest.md` |
| `assets/` | FLUX key art for the title and results screens |
| `coverart.png`, `cover.jpg`, `icon.png`, `favicon.*` | Platform art |

---

## 2. Vision and design pillars

**1. The board is provable.** Every run is a seed plus an ordered list of four directions.
`buildReplay`/`verifyReplay` re-derive every intermediate state hash, and the server refuses a
daily score it cannot reproduce. *Rules in:* seeded spawns, a state hash on the results screen,
server-side replay validation. *Rules out:* any hidden difficulty adjustment, any bonus the
client alone can mint, cosmetic randomness that touches simulation state.

**2. One direction, one whole thought.** A move resolves the entire grid at once; there is no
sub-turn, no selection, no aim. *Rules in:* four inputs plus undo/hint/pause, a 120 ms
per-direction debounce, gamepad and swipe parity. *Rules out:* drag-a-single-tile mechanics,
timed reflex inputs outside the one explicit Speed challenge.

**3. Glass you can still read.** The 3D board is the hero, but the number on a tile is the
information; the accessibility tree names every cell with its number at all times.
*Rules in:* per-value label textures baked at 256², a top-face-only number, high-contrast and
3D-off switches that never change the rules. *Rules out:* value encoded only by hue, effects
that occlude a tile face, motion that must finish before the next input is accepted.

**4. Teach by requiring the action.** Lessons complete when the player performs the thing
being taught — three slides, one merge, a 32 tile — not when they dismiss a panel.
*Rules in:* the three-lesson Learn track, forty journey stages on a teach → combine → test
arc, contextual hints on demand. *Rules out:* modal tutorial walls, forced tutorial on boot.

**5. A run should end with an explanation.** Results itemise merge points, milestone bonus and
efficiency bonus with the seed and replay hash next to them. *Rules out:* an unexplained total,
a leaderboard entry the player cannot reconstruct.

---

## 3. Player experience

**Target player.** Someone who already knows the slide-and-merge idiom and wants either a
five-minute constrained puzzle or a long 2048 climb they can compare against a shared board.

**First 60 seconds.** Boot lands on the title with the key-art hero and six choices, `Play`
focused first. *How to play* opens seven generated cards (slide, merge, new blocks, scoring,
losing, controls, seeds) before any commitment. *Learn* offers three lessons whose text states
the exact completion condition; the first is satisfied by three legal slides. From a cold start
the shortest path to a moving board is two clicks (`Journey` → stage 1, or `Play` → `Start`),
and every run opens with a 3-2-1 countdown (skipped under reduced motion) that also gives the
audio a first gesture-unlocked beat.

**Session shape.** Title → mode or stage → countdown → a stream of directional inputs with
undo/hint available where the mode allows → terminal state → results with breakdown, personal
best comparison, achievements, and `Retry` / `Next stage` / `Menu`. Leaving mid-run persists a
snapshot; the title then offers `Resume run`.

**Emotional beat.** The moment a long-tended corner column collapses in one direction and the
board's largest number doubles — carried by the four-stage merge sample set, the camera glow
pulse, and the tile pop.

---

## 4. Core loop and rules contract

Owner of all of this: `src/rules.ts` (mirrored for validation in `server.js`).

### Board and entities

* `board: number[][]`, `size × size`, `0` = empty. Size is clamped to 2–8 (`createGame`);
  the UI exposes 3, 4 and 5.
* Two starting tiles are spawned from the seeded stream before the first input.
* `GameState` also carries `moves`, `score` (3 components), `invalidActions`, `rngState`,
  `won`, `over`, `terminalReason`, `maxTile`, `undoStack` (≤ 64), `log`, `elapsedMs`.

### Legal actions

`up`, `down`, `left`, `right` (`DIRS`), plus `undo` where `allowUndo` is set. A direction is
legal only if it changes the board: `legalMoves()` filters `DIRS` by `peekMove().changed`.

### Resolution order (`applyMove`)

1. Reject if `over` (`game-over`), if the direction is not in `DIRS` (`bad-direction`), or if
   `moveLimit > 0 && moves >= moveLimit` (`move-limit`).
2. `peekMove` slides every line toward the move direction. Per line (`slideLine`): drop zeros,
   then scan forward merging a pair of equal neighbours into their double — **each tile merges
   at most once per move** — then pad with zeros.
3. If nothing changed: `invalidActions++`, return `no-move`. No tile spawns, no turn is spent.
4. Push an undo snapshot (board, score, `rngState`, `moves`, `maxTile`) when undo is allowed.
5. Commit the board, add the sum of merged values to `score.mergePoints`.
6. Spawn one tile into a uniformly chosen empty cell: `2` with p=0.9, `4` with p=0.1, drawn
   from the run's `Rng` (mulberry32 over a single uint32 state, so the whole RNG serialises).
7. `moves++`, append a `MoveRecord` (dir, gained, merge value/count pairs, spawn cell/value).
8. If `maxTile >= goalTile` and not already won: set `won`, add `goalTile * 10` to
   `milestoneBonus`, and if `moveLimit > 0` add `(moveLimit - moves) * 25` to `efficiencyBonus`.
9. `checkTerminal`.

### Scoring

```
total = mergePoints + milestoneBonus + efficiencyBonus      (rules.ts: scoreTotal)
mergePoints      = Σ value of every tile produced by a merge
milestoneBonus   = goalTile × 10, once, on first reaching the goal
efficiencyBonus  = max(0, moveLimit − moves) × 25, only in move-limited modes
```

*Worked example — Journey stage 1 (`seed 1000`, 4×4, goal 128), the exact run
`tests/native/journey.play` produces by sliding left, down, right, up in turn:* 169 moves (2 refused)
accumulate `mergePoints = 1648`; reaching 128 adds `128 × 10 = 1280`; the stage is unlimited so
`efficiencyBonus = 0`; **total 2928**, shown as three rows plus a bold total, with
`seed 1000 · replay hash 301aca67` beneath.

### Terminal states (`checkTerminal`, `tick`)

| Condition | `over` | `terminalReason` | Results headline |
|---|---|---|---|
| `moveLimit` reached | yes | `move-limit-exhausted` (or `goal-reached` if won) | "Out of moves" |
| No legal direction | yes | `board-full` (or `goal-reached`) | "Matrix full — run over" |
| `elapsedMs >= timeLimitMs` | yes | `time-expired` (or `goal-reached`) | "Time expired" |
| Goal reached, run continues | no | — | play continues; ending later reports `goal-reached` |

Reaching the goal does **not** end the run: `won` is latched and play continues until one of
the three terminal conditions fires. Results headline reads `Milestone reached — <goal>!`
whenever `won`.

### Tie-breaks (server leaderboard, `server.js`)

`score` desc → `invalidActions` asc → `elapsedMs` asc → stable session id.

### RNG, determinism, replay

One `Rng` per run; its `state` lives inside `GameState`, so a serialized snapshot resumes with
an identical future. `stateHash` is an FNV-1a mix of size, moves, rngState, total, maxTile,
over-flag and every cell. `buildReplay(opts, commands)` re-simulates from the seed and records
a hash after each command; `verifyReplay` re-runs and rejects on the first mismatch, on a
rules-version mismatch, or on a differing terminal reason/score.

### Undo and hints

`undo()` pops the snapshot, restores state, drops the last log entry, and recomputes `won` from
`maxTile`. It is refused after game over and in modes with `allowUndo: false` (Daily, Score
chase, Speed challenge, Journey mastery stages). `ui.computeHint` scores every legal direction
by `gained × 100 + resulting empty cells` and names the winner ("Try up — frees 14 cells with
the best immediate merges"); it uses the same `peekMove` the rules use, never a private oracle.

---

## 5. Modes and progression

| Mode | Content id | Board | Goal | Constraint | Undo | Ranked |
|---|---|---|---|---|---|---|
| Learn (3 lessons) | `lesson-slide` / `-merge` / `-survive` | 4×4 | 64 / 64 / 32 | completion condition per lesson | yes | no |
| Journey (40 stages) | `j01`…`j40` | 4×4, 5×5 late | 128→4096 | move limit on some | no on mastery stages | no |
| Daily | `daily-YYYY-MM-DD` | 4×4 | 2048 | none | **no** | yes (server-validated) |
| Practice | `practice-<goal>-<size>` | 3×3, 4×4, 5×5 | 512/1024/2048/4096 | none | yes | no |
| Challenge — moves | `challenge-moves` | 4×4 | 512 | 60 moves | yes | no |
| Challenge — moves hard | `challenge-moves-hard` | 4×4 | 1024 | 100 moves | yes | no |
| Challenge — speed | `challenge-speed` | 4×4 | 256 | 120 s | **no** | no |
| Challenge — wide | `challenge-wide` | 5×5 | 2048 | none | yes | no |
| Score chase | `score-chase` | 4×4, seed 90210 | 4096 | none | **no** | flagged ranked |

**Journey curve** (`content.journeyStages`): stage `i` (0-based) sits in band
`floor(i/8)`; band goals are `[128, 256, 512, 1024, 2048]`. Every 8th stage is a **mastery**
stage: goal doubled, undo disabled, drawn with an accent border. From band 2, every third stage
adds a move limit of `par + 20` where `par = 40 + band·30 + (size−4)·30`. In band 4 the odd
stages widen the board to 5×5. Seeds are `1000 + i·7919`; the theme cycles through the five
themes by `i % 5`. Stage completion is stored by index in `progress.journeyCompleted`, and the
journey grid marks completed cells and exposes name/goal/size/limit/theme in `aria-label`.

**Daily.** `dailySeed('YYYY-MM-DD')` is an FNV-1a hash of `merge-matrix-daily:<day>`, identical
in client and server, so every player gets the same board. The day comes from the platform's
clock (`serverNow`) once it answers, else the device's UTC date.

**Achievements** (`content.ACHIEVEMENTS`, granted in `progress.evaluateAchievements`, idempotent
per key with an unlock timestamp): First Light (first win), Matrix Adept (mastery stage),
Seven-Day Circuit (7 distinct daily days), Deep Signal (a 4096 tile), Long Haul (20 stages).

**Content validation.** `validateStage` runs offline in the test suite: every stage must have
sane fields, a legal first move, and must be driven to its goal (or a legitimate move-limit
ending) by a rotating deterministic policy inside 4000 simulated moves.

---

## 6. Controls and interaction

| Input | Keyboard | Touch / mouse | Gamepad |
|---|---|---|---|
| Slide | ↑ ↓ ← → or W A S D | swipe or drag on the board (≥ 24 px) | D-pad or left stick |
| Undo | `Z` / `Undo` button | `Undo` button | North |
| Hint | `H` / `Hint` button | `Hint` button | West |
| Pause / settings | `Esc` or `P`, the pause and ⚙ buttons | pause and ⚙ buttons | Start or East |
| Restart / leave | rail buttons and pause sheet | same | focus + South |
| Navigate menus | Tab / arrows + Enter/Space | tap or click | D-pad + South |

Every action is a manifest action (`control.*`, `engine.gamepad.*`); players rebind keys and pads
in the runtime's Options (the sheet's **Controls** button opens them), and the Help card and the
Undo/Hint key chips show the effective keys. F1 always opens the runtime's own menu.

**Input locking.** Slides apply only on the play screen with the sheet closed. The same refused
direction on the same turn is ignored for 120 ms, so a held key or double tap cannot double-count.
While a rail button has key focus (Tab), the arrows move UI focus; WASD and the pad still slide,
and a click or tap on a rail button hands the arrows back to the board. Swipes are decided after
the frame's UI is built, so a press on a widget is the widget's; a gesture under 24 px is a tap
and moves nothing. A hidden window opens the pause sheet.

**Feedback for every input.** Accepted move → tick + slide sample, board update, top-bar
score/moves refresh, a screen-reader announcement including a board summary, and a 10 ms
vibration when haptics are on. Merge → a merge sample by value tier, a tile pulse, and a glow
pulse (with a little camera shake) proportional to the points gained. Illegal direction →
`blocked-thud`, a red warning panel naming the direction, and an announcement. Undo → whoosh.
Hint → ping and the hint panel.

---

## 7. Screens and UI flow

Screens: title, modes, journey, learn, play, results, help, plus the pause/settings sheet over any
of them. Each opens with focus on its first control (the results on Retry) and at its top; tall
screens scroll inside their own column.

```
title ─┬─ help ────────────────► title
       ├─ modes → setup panel → play
       ├─ journey (40 cells) ──► play
       ├─ learn (3 lessons) ───► play
       ├─ daily challenge ─────► play
       └─ resume run ──────────► play
play ↔ pause sheet (the settings sheet from any other screen via ⚙)
play → results → retry | next stage / next lesson | menu
```

The top bar shows the brand, Score / Best / Moves (and Time in the speed challenge), the pause
button in a run and ⚙; when it does not fit on one line the numbers take a second row.

**Desktop play layout (≥ 1024 logical px).** Rails 220 px wide at the sides: objective, progress
and lesson box on the left, the action buttons and the hint / warning / Daily leaderboard panels
on the right; the board fills the middle. Left-handed swaps the rails.

**Compact portrait (< 1024 px).** The objective sits above the board, the action buttons (wrapping,
centred) and panels below it; left-handed swaps the two.

**Landscape phone.** Narrow side rails (110–140 px); each scrolls on its own, so the hint panel stacks
under the buttons.

**Never cut off:** the top bar wraps; the whole board stays in the playfield (the 3D camera retreats
and tilts toward overhead as the aspect narrows; the flat board fits the smaller side); every screen
and the sheet scroll when taller than the window. Safe-area insets pad the layout. The runtime's
interface and text size (Options › Accessibility) scale everything.

---

## 8. Art direction

**Palette** — five themes in `content.THEMES`, applied to both CSS custom properties and the
Three.js materials:

| Theme | bg | grid | cell | accent | Character |
|---|---|---|---|---|---|
| Dark Matrix (default) | `#0a0e1a` | `#131b2e` | `#1d2942` | `#41d9c0` | Cool navy glass, cyan-to-magenta value ramp |
| Ember Glass | `#170d0a` | `#241310` | `#331b16` | `#ffb84d` | Warm coal and amber |
| Verdant Circuit | `#0a140d` | `#11241a` | `#183325` | `#5ee6a8` | Green board-trace |
| High Contrast | `#000000` | `#111111` | `#222222` | `#ffffff` | Forced by the high-contrast setting |
| Light Paper | `#e8e6df` | `#d4d1c6` | `#c2beb1` | `#3056a3` | The only light theme; dark text |

Value ramp (Dark Matrix): 2 `#22407a`, 4 `#2b5cb8`, 8 `#3f8cff`, 16 `#37b6ff`, 32 `#41d9c0`,
64 `#5ee6a8`, 128 `#ffe066`, 256 `#ffb84d`, 512 `#ff8c5a`, 1024 `#ff5a7a`, 2048 `#e14dff`,
4096 `#9d5cff` — cold to hot as the number grows; anything above the table reuses the top
colour. Danger `#ff5a7a`, muted text `#9aa7c4`.

**Shape language.** Squares with generous radii: 10 px cells, 12 px buttons, 14 px cards and
panels, 18 px sheets. In 3D, tiles are `0.86 × 0.30 × 0.86` boxes on `0.96 × 0.12 × 0.96` cell
pads over a slab, lit by a directional key, a blue-tinted ambient, and a moving point light.

**Typography.** The system UI face throughout at a 16 px base (the runtime's text size scales it),
800-weight numerals on tiles and bold score values. Tile labels are baked into a canvas texture
(`starhermit:canvas`, 256² authored, scaled to the tier's budget) at 116/92/76 px by digit count.

**Motion.** Spawn tiles pop in from 0.2 scale; merges pulse with a half-sine to 1.18 over
~0.25 s; the point light jumps to `8 + gain·14` and eases back; camera shake decays
critically. All of it is skipped when `reducedMotion` is set — which also removes the title
tile bob and the countdown entirely.

**Graphics.** The board is lit by a hemisphere fill (sky blue over the theme's background), a
key directional light and an accent-tinted rim light, tone-mapped with ACES Filmic into sRGB;
a point light in the theme accent drifts slowly across the glass and flares on merges.
Effects by the runtime's graphics level (`frame().quality`, `native/quality.ts`): key-light
shadows (an orthographic shadow box fitted to the board), image-based reflections (a PMREM-filtered
`RoomEnvironment`, environment intensity 0.4), ambient occlusion for contact darkening, bloom with
an HDR threshold of 2.0 so only the light-trace frame, the emissive sides of 128+ tiles (not on
the light or high-contrast themes, and less on pale fills) and hot glints glow, a linear colour
grade (S-curve 0.18, saturation 1.1, cool shadows / warm highlights, 0.24 vignette) and
FXAA/SMAA/MSAA. **Detailed tiles** (Balanced and up) are rounded clear-coat tiles on rounded cell
pads with a grain roughness map, a bevelled number texture with a keyline behind white digits, the
glowing light-trace frame around the slab, a faint circuit grid on the ground and distance fog.
**Particles** are accent-coloured motes rising in a ring around (never over) the board. Ambient
motion stops under reduced motion. The runtime's Options own the level (Auto from the GPU and a
benchmark), render scale, pixel-ratio cap, adaptive resolution and the frame-rate limit and readout;
the game maps each tier to the browser build's preset:

| Tier | Shadows | AO | Bloom | Grade | AA | Reflections | Detail | Particles |
|---|---|---|---|---|---|---|---|---|
| Low | off | off | off | off | MSAA | off | plain | off |
| Balanced | 1024² | off | on | on | FXAA | on | detailed | ⅓ of budget |
| High | 2048² | on | on | on | SMAA | on | detailed | full budget |
| Ultra | 4096² | high | on | on | MSAA | on | detailed | full budget |

**Per-tier budgets.** Each tier keeps the browser build's 60 FPS budget; board, tiles, input and
rules are identical on every tier. The ambient-particle budget scales within a tier by the level
(×1.64 per level above the tier's first, at most 2×, at most 640).

| Budget | Low | Balanced | High | Ultra |
|---|---|---|---|---|
| Shading model (tiles, cells, slab) | Lambert | Standard | Physical (clear coat) | Physical |
| Tile-number / grid texture | 128 px | 256 px | 256 px | 512 px |
| Rounded-box segments, tiles (cells/slab one fewer) | 2 | 2 | 4 | 6 |
| Ambient particles (budget) | 90 | 150 | 220 | 320 |
| Bloom / AO resolution | ½ | ½ | ½ | full |

The settings sheet's **Graphics** group keeps the game's own choices: the colour **Theme** and
**3D board (WebGL)** (off: the flat board, nothing 3D renders).

**Hero of the screen.** On the title, the key-art plate with the four bobbing sample tiles over
it. In play, the lit board — the rails are deliberately quiet, low-contrast text.

### Visual assets the design calls for

| Asset | Purpose |
|---|---|
| `assets/title-keyart.webp` | Title hero plate behind the wordmark tiles: floating glass lattice, cyan trace lines, dark upper space for the menu |
| `assets/results-backdrop.webp` | Results screen backdrop: one large violet cube on a rippling grid, dimmed under a gradient so the table stays readable |
| `favicon.svg`, `icon.png`, `coverart.png` | Platform identity |

Both generated images are decorative, sit behind a scrim, and are replaced by the flat
background under high contrast.

---

## 9. Audio direction

**Mix philosophy.** Every event plays its authored Opus clip; the clips load one at a time once the
mixer runs (natively at once, in a browser after the player's first press), and an event whose clip
is still loading is silent (its caption still shows). The pause sheet holds all sound, as the
browser build suspended its audio context.

**Buses.** The runtime's Options own the volumes and the mute: music → `music`, effects →
`effects`, the ambience plays on `music` (the runtime has no ambience bus). The browser build's
default bus levels (music 50 % × 0.5, effects 80 %, ambience 40 % × 0.35) are folded into each
sound's gain.

**Music and ambience.** A sparse pulse on a six-note scale every 300 ms step with a bass note every
fourth step; the board's occupancy (`1 − empties/cells`) drives it every frame, and above 0.6 the
pulse plays on every step instead of every other one — the score tightens as the matrix fills.
Ambience is a 55 Hz/82.5 Hz drone swelling with a slow LFO (a seamless 14 s loop). Notes and the
loop are rendered into clips (`createClip`) once; the browser build's synthesized fallbacks for
loading samples are not ported.

### SFX event table (source for `sfx/manifest.txt`)

| Event id | File | Sound | Usage context |
|---|---|---|---|
| `uiMove` | `ui-tap.opus` | Soft plastic UI tap | Forward menu navigation, from `show()` |
| `uiBack` | `ui-back.opus` | Descending wooden blip | Any return to the title |
| `ack` | `move-tick.opus` | Counter tick | Every accepted slide, before the slide body |
| `slide` | `tile-slide.opus` | Wooden friction whoosh | The block travel itself |
| `merge` | `merge-low.opus` | Wooden knock | Merge result < 64 |
| `merge` | `merge-mid.opus` | Ceramic clack | Merge result 64–511 |
| `merge` | `merge-high.opus` | Glass chime + impact | Merge result 512–2047 |
| `merge` | `merge-max.opus` | Crystal boom + sparkle | Merge result ≥ 2048 |
| `invalid` | `blocked-thud.opus` | Muted rubber bump | Direction that changes nothing; unavailable undo |
| `milestone` | `milestone-chime.opus` | Four-note bell arpeggio | Results screen after a win |
| `gameOver` | `game-over.opus` | Descending two-tone fade | Results screen after a loss |
| `undo` | `undo-whoosh.opus` | Reversed airy sweep | Successful undo |
| `achievement` | `achievement-fanfare.opus` | Bell ding + glissando | Achievements unlocked on results |
| `countdown` | `countdown-tick.opus` | Warm sine blip | Each 3-2-1 countdown number |
| `countdownGo` | `countdown-go.opus` | Rising two-note go | Countdown clears, input opens |
| `hint` | `hint-ping.opus` | Glassy bell ping | Hint revealed |
| `newBest` | `best-flourish.opus` | Two rising bells + sparkle | Results total beats the stored best (and no achievement fanfare is playing) |

Captions: with "Captions for sounds" on, each event shows a `♪ …` line at the bottom for ~900 ms.

---

## 10. Localization

**Languages:** en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT — every player-facing
string (title, modes and setup, journey grid labels, lessons, HUD, objective, hints, invalid-move and
undo messages, results, help, settings sheet, theme and achievement names, sync status, captions) ships
in all nine. Tile values and seeds are plain digits.

**Where strings live:** `lang/strings.js` holds the tables keyed by the English source text (en-GB,
es-ES and fr-CA list only their differences — *Ajustes*, *pointage*); `native/i18n.ts` loads it as a
classic script and looks keys up through the regional parents. `src/content.ts` and `src/modes.ts` mark
theme, lesson, achievement and option texts as keys; the account strings (`src/sh-strings.ts`) follow
the same language. "Merge Matrix" and "StarHermit" stay untranslated.

**Language:** the runtime's interface language (Options › Language: the player's choice, else the
account's preferred language, else the device's), mapped to the nearest shipped locale (es-MX → es-419,
en-AU → en-GB, fr-BE → fr-FR, pt-PT → pt-BR). Every string is drawn through `T()` each frame, so a change
shows on the next frame without restarting the run. The browser build's own Language section is gone.

Layout is expansion-tolerant: buttons and text measure their strings and wrap, the top bar takes a
second row rather than clipping, and nothing is sized to a fixed English string.

---

## 11. Accessibility

* **Keyboard-only path.** Every screen is reachable and completable with Tab/arrows + Enter/Space
  and the slide keys; each screen focuses its first control, the sheet focuses Resume/Close.
  Focus rings are 3 px in the theme accent.
* **Screen-reader model.** Every widget is in the runtime's accessibility tree (natively UI
  Automation / AT-SPI, in browsers an ARIA mirror). The board is named "Merge Matrix board" and each
  cell is a node labelled `"<value>, row R column C"` or `"empty, row R column C"` (3D: `ui.target`
  areas over the projected cells; flat: image widgets). After every move an announcement gives the
  direction, the total and a summary ("4×4 board, 9 empty cells, tiles: 1×64, 2×32, … Largest 64");
  results, hints, warnings and the countdown's "Go" announce as well.
* **Runtime options.** Reduced motion removes the countdown, the title bob, spawn/merge animation,
  camera shake, the motes and the light drift. High contrast forces the mono theme (black chrome,
  yellow accent, flat backdrops). Interface and text size scale the whole UI.
* **Game options** (settings sheet): **Left-handed action rail** mirrors the rails, **Captions for
  sounds** transcribes sound events, **Haptics on touch** can be switched off, **3D board** off shows
  the flat board.
* **Contrast and targets.** Body text `#e8ecf6` on `#0a0e1a` (≈15:1); muted `#9aa7c4` (≈7:1); tile
  digits are white on saturated fills, or `#1b2540` on the light theme. Buttons, checkboxes and
  journey cells are at least 44×44 px.

---

## 12. StarHermit integration

`starhermit.txt` declares the engine (`engine.api=1`, `engine.entry=native/main.ts`,
`engine.version=1.30.0`, `engine.minor=32`, capabilities platform, storage, clipboard),
`launch=index.html` (the web loader), `server=score-script.js`, `cover=cover.jpg`, the owner id, the
seven actions (`control.*` with their default keys, grouped) and their pad defaults
(`engine.gamepad.*`). All platform features go through the runtime (`starhermit:platform`,
`starhermit:storage`); the game never sees a token.

| Feature | How |
|---|---|
| Player | `player()`: signed in from the first frame in the client and on starhermit.com; the title shows the name and the cloud-save state ("progress synced to your account", "saving progress…", "sync offline …"); guests see "Guest profile · progress saves on this device". A guest gets **Sign in with StarHermit** (`requestSignIn`); a signed-out session toasts and keeps playing locally. |
| Cloud save | The progress is the game's save (`saves`, schema 1, `{ version: 1, progress }`) on the device and in the player's cloud slot. Another device's save is merged in (`mergeProgress`: union of completed stages and daily days, the higher best per board, the earliest unlock per achievement, the larger games-played count, tutorial done if either is), on conflicts too (`saves.onConflict`). |
| Migration | The browser build's slot (`game:<slug>`, `{version, progress, savedAt}` written by the JS SDK) shows as foreign: it is read (`readForeign`), merged with this device's progress and replaced once (`replaceForeign`). Its settings-KV values for the game's own options (theme, 3D board, left-handed, haptics, captions) are adopted unless set since, then every old KV key (volumes, graphics, motion, contrast, text size, hold-to-repeat, `ui.language` …) is removed. Guests' old browser localStorage (progress, snapshot) cannot migrate. |
| Run snapshot | The run in progress is kept on the device (`storage` key `snapshot`) after every command, on pause, leave, a hidden window and quit; the title offers **Resume run**; a finished run clears it. |
| Options | The game's own options are engine `settings` (synced with the account). Sound, graphics, language, motion, contrast and text size are the runtime's Options (the sheet's **Audio, graphics & accessibility** button opens them; **Controls** opens rebinding). |
| Daily clock | The Daily's UTC day comes from the platform clock (`serverNow`), the device clock until it answers or offline. |
| Invite link | Signed-in players get **Invite a friend** on the title, copying the invite link to the clipboard with a confirmation toast. |
| Leaderboards | Signed in, every finished ranked run (Daily and Score chase) posts its total through `score-script.js` (a practice session whose socket carries `{ type: 'result', scores: { 'high-score': total } }`; the script range-checks it, 0–1,000,000, and posts it to the `high-score` board) and the results show "Leaderboard rank: #N" (or posted / not posted). The Daily rail lists the board's top ten; without a board or offline it shows the local personal best. Results come only from the server script; the client never writes a board. |
| Achievements | Evaluated in the game and kept in the save (five definitions in `content.ts`). |

Account strings are localized in the nine locales (`src/sh-strings.ts`).

Not used: matchmaking, chat, replays, presence, multiplayer, purchases and platform achievements —
Merge Matrix is single-player; the only platform session is the one-message practice session that
posts a ranked score (client total, range-checked by the script, not replay-validated).

---

## 13. Technical architecture

**Module boundaries.** `src/rules.ts` has no imports and no engine calls; `src/content.ts`,
`src/modes.ts` and `src/progress.ts` are pure and shared with the Node tests (run as TypeScript by
Node's type stripping). `native/main.ts` owns the run and is the single command path; `native/platform.ts`
owns storage and the platform; `native/render.ts` consumes board snapshots and never writes state;
`native/screens.ts` builds the immediate-mode UI every frame from app state.

**Frame.** `onUpdate`: the graphics tier and theme, audio, timers (toast, caption, countdown steps of
450 ms), the speed challenge's clock (frame time, not under the sheet), the delayed finish (0.45 s
after the last move, 0.3 s after a lesson completes). `onRender`: the UI, then queued swipes, then the
scene's animation and camera.

**Determinism and replay.** Rules version 1; content version 1. A replay envelope is
`{schema, rulesVersion, seed, options, initialHash, commands, hashes, terminal}` (tested); the results
show the seed and the replay hash.

**Performance.** Label textures and tile materials are cached per theme + detail + value, tile
geometry is shared, cell pads are one instanced mesh; meshes are rebuilt only for cells whose value
changed. Nothing 3D renders off the play screen or with the flat board. The undo stack is capped at 64.

---

## 14. Testing and acceptance criteria

**`npm test`** runs the unit tests and the native checks:

* `tests/rules.test.mjs` (21): `slideLine` merge-once semantics and scoring, no-change detection; two
  starting tiles; refused moves, bad directions and post-terminal moves with `invalidActions`; undo
  restoring the exact prior hash; move-limit and time-limit endings; determinism, replay build/verify
  and tamper rejection; serialization; daily seed; fuzzed long sessions; content invariants and
  `validateStage` over every journey stage.
* `tests/progress.test.mjs` (7): two devices' merge, the browser build's cloud document (and junk)
  migrating, save round trip, legacy settings-KV options, snapshot resume rules, achievements once,
  the modes' options, hint, move diff and board counts.
* `tests/i18n.test.mjs` (4): every key the client uses is translated in every locale with intact
  placeholders and no unused rows; content texts are keys; regional overrides; account strings.
* `tests/native.mjs`: the web index matches the files (`npm run package` ran last), `tsc`,
  `starhermit check` with no warnings, then each `tests/native/*.play` as a signed-out
  `--render-check`: `practice.play` (desktop: keys, a swipe, hint, undo, pause, Leave, Resume offered),
  `learn.play` (all three lessons to their results, Next lesson), `journey.play` (stage 1 to "Milestone
  reached", Next stage, the grid shows it completed), `challenge-phone.play` (390×844 @3: the 60-move
  challenge by swipes to Out of moves, Retry), `landscape.play` (844×390 @3: the Daily by touch, hint,
  pause sheet, the flat board with a swipe, Leave run; its six key slides are placeholders `tests/native.mjs` fills from the rules with legal slides for that UTC day's Daily, leaving up legal for the swipe), `menus.play` (help, settings, Score chase setup).

**Browser check** (`npm run test:browser`, `tools/browser-play.mjs`): the packaged loader in Chrome on
the GPU at 1366×768, 390×844 @3 and 844×390 @3 — the first lesson by keys to its results and a Practice
run with a mouse drag on the board and the pause sheet (desktop); the 60-move challenge by finger swipes
to Out of moves, Retry, the flat board and Leave (phones). Any console error or warning, the runtime's
error screen or an unfinished run fails it.

Signed-in paths (foreign save, legacy settings, score posting, the leaderboard rail) cannot be driven
headlessly; their data handling is covered by the unit tests.

---

## 15. Asset inventory

| Path | Purpose | Source tool | Status |
|---|---|---|---|
| `assets/title-keyart.webp` | Title hero plate (1536×864 → WebP q80, 48 KB) | FLUX.2 klein, seed 70118 | shipped, the `.title-art` style |
| `assets/results-backdrop.webp` | Results backdrop (1280×720 → WebP q80, 36 KB) | FLUX.2 klein, seed 40213 | shipped, the `.results-art` style |
| `coverart.png` | StarHermit cover (`cover=` in `starhermit.txt`) | pre-existing | shipped |
| `icon.png`, `favicon.svg` | App icon and tab icon | pre-existing | shipped |
| `sfx/ui-tap.opus` | `uiMove` | MOSS-SFX v2.0 | shipped, newly wired to menu navigation |
| `sfx/ui-back.opus` | `uiBack` | MOSS-SFX v2.0 | shipped, newly wired to title returns |
| `sfx/move-tick.opus` | `ack` | MOSS-SFX v2.0 | shipped |
| `sfx/tile-slide.opus` | `slide` | MOSS-SFX v2.0 | shipped |
| `sfx/merge-low/mid/high/max.opus` | `merge` tiers | MOSS-SFX v2.0 | shipped |
| `sfx/blocked-thud.opus` | `invalid` | MOSS-SFX v2.0 | shipped |
| `sfx/milestone-chime.opus` | `milestone` | MOSS-SFX v2.0 | shipped |
| `sfx/game-over.opus` | `gameOver` | MOSS-SFX v2.0 | shipped |
| `sfx/undo-whoosh.opus` | `undo` | MOSS-SFX v2.0 | shipped |
| `sfx/achievement-fanfare.opus` | `achievement` | MOSS-SFX v2.0 | shipped |
| `sfx/countdown-tick.opus` | `countdown` | MOSS-SFX v2.0, 100 steps | generated in this pass, wired |
| `sfx/countdown-go.opus` | `countdownGo` | MOSS-SFX v2.0, 100 steps | generated in this pass, wired |
| `sfx/hint-ping.opus` | `hint` | MOSS-SFX v2.0, 100 steps | generated in this pass, wired |
| `sfx/best-flourish.opus` | `newBest` | MOSS-SFX v2.0, 100 steps | generated in this pass, wired |

No 3D model or character animation is called for: the board's tiles are parametric boxes with
generated label textures, and the game has no characters.

---

## 16. Known limitations

* The hint is greedy one-ply (`gained × 100 + empties`); it can recommend a move that is
  locally best and strategically poor.
* Merged-cell highlighting in 3D is inferred by diffing board values rather than tracking tile
  identities, so a spawn adjacent to a merge can occasionally miss its pulse; tiles teleport to
  their end cells instead of sliding.
* Daily and Score chase share one `high-score` board (different seeds), and posted totals are
  range-checked but not replay-validated (user decision: solo scores keep score-script.js).
* There is no retry queue: a ranked result that fails to post ("Score not posted to the
  leaderboard.") is never submitted later.
* `content.difficultyOf` double-counts mastery (`if (!s.mastery === false) d += 5` immediately
  before `if (s.mastery) d += 10`), so it is a rough ordering rather than a calibrated curve;
  nothing gameplay-facing consumes it.
* Board sizes 2, 6, 7 and 8 are legal in the engine but unreachable from the UI.
* Differences from the browser build: the speed challenge's clock now stops under the pause sheet
  (the browser build's wall-clock tick counted paused time); the per-effect graphics overrides, the
  render-scale slider and the adaptive/FPS toggles are the runtime's level and Options; the browser
  build's synthesized stand-ins for loading samples and its unused hold-to-repeat setting are gone;
  guests' old localStorage progress and snapshots do not carry over (cloud saves do).

## 17. Design intent not yet implemented

* **Validated ranked boards.** Intent: replay-validate posted Daily and Score chase runs in the
  platform script, with a separate board per mode.
* **Friends leaderboard filter.** Intent: request the host identity/friends graph and filter the
  entries panel, which is why the panel is titled generically today.
* **Per-tile slide animation.** Intent: track tile identity across a move so blocks travel to
  their destination instead of being rebuilt in place.
