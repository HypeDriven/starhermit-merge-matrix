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
| Platforms | Desktop and mobile browsers; portrait and landscape |
| Rendering | Three.js WebGL board (`vendor/three.module.js`) over an authoritative DOM grid mirror; the DOM board is the interaction and accessibility layer and takes over whenever WebGL is off or unavailable |
| Build | TypeScript in `src/` compiled by `tsc` to `dist/` (ES modules, no bundler) |

### File map

| Path | Responsibility |
|---|---|
| `index.html` | All seven screens, the pause/settings sheet, live regions; loads `dist/main.js` |
| `style.css` | Palette tokens, screen layouts, responsive/compact rules, safe-area insets |
| `src/rules.ts` | Pure rules engine: board, slide/merge, scoring, RNG, undo, replay envelope, daily seed |
| `src/content.ts` | Versioned content: 5 themes, 3 lessons, 40 journey stages, 5 achievements, offline stage validator |
| `src/session.ts` | Active session, settings/progress/snapshot persistence, achievement evaluation, clock |
| `src/main.ts` | Boot, screen state machine, input routing (keys/pointer/gamepad), results, `/api` client |
| `src/ui.ts` | DOM board build/render, ARIA labels, settings form binding, help cards, hint text |
| `src/render.ts` | Three.js scene: tile meshes, label textures, camera framing, merge pulse, glow/shake |
| `src/audio.ts` | Three buses, authored `sfx/*.opus` one-shots with synthesis fallback, adaptive music |
| `server.js` | StarHermit game script: static host + `/api/v1` time, daily, replay-validated submit, leaderboard |
| `tests/rules.test.ts` | 21 vitest cases over rules + content |
| `tests/e2e.mjs` | Playwright-core playthrough of the real UI at desktop and mobile |
| `sfx/` | 17 Opus clips, `manifest.txt` (canonical), `manifest.json` (generator), `manifest.md` |
| `assets/` | FLUX key art used by the title and results screens |
| `coverart.png`, `icon.png`, `favicon.svg` | Platform art |

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

**3. Glass you can still read.** The WebGL board is the hero, but the number on a tile is the
information; the DOM mirror carries the same numbers and ARIA labels at all times.
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

*Worked example — Journey stage 1 (`seed 1000`, 4×4, goal 128), the exact run the e2e test
produces:* 479 moves of merges accumulate `mergePoints = 6864`; reaching 128 adds
`128 × 10 = 1280`; the stage is unlimited so `efficiencyBonus = 0`; **total 8144**, shown as
three rows plus a bold total, with `seed 1000 · replay hash ec62f5cf` beneath.

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
in client and server, so every player gets the same board. The client syncs to `/api/v1/time`
at boot so the day rolls over on platform time.

**Achievements** (`content.ACHIEVEMENTS`, granted in `session.evaluateAchievements`, idempotent
per key with an unlock timestamp): First Light (first win), Matrix Adept (mastery stage),
Seven-Day Circuit (7 distinct daily days), Deep Signal (a 4096 tile), Long Haul (20 stages).

**Content validation.** `validateStage` runs offline in the test suite: every stage must have
sane fields, a legal first move, and must be driven to its goal (or a legitimate move-limit
ending) by a rotating deterministic policy inside 4000 simulated moves.

---

## 6. Controls and interaction

| Input | Desktop | Mobile | Gamepad |
|---|---|---|---|
| Slide | ↑ ↓ ← → or W A S D | swipe on the board (≥ 24 px) | d-pad, or left stick past ±0.6 |
| Undo | `Z` / `Undo` button | `Undo` button | — |
| Hint | `H` / `Hint` button | `Hint` button | — |
| Pause / settings | `P` or `Esc`, `⏸`, `⚙` | `⏸`, `⚙` | Start or B |
| Restart / leave | rail buttons and pause sheet | same | — |
| Navigate menus | Tab + Enter/Space | tap | — |

**Input locking.** Directions are ignored unless `currentScreen === 'play'` and not paused.
Each direction is keyed as `<moves>:<dir>` and debounced for 120 ms, so a held key or a double
tap cannot double-commit a turn. Key handling is skipped while focus is in an `input`,
`select`, or `textarea`. Swipes use pointer capture with a `pointercancel` reset; a gesture
shorter than 24 px is a tap and moves nothing. Backgrounding the tab auto-pauses a run.

