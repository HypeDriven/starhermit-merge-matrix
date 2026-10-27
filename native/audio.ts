// Sound, as the browser build's src/audio.ts: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json) per game event, the adaptive music (a
// sparse triangle pulse every 300 ms step whose density and level follow the
// board's tension, a low 110 Hz note every fourth step) and the ambience (two
// low sines, 55 and 82.5 Hz, swelling with a slow LFO), plus the captions every
// cue emits.
//
// The browser build's buses become the runtime's (Options › Audio owns the
// volumes and the mute): music → "music", effects → "effects", the ambience
// plays on "music" (the runtime has no ambience bus); the old default bus
// levels (music 50 % × 0.5, effects 80 %, ambience 40 % × 0.35) are folded into
// each sound's gain. The music notes and the ambience loop are rendered into
// clips (createClip; the 14 s ambience in slices over several frames): a live
// synthesis graph makes clip loads fail on the engine's web runtime. The
// synthesized stand-ins the browser build played while a sample decoded are
// not ported, so a sample still loading is silent (its caption still shows).
// Clips load once the mixer runs (natively at once, in a browser after the
// first press), one at a time. The pause sheet holds all sound, as the
// browser build suspended its audio context there.
import { context, createClip, loadClip, play as playClip, type AudioClip, type Sound } from "starhermit:audio";

/** Marks an English caption key (translated where shown). */
const N = (key: string): string => key;
const LEVEL = { music: 0.25, effects: 0.8, ambience: 0.14 };
/** audio.ts SAMPLE_MAP. */
const SFX: Record<string, string> = {
  uiMove: "ui-tap", uiBack: "ui-back", ack: "move-tick", slide: "tile-slide", invalid: "blocked-thud", milestone: "milestone-chime",
  gameOver: "game-over", undo: "undo-whoosh", achievement: "achievement-fanfare", countdown: "countdown-tick", countdownGo: "countdown-go",
  hint: "hint-ping", newBest: "best-flourish",
};
const MERGE = ["merge-low", "merge-mid", "merge-high", "merge-max"];
/** audio.ts caption keys (translated where shown). */
const CAPTIONS: Record<string, string> = {
  ack: N("tick"), slide: N("slide"), invalid: N("blocked"), milestone: N("milestone reached"), gameOver: N("run ended"), undo: N("undo"),
  achievement: N("achievement unlocked"), countdownGo: N("go"), hint: N("hint"), newBest: N("new personal best"),
};

const clips = new Map<string, AudioClip>();
const queue: string[] = [];
let loading = false;
let wantClips = false;
let suspended = false;
let captionFn: ((key: string, vars?: Record<string, string | number>) => void) | null = null;

/** The caption line's listener (English keys and their placeholders, translated where shown). */
export function onCaption(fn: (key: string, vars?: Record<string, string | number>) => void): void { captionFn = fn; }

function load(name: string): void { if (!queue.includes(name) && !clips.has(name)) queue.push(name); }
function pump(): void {
  if (loading || !queue.length) return;
  const name = queue.shift()!;
  loading = true;
  loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); loading = false; }, (e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); loading = false; });
}
/** Asks for the clips; they load once the mixer runs (see update). */
export function loadSfx(): void { wantClips = true; }
/** The pause sheet (and a hidden window) holds all sound. */
export function setSuspended(on: boolean): void { suspended = on; }

function playSample(file: string): void {
  if (suspended) return;
  const clip = clips.get(file);
  if (!clip) return;
  try { playClip(clip, { bus: "effects", gain: LEVEL.effects }); }
  catch { clips.delete(file); load(file); } // a clip the mixer lost: load it again
}
function cue(event: string, vars?: Record<string, string | number>): void {
  const cap = CAPTIONS[event];
  if (cap && captionFn) captionFn(cap, vars);
  const file = SFX[event];
  if (file) playSample(file);
}
export const sfx = {
  uiMove: (): void => cue("uiMove"),
  uiBack: (): void => cue("uiBack"),
  ack: (): void => cue("ack"),
  slide: (): void => cue("slide"),
  merge(value: number): void {
    captionFn?.(N("merge {value}"), { value });
    playSample(value >= 2048 ? MERGE[3]! : value >= 512 ? MERGE[2]! : value >= 64 ? MERGE[1]! : MERGE[0]!);
  },
  invalid: (): void => cue("invalid"),
  milestone: (): void => cue("milestone"),
  gameOver: (): void => cue("gameOver"),
  undo: (): void => cue("undo"),
  achievement: (): void => cue("achievement"),
  countdown(n: number): void { captionFn?.(N("countdown {n}"), { n }); playSample(SFX.countdown!); },
  countdownGo: (): void => cue("countdownGo"),
  hint: (): void => cue("hint"),
  newBest: (): void => cue("newBest"),
};

