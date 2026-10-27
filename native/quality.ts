// The look per graphics level: the browser build's four presets and budgets
// (src/gfx.ts TABLE / BUDGETS, each tuned to hold 60 FPS on the weakest GPU
// its Auto gave it) keyed by the runtime's quality tier (frame().quality),
// with the ambient particles scaled within the tier by the level
// (frame().levelIndex), as the browser build scaled them by its hardware
// level (at most 2×). The runtime owns the rest of what the old Settings ›
// Graphics section did: Auto and the level choice, render scale and the
// pixel-ratio cap, adaptive resolution, the frame-rate limit and readout, the
// GPU summary. The old section's per-category overrides are not offered (the
// runtime's Options choose a level).
import type { QualityTier } from "starhermit:engine";
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
  bloomRes: number; aoRes: number;
}
export interface Look {
  preset: QualityTier;
  shadows: 0 | 1024 | 2048 | 4096;
  ao: "off" | "on" | "high";
  bloom: boolean;
  grade: boolean;
  antialias: AntialiasMode;
  reflections: boolean;
  /** Glossy bevelled tiles, grain, fog, the light-trace frame and the ground's circuit grid. */
  detailed: boolean;
  /** Ambient particles drawn. */
  particles: number;
  budget: Budget;
}

const TABLE: Record<QualityTier, Omit<Look, "preset" | "budget" | "particles"> & { share: number }> = {
  low: { shadows: 0, ao: "off", bloom: false, grade: false, antialias: "msaa", reflections: false, detailed: false, share: 0 },
  balanced: { shadows: 1024, ao: "off", bloom: true, grade: true, antialias: "fxaa", reflections: true, detailed: true, share: 1 / 3 },
  high: { shadows: 2048, ao: "on", bloom: true, grade: true, antialias: "smaa", reflections: true, detailed: true, share: 1 },
  ultra: { shadows: 4096, ao: "high", bloom: true, grade: true, antialias: "msaa", reflections: true, detailed: true, share: 1 },
};
const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", label: 128, bevel: 2, ambient: 90, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", label: 256, bevel: 2, ambient: 150, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "physical", label: 256, bevel: 4, ambient: 220, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "physical", label: 512, bevel: 6, ambient: 320, bloomRes: 1, aoRes: 1 },
};
export const AMBIENT_MAX = 640;
/** The first level index of each tier. */
const TIER_FLOOR: Record<QualityTier, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };

/** The look for a quality tier at a level index (0 … 9). */
export function lookFor(preset: QualityTier, levelIndex: number): Look {
  const b = { ...BUDGETS[preset] };
  // Levels are about 1.64× apart in GPU throughput: the particle budget grows with the level above the tier's
  // first, at most 2× (gfx.ts budgetFor).
  const k = Math.min(2, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  b.ambient = Math.min(AMBIENT_MAX, Math.round(b.ambient * k));
  const { share, ...row } = TABLE[preset];
  return { preset, ...row, particles: Math.round(b.ambient * share), budget: b };
}
