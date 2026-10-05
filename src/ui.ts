/**
 * Merge Matrix — DOM shell: accessible board mirror, settings binding, help cards.
 * DOM is the authoritative interaction layer; the canvas is decorative.
 */
import type { Settings } from './session.js';
import { THEMES, type ThemeDef } from './content.js';
import { legalMoves, type GameState, type Dir } from './rules.js';
import { CATEGORIES, CATEGORY_KEYS, PRESETS, resolve, presetTier, choosePreset, clamp, type Preset } from './gfx.js';
import { gfxText } from './gfxtext.js';
import * as render from './render.js';

export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applySettingsToDom(s: Settings): void {
  document.body.classList.toggle('reduced-motion', s.reducedMotion);
  document.body.classList.toggle('high-contrast', s.highContrast);
  document.body.classList.toggle('large-text', s.largeText);
  document.body.classList.toggle('left-handed', s.leftHanded);
  const t = themeById(s.highContrast ? 'mono' : s.theme);
  const root = document.documentElement.style;
  root.setProperty('--bg', t.bg);
  root.setProperty('--panel', t.grid);
  root.setProperty('--panel2', t.cell);
  root.setProperty('--accent', t.accent);
  root.setProperty('--text', t.textLight ? '#e8ecf6' : '#1b2540');
}

export function tileColorOf(t: ThemeDef, v: number): string {
  if (t.tiles[v]) return t.tiles[v];
  const keys = Object.keys(t.tiles).map(Number).filter((k) => k > 0).sort((a, b) => a - b);
  return t.tiles[keys[keys.length - 1]] ?? '#3b82f6';
}

/** Rebuild the DOM grid for a board size. */
export function buildDomBoard(el: HTMLElement, size: number): void {
  el.textContent = '';
  el.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  el.style.width = `min(calc(92vw / var(--ui-scale, 1)), calc(92dvh / var(--ui-scale, 1) - 220px), ${size * 96}px)`;
  el.style.maxWidth = '100%';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      el.appendChild(cell);
    }
  }
}

/** Render state into the DOM grid (labels, colors, ARIA). */
export function renderDomBoard(el: HTMLElement, st: GameState, theme: ThemeDef): void {
  const cells = el.children;
  for (let r = 0; r < st.size; r++) {
    for (let c = 0; c < st.size; c++) {
      const v = st.board[r][c];
      const cell = cells[r * st.size + c] as HTMLElement;
      cell.dataset.v = String(v);
      cell.textContent = v === 0 ? '' : String(v);
      cell.style.background = v === 0 ? '' : tileColorOf(theme, v);
      cell.style.color = theme.textLight ? '#fff' : '#1b2540';
      cell.setAttribute('aria-label', v === 0 ? `empty, row ${r + 1} column ${c + 1}` : `${v}, row ${r + 1} column ${c + 1}`);
    }
  }
}

