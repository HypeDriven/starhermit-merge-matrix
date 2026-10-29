// The 3D board on starhermit:scene, as the browser build's src/render.ts drew
// it with three.js r183: the board slab and its cells (an InstancedMesh), a
// tile per block (a box, or a bevelled rounded box with clear coat on
// detailed looks) with its number on a canvas texture on the top face, the
// theme's colours and light, the high tiles' bloom-catching side glow, the
// accent light-trace frame, the ground with its circuit-grid trace, the
// drifting ambient particles, the spawn pop-in, the merge pulse, the accent
// light's glow pulse and the camera shake on big merges. Rendering reads
// board snapshots and never writes rules state.
//
// From three.js r183 (engine.minor 26): light intensities, shadow bias and box as render.ts set them;
// RoomEnvironment(renderer) lowered as r183+ + PMREM give the reflections at the old
// environmentIntensity 0.4 (three ignored the per-material envMapIntensity
// values with scene.environment, so they are left out); the post chain
// (GTAO, UnrealBloom threshold 2.0, the GradeShader in linear light before
// the output, FXAA / SMAA / MSAA) is renderer.ao / bloom / grade / antialias;
// the orthographic shadow box is render.ts's, fitted to the board. The
// board sits between the HUD and the rails as the old <canvas> did: the
// camera keeps the playfield's aspect and is offset into its rectangle with
// setViewOffset. Adaptive resolution, the pixel-ratio cap and the frame-rate
// readout are the runtime's.
import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DirectionalLight, Fog, Group,
  HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  NoColorSpace, OrthographicCamera, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight, Points, PointsMaterial, RepeatWrapping, RoomEnvironment,
  RoundedBoxGeometry, SRGBColorSpace, Vector3, renderer, scene,
  type Material, type Object3D, type Texture,
} from "starhermit:scene";
import { OffscreenCanvas } from "starhermit:canvas";
import { frame } from "starhermit:engine";
import type { ThemeDef } from "../src/content.ts";
import type { Look } from "./quality.ts";

const PI = Math.PI;
interface TileView { mesh: Mesh<Material[]>; value: number; pulse: number }

renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// Authored framing: low-distortion perspective, near-tabletop angle.
const camera = new PerspectiveCamera(38, 1, 0.1, 100);
renderer.camera = camera;

const hemi = new HemisphereLight(0xbfd2ff, 0x0a0e1a, 0.9);
const key = new DirectionalLight(0xffffff, 2.2);
key.position.set(3, 7, 4);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
const rim = new DirectionalLight(0x66d9ff, 0.7);
rim.position.set(-4, 3, -6);
const GLOW_BASE = 8;
const glow = new PointLight(0x66d9ff, GLOW_BASE, 12);
glow.position.set(0, 3, 2);
scene.add(hemi, key, key.target, rim, glow);

// The ground plane for contact grounding.
const ground = new Mesh(new PlaneGeometry(30, 30), new MeshStandardMaterial({ color: 0x05070f, roughness: 0.95, metalness: 0.1 }));
ground.rotation.x = -PI / 2;
ground.position.y = -0.35;
ground.receiveShadow = true;
scene.add(ground);

const boardGroup = new Group();
scene.add(boardGroup);

let look: Look | null = null;
let theme: ThemeDef | null = null;
let reducedMotion = false;
let size = 4;
let tiles: (TileView | null)[][] = [];
let boardMeshes: Object3D[] = [];
let lastBoard: number[][] | null = null;
let shake = 0;
let clock = 0;
let particles: Points | null = null;
let particleVel: Float32Array | null = null;
let envTex: Texture | null = null;
let active = true;
const texCache = new Map<string, Texture>();
const tileMatCache = new Map<string, Material[]>();
const geoCache = new Map<string, BufferGeometry>();
const detailed = (): boolean => !!look?.detailed;

