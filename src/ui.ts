/**
 * Merge Matrix — DOM shell: accessible board mirror, settings binding, help cards.
 * DOM is the authoritative interaction layer; the canvas is decorative.
 */
import type { Settings } from './session.js';
import { THEMES, type ThemeDef } from './content.js';
import { legalMoves, type GameState, type Dir } from './rules.js';

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
  el.style.width = `min(92vw, 92dvh - 220px, ${size * 96}px)`;
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

export function bindSettingsForm(s: Settings, onChange: (s: Settings) => void): void {
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
    (get<HTMLSelectElement>('set-quality')).value = s.quality;
    themeSel.value = s.theme;
    (get<HTMLInputElement>('set-render3d')).checked = s.render3d;
    (get<HTMLInputElement>('set-reduced-motion')).checked = s.reducedMotion;
    (get<HTMLInputElement>('set-high-contrast')).checked = s.highContrast;
    (get<HTMLInputElement>('set-large-text')).checked = s.largeText;
    (get<HTMLInputElement>('set-left-handed')).checked = s.leftHanded;
    (get<HTMLInputElement>('set-haptics')).checked = s.haptics;
  };
  sync();
  const emit = () => onChange({ ...s });
  get<HTMLInputElement>('set-music').addEventListener('input', (e) => { s.music = +(e.target as HTMLInputElement).value / 100; emit(); });
  get<HTMLInputElement>('set-fx').addEventListener('input', (e) => { s.fx = +(e.target as HTMLInputElement).value / 100; emit(); });
  get<HTMLInputElement>('set-ambience').addEventListener('input', (e) => { s.ambience = +(e.target as HTMLInputElement).value / 100; emit(); });
  get<HTMLInputElement>('set-muted').addEventListener('change', (e) => { s.muted = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-captions').addEventListener('change', (e) => { s.captions = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLSelectElement>('set-quality').addEventListener('change', (e) => { s.quality = (e.target as HTMLSelectElement).value as Settings['quality']; emit(); });
  themeSel.addEventListener('change', (e) => { s.theme = (e.target as HTMLSelectElement).value; emit(); });
  get<HTMLInputElement>('set-render3d').addEventListener('change', (e) => { s.render3d = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-reduced-motion').addEventListener('change', (e) => { s.reducedMotion = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-high-contrast').addEventListener('change', (e) => { s.highContrast = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-left-handed').addEventListener('change', (e) => { s.leftHanded = (e.target as HTMLInputElement).checked; emit(); });
  get<HTMLInputElement>('set-haptics').addEventListener('change', (e) => { s.haptics = (e.target as HTMLInputElement).checked; emit(); });
}

/** Help cards generated from the current control mappings and a representative state. */
export function buildHelpCards(el: HTMLElement): void {
  el.textContent = '';
  const cards: [string, string][] = [
    ['Slide', 'Arrow keys, WASD, swipe, or the on-board drag. Every block slides until it hits the edge or another block.'],
    ['Merge', 'Two blocks with the same number that collide combine into one of double value. Each block merges at most once per move.'],
    ['New blocks', 'After every valid move, a new 2 (90%) or 4 (10%) appears in a random empty cell, chosen by the run\'s seed.'],
    ['Scoring', 'You score the value of every merge. Reaching the goal tile adds a milestone bonus; constrained modes add an efficiency bonus.'],
    ['Losing', 'The run ends when no move changes the board — a full grid with no adjacent equals.'],
    ['Controls', 'Arrows/WASD: slide · Z: undo (where allowed) · H: hint · P/Esc: pause · R: restart · buttons work by touch and mouse.'],
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