/** Concise navigable board summary for screen readers. */
export function boardSummary(st: GameState): string {
  const counts = new Map<number, number>();
  let empty = 0;
  for (const row of st.board) for (const v of row) {
    if (v === 0) empty++;
    else counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const parts = [...counts.entries()].sort((a, b) => b[0] - a[0]).slice(0, 5)
    .map(([v, n]) => `${n}×${v}`);
  return `${st.size}×${st.size} board, ${empty} empty cells, tiles: ${parts.join(', ')}. Largest ${st.maxTile}.`;
}

let boundSettings: Settings | null = null;
let formSync: (() => void) | null = null;

/** Merge externally loaded values (StarHermit settings KV) into the bound form state and redraw it. */
export function patchSettingsForm(patch: Partial<Settings>): void {
  if (!boundSettings) return;
  Object.assign(boundSettings, patch);
  formSync?.();
}

export function bindSettingsForm(s: Settings, onChange: (s: Settings) => void): void {
  boundSettings = s;
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const themeSel = get<HTMLSelectElement>('set-theme');
  themeSel.textContent = '';
  for (const t of THEMES) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    themeSel.appendChild(o);
  }
  const sync = () => {
    (get<HTMLInputElement>('set-music')).value = String(Math.round(s.music * 100));
    (get<HTMLInputElement>('set-fx')).value = String(Math.round(s.fx * 100));
    (get<HTMLInputElement>('set-ambience')).value = String(Math.round(s.ambience * 100));
    (get<HTMLInputElement>('set-muted')).checked = s.muted;
    (get<HTMLInputElement>('set-captions')).checked = s.captions;
    themeSel.value = s.theme;
    (get<HTMLInputElement>('set-render3d')).checked = s.render3d;
    (get<HTMLInputElement>('set-reduced-motion')).checked = s.reducedMotion;
    (get<HTMLInputElement>('set-high-contrast')).checked = s.highContrast;
    (get<HTMLInputElement>('set-large-text')).checked = s.largeText;
    (get<HTMLInputElement>('set-left-handed')).checked = s.leftHanded;
    (get<HTMLInputElement>('set-haptics')).checked = s.haptics;
  };
  sync();
  formSync = sync;
  const emit = () => onChange({ ...s });
  get<HTMLInputElement>('set-music').addEventListener('input', (e) => { s.music = +(e.target as HTMLInputElement).value / 100; emit(); });
  get<HTMLInputElement>('set-fx').addEventListener('input', (e) => { s.fx = +(e.target as HTMLInputElement).value / 100; emit(); });
  get<HTMLInputElement>('set-ambience').addEventListener('input', (e) => { s.ambience = +(e.target as HTMLInputElement).value / 100; emit(); });
  get<HTMLInputElement>('set-muted').addEventListener('change', (e) => { s.muted = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-captions').addEventListener('change', (e) => { s.captions = (e.target as HTMLInputElement).checked; emit(); });
  themeSel.addEventListener('change', (e) => { s.theme = (e.target as HTMLSelectElement).value; emit(); });
  get<HTMLInputElement>('set-render3d').addEventListener('change', (e) => { s.render3d = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-reduced-motion').addEventListener('change', (e) => { s.reducedMotion = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-high-contrast').addEventListener('change', (e) => { s.highContrast = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-large-text').addEventListener('change', (e) => { s.largeText = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-left-handed').addEventListener('change', (e) => { s.leftHanded = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-haptics').addEventListener('change', (e) => { s.haptics = (e.target as HTMLInputElement).checked; emit(); });
  bindGraphicsForm(s, emit);
}

/* ---------------- Graphics section ---------------- */

const gid = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function presetName(p: string): string {
  const t = gfxText();
  return (t as unknown as Record<string, string>)[p] ?? p;
}

/** Build the per-category selects once, then wire every Graphics control. */
function bindGraphicsForm(s: Settings, emit: () => void): void {
  const t = gfxText();
  gid('gfx-quality-label').textContent = t.quality;
  gid('gfx-scale-label').textContent = t.renderScale;
  gid('gfx-adaptive-label').textContent = t.adaptive;
  gid('gfx-fps-label').textContent = t.showFps;
  const cats = gid('gfx-cats');
  cats.textContent = '';
  for (const cat of CATEGORY_KEYS) {
    const label = document.createElement('label');
    label.className = 'gfx-row';
    const span = document.createElement('span');
    span.textContent = t.cat[cat] ?? cat;
    const sel = document.createElement('select');
    sel.id = `set-gfx-${cat}`;
    sel.dataset.gfxCat = cat;
    for (const v of ['preset', ...CATEGORIES[cat]]) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t.tier[v] ?? v;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      if (sel.value === 'preset') delete s.gfx[cat];
      else s.gfx[cat] = sel.value;
      emit();
    });
    label.append(span, sel);
    cats.appendChild(label);
  }
  gid<HTMLSelectElement>('set-quality').addEventListener('change', (e) => {
    s.gfx = choosePreset(s.gfx, (e.target as HTMLSelectElement).value); // a preset clears overrides
    emit();
  });
  const scale = gid<HTMLInputElement>('set-gfx-scale');
  scale.addEventListener('input', () => {
    s.gfx.render_scale = clamp(+scale.value, 50, 200) / 100;
    gid('gfx-scale-value').textContent = `${scale.value}%`;
    emit();
  });
  gid<HTMLInputElement>('set-gfx-adaptive').addEventListener('change', (e) => { s.gfx.adaptive = (e.target as HTMLInputElement).checked; emit(); });
  gid<HTMLInputElement>('set-gfx-fps').addEventListener('change', (e) => { s.gfx.show_fps = (e.target as HTMLInputElement).checked; emit(); });
}

/** Sync the Graphics controls, labels and body attributes with the current settings. */
export function refreshGraphicsPanel(s: Settings, glActive: boolean): void {
  const t = gfxText();
  const { detected } = render.probeGpu();
  const r = resolve(s.gfx, detected);
  document.body.dataset.gfxPreset = r.preset;
  document.body.dataset.gfxDetail = r.detail;
  document.body.dataset.gfxAuto = String(r.auto);
  const q = gid<HTMLSelectElement>('set-quality');
  for (const o of Array.from(q.options)) {
    o.textContent = o.value === 'auto' ? t.auto.replace('{tier}', presetName(detected)) : presetName(o.value);
  }
  q.value = (PRESETS as readonly string[]).includes(s.gfx.preset as string) ? (s.gfx.preset as string) : 'auto';
  const pct = Math.round(clamp(Number(s.gfx.render_scale) || 1, 0.5, 2) * 100);
  gid<HTMLInputElement>('set-gfx-scale').value = String(pct);
  gid('gfx-scale-value').textContent = `${pct}%`;
  for (const cat of CATEGORY_KEYS) {
    const sel = document.getElementById(`set-gfx-${cat}`) as HTMLSelectElement | null;
    if (!sel) continue;
    const fromPreset = sel.options[0];
    fromPreset.textContent = t.fromPreset.replace('{tier}', t.tier[presetTier(r.preset as Preset, cat)] ?? '');
    const v = s.gfx[cat] as string | undefined;
    sel.value = v && (CATEGORIES[cat] as readonly string[]).includes(v) ? v : 'preset';
  }
  gid<HTMLInputElement>('set-gfx-adaptive').checked = s.gfx.adaptive !== false;
  gid<HTMLInputElement>('set-gfx-fps').checked = !!s.gfx.show_fps;
  const off = gid('gfx-gl-off');
  off.textContent = t.glOff;
  off.hidden = glActive;
  refreshGraphicsSummary(glActive);
}

/** The live line: GPU · cost summary · drawing-buffer size, plus the post-processing note. */
export function refreshGraphicsSummary(glActive: boolean): void {
  const t = gfxText();
  const note = gid('gfx-post-note');
  if (!glActive || !render.isReady()) {
    const { gpu } = render.probeGpu();
    gid('gfx-summary').textContent = gpu || t.unknownGpu;
    note.hidden = true;
    return;
  }
  const info = render.graphicsInfo();
  gid('gfx-summary').textContent = `${info.gpu || t.unknownGpu} · ${info.summary(t)}`;
  note.textContent = t.postFailed;
  note.hidden = !info.postFailed;
}

/** Help cards generated from the current control mappings and a representative state. */
export function buildHelpCards(el: HTMLElement, keys: (a: 'up' | 'down' | 'left' | 'right' | 'undo' | 'hint' | 'pause') => string): void {
  el.textContent = '';
  const cards: [string, string][] = [
    ['Slide', 'Arrow keys, WASD, swipe, or the on-board drag. Every block slides until it hits the edge or another block.'],
    ['Merge', 'Two blocks with the same number that collide combine into one of double value. Each block merges at most once per move.'],
    ['New blocks', 'After every valid move, a new 2 (90%) or 4 (10%) appears in a random empty cell, chosen by the run\'s seed.'],
    ['Scoring', 'You score the value of every merge. Reaching the goal tile adds a milestone bonus; constrained modes add an efficiency bonus.'],
    ['Losing', 'The run ends when no move changes the board — a full grid with no adjacent equals.'],
    ['Controls', `${keys('up')} ${keys('left')} ${keys('down')} ${keys('right')}: slide · ${keys('undo')}: undo (where allowed) · ${keys('hint')}: hint · ${keys('pause')}: pause · swipe or drag on the board · every action also has a button.`],
    ['Seeds & fairness', 'Practice and Journey seeds are fixed. The daily seed is shared per UTC day, so everyone plays the same board.'],
  ];
  for (const [h, body] of cards) {
    const d = document.createElement('div');
    d.className = 'card';
    const s = document.createElement('strong');
    s.textContent = h;
    const p = document.createElement('span');
    p.textContent = body;
    d.append(s, p);
    el.appendChild(d);
  }
}

/** Pick a reasonable hint from the same legal-action API used by play. */
export function computeHint(st: GameState): { dir: Dir; why: string } | null {
  const legal = legalMoves(st);
  if (legal.length === 0) return null;
  let best: { dir: Dir; gain: number; empties: number } | null = null;
  for (const d of legal) {
    // preview without mutating
    const { peekMove } = rulesApi();
    const p = peekMove(st.board, d);
    let empties = 0;
    for (const row of p.board) for (const v of row) if (v === 0) empties++;
    const gain = p.gained * 100 + empties;
    if (!best || gain > best.gain) best = { dir: d, gain, empties };
  }
  if (!best) return { dir: legal[0], why: 'only legal direction' };
  return { dir: best.dir, why: `frees ${best.empties} cells with the best immediate merges` };
}

// lazy import to avoid a cycle at module init
import { peekMove } from './rules.js';
function rulesApi() { return { peekMove }; }
