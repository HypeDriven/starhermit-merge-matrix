import { describe, it, expect } from 'vitest';
import {
  detectPreset, resolve, presetTier, choosePreset, describe as describeGfx, adaptStep,
  CATEGORY_KEYS, PRESETS,
} from '../src/gfx';
import { GFX_LOCALES, pickLocale } from '../src/gfxtext';

describe('detectPreset', () => {
  it('gives software renderers Low', () => {
    expect(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe('low');
    expect(detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('low');
    expect(detectPreset('Microsoft Basic Render Driver')).toBe('low');
  });
  it('gives discrete GPUs and Apple M High', () => {
    expect(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('high');
    expect(detectPreset('AMD Radeon RX 6800 XT')).toBe('high');
    expect(detectPreset('Apple M2 Pro')).toBe('high');
  });
  it('gives integrated / mobile / unknown GPUs Balanced', () => {
    expect(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)')).toBe('balanced');
    expect(detectPreset('Adreno (TM) 730')).toBe('balanced');
    expect(detectPreset('AMD Radeon Graphics')).toBe('balanced');
    expect(detectPreset('')).toBe('balanced');
    expect(detectPreset(null)).toBe('balanced');
  });
  it('caps touch devices at Balanced', () => {
    expect(detectPreset('Apple M1', true)).toBe('balanced');
    expect(detectPreset('SwiftShader', true)).toBe('low');
  });
});

describe('resolve', () => {
  it('Auto follows the detected preset', () => {
    const r = resolve({ preset: 'auto' }, 'low');
    expect(r.preset).toBe('low');
    expect(r.auto).toBe(true);
    expect(r.post).toBe(false); // Low renders straight to the canvas
    expect(r.pixelCap).toBe(1);
  });
  it('an explicit preset wins over detection', () => {
    const r = resolve({ preset: 'high' }, 'low');
    expect(r.preset).toBe('high');
    expect(r.auto).toBe(false);
    expect(r.shadows).toBe('medium');
    expect(r.post).toBe(true);
  });
  it('per-category overrides replace the preset tier; invalid values fall back', () => {
    const r = resolve({ preset: 'high', bloom: 'off', shadows: 'bogus', particles: 'low' }, 'low');
    expect(r.bloom).toBe('off');
    expect(r.shadows).toBe(presetTier('high', 'shadows'));
    expect(r.particles).toBe('low');
  });
  it('clamps render scale to 50–200% and multiplies the preset scale', () => {
    expect(resolve({ preset: 'high', render_scale: 5 }, null).scale).toBe(2);
    expect(resolve({ preset: 'high', render_scale: 0.1 }, null).scale).toBe(0.5);
    expect(resolve({ preset: 'ultra', render_scale: 1 }, null).scale).toBeCloseTo(1.25);
  });
  it('defaults adaptive on and the fps readout off', () => {
    const r = resolve({}, 'balanced');
    expect(r.adaptive).toBe(true);
    expect(r.showFps).toBe(false);
    expect(resolve({ adaptive: false, show_fps: true }, 'balanced')).toMatchObject({ adaptive: false, showFps: true });
  });
  it('every preset defines every category', () => {
    for (const p of PRESETS) for (const c of CATEGORY_KEYS) expect(presetTier(p, c)).toBeTruthy();
  });
});

describe('choosePreset', () => {
  it('clears overrides but keeps scale and toggles', () => {
    const next = choosePreset({ preset: 'high', bloom: 'off', ao: 'high', render_scale: 1.5, adaptive: false, show_fps: true }, 'low');
    expect(next).toEqual({ preset: 'low', render_scale: 1.5, adaptive: false, show_fps: true });
    expect(resolve(next, 'high').bloom).toBe(presetTier('low', 'bloom'));
  });
  it('unknown presets become Auto', () => {
    expect(choosePreset({}, 'nope').preset).toBe('auto');
  });
});

describe('describe / adaptStep', () => {
  it('summarises cost and pixels', () => {
    const s = describeGfx(resolve({ preset: 'high' }, null), [800, 600]);
    expect(s).toBe('2048² shadows · ambient occlusion · bloom · SMAA · 800×600 px');
    expect(describeGfx(resolve({ preset: 'low' }, null))).toBe('no shadows · MSAA');
  });
  it('steps resolution down on slow frames and back up on fast ones', () => {
    expect(adaptStep(1, 30)).toBe(0.9);
    expect(adaptStep(0.6, 40)).toBe(0.6);
    expect(adaptStep(0.9, 10)).toBe(0.95);
    expect(adaptStep(1, 10)).toBe(1);
    expect(adaptStep(0.8, 20)).toBe(0.8);
  });
});

describe('graphics strings', () => {
  it('cover every required locale with the same keys', () => {
    const required = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];
    const base = GFX_LOCALES['en-US'];
    for (const loc of required) {
      const t = GFX_LOCALES[loc];
      expect(t, loc).toBeTruthy();
      for (const k of Object.keys(base)) expect((t as unknown as Record<string, unknown>)[k], `${loc}.${k}`).toBeTruthy();
      for (const c of CATEGORY_KEYS) expect(t.cat[c], `${loc}.cat.${c}`).toBeTruthy();
      expect(t.auto).toContain('{tier}');
      expect(t.fromPreset).toContain('{tier}');
    }
  });
  it('maps browser languages to a supported locale', () => {
    expect(pickLocale('en-GB')).toBe('en-GB');
    expect(pickLocale('es-MX')).toBe('es-419');
    expect(pickLocale('fr-CA')).toBe('fr-CA');
    expect(pickLocale('pt-PT')).toBe('pt-BR');
    expect(pickLocale('de')).toBe('de-DE');
    expect(pickLocale('ja-JP')).toBe('en-US');
  });
});