// -- rendered clips ------------------------------------------------------------------------------
const RATE = 22050;
/** audio.ts tone(): a 8 ms rise to `gain`, then an exponential fall to 0.0001 over `dur`. */
function toneClip(freq: number, dur: number, type: "sine" | "triangle", gain: number): AudioClip {
  const n = Math.round((dur + 0.05) * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const ph = (t * freq) % 1;
    const w = type === "sine" ? Math.sin(2 * Math.PI * ph) : 1 - 4 * Math.abs(ph - 0.5);
    const env = t < 0.008 ? 0.0001 * Math.pow(gain / 0.0001, t / 0.008) : t < dur ? gain * Math.pow(0.0001 / gain, (t - 0.008) / (dur - 0.008)) : 0;
    out[i] = w * env;
  }
  return createClip([out], RATE);
}
/** audio.ts startAmbience: 55 + 82.5 Hz sines at 0.5, the sum's gain swung ±0.25 by a slow LFO (0.07 Hz; here
 * 1/14 Hz so the 14 s loop is seamless). Rendered at 11025 Hz in slices of 22050 samples a frame. */
const AMB_RATE = 11025, AMB_SECONDS = 14;
let ambData: Float32Array | null = null;
let ambDone = 0;
function ambienceSlice(): AudioClip | null {
  const n = AMB_RATE * AMB_SECONDS;
  if (!ambData) ambData = new Float32Array(n);
  const end = Math.min(n, ambDone + 22050);
  for (let i = ambDone; i < end; i++) {
    const t = i / AMB_RATE;
    const g = 0.5 + 0.25 * Math.sin(2 * Math.PI * t / AMB_SECONDS);
    ambData[i] = (Math.sin(2 * Math.PI * 55 * t) + Math.sin(2 * Math.PI * 82.5 * t)) * g * 0.5;
  }
  ambDone = end;
  if (ambDone < n) return null;
  const clip = createClip([ambData], AMB_RATE);
  ambData = null;
  return clip;
}

// -- music and ambience ----------------------------------------------------------------------------
const SCALE = [220, 261.6, 329.6, 392, 440, 523.2];
const notes = new Map<number, AudioClip>();
let low: AudioClip | null = null;
let ambience: AudioClip | null = null;
let ambSound: Sound | null = null;
let started = false;
let musicStep = 0;
let nextStep = 0;
let intensity = 0; // 0 calm, 1 tense: the adaptive layer

/** Ambience and music run from the first press on (audio.ts ensureAudio; natively from the start). */
export function start(): void { started = true; }
/** audio.ts setMusicIntensity: the board's fill (0 empty … 1 full). */
export function setMusicIntensity(v: number): void { intensity = Math.max(0, Math.min(1, v)); }

/** Each frame: the samples once the mixer runs (one at a time), the rendered clips one a frame after them, then
 * the ambience by state and the music's next step by mixer time. */
export function update(): void {
  if (context.state !== "running") return;
  if (wantClips) {
    wantClips = false;
    for (const n of [...Object.values(SFX), ...MERGE]) load(n);
    return;
  }
  pump();
  if (loading || queue.length) return;
  for (const f of SCALE) if (!notes.has(f)) { notes.set(f, toneClip(f, 0.3, "triangle", 1)); return; }
  if (!low) { low = toneClip(110, 0.5, "sine", 1); return; }
  if (!ambience) { ambience = ambienceSlice(); return; }
  const want = started && !suspended;
  try {
    if (want && !ambSound) ambSound = playClip(ambience, { bus: "music", gain: LEVEL.ambience, loop: true });
    else if (!want && ambSound) { ambSound.stop(); ambSound = null; }
  } catch (e) { console.warn(`audio: ${String(e)}`); return; }
  if (!want) return;
  const now = context.currentTime;
  if (now < nextStep) return;
  nextStep = Math.max(now, nextStep) + 0.3;
  musicStep++;
  try {
    if (musicStep % 4 === 0) playClip(low, { bus: "music", gain: LEVEL.music * 0.25 });
    const density = intensity > 0.6 ? 1 : 2; // every step when tense
    if (musicStep % density === 0) {
      playClip(notes.get(SCALE[(musicStep * 7) % SCALE.length]!)!, { bus: "music", gain: LEVEL.music * (0.1 + intensity * 0.08) });
    }
  } catch { /* the mixer is full */ }
}
