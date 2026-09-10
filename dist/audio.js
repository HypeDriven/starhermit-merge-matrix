let ctx = null;
let buses = {};
let master = null;
let settings = null;
let captionCb = null;
let ambienceNodes = null;
let musicTimer = null;
let musicStep = 0;
let musicIntensity = 0; // 0 calm, 1 tense — adaptive layer
export function configureAudio(s) {
    settings = s;
    applyVolumes();
}
export function onCaption(cb) {
    captionCb = cb;
}
function caption(text) {
    if (settings?.captions && captionCb)
        captionCb(text);
}
export function ensureAudio() {
    if (ctx) {
        if (ctx.state === 'suspended')
            void ctx.resume();
        return;
    }
    try {
        ctx = new (window.AudioContext || globalThis.webkitAudioContext)();
        master = ctx.createGain();
        master.connect(ctx.destination);
        for (const b of ['music', 'fx', 'ambience']) {
            const g = ctx.createGain();
            g.connect(master);
            buses[b] = g;
        }
        applyVolumes();
        startAmbience();
        startMusic();
    }
    catch { /* audio unavailable; game remains playable silently */ }
}
export function applyVolumes() {
    if (!master || !settings)
        return;
    master.gain.value = settings.muted ? 0 : 1;
    if (buses.music)
        buses.music.gain.value = settings.music * 0.5;
    if (buses.fx)
        buses.fx.gain.value = settings.fx;
    if (buses.ambience)
        buses.ambience.gain.value = settings.ambience * 0.35;
}
export function suspendAudio() { if (ctx && ctx.state === 'running')
    void ctx.suspend(); }