**Feedback for every input.** Accepted move → tick + slide sample, DOM/3D board update, HUD
score/moves refresh, a screen-reader announcement including a board summary, and a 10 ms
vibration when haptics are on. Merge → a merge sample chosen by value tier, a tile pop, and a
glow pulse proportional to points gained. Illegal direction → `blocked-thud`, a red warning
panel naming the direction, and an assertive live announcement. Undo → whoosh. Hint → ping.

---

## 7. Screens and UI flow

`SCREENS = ['title','modes','journey','learn','play','results','help']`; `show()` hides all but
one, toggles the pause button, and focuses the first control on the new screen.

```
boot → title ─┬─ help ────────────────► title
              ├─ modes → mode-setup → play
              ├─ journey (40 cells) ──► play
              ├─ learn (3 lessons) ───► play
              ├─ daily ───────────────► play
              └─ resume snapshot ─────► play
play ↔ overlay-pause (also the settings sheet from any screen)
play → results → retry | next stage | menu
```

**Desktop play layout.** Three columns, `220px | 1fr | 220px`: objective + lesson box on the
left, board centre, action rail + hint/warning/leaderboard on the right. The left-handed
setting swaps the two rails via grid areas.

**Mobile portrait (≤ 1023 px).** Rails collapse to horizontal rows above and below the board;
the action rail keeps `padding-bottom: calc(0.3rem + var(--safe-bottom))`.

**Mobile landscape.** Rails return to narrow vertical columns capped at 140 px so the board
keeps the vertical space.

**Never cut off:** the top bar's score/best/moves/timer (it wraps rather than clipping), the
whole board (the 3D camera retreats and tilts toward overhead as aspect narrows;
`buildDomBoard` sizes the DOM grid with `min(92vw, 92dvh − 220px, size·96px)`), the primary
action of any screen, and the pause sheet (`max-height: calc(100dvh − 2rem)` with its own
scroll). All screens pad by `env(safe-area-inset-*)`.

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

**Typography.** System UI stack throughout, 16 px base (20 px with "Larger text"), 800-weight
tabular numerals on tiles and score values, `0.06em` tracking on the wordmark. Tile labels are
baked into a 256² canvas texture at 116/92/76 px depending on digit count.

**Motion.** Spawn tiles pop in from 0.2 scale; merges pulse with a half-sine to 1.18 over
~0.25 s; the point light jumps to `8 + gain·14` and eases back; camera shake decays
critically. All of it is skipped when `reducedMotion` is set — which also removes the title
tile bob and the countdown entirely.

**Hero of the screen.** On the title, the key-art plate with the four bobbing sample tiles over
it. In play, the lit board — the rails are deliberately quiet, low-contrast text.

### Visual assets the design calls for

| Asset | Purpose |
|---|---|
| `assets/title-keyart.webp` | Title hero plate behind the wordmark tiles: floating glass lattice, cyan trace lines, dark upper space for the menu |
| `assets/results-backdrop.webp` | Results screen backdrop: one large violet cube on a rippling grid, dimmed under a gradient so the table stays readable |
| `favicon.svg`, `icon.png`, `coverart.png` | Platform identity |

Both generated images are decorative (`aria-hidden`), sit behind a scrim, and are replaced by
flat `--bg` under High Contrast.

---

## 9. Audio direction

**Mix philosophy.** Sample-first, synthesis-always: every event tries its authored Opus clip
and falls back to a WebAudio tone/noise recipe while the clip is loading or if it 404s, so the
game is never silent and never blocks on the network. Nothing starts until a user gesture
(`ensureAudio` on first pointer/first menu action); pausing suspends the context.

**Buses** (`src/audio.ts`): `master` (0 when muted) → `music` (setting × 0.5), `fx` (setting),
`ambience` (setting × 0.35). Clips are loudness-normalised to −20 LUFS so the FX bus needs no
per-clip trims.

**Music and ambience.** A synthesised sparse pulse on a six-note scale with a bass note every
fourth step; `setMusicIntensity` is driven every frame by board occupancy (`1 − empties/cells`)
and above 0.6 the pulse plays on every step instead of every other one — the score tightens as
the matrix fills. Ambience is a 55 Hz/82.5 Hz drone with a 0.07 Hz LFO. Both idle while the tab
is hidden.

