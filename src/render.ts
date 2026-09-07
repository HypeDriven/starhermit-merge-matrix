/**
 * Merge Matrix — Three.js render layer.
 * Consumes immutable board snapshots; never mutates rules state.
 * Falls back gracefully: caller uses the DOM board when init() returns false.
 */
import * as THREE from 'three';
import type { ThemeDef } from './content.js';

export interface RenderSettings {
  quality: 'low' | 'medium' | 'high';
  reducedMotion: boolean;
}

interface TileView {
  mesh: THREE.Mesh;
  value: number;
  targetScale: number;
  pulse: number; // merge pop timer
}

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let boardGroup: THREE.Group | null = null;
let tiles: (TileView | null)[][] = [];
let cellMeshes: THREE.Mesh[] = [];
let theme: ThemeDef | null = null;
let cfg: RenderSettings = { quality: 'high', reducedMotion: false };
let size = 4;
let canvasEl: HTMLCanvasElement | null = null;
let disposed = false;
let shake = 0;
let glow: THREE.PointLight | null = null;
const texCache = new Map<string, THREE.CanvasTexture>();

function disposeMesh(group: THREE.Group, mesh: THREE.Mesh): void {
  group.remove(mesh);
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.Material | THREE.Material[];
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
}

/** Box faces in geometry order: only the top face carries the number. */
function tileMaterials(v: number): THREE.Material[] {
  const col = new THREE.Color(tileColor(v));
  const side = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.25, emissive: col, emissiveIntensity: 0.25 });
  const top = new THREE.MeshStandardMaterial({ map: labelTexture(v), roughness: 0.35, metalness: 0.25, emissive: col, emissiveIntensity: 0.25 });
  return [side, side.clone(), top, side.clone(), side.clone(), side.clone()];
}

export function initRender(canvas: HTMLCanvasElement, settings: RenderSettings): boolean {
  cfg = settings;
  canvasEl = canvas;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: cfg.quality !== 'low', alpha: true });
  } catch {
    return false;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene = new THREE.Scene();

  // authored framing: low-distortion perspective, near-tabletop angle
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  frameCamera();

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 6, 4);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x8fa8ff, 0.55));
  glow = new THREE.PointLight(0x66d9ff, 8, 12);
  glow.position.set(0, 3, 2);
  scene.add(glow);

  // ground plane for contact grounding
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.95, metalness: 0.1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  scene.add(ground);

  boardGroup = new THREE.Group();
  scene.add(boardGroup);
  disposed = false;
  return true;
}

/** True once a WebGL context exists and has not been disposed. */
export function isReady(): boolean {
  return renderer !== null && !disposed;
}

export function setTheme(t: ThemeDef): void {
  theme = t;
  if (scene) scene.background = new THREE.Color(t.bg);
  texCache.clear();
  buildBoard(size);
}

function tileColor(v: number): string {
  if (!theme) return '#3b82f6';
  if (theme.tiles[v]) return theme.tiles[v];
  // extrapolate for big tiles
  const keys = Object.keys(theme.tiles).map(Number).filter((k) => k > 0).sort((a, b) => a - b);
  return theme.tiles[keys[keys.length - 1]] ?? '#3b82f6';
}

function labelTexture(v: number): THREE.CanvasTexture {
  const key = `${theme?.id}:${v}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const col = tileColor(v);
  g.fillStyle = col;
  const r = 28;
  g.beginPath();
  g.roundRect(4, 4, 248, 248, r);
  g.fill();
  // top sheen
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.02)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(4, 4, 248, 248, r);
  g.fill();
  g.fillStyle = theme && !theme.textLight ? '#1b2540' : '#ffffff';
  g.font = `bold ${v >= 1000 ? 76 : v >= 100 ? 92 : 116}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(v), 128, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

export function buildBoard(newSize: number): void {
  if (!boardGroup || !theme) return;
  size = newSize;
  // dispose old
  for (const row of tiles) for (const t of row) if (t) disposeMesh(boardGroup, t.mesh);
  for (const m of cellMeshes) { boardGroup.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  tiles = Array.from({ length: size }, () => new Array<TileView | null>(size).fill(null));
  cellMeshes = [];

  const cellGeo = new THREE.BoxGeometry(0.96, 0.12, 0.96);
  const cellMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.cell), roughness: 0.6, metalness: 0.3 });
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const m = new THREE.Mesh(cellGeo, cellMat);
      m.position.copy(cellPos(r, c));
      m.position.y = -0.08;
      boardGroup.add(m);
      cellMeshes.push(m);
    }
  }
  // grid base slab
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(size + 0.24, 0.1, size + 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.grid), roughness: 0.4, metalness: 0.5 }),
  );
  slab.position.y = -0.2;
  boardGroup.add(slab);
  cellMeshes.push(slab);
  frameCamera(); // a 5×5 board needs more room than a 4×4 one
}

const CAM_TARGET = new THREE.Vector3(0, 0, 0.2);
const CAM_BASE_DIST = 7.32; // authored tabletop distance for a wide viewport
const camPos = new THREE.Vector3(0, 4.2, 6.2);
const camDir = new THREE.Vector3();