/** Deterministic pitch variant from a seed so replays sound identical. */
function variant(base, seed, spread = 0.06) {
    let t = (seed >>> 0) || 1;
    t ^= t << 13;
    t ^= t >>> 17;
    t ^= t << 5;
    const u = ((t >>> 0) % 1000) / 1000;
    return base * (1 + (u - 0.5) * 2 * spread);
}
function tone(bus, freq, dur, type, gain, when = 0, slideTo) {
    if (!ctx || !buses[bus])
        return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo)
        o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(buses[bus]);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
}
function noiseBurst(bus, dur, gain, filterFreq) {
    if (!ctx || !buses[bus])
        return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(buses[bus]);
    src.start();
}
/* ---------- authored sample one-shots (sfx/*.opus) with synthesis fallback ---------- */
/** Event → authored clip basename(s) from sfx/manifest.json. */
const SAMPLE_MAP = {
    uiMove: 'ui-tap',
    uiBack: 'ui-back',
    ack: 'move-tick',
    slide: 'tile-slide',
    merge: ['merge-low', 'merge-mid', 'merge-high', 'merge-max'],
    invalid: 'blocked-thud',
    milestone: 'milestone-chime',
    gameOver: 'game-over',
    undo: 'undo-whoosh',
    achievement: 'achievement-fanfare',
    countdown: 'countdown-tick',
    countdownGo: 'countdown-go',
    hint: 'hint-ping',
    newBest: 'best-flourish',
};
const sampleState = new Map();
const sampleBuffers = new Map();
/** Lazy fetch/decode/cache; only after the user-gesture unlock created ctx. */
function loadSample(name) {
    if (!ctx || sampleState.has(name))
        return;
    sampleState.set(name, 'loading');
    fetch(`sfx/${name}.opus`)
        .then((r) => { if (!r.ok)
        throw new Error(`sfx ${name}: ${r.status}`); return r.arrayBuffer(); })
        .then((ab) => (ctx ? ctx.decodeAudioData(ab) : Promise.reject(new Error('ctx-gone'))))
        .then((buf) => { sampleBuffers.set(name, buf); sampleState.set(name, 'ready'); })
        .catch(() => { sampleState.set(name, 'failed'); });
}
/** Start a ready sample on the fx bus; false → caller runs its synthesis fallback. */
function playSample(name) {
    if (!ctx || !buses.fx)
        return false;
    if (sampleState.get(name) === 'ready') {
        const src = ctx.createBufferSource();
        src.buffer = sampleBuffers.get(name);
        src.connect(buses.fx);
        src.start();
        return true;
    }
    loadSample(name);
    return false;
}
function mergeSample(value) {
    const names = SAMPLE_MAP.merge;
    return value >= 2048 ? names[3] : value >= 512 ? names[2] : value >= 64 ? names[1] : names[0];
}
export const sfx = {
    uiMove() { if (!playSample(SAMPLE_MAP.uiMove))
        tone('fx', 520, 0.05, 'triangle', 0.12); },
    uiBack() { if (!playSample(SAMPLE_MAP.uiBack))
        tone('fx', 330, 0.06, 'triangle', 0.1); },
    ack(seed) {
        if (!playSample(SAMPLE_MAP.ack))
            tone('fx', variant(392, seed), 0.06, 'sine', 0.15);
        caption('tick');
    },
    slide(seed) {
        if (!playSample(SAMPLE_MAP.slide)) {
            tone('fx', variant(300, seed), 0.09, 'sine', 0.16, 0, 380);
            noiseBurst('fx', 0.05, 0.04, 3000);
        }
        caption('slide');
    },
    merge(seed, value) {
        if (!playSample(mergeSample(value))) {
            const f = 340 + Math.min(10, Math.log2(value)) * 60;
            tone('fx', variant(f, seed), 0.12, 'triangle', 0.22);
            tone('fx', variant(f * 1.5, seed + 7), 0.14, 'sine', 0.14, 0.03);
        }
        caption(`merge ${value}`);
    },
    invalid() {
        if (!playSample(SAMPLE_MAP.invalid))
            tone('fx', 140, 0.12, 'sawtooth', 0.08);
        caption('blocked');
    },
    milestone() {
        if (!playSample(SAMPLE_MAP.milestone)) {
            for (let i = 0; i < 4; i++)
                tone('fx', 440 * Math.pow(1.335, i), 0.22, 'triangle', 0.18, i * 0.09);
        }
        caption('milestone reached');
    },
    gameOver() {
        if (!playSample(SAMPLE_MAP.gameOver)) {
            tone('fx', 220, 0.5, 'sine', 0.2, 0, 110);
            tone('fx', 165, 0.6, 'sine', 0.15, 0.15, 82);
        }
        caption('run ended');
    },
    undo() {
        if (!playSample(SAMPLE_MAP.undo))
            tone('fx', 500, 0.08, 'sine', 0.12, 0, 350);
        caption('undo');
    },
    achievement() {
        if (!playSample(SAMPLE_MAP.achievement)) {
            tone('fx', 660, 0.15, 'triangle', 0.16);
            tone('fx', 990, 0.25, 'sine', 0.14, 0.1);
        }
        caption('achievement unlocked');
    },
    countdown(n) {
        if (!playSample(SAMPLE_MAP.countdown))
            tone('fx', 440 + n * 40, 0.08, 'sine', 0.14);
        caption(`countdown ${n}`);
    },
    countdownGo() {
        if (!playSample(SAMPLE_MAP.countdownGo)) {
            tone('fx', 523.2, 0.12, 'triangle', 0.18);
            tone('fx', 784, 0.18, 'sine', 0.14, 0.06);
        }
        caption('go');
    },
    hint() {
        if (!playSample(SAMPLE_MAP.hint))
            tone('fx', 880, 0.14, 'sine', 0.12);
        caption('hint');
    },
    newBest() {
        if (!playSample(SAMPLE_MAP.newBest)) {
            tone('fx', 587.3, 0.16, 'triangle', 0.16);
            tone('fx', 880, 0.28, 'sine', 0.14, 0.11);
        }
        caption('new personal best');
    },
};
function startAmbience() {
    if (!ctx || !buses.ambience || ambienceNodes)
        return;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.value = 55;
    o2.type = 'sine';
    o2.frequency.value = 82.5;
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 0.25;
    g.gain.value = 0.5;
    lfo.connect(lfoG).connect(g.gain);
    o1.connect(g);
    o2.connect(g);
    g.connect(buses.ambience);
    o1.start();
    o2.start();
    lfo.start();
    ambienceNodes = { stop: () => { o1.stop(); o2.stop(); lfo.stop(); } };
}
/** Adaptive music: sparse pulse whose layer intensity follows board tension. */
export function setMusicIntensity(v) {
    musicIntensity = Math.max(0, Math.min(1, v));
}
function startMusic() {
    if (!ctx || musicTimer)
        return;
    const scale = [220, 261.6, 329.6, 392, 440, 523.2];
    musicTimer = setInterval(() => {
        if (!ctx || ctx.state !== 'running' || document.hidden)
            return;
        musicStep++;
        if (musicStep % 4 === 0)
            tone('music', 110, 0.5, 'sine', 0.25);
        const density = musicIntensity > 0.6 ? 1 : 2; // play every step when tense
        if (musicStep % density === 0) {
            const idx = (musicStep * 7) % scale.length;
            tone('music', scale[idx], 0.3, 'triangle', 0.1 + musicIntensity * 0.08);
        }
    }, 300);
}