**Determinism.** `variant(base, seed)` derives fallback pitch from the move number and seed, so
a replayed run sounds identical.

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

Captions: with "Captions for sounds" on, each event pushes a `♪ …` toast into `#caption-live`
for ~900 ms.

---

## 10. Localization

The product requirement is en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR and it-IT.
**Today the game ships US English only.** Player-facing strings live in three places:
static markup in `index.html`, generated content strings in `src/content.ts` (lesson titles and
bodies, theme and achievement names) and `src/ui.ts` (help cards), and runtime messages in
`src/main.ts` (objective line, results headlines, announcements, hint phrasing). `<html lang>`
is fixed to `en`. Numbers are rendered with plain `String()` and tabular numerals.

Layout is already expansion-tolerant: every button is a flow box with wrapping text, the top
bar wraps rather than clips, and nothing is sized to a fixed English string. See §17 for the
intended string-table extraction.

---

## 11. Accessibility

* **Keyboard-only path.** Every screen is reachable and completable with Tab/Enter/Space and
  the four arrow keys; `show()` moves focus to the first control of the new screen, and the
  pause dialog focuses `Resume`/`Close` and restores the previously focused element on close.
  `:focus-visible` draws a 3 px accent outline offset 2 px.
* **Screen-reader model.** The DOM board is the source of truth: `role="grid"` with a
  `role="gridcell"` per cell labelled `"<value>, row R column C"` or `"empty, row R column C"`.
  After every move, `#a11y-live` (polite) announces the direction, the total, and a summary
  ("4×4 board, 9 empty cells, tiles: 1×64, 2×32, … Largest 64"). Results, hints and the
  countdown announce as well; illegal moves use `role="alert"`.
* **The canvas is never the only channel.** `#gl` is `aria-hidden`; when 3D is on, the DOM board
  becomes a visually-hidden mirror, and when 3D is off (setting, or WebGL init failure, which
  also announces "3D unavailable — using the accessible board view") the DOM board becomes the
  visible playfield with no rules change.
* **Reduced motion** removes the countdown, the title bob, spawn/merge animation and camera
  shake. **High contrast** forces the mono theme, pure-black chrome and flat backdrops.
  **Larger text** raises the base font to 20 px. **Left-handed** mirrors the play rails.
  **Captions** transcribe sound events. **Haptics** can be switched off.
* **Contrast and targets.** Body text `#e8ecf6` on `#0a0e1a` (≈15:1); muted `#9aa7c4` (≈7:1);
  tile digits are white on saturated fills, or `#1b2540` on the light theme. Every button,
  checkbox row, settings summary and journey cell is at least 44×44 px.

---

## 12. StarHermit integration

`starhermit.txt` declares `name=Merge Matrix`, `launch=index.html`, `server=server.js`,
`cover=coverart.png`, and the owner id. `src/platform.ts` owns the platform contract;
hosted mode activates iff a launch token was read. Per https://wiki.starhermit.com/
conventions the game uses:

