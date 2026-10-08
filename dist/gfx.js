/**
 * Merge Matrix — graphics quality model: presets, per-category overrides, GPU
 * detection and a cost summary. Pure (no three.js, no DOM) so the settings
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
export const PARTICLE_COUNT = { off: 0, low: 70, high: 220 };
export const DEFAULT_GFX = { preset: 'auto', render_scale: 1, adaptive: true, show_fps: false };
/**
 * Best preset for this GPU, from the unmasked renderer string when exposed.
 * Software renderers get Low; discrete GPUs and Apple M get High; the rest
 * Balanced. Touch/mobile devices are capped at Balanced.
 */
export function detectPreset(gpu, touch = false) {
    const g = String(gpu || '').toLowerCase();
    let p = 'balanced';
    if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g))
        p = 'low';
    else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon(?!.*graphics)|apple m\d/.test(g))
        p = 'high';
    if (touch && p === 'high')
        p = 'balanced';
    return p;
}
function isPreset(v) {
    return PRESETS.includes(v);
}
export function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
}
/** Resolve saved settings into concrete tiers. */
export function resolve(saved, detected) {
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
    };
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
