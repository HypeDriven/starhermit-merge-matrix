/**
 * Merge Matrix — bootstrap, screen state machine, input routing, platform client.
 */
import * as rules from './rules.js';
import * as content from './content.js';
import * as session from './session.js';
import * as audio from './audio.js';
import * as render from './render.js';
import * as ui from './ui.js';
import * as platform from './platform.js';
const $ = (id) => document.getElementById(id);
let settings = session.loadSettings();
let progress = session.loadProgress();
let glActive = false;
let rafId = 0;
let paused = false;
let lastFocused = null;
let serverOffsetMs = 0; // serverTime - clientTime
let online = true;
let currentScreen = 'title';
let runFinished = false; // guards finishRun against the rAF loop / setTimeout race
let finishScheduled = false; // a delayed reveal is pending; the loop must not pre-empt it
/* ---------------- platform (/api) ----------------
 * Hosted mode (launch token in the URL fragment) talks to the StarHermit
 * platform with Bearer auth; the game's own server.js stays the its-backend
 * for replay-validated daily submission, with a graceful local fallback. */
async function api(path, init) {
    try {
        const res = await fetch('/api/v1' + path, init);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            if (res.status === 429)
                announce('Server is busy; try again shortly.');
            return null;
        }
        setOnline(true);
        return body;
    }
    catch {
        setOnline(false);
        return null;
    }
}
/** Authenticated call in hosted mode, own-server call in local dev. */
async function backendApi(path, init) {
    return platform.isHosted() ? platform.api(path, init) : api(path, init);
}
function setOnline(v) {
    online = v;
    $('offline-note').hidden = v;
}
async function syncServerTime() {
    if (platform.isHosted())
        return; // /time is the dev server's endpoint, not a platform route
    const t0 = Date.now();
    const r = await api('/time');
    if (r?.now)
        serverOffsetMs = r.now - (t0 + Date.now()) / 2;
}
function serverNow() { return Date.now() + serverOffsetMs; }
async function submitDaily(sess) {
    const env = session.replayEnvelope();
    if (!env)
        return;
    const r = await backendApi('/daily/submit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            day: sess.contentId.replace('daily-', ''),
            replay: env,
            score: rules.scoreTotal(sess.state),
            moves: sess.state.moves,
            invalidActions: sess.state.invalidActions,
            elapsedMs: sess.state.elapsedMs,
            contentVersion: sess.contentVersion,
        }),
    });
    const note = $('res-board-note');
    note.hidden = false;
    if (r?.ok)
        note.textContent = `Daily score accepted — rank #${r.rank ?? '—'} on today's board.`;
    else if (r?.error)
        note.textContent = `Daily submission rejected: ${r.error}`;
    else
        note.textContent = 'Daily score stored locally; replay validation unavailable here (casual board).';
}
async function loadLeaderboard() {
    const panel = $('friends-panel');
    const ol = $('leaderboard-list');
    ol.textContent = '';
    panel.hidden = false;
    const sess = session.getActive();
    const best = sess ? progress.bestScores[sess.contentId] ?? 0 : 0;
    const entries = platform.isHosted() ? await platform.leaderboardEntries(10) : null;
    if (entries) {
        for (const e of entries) {
            const li = document.createElement('li');
            li.textContent = `${e.name}: ${e.score}`;
            ol.appendChild(li);
        }
    }
    else {
        // no platform board (local dev / offline / none configured): local records only
        const li = document.createElement('li');
        li.textContent = `Personal best: ${best}`;
        ol.appendChild(li);
        const note = document.createElement('li');
        note.textContent = '(global leaderboard unavailable — local records only)';
        ol.appendChild(note);
    }
}
/* ---------------- profile / cloud save ---------------- */
function refreshProfileLine() {
    const nameEl = $('profile-name');
    const syncEl = $('sync-status');
    if (!platform.isHosted()) {
        nameEl.textContent = 'Guest profile';
        syncEl.textContent = 'progress saves on this device';
        return;
    }
    nameEl.textContent = platform.nicknameNow() || 'Player';
    syncEl.textContent = 'progress synced to your account';
}
function cloudDoc() {
    return { version: 1, progress, savedAt: Date.now() };
}
async function applyCloudSave() {
    if (!platform.isHosted())
        return;
    const doc = await platform.loadCloudSave();
    if (doc?.version === 1 && doc.progress && doc.progress.version === 1) {
        // remote wins on conflict; localStorage stays the offline cache
        progress = doc.progress;
        session.saveProgress(progress);
    }
    refreshProfileLine();
}
/* ---------------- screens ---------------- */
const SCREENS = ['title', 'modes', 'journey', 'learn', 'play', 'results', 'help'];
function show(name) {
    if (name !== currentScreen) {
        // forward navigation taps, backward navigation blips
        if (name === 'title' && currentScreen !== 'title')
            audio.sfx.uiBack();
        else if (currentScreen !== 'play')
            audio.sfx.uiMove();
    }
    currentScreen = name;
    for (const s of SCREENS)
        $(`screen-${s}`).hidden = s !== name;
    $('btn-pause').hidden = name !== 'play';
    if (name !== 'play')
        setHudVisible(false);
    const first = $(`screen-${name}`).querySelector('button, [tabindex="0"]');
    first?.focus();
}
function setHudVisible(v) {
    // HUD numbers remain visible; this just resets when leaving play
    if (!v) {
        $('hud-timer-wrap').hidden = true;
    }
}
function announce(text) {
    $('a11y-live').textContent = '';
    requestAnimationFrame(() => { $('a11y-live').textContent = text; });
}
function caption(text) {
    const el = $('caption-live');
    el.textContent = `♪ ${text}`;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 900);
}
/* ---------------- game flow ---------------- */
function themeNow() {
    return ui.themeById(settings.highContrast ? 'mono' : settings.theme);
}
function startRun(mode, contentId, opts, ranked) {
    const sess = session.startSession(mode, contentId, opts, ranked);
    paused = false;
    runFinished = false;
    finishScheduled = false;
    setupBoard(sess.state);
    show('play');
    fitCanvas();
    runCountdown(() => announce('Go'));
    updateAll();
    audio.ensureAudio();
    if (sess.ranked && sess.mode === 'daily')
        void loadLeaderboard();
}
function setupBoard(st) {
    const t = themeNow();
    ui.buildDomBoard($('dom-board'), st.size);
    render.setTheme(t);
    render.buildBoard(st.size);
    updateObjective();
}
function updateObjective() {
    const sess = session.getActive();
    if (!sess)
        return;
    const st = sess.state;
    const goalTxt = `Reach a ${st.goalTile} block.`;
    $('objective-text').textContent = goalTxt +
        (st.moveLimit > 0 ? ` Moves left: ${Math.max(0, st.moveLimit - st.moves)}.` : '') +
        (st.timeLimitMs > 0 ? ` Time limit ${Math.ceil(st.timeLimitMs / 1000)}s.` : '');
    $('objective-progress').textContent = `Largest block: ${st.maxTile} · ${session.legal().length} legal directions`;
    $('hud-timer-wrap').hidden = st.timeLimitMs <= 0;
}
function updateAll() {
    const sess = session.getActive();
    if (!sess)
        return;
    const st = sess.state;
    const t = themeNow();
    ui.renderDomBoard($('dom-board'), st, t);
    render.setBoard(st.board);
    const total = rules.scoreTotal(st);
    $('hud-score').textContent = String(total);
    $('hud-moves').textContent = String(st.moves);
    const best = progress.bestScores[sess.contentId] ?? 0;
    $('hud-best').textContent = String(Math.max(best, total));
    const remaining = st.timeLimitMs > 0 ? Math.max(0, st.timeLimitMs - st.elapsedMs) : 0;
    if (st.timeLimitMs > 0) {
        const s = Math.ceil(remaining / 1000);
        $('hud-timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    $('btn-undo').toggleAttribute('disabled', !st.allowUndo || st.undoStack.length === 0 || st.over);
    // adaptive music intensity from board tension
    let empties = 0;
    for (const row of st.board)
        for (const v of row)
            if (v === 0)
                empties++;
    audio.setMusicIntensity(1 - empties / (st.size * st.size));
    updateObjective();
}
function finishRun() {
    const sess = session.getActive();
    // a run resolves exactly once, and only when it is actually over: the rAF loop
    // and doMove's delayed call both land here, and a stale delayed call must never
    // resolve whatever run the player started in the meantime
    if (!sess || runFinished || !sess.state.over)
        return;
    runFinished = true;
    const st = sess.state;
    const total = rules.scoreTotal(st);
    // records — capture the previous best before it is overwritten below
    const prevBest = progress.bestScores[sess.contentId] ?? 0;
    if (prevBest < total)
        progress.bestScores[sess.contentId] = total;
    progress.gamesPlayed++;
    if (sess.mode === 'daily') {
        const day = session.utcToday();
        if (!progress.dailyDays.includes(day))
            progress.dailyDays.push(day);
    }
    if (sess.mode === 'journey' && st.won) {
        const stage = content.JOURNEY.find((s) => s.id === sess.contentId);
        if (stage && !progress.journeyCompleted.includes(stage.index))
            progress.journeyCompleted.push(stage.index);
    }
    if (sess.mode === 'learn' && st.won)
        progress.tutorialDone = true;
    stopCountdown();
    const newAch = session.evaluateAchievements(progress, sess);
    session.saveProgress(progress);
    session.clearSnapshot();
    platform.queueCloudSave(cloudDoc());
    // results screen
    $('results-headline').textContent = st.won
        ? (sess.mode === 'learn' ? 'Lesson complete' : `Milestone reached — ${st.goalTile}!`)
        : st.terminalReason === 'move-limit-exhausted' ? 'Out of moves'
            : st.terminalReason === 'time-expired' ? 'Time expired'
                : 'Matrix full — run over';
    $('res-merge').textContent = String(st.score.mergePoints);
    $('res-milestone').textContent = String(st.score.milestoneBonus);
    $('res-efficiency').textContent = String(st.score.efficiencyBonus);
    $('res-total').textContent = String(total);
    $('res-detail').textContent = `${st.moves} moves · ${st.invalidActions} invalid attempts · largest block ${st.maxTile} · seed ${st.seed} · replay hash ${rules.stateHash(st)}`;
    const achEl = $('res-achievements');
    if (newAch.length > 0) {
        achEl.hidden = false;
        achEl.textContent = 'Achievement unlocked: ' + newAch.map((k) => content.ACHIEVEMENTS.find((a) => a.key === k)?.name ?? k).join(', ');
        audio.sfx.achievement();
    }
    else
        achEl.hidden = true;
    const cmp = $('res-compare');
    cmp.hidden = false;
    cmp.textContent = total > prevBest ? 'New personal best for this board.' : `Personal best here: ${prevBest}.`;
    if (total > prevBest && newAch.length === 0)
        audio.sfx.newBest();
    $('res-board-note').hidden = true;
    const nextBtn = $('btn-next');
    if (sess.mode === 'journey' && st.won) {
        const stage = content.JOURNEY.find((s) => s.id === sess.contentId);
        const next = content.JOURNEY[stage.index + 1];
        nextBtn.hidden = !next;
        nextBtn.dataset.nextId = next?.id ?? '';
        nextBtn.dataset.nextKind = 'journey';
        nextBtn.textContent = 'Next stage';
    }
    else if (sess.mode === 'learn' && st.won) {
        const idx = content.LESSONS.findIndex((l) => l.id === sess.contentId);
        const next = content.LESSONS[idx + 1];
        nextBtn.hidden = !next;
        nextBtn.dataset.nextId = next?.id ?? '';
        nextBtn.dataset.nextKind = 'learn';
        nextBtn.textContent = 'Next lesson';
    }
    else
        nextBtn.hidden = true;
    show('results');
    announce($('results-headline').textContent + `. Total score ${total}.`);
    if (st.won)
        audio.sfx.milestone();
    else
        audio.sfx.gameOver();
    if (sess.mode === 'daily')
        void submitDaily(sess);
}
/* ---------------- input ---------------- */
let lastCommandId = 0;
const pendingCommands = new Set();
function doMove(dir) {
    const sess = session.getActive();
    if (!sess || paused || currentScreen !== 'play')
        return;
    // action identifiers prevent accidental double commits
    const id = `${sess.state.moves}:${dir}:${++lastCommandId}`;
    const base = `${sess.state.moves}:${dir}`;
    if (pendingCommands.has(base))
        return;
    pendingCommands.add(base);
    setTimeout(() => pendingCommands.delete(base), 120);
    void id;
    const before = new Set();
    const merged = new Set();
    const prevBoard = sess.state.board;
    const r = session.command(dir);
    if (!r.ok) {
        if (r.reason === 'no-move') {
            showInvalid(`Nothing slides ${dir} — try another direction.`);
            audio.sfx.invalid();
        }
        return;
    }
    // determine spawned cell by diff
    for (let i = 0; i < sess.state.size; i++)
        for (let j = 0; j < sess.state.size; j++) {
            if (prevBoard[i][j] === 0 && sess.state.board[i][j] !== 0)
                before.add(`${i},${j}`);
        }
    const lastMove = sess.state.log[sess.state.log.length - 1];
    if (lastMove) {
        // approximate merged cells for pulse: any cell whose value doubled
        for (let i = 0; i < sess.state.size; i++)
            for (let j = 0; j < sess.state.size; j++)
                if (sess.state.board[i][j] > prevBoard[i][j] && !before.has(`${i},${j}`))
                    merged.add(`${i},${j}`);
    }
    render.setBoard(sess.state.board, before, merged);
    audio.sfx.ack(sess.state.moves);
    audio.sfx.slide(sess.state.moves * 31 + sess.state.seed);
    if ((r.gained ?? 0) > 0) {
        audio.sfx.merge(sess.state.moves * 17, lastMove?.merges[0]?.value ?? 4);
        render.pulseGlow(Math.min(1, (r.gained ?? 0) / 256));
    }
    if (settings.haptics && navigator.vibrate)
        navigator.vibrate(10);
    updateAll();
    announce(`Moved ${dir}. Score ${rules.scoreTotal(sess.state)}. ${ui.boardSummary(sess.state)}`);
    hideInvalid();
    checkLessonProgress();
    if (r.gameOver)
        scheduleFinish(sess, 450);
}
/** Let the final move land on screen before the results take over. */
function scheduleFinish(sess, delayMs) {
    finishScheduled = true;
    setTimeout(() => {
        if (session.getActive() !== sess)
            return;
        finishScheduled = false;
        if (currentScreen === 'play')
            finishRun();
    }, delayMs);
}
function doUndo() {
    const sess = session.getActive();
    if (!sess || paused)
        return;
    const r = session.commandUndo();
    if (r.ok) {
        audio.sfx.undo();
        updateAll();
        announce('Undid the last move.');
    }
    else {
        showInvalid(r.reason === 'undo-unavailable' ? 'Undo is not available in this mode.' : 'Cannot undo now.');
        audio.sfx.invalid();
    }
}
function doHint() {
    const sess = session.getActive();
    if (!sess)
        return;
    const h = ui.computeHint(sess.state);
    const box = $('hint-box');
    box.hidden = false;
    box.textContent = h ? `Try ${h.dir} — ${h.why}.` : 'No legal moves remain.';
    audio.sfx.hint();
    announce(box.textContent);
}
function showInvalid(msg) {
    const box = $('invalid-box');
    box.hidden = false;
    box.textContent = msg;
    announce(msg);
}
function hideInvalid() { $('invalid-box').hidden = true; }
let countdownIv = null;
function stopCountdown() {
    if (countdownIv !== null) {
        clearInterval(countdownIv);
        countdownIv = null;
    }
    $('countdown').hidden = true;
}
function runCountdown(done) {
    stopCountdown(); // a restart mid-countdown must not leave a stale interval running
    const el = $('countdown');
    if (settings.reducedMotion) {
        done();
        return;
    }
    let n = 3;
    el.hidden = false;
    el.textContent = String(n);
    audio.sfx.countdown(n);
    countdownIv = setInterval(() => {
        n--;
        if (n <= 0) {
            stopCountdown();
            audio.sfx.countdownGo();
            done();
            return;
        }
        el.textContent = String(n);
        audio.sfx.countdown(n);
    }, 450);
}
/* keyboard */
const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
};
function onKey(e) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')
        return;
    if (currentScreen === 'play' && !paused) {
        const dir = KEYMAP[e.key];
        if (dir) {
            e.preventDefault();
            doMove(dir);
            return;
        }
        if (e.key === 'z' || e.key === 'Z') {
            e.preventDefault();
            doUndo();
            return;
        }
        if (e.key === 'h' || e.key === 'H') {
            e.preventDefault();
            doHint();
            return;
        }
    }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (currentScreen === 'play') {
            e.preventDefault();
            togglePause();
        }
        else if (!$('overlay-pause').hidden) {
            e.preventDefault();
            togglePause(false);
        }
    }
}
/* touch/pointer swipe with capture + tap/drag thresholds */
let ptrStart = null;
function bindPointer() {
    const wrap = $('board-wrap');
    wrap.addEventListener('pointerdown', (e) => {
        ptrStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
        wrap.setPointerCapture(e.pointerId);
        audio.ensureAudio();
    });
    wrap.addEventListener('pointerup', (e) => {
        if (!ptrStart || ptrStart.id !== e.pointerId)
            return;
        const dx = e.clientX - ptrStart.x;
        const dy = e.clientY - ptrStart.y;
        const dist = Math.hypot(dx, dy);
        ptrStart = null;
        if (dist < 24)
            return; // tap — no move
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        doMove(dir);
    });
    wrap.addEventListener('pointercancel', () => { ptrStart = null; }); // lost capture: cancel safely
}
/* gamepad: d-pad/left stick = move, A = confirm, B/Start = pause */
let padPrev = {};
function pollGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads.find((p) => p && p.connected);
    if (gp && currentScreen === 'play' && !paused) {
        const pressed = (i) => gp.buttons[i]?.pressed ?? false;
        const axisX = gp.axes[0] ?? 0;
        const axisY = gp.axes[1] ?? 0;
        const dirs = [
            [pressed(12) || axisY < -0.6, 'up'],
            [pressed(13) || axisY > 0.6, 'down'],
            [pressed(14) || axisX < -0.6, 'left'],
            [pressed(15) || axisX > 0.6, 'right'],
        ];
        for (const [on, d] of dirs) {
            const key = { up: 12, down: 13, left: 14, right: 15 }[d];
            if (on && !padPrev[key])
                doMove(d);
            padPrev[key] = on;
        }
        if ((pressed(9) || pressed(1)) && !padPrev[9])
            togglePause();
        padPrev[9] = pressed(9) || pressed(1);
    }
}
/* ---------------- pause / lifecycle ---------------- */
function togglePause(force) {
    paused = force ?? !paused;
    const ov = $('overlay-pause');
    if (paused) {
        lastFocused = document.activeElement;
        // outside a run the same sheet is the settings dialog: run actions do not apply
        const inRun = currentScreen === 'play' && !!session.getActive();
        $('pause-h').textContent = inRun ? 'Paused' : 'Settings';
        $('btn-resume-play').textContent = inRun ? 'Resume' : 'Close';
        $('pause-run-actions').hidden = !inRun;
        ov.hidden = false;
        session.persistSnapshot();
        audio.suspendAudio();
        $('btn-resume-play').focus();
    }
    else {
        ov.hidden = true;
        audio.ensureAudio();
        lastFocused?.focus?.();
    }
}
function bindLifecycle() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && currentScreen === 'play' && !paused)
            togglePause(true);
    });
    window.addEventListener('resize', fitCanvas);
    window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 60));
}
function fitCanvas() {
    const wrap = $('board-wrap');
    const rect = wrap.getBoundingClientRect();
    render.resize(Math.max(1, rect.width), Math.max(1, rect.height), devicePixelRatio || 1);
}
// The board box also changes without a window resize (screen shown, chat
// sidebar, orientation): keep the drawing buffer sized to it.
if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => { if (currentScreen === 'play')
        fitCanvas(); }).observe($('board-wrap'));
}
/* ---------------- screens wiring ---------------- */
function refreshTitle() {
    const snap = session.resumeSnapshot();
    $('btn-resume').hidden = !snap;
    $('resume-note').hidden = !snap;
    const done = progress.journeyCompleted.length;
    $('journey-progress').textContent = `${done}/40 stages`;
    $('daily-date').textContent = `· ${session.utcToday()}`;
}
function openModeSetup(mode) {
    const setup = $('mode-setup');
    setup.hidden = false;
    setup.dataset.mode = mode;
    $('practice-opts').hidden = mode !== 'practice';
    $('challenge-opts').hidden = mode !== 'challenge';
    const rulesText = {
        practice: 'Unranked · undo allowed · about 5–15 minutes · solo.',
        challenge: 'Unranked · constrained goal · undo allowed except speed · solo.',
        score: 'Ranked locally · shared seed · no undo · one board per difficulty.',
    };
    $('mode-rules').textContent = rulesText[mode] ?? '';
    $('ranked-note').textContent = mode === 'score' ? 'This result is submitted to the score-chase leaderboard.' : 'This run does not affect competitive rating.';
    $('btn-mode-start').focus();
}
function startModeFromSetup() {
    const mode = $('mode-setup').dataset.mode ?? 'practice';
    if (mode === 'practice') {
        const goal = +$('practice-goal').value;
        const size = +$('practice-size').value;
        const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
        startRun('practice', `practice-${goal}-${size}`, { seed, size, goalTile: goal, allowUndo: true }, false);
    }
    else if (mode === 'challenge') {
        const kind = $('challenge-kind').value;
        const table = {
            moves: { id: 'challenge-moves', opts: { seed: 424242, size: 4, goalTile: 512, moveLimit: 60, allowUndo: true } },
            'moves-hard': { id: 'challenge-moves-hard', opts: { seed: 515151, size: 4, goalTile: 1024, moveLimit: 100, allowUndo: true } },
            speed: { id: 'challenge-speed', opts: { seed: 626262, size: 4, goalTile: 256, timeLimitMs: 120000, allowUndo: false } },
            wide: { id: 'challenge-wide', opts: { seed: 737373, size: 5, goalTile: 2048, allowUndo: true } },
        };
        const c = table[kind] ?? table.moves;
        startRun('challenge', c.id, c.opts, false);
    }
    else {
        const seed = 90210;
        startRun('challenge', 'score-chase', { seed, size: 4, goalTile: 4096, allowUndo: false }, true);
    }
}
function buildJourneyGrid() {
    const grid = $('journey-grid');
    grid.textContent = '';
    for (const s of content.JOURNEY) {
        const b = document.createElement('button');
        b.className = 'jcell';
        b.setAttribute('role', 'listitem');
        const done = progress.journeyCompleted.includes(s.index);
        if (done)
            b.classList.add('done');
        if (s.mastery)
            b.classList.add('mastery');
        b.textContent = String(s.index + 1);
        const bits = [`${s.name}`, `goal ${s.goalTile}`, `${s.size}×${s.size}`];
        if (s.moveLimit)
            bits.push(`${s.moveLimit} moves max`);
        bits.push(`theme ${s.theme}`, done ? 'completed' : 'not completed');
        b.setAttribute('aria-label', bits.join(', '));
        b.title = bits.join(' · ');
        b.addEventListener('click', () => {
            startRun('journey', s.id, content.stageOptions(s), false);
        });
        grid.appendChild(b);
    }
}
function buildLessonList() {
    const list = $('lesson-list');
    list.textContent = '';
    for (const l of content.LESSONS) {
        const b = document.createElement('button');
        b.className = 'card';
        const strong = document.createElement('strong');
        strong.textContent = `${l.index + 1}. ${l.title}`;
        const span = document.createElement('span');
        span.textContent = l.text;
        b.append(strong, span);
        b.addEventListener('click', () => startLesson(l));
        list.appendChild(b);
    }
}
let activeLesson = null;
function startLesson(l) {
    activeLesson = l;
    startRun('learn', l.id, content.lessonOptions(l), false);
    $('lesson-box').hidden = false;
    $('lesson-title').textContent = l.title;
    $('lesson-text').textContent = l.text;
}
function checkLessonProgress() {
    if (!activeLesson)
        return;
    const sess = session.getActive();
    if (!sess)
        return;
    const st = sess.state;
    const l = activeLesson;
    let doneMoves = st.moves >= l.requireMoves;
    if (l.id === 'lesson-merge')
        doneMoves = doneMoves && st.log.some((m) => m.merges.length > 0);
    if (l.id === 'lesson-survive')
        doneMoves = st.maxTile >= 32;
    if (doneMoves && !st.over) {
        st.won = true;
        st.over = true;
        st.terminalReason = 'goal-reached';
        st.score.milestoneBonus += 100;
        scheduleFinish(sess, 300);
        activeLesson = null;
        $('lesson-box').hidden = true;
    }
}
/* ---------------- render loop ---------------- */
function loop(time) {
    rafId = requestAnimationFrame(loop);
    if (document.hidden)
        return; // zero rendering heartbeat while hidden
    pollGamepad();
    const sess = session.getActive();
    if (currentScreen === 'play' && sess && !paused) {
        session.advanceClock();
        if (sess.state.timeLimitMs > 0)
            updateAll();
        if (sess.state.over && currentScreen === 'play' && !finishScheduled) {
            // timer-driven termination (move-driven endings reveal on their own delay)
            finishRun();
        }
    }
    if (glActive && currentScreen === 'play')
        render.frame(time);
}
/* ---------------- boot ---------------- */
function bindButtons() {
    $('btn-play').addEventListener('click', () => { audio.ensureAudio(); show('modes'); });
    $('btn-daily').addEventListener('click', () => {
        audio.ensureAudio();
        const day = session.utcToday();
        startRun('daily', `daily-${day}`, session.dailyOptions(day), true);
    });
    $('btn-journey').addEventListener('click', () => { buildJourneyGrid(); show('journey'); });
    $('btn-learn').addEventListener('click', () => { buildLessonList(); show('learn'); });
    $('btn-help').addEventListener('click', () => { ui.buildHelpCards($('help-cards')); show('help'); });
    $('btn-help-back').addEventListener('click', () => { show('title'); refreshTitle(); });
    $('btn-modes-back').addEventListener('click', () => { show('title'); refreshTitle(); });
    $('btn-journey-back').addEventListener('click', () => { show('title'); refreshTitle(); });
    $('btn-learn-back').addEventListener('click', () => { show('title'); refreshTitle(); });
    $('btn-resume').addEventListener('click', () => {
        const sess = session.resumeSnapshot();
        if (sess) {
            runFinished = false;
            finishScheduled = false;
            paused = false;
            setupBoard(sess.state);
            show('play');
            fitCanvas();
            updateAll();
        }
    });
    for (const card of document.querySelectorAll('#mode-cards .card')) {
        card.addEventListener('click', () => openModeSetup(card.dataset.mode ?? 'practice'));
    }
    $('btn-mode-start').addEventListener('click', startModeFromSetup);
    $('btn-mode-back').addEventListener('click', () => { $('mode-setup').hidden = true; });
    $('btn-pause').addEventListener('click', () => togglePause());
    $('btn-settings-top').addEventListener('click', () => togglePause(true));
    $('btn-resume-play').addEventListener('click', () => togglePause(false));
    $('btn-undo').addEventListener('click', doUndo);
    $('btn-hint').addEventListener('click', doHint);
    $('btn-restart').addEventListener('click', restartRun);
    $('btn-leave').addEventListener('click', leaveRun);
    $('btn-pause-restart').addEventListener('click', () => { togglePause(false); restartRun(); });
    $('btn-pause-leave').addEventListener('click', () => { togglePause(false); leaveRun(); });
    $('btn-retry').addEventListener('click', () => {
        const sess = session.getActive();
        if (sess && sess.mode === 'learn') {
            // a lesson restarts as a lesson: instructions and completion rule return
            const l = content.LESSONS.find((x) => x.id === sess.contentId);
            if (l) {
                startLesson(l);
                return;
            }
        }
        if (sess)
            startRun(sess.mode, sess.contentId, sess.opts, sess.ranked);
        else {
            show('title');
            refreshTitle();
        }
    });
    $('btn-results-menu').addEventListener('click', () => { show('title'); refreshTitle(); });
    $('btn-next').addEventListener('click', () => {
        const id = $('btn-next').dataset.nextId;
        if ($('btn-next').dataset.nextKind === 'learn') {
            const l = content.LESSONS.find((x) => x.id === id);
            if (l)
                startLesson(l);
            return;
        }
        const s = content.JOURNEY.find((x) => x.id === id);
        if (s)
            startRun('journey', s.id, content.stageOptions(s), false);
    });
    $('btn-replay-tutorial').addEventListener('click', () => {
        togglePause(false);
        buildLessonList();
        show('learn');
    });
}
function restartRun() {
    const sess = session.getActive();
    if (!sess)
        return;
    if (sess.mode === 'learn') {
        const l = content.LESSONS.find((x) => x.id === sess.contentId);
        if (l) {
            startLesson(l);
            return;
        }
    }
    startRun(sess.mode, sess.contentId, sess.opts, sess.ranked);
}
function leaveRun() {
    session.persistSnapshot();
    stopCountdown();
    show('title');
    refreshTitle();
}
function applyRenderMode() {
    const canvas = $('gl');
    const board = $('dom-board');
    if (settings.render3d && !glActive) {
        // reuse an existing context when possible: a disposed canvas cannot be re-acquired
        glActive = render.isReady() || render.initRender(canvas, { quality: settings.quality, reducedMotion: settings.reducedMotion });
        if (!glActive)
            announce('3D unavailable — using the accessible board view.');
    }
    else if (!settings.render3d && glActive) {
        glActive = false;
    }
    canvas.hidden = !glActive;
    board.classList.toggle('dom-primary', !glActive);
    board.classList.toggle('dom-mirror', glActive);
}
function onSettingsChanged(s) {
    settings = s;
    session.saveSettings(s);
    ui.applySettingsToDom(s);
    audio.configureAudio(s);
    applyRenderMode();
    render.updateQuality({ quality: s.quality, reducedMotion: s.reducedMotion });
    const sess = session.getActive();
    if (sess) {
        setupBoard(sess.state);
        fitCanvas();
    }
    updateAll();
}
async function boot() {
    ui.applySettingsToDom(settings);
    audio.configureAudio(settings);
    audio.onCaption(caption);
    ui.bindSettingsForm(settings, onSettingsChanged);
    bindButtons();
    bindPointer();
    bindLifecycle();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', () => audio.ensureAudio(), { once: true });
    // hosted mode: launch token → identity, cloud save, platform leaderboard
    const info = await platform.initPlatform();
    platform.onSyncStatus((s) => {
        if (!info.hosted)
            return;
        $('sync-status').textContent =
            s === 'saving' ? 'saving progress…'
                : s === 'offline' ? 'sync offline — progress saves on this device'
                    : 'progress synced to your account';
    });
    await applyCloudSave();
    // 3D init with graceful fallback
    applyRenderMode();
    fitCanvas();
    await syncServerTime();
    refreshProfileLine();
    show('title');
    refreshTitle();
    rafId = requestAnimationFrame(loop);
}
void boot();
