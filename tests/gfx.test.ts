import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  detectPreset, detectLevel, presetForLevel, budgetFor, particleCount, resolve, presetTier, choosePreset, describe as describeGfx, adaptStep,
  CATEGORY_KEYS, PRESETS, LEVELS, BUDGETS, AMBIENT_MAX,
} from '../src/gfx';
import { GFX_LOCALES, pickLocale } from '../src/gfxtext';

// gpu-level.js is a classic script in the page (globalThis.StarHermitGpu); load its CommonJS export here.
(globalThis as Record<string, unknown>).StarHermitGpu = createRequire(import.meta.url)('../gpu-level.js');

const DESK = { cores: 8, memoryGb: 8 };
const PHONE = { mobile: true, cores: 8, memoryGb: 8 };

describe('hardware level → Auto preset (Low 0, Balanced 4, High 10, Ultra 17)', () => {
  it('rates GPUs on the StarHermit level', () => {
    expect(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', DESK)).toBe('low');
    expect(detectLevel('llvmpipe (LLVM 15.0.7, 256 bits)', DESK)).toBe(0);
    expect(detectPreset('', DESK)).toBe('low');
    expect(detectPreset(null, DESK)).toBe('low');
    expect(detectPreset('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', DESK)).toBe('low');
    expect(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', DESK)).toBe('low');
    expect(detectPreset('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', DESK)).toBe('balanced');
    expect(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0)', DESK)).toBe('high');
    expect(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)', DESK)).toBe('ultra');
    expect(detectLevel('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)', DESK)).toBe(20);
    expect(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)', DESK)).toBe('ultra');
    for (const p of PRESETS) expect(presetForLevel(LEVELS[p])).toBe(p);
    expect(presetForLevel(3)).toBe('low');
    expect(presetForLevel(16)).toBe('high');
  });
  it('caps phones and tablets at Balanced; software stays Low', () => {
    expect(detectPreset('Adreno (TM) 740', PHONE)).toBe('balanced');
    expect(detectLevel('Adreno (TM) 740', PHONE)).toBeLessThanOrEqual(9);
    expect(detectPreset('Apple M1', PHONE)).toBe('balanced');
    expect(detectPreset('SwiftShader', PHONE)).toBe('low');
  });
});

describe('per-preset budgets', () => {
  it('are explicit and grow from Low to Ultra', () => {
    const keys = ['material', 'label', 'bevel', 'ambient', 'bloomRes', 'aoRes'] as const;
    for (const p of PRESETS) for (const k of keys) expect(BUDGETS[p][k]).toBeDefined();
    for (let i = 1; i < PRESETS.length; i++) for (const k of keys) {
      const a = BUDGETS[PRESETS[i - 1]][k], b = BUDGETS[PRESETS[i]][k];
      if (typeof a === 'number') expect(b as number).toBeGreaterThanOrEqual(a);
    }
    expect(PRESETS.map((p) => BUDGETS[p].material)).toEqual(['lambert', 'standard', 'physical', 'physical']);
    expect(PRESETS.map((p) => BUDGETS[p].bloomRes)).toEqual([0.5, 0.5, 0.5, 1]);
  });
  it('are tuned at the floor level and scale up within the preset', () => {
    expect(resolve({ preset: 'high' }, 'low', 10).budget).toEqual(BUDGETS.high);
    expect(resolve({ preset: 'ultra' }, 'low', 0).budget).toEqual(resolve({ preset: 'ultra' }, 'ultra', 17).budget);
    expect(budgetFor('balanced', 9).ambient).toBeGreaterThan(budgetFor('balanced', 4).ambient);
    expect(budgetFor('ultra', 20).ambient).toBeLessThanOrEqual(AMBIENT_MAX);
    expect(particleCount(resolve({ preset: 'high' }, 'low', 10))).toBe(BUDGETS.high.ambient);
    expect(particleCount(resolve({ preset: 'low' }, 'low', 0))).toBe(0);
    expect(resolve({}, 'low', 0).budget.material).toBe('lambert');
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