| Feature | How |
|---|---|
| Launch token | Read once from the URL fragment `#game_token=<jwt>` (query `?token=`/`?launch=` are local-dev fallbacks), then stripped. `sub` and `game_scope` are base64url-decoded; `Authorization: Bearer <token>` on every platform call; re-minted via `POST /api/v1/games/{slug}/launch-token` every 45 min (60 s retry). |
| Game script / server | `server.js` is the its-backend: it hosts the static build for local dev and owns replay-validated `/api/v1/daily/submit`. |
| Identity | `GET /api/v1/users/{sub}/profile` → nickname, shown on the title screen (`Player ` + id8 fallback). Never `/api/v1/me`, never usernames. |
| Cloud save | `GET`/`PUT /api/v1/me/cloud-saves/{slug}` — one zip+base64 slot (`save.json` doc with progress + achievements); remote wins on load, ~2 s debounce + pagehide flush, sync status on the title screen. localStorage stays the offline cache. |
| Score submission | `POST /api/v1/daily/submit` with the full replay envelope, authenticated when hosted. The dev server re-simulates it and rejects `seed-mismatch`, `options-mismatch`, `replay-invalid`, `score-mismatch`, `implausible-score` (> 500 000) and `stale-version`; on-platform or offline it degrades to "stored locally". |
| Leaderboards | Read-only platform board: `GET /api/v1/games/{slug}` → `leaderboardId`, then `GET /api/v1/leaderboards/{leaderboardId}/entries`; entry userIds resolve to nicknames via the profile route. No board (local dev/offline) → the rail shows local records only. Personal bests are kept locally and cloud-saved. |
| Achievements | Evaluated and stored locally in `mm-progress-v1` (five definitions in `content.ts`), mirrored through the cloud save. No server unlock calls. |
| Platform time | `GET /api/v1/time` at boot in local dev only (the dev server's endpoint); hosted mode uses local UTC for the day boundary. |

Not used: presence, matchmaking, real-time multiplayer, purchases, friends graph
(a friends leaderboard filter would need the friends API). All modes except Daily are
fully local; when the backend is unreachable the client keeps playing and reports
"Daily score stored locally; replay validation unavailable here (casual board)".

---

## 13. Technical architecture

**Module boundaries.** `rules.ts` has no DOM, no timers and no imports; `content.ts` imports
only `rules`; `session.ts` owns persistence and is the single validated command path
(`command`, `commandUndo`) that both UI and replay use; `platform.ts` owns the StarHermit
contract (launch token, Bearer auth, profile, cloud save, read-only leaderboard) and is the
only module that reads `location`/auth state; `main.ts` is the only module that
touches `document` for flow control; `render.ts` consumes immutable board snapshots and never
writes state; `audio.ts` is fire-and-forget.

**Determinism and replay.** Rules version 1; content version 1. A replay envelope is
`{schema, rulesVersion, seed, options, initialHash, commands, hashes, terminal}`. `server.js`
carries a hand-mirrored copy of the engine (mulberry32, `slideLine`, `peekMove`, `dailySeed`,
`stateHash`) so validation never trusts client code — any divergence between the two surfaces
as `replay-invalid`.

**Persistence** (localStorage, all writes wrapped so a blocked/full store degrades silently):
`mm-settings-v1` (14 settings), `mm-progress-v1` (journey indices, best score per content id,
achievement timestamps, daily days, tutorial flag, games played), `mm-snapshot-v1` (mode,
content id, ranked flag, options, serialized state). Snapshots are written after every command,
on pause and on leave, and cleared when a run resolves; a snapshot of an already-over run is
discarded on load. When hosted, `mm-progress-v1` is mirrored to the platform cloud-save slot
(zip+base64, remote wins on load); localStorage remains the offline cache. Server state is
three JSON files under `.data/` (leaderboard, submissions, rate limit; 240 requests/min/IP,
256 KB body cap).

**Performance budgets.** One `requestAnimationFrame` loop that returns immediately while the
tab is hidden. Quality caps device pixel ratio at 1 / 1.5 / 2 (low/medium/high) and disables
antialiasing on low. Label textures are cached per theme+value; meshes are rebuilt only for
cells whose value changed, and disposed geometry/materials are released explicitly. The undo
stack is capped at 64 entries. The whole payload is HTML + CSS + seven ES modules + Three.js +
17 Opus clips (~10–30 KB each) + two WebP images (85 KB total).

**How the e2e drives the real UI.** `tests/e2e.mjs` starts its own static server on an
ephemeral port (with a `/api/v1/time` stub and 404s for everything else, so it exercises the
offline path), launches system Chrome through `playwright-core`, and clicks the same buttons a
player does. It reads the board **out of `#dom-board`**, computes its next direction with a
local mirror of `slideLine`, and presses arrow keys or performs real pointer swipes; it never
calls into game internals to make progress.

---

## 14. Testing and acceptance criteria

**`npm test` (vitest, `tests/rules.test.ts`, 21 cases):** `slideLine` merge-once semantics,
merge scoring, no-change detection; two starting tiles and a legal opening; rejection of no-op
moves, bad directions and post-terminal moves with `invalidActions` counting; undo restoring
the exact prior hash; move-limit and time-limit termination; score composition;
serialize/deserialize round trip and version rejection; replay build/verify including tamper
rejection; daily seed stability and per-day distinctness; content invariants (40 stages, unique
ids, mastery cadence, five themes with full ramps, achievements, lesson fields) and
`validateStage` over sampled stages; `difficultyOf` monotonicity.

**`npm run test:e2e` (`tests/e2e.mjs`), two passes — desktop 1280×800 and mobile 390×844 with
touch, both must pass:** load and title visible; help opens and closes; journey grid shows 40
stages; stage 1 starts and the countdown clears; pause → resume; settings open/close with a
mute toggle; hint returns `Try <direction> …`; a real swipe changes the board; undo reverts it;
then the bot plays stage 1 with arrow keys to the 128 milestone (479 moves on this seed);
results show the milestone headline, a positive total and `seed 1000`; progress is persisted in
localStorage; `Next stage` starts stage 2 with the right objective; leaving mid-run returns to
the title and no delayed result screen reopens. **Any page error or non-allowlisted console
message fails the run** (only known GPU/WebGL driver noise is filtered).

**QA bar, as checkable statements** (agents/qa.md):

1. A first-time player is taught: the title exposes *How to play* (7 cards) and *Learn*
   (3 action-gated lessons) before any run, and each lesson states its completion condition. ✔
2. Every implemented feature is reachable by clicking visible UI — all modes, all settings,
   undo, hint, pause, resume, retry, next stage, leaderboard panel. ✔ (covered by e2e)
3. No console errors or warnings during a full playthrough at both viewports. ✔ (e2e fails on
   any)
4. No text or control is cut off at 1280×800, 390×844 portrait or landscape; the board always
   fits (camera refit plus DOM board sizing) and rails reflow. ✔
5. Features that could use StarHermit do: time, daily descriptor, validated submission,
   leaderboard, achievements. ✔
6. Localization: **not met** — English only (§10, §17).

`python3 tools/audit_game_assets.py merge-matrix` passes: favicon link resolves, `icon.png`
present, every clip is 48 kHz mono Opus and appears in both the source event map and
`manifest.json`.

---

## 15. Asset inventory

| Path | Purpose | Source tool | Status |
|---|---|---|---|
| `assets/title-keyart.webp` | Title hero plate (1536×864 → WebP q80, 48 KB) | FLUX.2 klein, seed 70118 | generated in this pass, wired via `.title-art` in `style.css` |
| `assets/results-backdrop.webp` | Results backdrop (1280×720 → WebP q80, 36 KB) | FLUX.2 klein, seed 40213 | generated in this pass, wired via `#screen-results.has-art` |
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
| `vendor/three.module.js`, `three.core.js` | WebGL renderer | three.js r183 | shipped |

No 3D model or character animation is called for: the board's tiles are parametric boxes with
generated label textures, and the game has no characters.

---

## 16. Known limitations

* **English only.** No string table, no language picker, `<html lang="en">` (§10).
* The hint is greedy one-ply (`gained × 100 + empties`); it can recommend a move that is
  locally best and strategically poor.
* Merged-cell highlighting in 3D is inferred by diffing board values rather than tracking tile
  identities, so a spawn adjacent to a merge can occasionally miss its pulse; tiles teleport to
  their end cells instead of sliding.
* Score chase is labelled "ranked" in the UI but submits nothing: only Daily posts to the
  server, so its board is local-best only.
* The platform leaderboard is read-only (clients cannot submit), has no friends filter, and
  falls back to local records when no board is configured or the network is down.
* `res-board-note` reports "stored locally" on an unreachable server, but there is no retry
  queue: an offline daily result is never submitted later.
* The `holdToRepeat` setting exists in the settings model with no UI control and no behaviour.
* `content.difficultyOf` double-counts mastery (`if (!s.mastery === false) d += 5` immediately
  before `if (s.mastery) d += 10`), so it is a rough ordering rather than a calibrated curve;
  nothing gameplay-facing consumes it.
* Board sizes 2, 6, 7 and 8 are legal in the engine but unreachable from the UI.

## 17. Design intent not yet implemented

* **Localization to the nine required locales.** Intent: extract every player-facing string into
  a keyed table per locale, mark up static markup with `data-i18n`, choose the locale from a
  persisted setting defaulting to `navigator.languages`, set `<html lang>` accordingly, and
  format numbers through `Intl.NumberFormat`.
* **Ranked score chase.** Intent: submit the score-chase replay through the same validated
  endpoint as Daily, with its own board keyed by the fixed seed.
* **Friends leaderboard filter.** Intent: request the host identity/friends graph and filter the
  entries panel, which is why the panel is titled generically today.
* **Per-tile slide animation.** Intent: track tile identity across a move so blocks travel to
  their destination instead of being rebuilt in place.