/**
 * Keep the whole board inside the frame. The authored tabletop angle assumes a
 * wide viewport; on a portrait one (phone) it would crop the outer columns, so
 * the camera both retreats until the full width fits and tilts toward overhead,
 * which trades depth foreshortening for the vertical room a phone actually has.
 */
function frameCamera(): void {
  if (!camera) return;
  const wide = Math.max(0, Math.min(1, (camera.aspect - 0.7) / 0.4)); // 0 portrait → 1 wide
  camDir.set(0, 7.0 + (4.2 - 7.0) * wide, 2.6 + (6.0 - 2.6) * wide).normalize();
  const halfWidth = (size + 0.6) / 2;
  const tanHalfV = Math.tan((camera.fov * Math.PI) / 360);
  const fitWidth = halfWidth / (tanHalfV * Math.max(0.2, camera.aspect));
  const dist = Math.max(CAM_BASE_DIST, fitWidth);
  camPos.copy(camDir).multiplyScalar(dist).add(CAM_TARGET);
  camera.position.copy(camPos);
  camera.lookAt(CAM_TARGET);
}

function cellPos(r: number, c: number): THREE.Vector3 {
  const off = (size - 1) / 2;
  return new THREE.Vector3(c - off, 0, r - off);
}

/** Apply a board snapshot; animates spawns/merges toward the deterministic end state. */
export function setBoard(board: number[][], changed?: Set<string>, merged?: Set<string>): void {
  if (!boardGroup || !theme) return;
  if (board.length !== size) buildBoard(board.length);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = board[r][c];
      const key = `${r},${c}`;
      let t = tiles[r][c];
      if (v === 0) {
        if (t) {
          disposeMesh(boardGroup, t.mesh);
          tiles[r][c] = null;
        }
        continue;
      }
      if (!t || t.value !== v) {
        if (t) disposeMesh(boardGroup, t.mesh);
        const geo = new THREE.BoxGeometry(0.86, 0.3, 0.86);
        const mesh = new THREE.Mesh(geo, tileMaterials(v));
        mesh.position.copy(cellPos(r, c));
        boardGroup.add(mesh);
        t = { mesh, value: v, targetScale: 1, pulse: 0 };
        tiles[r][c] = t;
        if (changed?.has(key) && !cfg.reducedMotion) t.mesh.scale.setScalar(0.2); // spawn pop-in
      }
      if (merged?.has(key) && !cfg.reducedMotion) t.pulse = 1;
    }
  }
}

export function pulseGlow(intensity: number): void {
  if (glow) glow.intensity = 8 + intensity * 14;
  if (!cfg.reducedMotion) shake = Math.min(0.5, shake + intensity * 0.1);
}

let lastTime = 0;
export function frame(time: number): void {
  if (!renderer || !scene || !camera || disposed) return;
  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0.016);
  lastTime = time;
  // settle tile animation toward exact end state
  for (const row of tiles) {
    for (const t of row) {
      if (!t) continue;
      const s = t.mesh.scale.x;
      if (s < 1) t.mesh.scale.setScalar(Math.min(1, s + dt * 6));
      if (t.pulse > 0) {
        t.pulse = Math.max(0, t.pulse - dt * 4);
        const k = 1 + Math.sin(t.pulse * Math.PI) * 0.18;
        t.mesh.scale.setScalar(Math.max(t.mesh.scale.x, k));
        if (t.pulse === 0) t.mesh.scale.setScalar(1);
      }
    }
  }
  if (shake > 0.001 && camera) {
    shake *= Math.pow(0.001, dt); // critically damped decay
    camera.position.x = camPos.x + Math.sin(time * 0.09) * shake * 0.06;
    camera.position.y = camPos.y + Math.cos(time * 0.11) * shake * 0.04;
    camera.lookAt(CAM_TARGET);
  } else if (camera && shake !== 0) {
    shake = 0;
    camera.position.copy(camPos);
    camera.lookAt(CAM_TARGET);
  }
  if (glow) glow.intensity += (8 - glow.intensity) * Math.min(1, dt * 3);
  renderer.render(scene, camera);
}

export function resize(w: number, h: number, dpr: number): void {
  if (!renderer || !camera) return;
  const capDpr = cfg.quality === 'low' ? Math.min(dpr, 1) : cfg.quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  renderer.setPixelRatio(capDpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  frameCamera();
}

export function updateQuality(q: RenderSettings): void {
  cfg = q;
  if (renderer) renderer.setPixelRatio(q.quality === 'low' ? 1 : q.quality === 'medium' ? 1.5 : Math.min(devicePixelRatio, 2));
}

export function disposeRender(): void {
  disposed = true;
  for (const tex of texCache.values()) tex.dispose();
  texCache.clear();
  if (scene) {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }
  renderer?.dispose();
  renderer = null; scene = null; camera = null; boardGroup = null; tiles = []; cellMeshes = [];
}