// -- materials and textures --------------------------------------------------------------------------
export function tileColorOf(t: ThemeDef, v: number): string {
  if (t.tiles[v]) return t.tiles[v]!;
  const keys = Object.keys(t.tiles).map(Number).filter((k) => k > 0).sort((a, b) => a - b);
  return t.tiles[keys[keys.length - 1]!] ?? "#3b82f6";
}
const tileColor = (v: number): string => (theme ? tileColorOf(theme, v) : "#3b82f6");
const luminance = (hex: string): number => { const c = new Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

/** Extra side-face emission for high tiles, so bloom picks out the big numbers (dark themes only). */
function glowFor(v: number): number {
  if (!theme || !theme.textLight || theme.id === "mono") return 0;
  const rank = Math.log2(Math.max(2, v));
  if (rank < 7) return 0;
  return Math.min(3, 1.9 + (rank - 7) * 0.25) * (1 - 0.6 * luminance(tileColor(v)));
}

function tileGeometry(): BufferGeometry {
  const bevel = look?.budget.bevel ?? 2;
  const k = `tile:${detailed()}:${bevel}`;
  let g = geoCache.get(k);
  if (!g) {
    g = detailed() ? new RoundedBoxGeometry(0.86, 0.3, 0.86, bevel, 0.085) : new BoxGeometry(0.86, 0.3, 0.86);
    geoCache.set(k, g);
  }
  return g;
}

interface MatParams {
  color?: Color; map?: Texture | null; roughnessMap?: Texture | null; roughness?: number; metalness?: number;
  clearcoat?: number; clearcoatRoughness?: number; emissive?: Color; emissiveIntensity?: number;
}
/** Shading model per the budget: Lambert on Low, Standard on Balanced, the authored Physical (clear coat) on High/Ultra. */
function litMaterial(p: MatParams): Material {
  // Copies the Colors so materials never share one (three copies; the engine keeps the object).
  p = { ...p };
  if (p.color) p.color = p.color.clone();
  if (p.emissive) p.emissive = p.emissive.clone();
  const tier = look?.budget.material ?? "standard";
  if (tier === "lambert") {
    const l: Record<string, unknown> = {};
    for (const k of ["color", "map", "emissive", "emissiveIntensity"] as const) if (p[k] !== undefined) l[k] = p[k];
    return new MeshLambertMaterial(l);
  }
  const { clearcoat, clearcoatRoughness, ...rest } = p;
  if (tier === "standard" || clearcoat === undefined) return new MeshStandardMaterial(rest);
  return new MeshPhysicalMaterial({ ...rest, clearcoat, clearcoatRoughness: clearcoatRoughness ?? 0 });
}

function tileMaterials(v: number): Material[] {
  const k = `${theme?.id}:${detailed()}:${look?.budget.material}:${look?.budget.label}:${v}`;
  const hit = tileMatCache.get(k);
  if (hit) return hit;
  const col = new Color(tileColor(v));
  let side: Material, top: Material;
  if (detailed()) {
    side = litMaterial({ color: col, roughness: 0.4, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18, emissive: col, emissiveIntensity: 0.12 + glowFor(v) });
    top = litMaterial({ map: labelTexture(v), roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3, emissive: col, emissiveIntensity: 0.06 });
  } else {
    side = litMaterial({ color: col, roughness: 0.35, metalness: 0.25, emissive: col, emissiveIntensity: 0.25 });
    top = litMaterial({ map: labelTexture(v), roughness: 0.35, metalness: 0.25, emissive: col, emissiveIntensity: 0.25 });
  }
  const mats = [side, side, top, side, side, side];
  tileMatCache.set(k, mats);
  return mats;
}

/** The tile's number on its colour (authored at 256 px, drawn into the budget's texture size). */
function labelTexture(v: number): Texture {
  const n = look?.budget.label ?? 256;
  const k = `label:${theme?.id}:${detailed()}:${n}:${v}`;
  const hit = texCache.get(k);
  if (hit) return hit;
  const c = new OffscreenCanvas(n, n);
  const g = c.getContext("2d");
  g.scale(n / 256, n / 256);
  const col = tileColor(v);
  const light = !!theme && !theme.textLight;
  g.fillStyle = col;
  g.fillRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "rgba(255,255,255,0.22)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.02)");
  grad.addColorStop(1, "rgba(0,0,0,0.18)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  if (detailed()) {
    // Soft inner bevel: bright upper-left rim, dark lower-right rim.
    g.lineWidth = 10;
    g.strokeStyle = "rgba(255,255,255,0.16)";
    g.beginPath(); g.moveTo(14, 242); g.lineTo(14, 14); g.lineTo(242, 14); g.stroke();
    g.strokeStyle = "rgba(0,0,0,0.16)";
    g.beginPath(); g.moveTo(242, 14); g.lineTo(242, 242); g.lineTo(14, 242); g.stroke();
  }
  g.font = `800 ${v >= 1000 ? 76 : v >= 100 ? 92 : 116}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (detailed()) {
    // A drop shadow keeps the digits crisp against the glossy fill.
    g.shadowColor = light ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.45)";
    g.shadowBlur = 8;
    g.shadowOffsetY = 4;
  }
  if (detailed() && !light) {
    // A thin dark keyline: white digits stay legible on the pale (yellow/mint) fills.
    g.lineJoin = "round";
    g.lineWidth = 7;
    g.strokeStyle = `rgba(8,14,30,${(0.35 + 0.4 * luminance(col)).toFixed(2)})`;
    g.strokeText(String(v), 128, 134);
    g.shadowColor = "transparent";
  }
  g.fillStyle = light ? "#1b2540" : "#ffffff";
  g.fillText(String(v), 128, 134);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(k, tex);
  return tex;
}

/** Deterministic value noise in a small tileable texture (surface grain for the roughness). */
function noiseTexture(): Texture {
  const hit = texCache.get("noise");
  if (hit) return hit;
  const n = 128;
  const c = new OffscreenCanvas(n, n);
  const g = c.getContext("2d");
  const img = g.createImageData(n, n);
  let s = 0x2f6b1d;
  for (let i = 0; i < n * n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const v = 150 + ((s >>> 16) % 70);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new CanvasTexture(c);
  tex.colorSpace = NoColorSpace; // data, as three's CanvasTexture default
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(3, 3);
  texCache.set("noise", tex);
  return tex;
}

/** The faint circuit-grid trace on the ground (emissive map, fading into the fog). */
function gridTexture(): Texture {
  const n = look?.budget.label ?? 256;
  const k = `grid:${theme?.id}:${n}`;
  const hit = texCache.get(k);
  if (hit) return hit;
  const c = new OffscreenCanvas(n, n);
  const g = c.getContext("2d");
  g.scale(n / 256, n / 256);
  g.fillStyle = "#000";
  g.fillRect(0, 0, 256, 256);
  const accent = theme?.accent ?? "#41d9c0";
  g.strokeStyle = accent;
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.globalAlpha = 0.22;
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  g.globalAlpha = 0.8;
  g.fillStyle = accent;
  for (const [x, y] of [[0, 0], [128, 128], [0, 128], [128, 0]] as const) { g.beginPath(); g.arc(x + 1, y + 1, 3, 0, PI * 2); g.fill(); }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(15, 15);
  tex.anisotropy = 8;
  texCache.set(k, tex);
  return tex;
}

function discTexture(): Texture {
  const hit = texCache.get("disc");
  if (hit) return hit;
  const c = new OffscreenCanvas(64, 64);
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  texCache.set("disc", tex);
  return tex;
}

function clearTileMaterials(): void {
  const seen = new Set<Material>();
  for (const mats of tileMatCache.values()) for (const m of mats) seen.add(m);
  for (const m of seen) m.dispose();
  tileMatCache.clear();
}
function dropTextures(prefixes: string[]): void {
  for (const [k, tex] of texCache) if (prefixes.some((p) => k.startsWith(p))) { tex.dispose(); texCache.delete(k); }
}

// -- theme and board ---------------------------------------------------------------------------------
export function setTheme(t: ThemeDef): void {
  if (theme && theme.id === t.id) return;
  theme = t;
  dropTextures(["label:", "grid:"]);
  clearTileMaterials();
  applyThemeLights();
  buildBoard(size);
  if (lastBoard) setBoard(lastBoard);
}

function applyThemeLights(): void {
  if (!theme) return;
  const bg = new Color(theme.bg);
  scene.background = bg;
  scene.fog = detailed() ? new Fog(bg, 11, 24) : null;
  const accent = new Color(theme.accent);
  hemi.groundColor.copy(bg);
  glow.color.copy(accent).lerp(new Color(0x66d9ff), 0.4);
  rim.color.copy(accent).lerp(new Color(0xffffff), 0.3);
  const lightTheme = !theme.textLight;
  const m = ground.material as MeshStandardMaterial;
  m.color.set(lightTheme ? theme.grid : "#05070f");
  if (detailed()) {
    m.emissiveMap = gridTexture();
    m.emissive.set(lightTheme ? "#000000" : "#ffffff");
    m.emissiveIntensity = lightTheme ? 0 : 0.12;
    m.roughness = 0.85;
  } else {
    m.emissiveMap = null;
    m.emissive.set("#000000");
    m.roughness = 0.95;
  }
  if (particles) (particles.material as PointsMaterial).color.copy(accent);
}

function disposeBoardMeshes(): void {
  for (const row of tiles) for (const t of row) if (t) boardGroup.remove(t.mesh);
  for (const m of boardMeshes) {
    boardGroup.remove(m);
    m.traverse((o) => {
      if (!(o instanceof Mesh) && !(o instanceof InstancedMesh)) return;
      const mesh = o as Mesh;
      if (![...geoCache.values()].includes(mesh.geometry)) mesh.geometry.dispose();
      const mat = mesh.material as Material | Material[];
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat.dispose();
    });
  }
  boardMeshes = [];
}

function cellPos(r: number, c: number): Vector3 {
  const off = (size - 1) / 2;
  return new Vector3(c - off, 0, r - off);
}

/** Builds the slab, the cells and (detailed) the light-trace frame for a board size. */
export function buildBoard(newSize: number): void {
  size = newSize;
  if (!theme) return;
  disposeBoardMeshes();
  tiles = Array.from({ length: size }, () => new Array<TileView | null>(size).fill(null));
  const det = detailed();
  const bevel = Math.max(1, (look?.budget.bevel ?? 2) - 1);
  const cellGeo = det ? new RoundedBoxGeometry(0.96, 0.12, 0.96, bevel, 0.07) : new BoxGeometry(0.96, 0.12, 0.96);
  const cellMat = det
    ? litMaterial({ color: new Color(theme.cell), roughness: 0.55, metalness: 0.35, roughnessMap: noiseTexture(), clearcoat: 0.3, clearcoatRoughness: 0.4 })
    : litMaterial({ color: new Color(theme.cell), roughness: 0.6, metalness: 0.3 });
  const cells = new InstancedMesh(cellGeo, cellMat, size * size);
  const m4 = new Matrix4();
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const p = cellPos(r, c);
    m4.makeTranslation(p.x, -0.08, p.z);
    cells.setMatrixAt(r * size + c, m4);
  }
  cells.receiveShadow = true;
  boardGroup.add(cells);
  boardMeshes.push(cells);

  const slabGeo = det ? new RoundedBoxGeometry(size + 0.24, 0.1, size + 0.24, bevel, 0.05) : new BoxGeometry(size + 0.24, 0.1, size + 0.24);
  const slab = new Mesh(slabGeo, det
    ? litMaterial({ color: new Color(theme.grid), roughness: 0.3, metalness: 0.6, roughnessMap: noiseTexture(), clearcoat: 0.6, clearcoatRoughness: 0.2 })
    : litMaterial({ color: new Color(theme.grid), roughness: 0.4, metalness: 0.5 }));
  slab.position.y = -0.2;
  slab.receiveShadow = true;
  slab.castShadow = true;
  boardGroup.add(slab);
  boardMeshes.push(slab);

  if (det) {
    // A thin light-trace frame around the slab: the matrix "powered on".
    const accent = new Color(theme.accent);
    const frameMat = new MeshBasicMaterial({ color: accent.clone().multiplyScalar(!theme.textLight ? 0.8 : 4.5) });
    const len = size + 0.3;
    const frameGroup = new Group();
    for (const [x, z, rot] of [[0, len / 2, 0], [0, -len / 2, 0], [len / 2, 0, 1], [-len / 2, 0, 1]] as const) {
      const b = new Mesh(new BoxGeometry(len, 0.025, 0.025), frameMat);
      b.position.set(x, -0.16, z);
      if (rot) b.rotation.y = PI / 2;
      frameGroup.add(b);
    }
    boardGroup.add(frameGroup);
    boardMeshes.push(frameGroup);
  }
  // render.ts fitShadow: an orthographic box ±(size/2 + 0.9) from 4 to 14 along the light.
  const cam = key.shadow.camera as OrthographicCamera, h = size / 2 + 0.9;
  cam.left = -h; cam.right = h; cam.top = h; cam.bottom = -h;
  cam.near = 4; cam.far = 14;
  cam.updateProjectionMatrix();
  camFit = -1;
}

/** Applies a board snapshot; spawned cells pop in, merged cells pulse (`spawned` / `merged`: "r,c" keys). */
export function setBoard(board: number[][], spawned?: Set<string>, merged?: Set<string>): void {
  lastBoard = board.map((r) => r.slice());
  if (!theme) return;
  if (board.length !== size) buildBoard(board.length);
  const cast = (look?.shadows ?? 0) > 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const v = board[r]![c]!;
    const k = `${r},${c}`;
    let t = tiles[r]![c];
    if (v === 0) {
      if (t) { boardGroup.remove(t.mesh); tiles[r]![c] = null; }
      continue;
    }
    if (!t || t.value !== v) {
      if (t) boardGroup.remove(t.mesh);
      const mesh = new Mesh(tileGeometry(), tileMaterials(v));
      mesh.position.copy(cellPos(r, c));
      mesh.castShadow = cast;
      mesh.receiveShadow = cast;
      boardGroup.add(mesh);
      t = { mesh, value: v, pulse: 0 };
      tiles[r]![c] = t;
      if (spawned?.has(k) && !reducedMotion) mesh.scale.setScalar(0.2);
    }
    if (merged?.has(k) && !reducedMotion) t!.pulse = 1;
  }
}

/** A merge's light pulse (and, with motion, a little camera shake), 0–1 by the points it scored. */
export function pulseGlow(intensity: number): void {
  glow.intensity = GLOW_BASE + intensity * 14;
  if (!reducedMotion) shake = Math.min(0.5, shake + intensity * 0.1);
}

// -- particles ---------------------------------------------------------------------------------------
function buildParticles(): void {
  if (particles) {
    scene.remove(particles);
    particles.geometry.dispose();
    (particles.material as Material).dispose();
    particles = null;
    particleVel = null;
  }
  const n = look?.particles ?? 0;
  if (n <= 0) return;
  const pos = new Float32Array(n * 3);
  particleVel = new Float32Array(n);
  let s = 0x51ed27;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    // A loose ring around the board, never over the tiles themselves.
    const a = rnd() * PI * 2;
    const rad = size / 2 + 0.9 + rnd() * 6;
    pos[i * 3] = Math.cos(a) * rad;
    pos[i * 3 + 1] = -0.3 + rnd() * 3.2;
    pos[i * 3 + 2] = Math.sin(a) * rad - 1.5;
    particleVel[i] = 0.08 + rnd() * 0.18;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  const mat = new PointsMaterial({
    size: 0.07, map: discTexture(), transparent: true, opacity: 0.75, depthWrite: false,
    blending: AdditiveBlending, color: new Color(theme?.accent ?? "#41d9c0"), fog: true,
  });
  particles = new Points(geo, mat);
  scene.add(particles);
}
function animateParticles(dt: number): void {
  if (!particles || !particleVel) return;
  const attr = particles.geometry.getAttribute("position") as BufferAttribute;
  const a = attr.array as Float32Array;
  for (let i = 0; i < particleVel.length; i++) {
    let y = a[i * 3 + 1]! + particleVel[i]! * dt;
    if (y > 2.9) y = -0.3;
    a[i * 3 + 1] = y;
    a[i * 3] = a[i * 3]! + Math.sin(clock * 0.6 + i) * 0.02 * dt;
  }
  attr.needsUpdate = true;
}

// -- graphics level ----------------------------------------------------------------------------------
/** The graphics level's look (quality.ts): post effects, shadows, reflections, shading, detail and particles. */
export function applyLook(next: Look): void {
  if (look && JSON.stringify(look) === JSON.stringify(next)) return;
  look = next;
  const b = next.budget;
  renderer.ao = next.ao === "off" ? null : {
    blendIntensity: 0.75, radius: 0.45, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: next.ao === "high" ? 16 : 8, resolution: b.aoRes,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: next.ao === "high" ? 6 : 4, rings: 2, samples: next.ao === "high" ? 16 : 8, radiusExponent: 2 },
  };
  // HDR threshold above lit-surface levels: only the light-trace frame, the emissive sides of 128+ tiles and hot
  // specular glints bloom.
  renderer.bloom = next.bloom ? { strength: 0.4, radius: 0.3, threshold: 2.0, resolution: b.bloomRes } : null;
  // render.ts GradeShader (linear, before the output): a gentle S-curve, a touch more saturation, cool shadows /
  // warm highlights, the 0.24 vignette.
  renderer.grade = next.grade ? {
    space: "linear", contrast: 0.18, saturation: 1.1, shadows: [0.95, 0.98, 1.06], highlights: [1.03, 1.0, 0.97], split: [0.2, 0.8],
    vignette: { amount: 0.24, inner: 0.35, outer: 0.85 },
  } : null;
  renderer.antialias = next.antialias;
  const on = next.shadows > 0;
  renderer.shadowMap.enabled = on;
  key.castShadow = on;
  if (on) key.shadow.mapSize = next.shadows;
  if (next.reflections && !envTex) {
    try {
      const room = new RoomEnvironment(renderer);
      room.position.y = -3.5; // three.js r183+ lowers the room
      envTex = new PMREMGenerator(renderer).fromScene(room, 0.04).texture;
    }
    catch (e) { console.warn(`environment: ${e instanceof Error ? e.message : String(e)}`); }
  }
  scene.environment = next.reflections ? envTex : null;
  scene.environmentIntensity = 0.4;
  hemi.intensity = next.reflections ? 0.45 : 0.7;
  clearTileMaterials();
  dropTextures(["label:", "grid:"]);
  applyThemeLights();
  if (theme) {
    buildBoard(size);
    if (lastBoard) setBoard(lastBoard);
  }
  buildParticles();
}
export function setReducedMotion(on: boolean): void {
  reducedMotion = on;
  if (on) for (const row of tiles) for (const t of row) if (t) { t.pulse = 0; t.mesh.scale.setScalar(1); }
}
/** The 3D board on or off (the flat board draws in the UI then; nothing 3D renders). */
export function setActive(on: boolean): void {
  active = on;
  renderer.camera = on ? camera : null;
}

// -- camera ------------------------------------------------------------------------------------------
const CAM_TARGET = new Vector3(0, 0, 0.2);
const CAM_BASE_DIST = 7.32; // the authored tabletop distance for a wide viewport
const camPos = new Vector3(0, 4.2, 6.2);
const camDir = new Vector3();
let camFit = -1;
/**
 * render.ts frameCamera: keep the whole board in the frame. The authored tabletop angle assumes a wide view; on a
 * portrait one (a phone) the camera both retreats until the full width fits and tilts toward overhead.
 */
function frameCamera(aspect: number): void {
  const wide = Math.max(0, Math.min(1, (aspect - 0.7) / 0.4)); // 0 portrait → 1 wide
  camDir.set(0, 7.0 + (4.2 - 7.0) * wide, 2.6 + (6.0 - 2.6) * wide).normalize();
  const halfWidth = (size + 0.6) / 2;
  const tanHalfV = Math.tan((camera.fov * PI) / 360);
  const fitWidth = halfWidth / (tanHalfV * Math.max(0.2, aspect));
  camPos.copy(camDir).multiplyScalar(Math.max(CAM_BASE_DIST, fitWidth)).add(CAM_TARGET);
  camera.position.copy(camPos);
  camera.lookAt(CAM_TARGET);
}

/** The playfield's window rectangle (px): the camera keeps its aspect and draws into it. */
const pf = { x: 0, y: 0, w: 0, h: 0 };
export function setPlayfield(x: number, y: number, w: number, h: number): void { pf.x = x; pf.y = y; pf.w = w; pf.h = h; }

/** Each cell's window rectangle (px) in the playfield, for the accessibility targets (top-face corners projected). */
const probe = new PerspectiveCamera(38, 1, 0.1, 100);
export function cellRects(): { x: number; y: number; width: number; height: number }[][] {
  if (pf.w <= 0 || pf.h <= 0) return [];
  probe.aspect = pf.w / pf.h;
  probe.position.copy(camPos);
  probe.lookAt(CAM_TARGET);
  probe.updateProjectionMatrix();
  probe.updateMatrixWorld();
  const out: { x: number; y: number; width: number; height: number }[][] = [];
  const v = new Vector3();
  for (let r = 0; r < size; r++) {
    const row: { x: number; y: number; width: number; height: number }[] = [];
    for (let c = 0; c < size; c++) {
      const p = cellPos(r, c);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) {
        v.set(p.x + dx, 0.15, p.z + dz).project(probe);
        const x = pf.x + (v.x + 1) / 2 * pf.w, y = pf.y + (1 - v.y) / 2 * pf.h;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      row.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
    out.push(row);
  }
  return out;
}

// -- the frame ---------------------------------------------------------------------------------------
/** render.ts frame(): tile pop-ins and pulses settle, the shake decays, the accent light drifts, particles rise;
 * the camera is fitted to the playfield. */
export function update(dtIn: number): void {
  const f = frame();
  const dt = Math.min(0.05, Math.max(0, dtIn));
  if (!active) return;
  if (f.width > 0 && f.height > 0) {
    const w = pf.w > 0 ? pf.w : f.width, h = pf.h > 0 ? pf.h : f.height;
    const aspect = w / h;
    const v = camera.view;
    const stale = !v || !v.enabled || v.fullWidth !== w || v.fullHeight !== h || v.offsetX !== -pf.x || v.offsetY !== -pf.y || v.width !== f.width || v.height !== f.height;
    if (aspect !== camera.aspect || stale || camFit !== size) {
      camera.aspect = aspect;
      if (pf.w > 0) camera.setViewOffset(w, h, -pf.x, -pf.y, f.width, f.height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      frameCamera(aspect);
      camFit = size;
    }
  }
  const moving = !reducedMotion;
  if (moving) clock += dt;
  for (const row of tiles) for (const t of row) {
    if (!t) continue;
    const s = t.mesh.scale.x;
    if (s < 1) t.mesh.scale.setScalar(Math.min(1, s + dt * 6));
    if (t.pulse > 0) {
      t.pulse = Math.max(0, t.pulse - dt * 4);
      const k = 1 + Math.sin(t.pulse * PI) * 0.18;
      t.mesh.scale.setScalar(Math.max(t.mesh.scale.x, k));
      if (t.pulse === 0) t.mesh.scale.setScalar(1);
    }
  }
  const ms = f.time * 1000;
  if (shake > 0.001) {
    shake *= Math.pow(0.001, dt); // critically damped decay
    camera.position.x = camPos.x + Math.sin(ms * 0.09) * shake * 0.06;
    camera.position.y = camPos.y + Math.cos(ms * 0.11) * shake * 0.04;
    camera.lookAt(CAM_TARGET);
  } else if (shake !== 0) {
    shake = 0;
    camera.position.copy(camPos);
    camera.lookAt(CAM_TARGET);
  }
  glow.intensity += (GLOW_BASE - glow.intensity) * Math.min(1, dt * 3);
  // A slow drift of the accent light across the glass (ambient shimmer).
  glow.position.set(Math.sin(clock * 0.35) * 1.6, 3, 2 + Math.cos(clock * 0.27) * 0.8);
  if (moving) animateParticles(dt);
}
