// The look per graphics level. The engine-owned effects (shadows and their map
// size, ambient occlusion, bloom, the grade, anti-aliasing) are the level's own
// (levelSettings(): the same table every StarHermit game reads). The game's art
// (shading, label textures, bevels, ambient particles, reflections, detail) is
// the browser build's four presets and budgets (src/gfx.ts TABLE / BUDGETS)
// keyed by the level's quality tier, with the ambient particles scaled within
// the tier by the level's particle budget against the tier's anchor level
// (quantum, molecular, terrestrial, galactic), at most 2×. The runtime owns the
// rest of what the old Settings › Graphics section did: Auto and the level
// choice, render scale and the pixel-ratio cap, adaptive resolution, the
// frame-rate limit and readout, the GPU summary. The old section's per-category
// overrides are not offered (the runtime's Options choose a level).
import { levelSettings, type GraphicsLevel, type LevelSettings, type QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Budget {
  /** Tile/board shading: Lambert (Low), Standard (Balanced), the authored Physical with clear coat (High/Ultra). */
  material: "lambert" | "standard" | "physical";
  /** Tile-number texture size in px (the ground's grid trace: the same). */
  label: number;
  /** Rounded-box segments for tiles and cells (detailed tiles). */
  bevel: number;
  /** Drifting ambient particles at Particles "high" (low: a third). */
  ambient: number;
}
export interface Look {
  preset: QualityTier;
  /** The level's key-light shadow map size, 0 when the level draws no shadows. */
  shadows: number;
  /** The level's ambient occlusion (null: off). */
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  /** The level's bloom resolution (null: off). */
  bloom: number | null;
  grade: boolean;
  antialias: AntialiasMode;
  reflections: boolean;
  /** Glossy bevelled tiles, grain, fog, the light-trace frame and the ground's circuit grid. */
  detailed: boolean;
  /** Ambient particles drawn. */
  particles: number;
  budget: Budget;
}

type Art = Pick<Look, "reflections" | "detailed"> & { share: number };
const ART: Record<QualityTier, Art> = {
  low: { reflections: false, detailed: false, share: 0 },
  balanced: { reflections: true, detailed: true, share: 1 / 3 },
  high: { reflections: true, detailed: true, share: 1 },
  ultra: { reflections: true, detailed: true, share: 1 },
};
const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", label: 128, bevel: 2, ambient: 90 },
  balanced: { material: "standard", label: 256, bevel: 2, ambient: 150 },
  high: { material: "physical", label: 256, bevel: 4, ambient: 220 },
  ultra: { material: "physical", label: 512, bevel: 6, ambient: 320 },
};
export const AMBIENT_MAX = 640;
/** The level whose settings are each tier's preset. */
const ANCHOR: Record<QualityTier, GraphicsLevel> = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" };

/** The look for a graphics level (the frame's by default). */
export function lookFor(s: LevelSettings = levelSettings()): Look {
  const preset = s.quality;
  const { share, ...art } = ART[preset];
  const b = BUDGETS[preset];
  // The particle budget grows with the level's particle budget above the tier's anchor, at most 2× (gfx.ts budgetFor).
  const k = Math.min(2, s.particles / levelSettings(ANCHOR[preset]).particles);
  const ambient = Math.min(AMBIENT_MAX, Math.round(b.ambient * k));
  return {
    preset, ...art,
    shadows: s.shadows ? s.shadowMapSize : 0,
    ao: s.ao && { resolution: s.ao.resolution, samples: s.ao.samples, denoiseSamples: s.ao.denoiseSamples },
    bloom: s.bloom ? s.bloom.resolution : null,
    grade: s.grade,
    // Engine 1.36.1 bug: antialias "off" recolours fog, haze and translucent overlays; the old Low's MSAA
    // stays until engine 1.36.2 (drop this clamp when pinning 1.36.2+).
    antialias: s.antialias === "off" ? "msaa" : s.antialias,
    particles: Math.round(ambient * share),
    budget: { ...b, label: Math.min(b.label, s.maxTextureSize), ambient },
  };
}
