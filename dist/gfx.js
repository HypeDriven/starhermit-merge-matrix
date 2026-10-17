/**
 * Merge Matrix — graphics quality model: presets, per-category overrides, StarHermit
 * hardware-level detection, per-preset budgets and a cost summary. Pure (no three.js, no DOM) so the settings
 * panel, the renderer and the unit tests agree on what a setting means.
 */
export const PRESETS = ['low', 'balanced', 'high', 'ultra'];
/** Category → allowed tiers, cheapest first. */
export const CATEGORIES = {
    shadows: ['off', 'low', 'medium', 'high'],
    ao: ['off', 'on', 'high'],
    bloom: ['off', 'on'],
    grade: ['off', 'on'],
    antialias: ['off', 'fxaa', 'smaa', 'msaa'],
    reflections: ['off', 'on'],
    detail: ['plain', 'detailed'],
    particles: ['off', 'low', 'high'],
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES);
/** Each preset is a row of tiers, a render scale and a device-pixel-ratio cap. */
const TABLE = {
    low: { scale: 1, pixelCap: 1, shadows: 'off', ao: 'off', bloom: 'off', grade: 'off', antialias: 'msaa', reflections: 'off', detail: 'plain', particles: 'off' },
    balanced: { scale: 1, pixelCap: 1.5, shadows: 'low', ao: 'off', bloom: 'on', grade: 'on', antialias: 'fxaa', reflections: 'on', detail: 'detailed', particles: 'low' },
    high: { scale: 1, pixelCap: 2, shadows: 'medium', ao: 'on', bloom: 'on', grade: 'on', antialias: 'smaa', reflections: 'on', detail: 'detailed', particles: 'high' },
    ultra: { scale: 1.25, pixelCap: 2, shadows: 'high', ao: 'high', bloom: 'on', grade: 'on', antialias: 'msaa', reflections: 'on', detail: 'detailed', particles: 'high' },
};
export const SHADOW_MAP = { off: 0, low: 1024, medium: 2048, high: 4096 };
export const DEFAULT_GFX = { preset: 'auto', render_scale: 1, adaptive: true, show_fps: false };
const gpuApi = () => globalThis.StarHermitGpu;
/**
 * Auto picks the preset from the StarHermit hardware level (0 = Galaxy S20 / Intel UHD or weaker, 20 = RTX
 * 5090): Low from 0, Balanced from 4, High from 10, Ultra from 17. Phones, tablets and ≤ 4 GB machines are
 * capped at level 9 (Balanced); software renderers and no WebGL are level 0.
 */
