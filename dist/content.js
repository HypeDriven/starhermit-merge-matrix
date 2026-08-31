/**
 * Merge Matrix — versioned content: journey stages, lessons, challenges, themes, achievements.
 * All content is generated deterministically from authored parameters, then validated offline.
 */
import { createGame, applyMove, legalMoves } from './rules.js';
export const CONTENT_VERSION = 1;
export const THEMES = [
    {
        id: 'matrix', name: 'Dark Matrix', bg: '#0a0e1a', grid: '#131b2e', cell: '#1d2942',
        tiles: { 0: '#3b82f6', 2: '#22407a', 4: '#2b5cb8', 8: '#3f8cff', 16: '#37b6ff', 32: '#41d9c0', 64: '#5ee6a8', 128: '#ffe066', 256: '#ffb84d', 512: '#ff8c5a', 1024: '#ff5a7a', 2048: '#e14dff', 4096: '#9d5cff' },
        textLight: true, accent: '#41d9c0',
    },
    {
        id: 'ember', name: 'Ember Glass', bg: '#170d0a', grid: '#241310', cell: '#331b16',
        tiles: { 0: '#ff8c5a', 2: '#5a2a1d', 4: '#7a3520', 8: '#a34a24', 16: '#c95f2c', 32: '#e8762f', 64: '#ff9040', 128: '#ffb84d', 256: '#ffe066', 512: '#fff3a0', 1024: '#ff5a5a', 2048: '#ff2d78', 4096: '#c95cff' },
        textLight: true, accent: '#ffb84d',
    },
    {
        id: 'verdant', name: 'Verdant Circuit', bg: '#0a140d', grid: '#11241a', cell: '#183325',
        tiles: { 0: '#5ee6a8', 2: '#1d4a33', 4: '#276344', 8: '#31805a', 16: '#3ea873', 32: '#52d491', 64: '#7df0ae', 128: '#b8f7c9', 256: '#e3f9a0', 512: '#ffe066', 1024: '#ffb84d', 2048: '#41d9c0', 4096: '#37b6ff' },
        textLight: true, accent: '#5ee6a8',
    },
    {
        id: 'mono', name: 'High Contrast', bg: '#000000', grid: '#111111', cell: '#222222',
        tiles: { 0: '#ffffff', 2: '#444444', 4: '#666666', 8: '#888888', 16: '#aaaaaa', 32: '#cccccc', 64: '#ffffff', 128: '#ffdf00', 256: '#00e5ff', 512: '#00ff85', 1024: '#ff6d00', 2048: '#ff00a8', 4096: '#b388ff' },
        textLight: true, accent: '#ffffff',
    },
    {
        id: 'paper', name: 'Light Paper', bg: '#e8e6df', grid: '#d4d1c6', cell: '#c2beb1',
        tiles: { 0: '#3056a3', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#3056a3', 2048: '#25427e', 4096: '#1b3059' },
        textLight: false, accent: '#3056a3',
    },
];
export const ACHIEVEMENTS = [
    { key: 'first-clear', name: 'First Light', desc: 'Complete your first stage or reach your first goal tile.' },
    { key: 'mechanic-mastery', name: 'Matrix Adept', desc: 'Complete a mastery stage in Journey.' },
    { key: 'streak-7', name: 'Seven-Day Circuit', desc: 'Play the daily challenge on 7 different days.' },
    { key: 'tile-4096', name: 'Deep Signal', desc: 'Create a 4096 tile in any mode.' },
    { key: 'journey-half', name: 'Long Haul', desc: 'Complete 20 Journey stages. Any settings, any assists.' },
];
export const LESSONS = [
    {
        id: 'lesson-slide', index: 0, title: 'Slide the matrix',
        text: 'Use arrow keys, WASD, or swipe to slide every block. Blocks move as far as they can. Make 3 moves to continue.',
        seed: 101, goalTile: 64, requireMoves: 3, hintDir: 'left',
    },
    {
        id: 'lesson-merge', index: 1, title: 'Merge equals',
        text: 'When two blocks with the same number collide, they combine into one worth twice as much — and you score the new value. Make 4 moves and merge at least once.',
        seed: 202, goalTile: 64, requireMoves: 4,
    },
    {
        id: 'lesson-survive', index: 2, title: 'Mind the empty cells',
        text: 'After every move a new block appears. If the matrix fills with no merges left, the run ends. Reach a 32 tile to finish training.',
        seed: 303, goalTile: 32, requireMoves: 0,
    },
];
/** Authored journey parameters; the 40 stages follow the teach→combine→test arc. */
export function journeyStages() {
    const stages = [];
    const goals = [128, 256, 512, 1024, 2048];
    for (let i = 0; i < 40; i++) {
        const band = Math.floor(i / 8); // 0..4 difficulty bands
        const mastery = (i + 1) % 8 === 0; // every 8th is a mastery test
        const goalTile = goals[Math.min(band, goals.length - 1)];
        const constrained = band >= 2 && (i % 3 === 2); // later bands mix in move limits
        const size = band >= 4 && i % 2 === 1 ? 5 : 4; // altered layout late
        const par = 40 + band * 30 + (size - 4) * 30;
        stages.push({
            id: `j${String(i + 1).padStart(2, '0')}`,
            index: i,
            name: mastery ? `Mastery ${Math.floor(i / 8) + 1}` : `Stage ${i + 1}`,
            seed: 1000 + i * 7919,
            size,
            goalTile: mastery ? goalTile * 2 : goalTile,
            moveLimit: constrained ? par + 20 : 0,
            timeLimitMs: 0,
            parMoves: par,
            theme: THEMES[i % THEMES.length].id,
            tutorialFlag: i === 0 ? 'journey-intro' : null,
            mastery,
        });
    }
    return stages;
}
export const JOURNEY = journeyStages();
export function stageOptions(s) {
    return { seed: s.seed, size: s.size, goalTile: s.goalTile, moveLimit: s.moveLimit, timeLimitMs: s.timeLimitMs, allowUndo: !s.mastery };
}
export function lessonOptions(l) {
    return { seed: l.seed, size: 4, goalTile: l.goalTile, allowUndo: true };
}
export function validateStage(s, maxSimMoves = 4000) {
    const issues = [];
    if (!s.id || s.seed < 0 || s.goalTile < 8)
        issues.push({ stage: s.id, issue: 'bad-fields' });
    if (s.size < 2 || s.size > 8)
        issues.push({ stage: s.id, issue: 'bad-size' });
    // basic legality: initial state must have at least one legal move
    const st = createGame(stageOptions(s));
    if (legalMoves(st).length === 0)
        issues.push({ stage: s.id, issue: 'initial-softlock' });
    // reachable goals + bounded duration: a rotating deterministic policy should
    // reach the goal or terminate legitimately within the simulation budget
    const sim2 = createGame(stageOptions(s));
    let reached = false;
    for (let m = 0; m < maxSimMoves && !sim2.over; m++) {
        if (sim2.maxTile >= sim2.goalTile) {
            reached = true;
            break;
        }
        let applied = false;
        const order = ['down', 'left', 'right', 'up'];
        // cycle starting direction by move count for variety
        const rot = m % 4;
        for (let k = 0; k < 4 && !applied; k++) {
            const d = order[(k + rot) % 4];
            const r = applyMove(sim2, d);
            if (r.ok)
                applied = true;
        }
        if (!applied)
            break;
    }
    if (sim2.maxTile >= sim2.goalTile)
        reached = true;
    if (!reached && !sim2.over)
        issues.push({ stage: s.id, issue: 'unbounded-duration' });
    if (!reached && sim2.over && sim2.terminalReason !== 'move-limit-exhausted') {
        // greedy dying is acceptable for hard stages only if goal plausibly reachable; flag for review
        issues.push({ stage: s.id, issue: 'greedy-unreached' });
    }
    return issues;
}
export function validateAll() {
    const out = [];
    for (const s of JOURNEY)
        out.push(...validateStage(s));
    return out;
}
/** Difficulty score from depth/constraint parameters, not just number size. */
export function difficultyOf(s) {
    let d = Math.log2(s.goalTile) * 10;
    if (s.moveLimit > 0)
        d += 30;
    if (s.timeLimitMs > 0)
        d += 25;
    if (s.size > 4)
        d += 10;
    if (!s.mastery === false)
        d += 5;
    if (s.mastery)
        d += 10;
    return Math.round(d);
}