export const LEVELS = { low: 0, balanced: 4, high: 10, ultra: 17 };
/** Hardware level 0–20 for an unmasked renderer string plus StarHermitGpu.detectSystem() facts. */
export function detectLevel(gpu, system) {
    const G = gpuApi();
    const sys = { webgl: true, webgl2: true, ...(system || {}), gpu: String(gpu || '') };
    if (!gpu)
        sys.webgl = false;
    return G ? G.detectLevel(sys) : gpu ? LEVELS.balanced : 0;
}
/** The preset Auto starts from for a hardware level. */
export function presetForLevel(level) {
    const G = gpuApi();
    if (G)
        return G.presetForLevel(level, LEVELS);
    return PRESETS.filter((p) => LEVELS[p] <= level).pop() ?? 'low';
}
/** Best preset for this GPU (the hardware level already caps phones/tablets at Balanced). */
export function detectPreset(gpu, system) {
    return presetForLevel(detectLevel(gpu, system));
}
export const BUDGETS = {
    low: { material: 'lambert', label: 128, bevel: 2, ambient: 90, bloomRes: 0.5, aoRes: 0.5 },
    balanced: { material: 'standard', label: 256, bevel: 2, ambient: 150, bloomRes: 0.5, aoRes: 0.5 },
    high: { material: 'physical', label: 256, bevel: 4, ambient: 220, bloomRes: 0.5, aoRes: 0.5 },
    ultra: { material: 'physical', label: 512, bevel: 6, ambient: 320, bloomRes: 1, aoRes: 1 },
};
export const AMBIENT_MAX = 640;
const PARTICLE_SHARE = { off: 0, low: 1 / 3, high: 1 };
/** A preset's concrete budget for a hardware level (the particle count scales ≤ 2× within the preset). */
export function budgetFor(preset, level) {
    const b = { ...(BUDGETS[preset] ?? BUDGETS.balanced) };
    const G = gpuApi(), floor = LEVELS[preset] ?? 0;
    const lv = Math.max(Number.isFinite(level) ? level : floor, floor);
    const k = G ? Math.min(2, G.scaleBudget(1, lv, floor)) : 1;
    b.ambient = Math.min(AMBIENT_MAX, Math.round(b.ambient * k));
    return b;
}
/** Ambient particles drawn for a resolved setting (Particles tier share of the preset's budget). */
export function particleCount(r) {
    return Math.round(r.budget.ambient * (PARTICLE_SHARE[r.particles] ?? 0));
}
function isPreset(v) {
    return PRESETS.includes(v);
}
export function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
}
/** Resolve saved settings into concrete tiers. */
export function resolve(saved, detected, level) {
    const s = saved || {};
    const preset = isPreset(s.preset) ? s.preset : isPreset(detected) ? detected : 'balanced';
    const row = TABLE[preset];
    const out = {
        preset,
        auto: !isPreset(s.preset),
        scale: row.scale * clamp(Number(s.render_scale) || 1, 0.5, 2),
        pixelCap: row.pixelCap,
        adaptive: s.adaptive !== false,
        showFps: !!s.show_fps,
        level: Number.isFinite(level) ? level : LEVELS[preset],
    };
    out.budget = budgetFor(preset, out.level);
    for (const cat of CATEGORY_KEYS) {
        const tiers = CATEGORIES[cat];
        out[cat] = tiers.includes(s[cat]) ? s[cat] : row[cat];
    }
    // Post-processing runs only when something needs it; otherwise canvas MSAA is used.
    out.post = out.ao !== 'off' || out.bloom === 'on' || out.grade === 'on' || out.antialias === 'fxaa' || out.antialias === 'smaa';
    return out;
}
/** The preset's own tier for a category (for "From preset (…)" labels). */
export function presetTier(preset, cat) {
    return TABLE[preset]?.[cat];
}
/** Choosing a preset clears every per-category override (scale and toggles stay). */
export function choosePreset(saved, preset) {
    return {
        preset: preset === 'auto' || isPreset(preset) ? preset : 'auto',
        render_scale: saved.render_scale ?? 1,
        adaptive: saved.adaptive !== false,
        show_fps: !!saved.show_fps,
    };
}
const EN_WORDS = {
    noShadows: 'no shadows', shadows: 'shadows', ao: 'ambient occlusion', aoHigh: 'full ambient occlusion', bloom: 'bloom', noAa: 'no anti-aliasing',
};
export function describe(r, pixels, words = EN_WORDS) {
    const parts = [
        r.shadows === 'off' ? words.noShadows : `${SHADOW_MAP[r.shadows]}² ${words.shadows}`,
        r.ao === 'off' ? null : r.ao === 'high' ? words.aoHigh : words.ao,
        r.bloom === 'on' ? words.bloom : null,
        r.antialias === 'off' ? words.noAa : r.antialias.toUpperCase(),
        pixels && pixels[0] > 1 && pixels[1] > 1 ? `${pixels[0]}×${pixels[1]} px` : null,
    ];
    return parts.filter(Boolean).join(' · ');
}
/** Adaptive resolution step: slow frames step down 0.1 (min 0.6), fast ones back up 0.05 (max 1). */
export function adaptStep(scale, avgFrameMs) {
    if (avgFrameMs > 26)
        return Math.max(0.6, Math.round((scale - 0.1) * 100) / 100);
    if (avgFrameMs < 14 && scale < 1)
        return Math.min(1, Math.round((scale + 0.05) * 100) / 100);
    return scale;
}
