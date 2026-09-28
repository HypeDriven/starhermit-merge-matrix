/**
 * Merge Matrix — Three.js render layer.
 * Consumes immutable board snapshots; never mutates rules state.
 * Falls back gracefully: caller uses the DOM board when init() returns false.
 *
 * Graphics quality comes from gfx.ts (presets + per-category overrides) and is
 * applied live by setGraphics(): shadow map, image-based reflections, tile
 * detail, particles, pixel ratio and the post chain
 * (RenderPass → GTAO → UnrealBloom → grade → OutputPass → SMAA/FXAA).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { resolve, describe, detectPreset, adaptStep, SHADOW_MAP, PARTICLE_COUNT, } from './gfx.js';
let renderer = null;
let scene = null;
let camera = null;
let boardGroup = null;
let tiles = [];
let boardMeshes = [];
let theme = null;
let cfg = { gfx: {}, reducedMotion: false };
let size = 4;
let lastBoard = null;
let canvasEl = null;
let disposed = false;
let shake = 0;
let glow = null;
let key = null;
let rim = null;
let hemi = null;
let ground = null;
let particles = null;
let particleVel = null;
let envTex = null;
const texCache = new Map();
const tileMatCache = new Map();
const geoCache = new Map();
// graphics state
let gpu = '';
let detected = 'balanced';
let q = resolve({}, 'balanced');
let gfxJson = '';
let cssSize = [1, 1];
let dpr = 1;
let pixelRatio = 1;
let adaptiveScale = 1;
let frameTimes = [];
let fps = 0;
let composer = null;
let postKey = null;
let postFailed = false;
let clock = 0; // ambient-motion time (frozen under reduced motion)
/* ---------------- GPU detection ---------------- */
function isTouchDevice() {
    try {
        return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    }
    catch {
        return false;
    }
}
/** Renderer string: plain RENDERER when the browser already unmasks it, else the debug extension. */
function readGpu(gl) {
    try {
        const plain = String(gl.getParameter(gl.RENDERER) || '');
        if (plain && !/^webkit webgl$/i.test(plain) && !/^mozilla$/i.test(plain))
            return plain;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || plain) : plain;
    }
    catch {
        return '';
    }
}
/** GPU name and Auto preset, probing a throwaway context if the board renderer is not up yet. */
export function probeGpu() {
    if (renderer)
        return { gpu, detected };
    if (!gpu) {
        try {
            const c = document.createElement('canvas');
            const gl = (c.getContext('webgl2') || c.getContext('webgl'));
            if (gl) {
                gpu = readGpu(gl);
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            }
        }
        catch { /* no WebGL */ }
        detected = detectPreset(gpu, isTouchDevice());
    }
    return { gpu, detected };
}
/* ---------------- materials & textures ---------------- */
function tileColor(v) {
    if (!theme)
        return '#3b82f6';
    if (theme.tiles[v])
        return theme.tiles[v];
    // extrapolate for big tiles
    const keys = Object.keys(theme.tiles).map(Number).filter((k) => k > 0).sort((a, b) => a - b);
    return theme.tiles[keys[keys.length - 1]] ?? '#3b82f6';
}
/** Extra side-face emission for high tiles, so bloom picks out the big numbers. */
function glowFor(v) {
    // light and high-contrast themes: no halo that could soften a digit
    if (!theme || !theme.textLight || theme.id === 'mono')
        return 0;
    const rank = Math.log2(Math.max(2, v));
    if (rank < 7)
        return 0;
    // pale fills (yellow, cream) need less push to cross the bloom threshold
    const c = new THREE.Color(tileColor(v));
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return Math.min(3, 1.9 + (rank - 7) * 0.25) * (1 - 0.6 * lum);
}
function detailed() { return q.detail === 'detailed'; }
function tileGeometry() {
    const k = `tile:${q.detail}`;
    let g = geoCache.get(k);
    if (!g) {
        g = detailed() ? new RoundedBoxGeometry(0.86, 0.3, 0.86, 4, 0.085) : new THREE.BoxGeometry(0.86, 0.3, 0.86);
        geoCache.set(k, g);
    }
    return g;
}
/** Box faces in geometry order: only the top face carries the number. */
function tileMaterials(v) {
    const k = `${theme?.id}:${q.detail}:${v}`;
    const hit = tileMatCache.get(k);
    if (hit)
        return hit;
    const col = new THREE.Color(tileColor(v));
    let mats;
    if (detailed()) {
        const side = new THREE.MeshPhysicalMaterial({
            color: col, roughness: 0.4, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18,
            emissive: col, emissiveIntensity: 0.12 + glowFor(v), envMapIntensity: 0.45,
        });
        const top = new THREE.MeshPhysicalMaterial({
            map: labelTexture(v), roughness: 0.5, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.3,
            emissive: col, emissiveIntensity: 0.06, envMapIntensity: 0.15,
        });
        mats = [side, side, top, side, side, side];
    }
    else {
        const side = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.25, emissive: col, emissiveIntensity: 0.25 });
        const top = new THREE.MeshStandardMaterial({ map: labelTexture(v), roughness: 0.35, metalness: 0.25, emissive: col, emissiveIntensity: 0.25 });
        mats = [side, side, top, side, side, side];
    }
    tileMatCache.set(k, mats);
    return mats;
}
function labelTexture(v) {
    const k = `label:${theme?.id}:${q.detail}:${v}`;
    const hit = texCache.get(k);
    if (hit)
        return hit;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const col = tileColor(v);
    const light = !!theme && !theme.textLight;
    g.fillStyle = col; // full bleed: no dark corners on the rounded top
    g.fillRect(0, 0, 256, 256);
    // top sheen
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    if (detailed()) {
        // soft inner bevel: bright upper-left rim, dark lower-right rim
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(255,255,255,0.16)';
        g.beginPath();
        g.moveTo(14, 242);
        g.lineTo(14, 14);
        g.lineTo(242, 14);
        g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.16)';
        g.beginPath();
        g.moveTo(242, 14);
        g.lineTo(242, 242);
        g.lineTo(14, 242);
        g.stroke();
    }
    g.font = `800 ${v >= 1000 ? 76 : v >= 100 ? 92 : 116}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (detailed()) {
        // drop shadow keeps the digits crisp against the glossy fill
        g.shadowColor = light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)';
        g.shadowBlur = 8;
        g.shadowOffsetY = 4;
    }
    if (detailed() && !light) {
        // thin dark keyline: white digits stay legible on the pale (yellow/mint) fills
        g.lineJoin = 'round';
        const fill = new THREE.Color(col);
        const lum = 0.2126 * fill.r + 0.7152 * fill.g + 0.0722 * fill.b;
        g.lineWidth = 7;
        g.strokeStyle = `rgba(8,14,30,${(0.35 + 0.4 * lum).toFixed(2)})`;
        g.strokeText(String(v), 128, 134);
        g.shadowColor = 'transparent';
    }
    g.fillStyle = light ? '#1b2540' : '#ffffff';
    g.fillText(String(v), 128, 134);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    texCache.set(k, tex);
    return tex;
}
/** Deterministic value noise baked into a small tileable texture (surface grain). */
function noiseTexture() {
    const hit = texCache.get('noise');
    if (hit)
        return hit;
    const n = 128;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    let s = 0x2f6b1d;
    for (let i = 0; i < n * n; i++) {
        s = (s * 1103515245 + 12345) >>> 0;
        const v = 150 + ((s >>> 16) % 70);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    texCache.set('noise', tex);
    return tex;
}
/** Faint circuit-grid trace for the ground (emissive map, fades into the fog). */
function gridTexture() {
    const k = `grid:${theme?.id}`;
    const hit = texCache.get(k);
    if (hit)
        return hit;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = theme?.accent ?? '#41d9c0';
    g.globalAlpha = 0.55;
    g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 254);
    g.globalAlpha = 0.22;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(128, 0);
    g.lineTo(128, 256);
    g.moveTo(0, 128);
    g.lineTo(256, 128);
    g.stroke();
    g.globalAlpha = 0.8;
    g.fillStyle = theme?.accent ?? '#41d9c0';
    for (const [x, y] of [[0, 0], [128, 128], [0, 128], [128, 0]]) {
        g.beginPath();
        g.arc(x + 1, y + 1, 3, 0, Math.PI * 2);
        g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(15, 15);
    tex.anisotropy = 8;
    texCache.set(k, tex);
    return tex;
}
function discTexture() {
    const hit = texCache.get('disc');
    if (hit)
        return hit;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set('disc', tex);
    return tex;
}
function disposeMaterial(m) {
    m.dispose();
}
function clearTileMaterials() {
    const seen = new Set();
    for (const mats of tileMatCache.values())
        for (const m of mats)
            seen.add(m);
    for (const m of seen)
        disposeMaterial(m);
    tileMatCache.clear();
}
/* ---------------- scene ---------------- */
export function initRender(canvas, settings) {
    cfg = settings;
    canvasEl = canvas;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    }
    catch {
        return false;
    }
    gpu = readGpu(renderer.getContext());
    detected = detectPreset(gpu, isTouchDevice());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene = new THREE.Scene();
    // authored framing: low-distortion perspective, near-tabletop angle
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    frameCamera();
    hemi = new THREE.HemisphereLight(0xbfd2ff, 0x0a0e1a, 0.9);
    scene.add(hemi);
    key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 7, 4);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    scene.add(key);
    scene.add(key.target);
    rim = new THREE.DirectionalLight(0x66d9ff, 0.7);
    rim.position.set(-4, 3, -6);
    scene.add(rim);
    glow = new THREE.PointLight(0x66d9ff, 8, 12);
    glow.position.set(0, 3, 2);
    scene.add(glow);
    // image-based lighting: a neutral studio room prefiltered once
    try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
    }
    catch {
        envTex = null;
    }
    // ground plane for contact grounding
    ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.95, metalness: 0.1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.35;
    ground.receiveShadow = true;
    scene.add(ground);
    boardGroup = new THREE.Group();
    scene.add(boardGroup);
    disposed = false;
    setGraphics(settings.gfx, true);
    return true;
}
/** True once a WebGL context exists and has not been disposed. */
export function isReady() {
    return renderer !== null && !disposed;
}
export function setTheme(t) {
    theme = t;
    for (const [k, tex] of texCache)
        if (k.startsWith('label:') || k.startsWith('grid:')) {
            tex.dispose();
            texCache.delete(k);
        }
    clearTileMaterials();
    applyThemeLights();
    buildBoard(size);
}
function applyThemeLights() {
    if (!scene || !theme)
        return;
    const bg = new THREE.Color(theme.bg);
    scene.background = bg;
    scene.fog = detailed() ? new THREE.Fog(bg, 11, 24) : null;
    const accent = new THREE.Color(theme.accent);
    hemi?.groundColor.copy(bg);
    if (glow)
        glow.color.copy(accent).lerp(new THREE.Color(0x66d9ff), 0.4);
    if (rim)
        rim.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.3);
    if (ground) {
        const m = ground.material;
        const lightTheme = !theme.textLight;
        m.color.set(lightTheme ? theme.grid : '#05070f');
        if (detailed()) {
            m.emissiveMap = gridTexture();
            m.emissive.set(lightTheme ? '#000000' : '#ffffff');
            m.emissiveIntensity = lightTheme ? 0 : 0.12;
            m.roughness = 0.85;
            m.metalness = 0.1;
            m.envMapIntensity = 0.15;
        }
        else {
            m.emissiveMap = null;
            m.emissive.set('#000000');
            m.roughness = 0.95;
            m.metalness = 0.1;
        }
        m.needsUpdate = true;
    }
    if (particles)
        particles.material.color.copy(accent);
}
function disposeBoardMeshes() {
    if (!boardGroup)
        return;
    for (const row of tiles)
        for (const t of row)
            if (t)
                boardGroup.remove(t.mesh);
    for (const m of boardMeshes) {
        boardGroup.remove(m);
        m.traverse((o) => {
            const mesh = o;
            if (mesh.geometry && !isCachedGeo(mesh.geometry))
                mesh.geometry.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat))
                mat.forEach(disposeMaterial);
            else if (mat)
                disposeMaterial(mat);
        });
    }
    boardMeshes = [];
}
function isCachedGeo(g) {
    for (const c of geoCache.values())
        if (c === g)
            return true;
    return false;
}
export function buildBoard(newSize) {
    if (!boardGroup || !theme)
        return;
    size = newSize;
    disposeBoardMeshes();
    tiles = Array.from({ length: size }, () => new Array(size).fill(null));
    const det = detailed();
    const cellGeo = det ? new RoundedBoxGeometry(0.96, 0.12, 0.96, 3, 0.07) : new THREE.BoxGeometry(0.96, 0.12, 0.96);
    const cellMat = det
        ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(theme.cell), roughness: 0.55, metalness: 0.35, roughnessMap: noiseTexture(), clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.3 })
        : new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.cell), roughness: 0.6, metalness: 0.3 });
    const cells = new THREE.InstancedMesh(cellGeo, cellMat, size * size);
    const m4 = new THREE.Matrix4();
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const p = cellPos(r, c);
            m4.makeTranslation(p.x, -0.08, p.z);
            cells.setMatrixAt(r * size + c, m4);
        }
    }
    cells.receiveShadow = true;
    boardGroup.add(cells);
    boardMeshes.push(cells);
    // grid base slab
    const slabGeo = det ? new RoundedBoxGeometry(size + 0.24, 0.1, size + 0.24, 3, 0.05) : new THREE.BoxGeometry(size + 0.24, 0.1, size + 0.24);
    const slab = new THREE.Mesh(slabGeo, det
        ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(theme.grid), roughness: 0.3, metalness: 0.6, roughnessMap: noiseTexture(), clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.5 })
        : new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.grid), roughness: 0.4, metalness: 0.5 }));
    slab.position.y = -0.2;
    slab.receiveShadow = true;
    slab.castShadow = true;
    boardGroup.add(slab);
    boardMeshes.push(slab);
    if (det) {
        // thin light-trace frame around the slab: the matrix "powered on"
        const accent = new THREE.Color(theme.accent);
        const lightTheme = !theme.textLight;
        const frameMat = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(lightTheme ? 0.8 : 4.5) });
        const len = size + 0.3;
        const bar = new THREE.BoxGeometry(len, 0.025, 0.025);
        const frame = new THREE.Group();
        for (const [x, z, rot] of [[0, len / 2, 0], [0, -len / 2, 0], [len / 2, 0, 1], [-len / 2, 0, 1]]) {
            const b = new THREE.Mesh(rot ? bar.clone() : bar, frameMat);
            b.position.set(x, -0.16, z);
            if (rot)
                b.rotation.y = Math.PI / 2;
            frame.add(b);
        }
        boardGroup.add(frame);
        boardMeshes.push(frame);
    }
    fitShadow();
    frameCamera(); // a 5×5 board needs more room than a 4×4 one
}
/** Shadow frustum fitted tightly around the board (tiles, slab, a little ground). */
function fitShadow() {
    if (!key)
        return;
    const h = size / 2 + 0.9;
    const cam = key.shadow.camera;
    cam.left = -h;
    cam.right = h;
    cam.top = h;
    cam.bottom = -h;
    cam.near = 4;
    cam.far = 14;
    cam.updateProjectionMatrix();
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
function frameCamera() {
    if (!camera)
        return;
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
function cellPos(r, c) {
    const off = (size - 1) / 2;
    return new THREE.Vector3(c - off, 0, r - off);
}
/** Apply a board snapshot; animates spawns/merges toward the deterministic end state. */
export function setBoard(board, changed, merged) {
    lastBoard = board.map((r) => r.slice());
    if (!boardGroup || !theme)
        return;
    if (board.length !== size)
        buildBoard(board.length);
    const castShadow = q.shadows !== 'off';
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const v = board[r][c];
            const k = `${r},${c}`;
            let t = tiles[r][c];
            if (v === 0) {
                if (t) {
                    boardGroup.remove(t.mesh);
                    tiles[r][c] = null;
                }
                continue;
            }
            if (!t || t.value !== v) {
                if (t)
                    boardGroup.remove(t.mesh);
                const mesh = new THREE.Mesh(tileGeometry(), tileMaterials(v));
                mesh.position.copy(cellPos(r, c));
                mesh.castShadow = castShadow;
                mesh.receiveShadow = castShadow;
                boardGroup.add(mesh);
                t = { mesh, value: v, pulse: 0 };
                tiles[r][c] = t;
                if (changed?.has(k) && !cfg.reducedMotion)
                    t.mesh.scale.setScalar(0.2); // spawn pop-in
            }
            if (merged?.has(k) && !cfg.reducedMotion)
                t.pulse = 1;
        }
    }
}
export function pulseGlow(intensity) {
    if (glow)
        glow.intensity = 8 + intensity * 14;
    if (!cfg.reducedMotion)
        shake = Math.min(0.5, shake + intensity * 0.1);
}
/* ---------------- particles ---------------- */
function buildParticles() {
    if (!scene)
        return;
    if (particles) {
        scene.remove(particles);
        particles.geometry.dispose();
        particles.material.dispose();
        particles = null;
        particleVel = null;
    }
    const n = PARTICLE_COUNT[q.particles] ?? 0;
    if (n <= 0)
        return;
    const pos = new Float32Array(n * 3);
    particleVel = new Float32Array(n);
    let s = 0x51ed27;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) {
        // a loose ring around the board, never over the tiles themselves
        const a = rnd() * Math.PI * 2;
        const rad = size / 2 + 0.9 + rnd() * 6;
        pos[i * 3] = Math.cos(a) * rad;
        pos[i * 3 + 1] = -0.3 + rnd() * 3.2;
        pos[i * 3 + 2] = Math.sin(a) * rad - 1.5;
        particleVel[i] = 0.08 + rnd() * 0.18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.07, map: discTexture(), transparent: true, opacity: 0.75, depthWrite: false,
        blending: THREE.AdditiveBlending, color: new THREE.Color(theme?.accent ?? '#41d9c0'), fog: true,
    });
    particles = new THREE.Points(geo, mat);
    scene.add(particles);
}
function animateParticles(dt) {
    if (!particles || !particleVel)
        return;
    const attr = particles.geometry.getAttribute('position');
    const a = attr.array;
    for (let i = 0; i < particleVel.length; i++) {
        let y = a[i * 3 + 1] + particleVel[i] * dt;
        if (y > 2.9)
            y = -0.3;
        a[i * 3 + 1] = y;
        a[i * 3] += Math.sin(clock * 0.6 + i) * 0.02 * dt;
    }
    attr.needsUpdate = true;
}
/* ---------------- graphics settings ---------------- */
/** Apply saved graphics settings live (no reload). */
export function setGraphics(saved, force = false) {
    const json = JSON.stringify(saved ?? {});
    if (!force && json === gfxJson)
        return;
    gfxJson = json;
    const prevDetail = q.detail;
    q = resolve(saved, detected);
    if (!renderer || !scene)
        return;
    const mapSize = SHADOW_MAP[q.shadows];
    renderer.shadowMap.enabled = mapSize > 0;
    if (key) {
        key.castShadow = mapSize > 0;
        if (mapSize > 0 && key.shadow.mapSize.x !== mapSize) {
            key.shadow.mapSize.set(mapSize, mapSize);
            key.shadow.map?.dispose();
            key.shadow.map = null;
        }
    }
    scene.environment = q.reflections === 'on' ? envTex : null;
    scene.environmentIntensity = 0.4;
    if (hemi)
        hemi.intensity = q.reflections === 'on' ? 0.45 : 0.7;
    if (force || prevDetail !== q.detail) {
        clearTileMaterials();
        for (const [k, tex] of texCache)
            if (k.startsWith('label:')) {
                tex.dispose();
                texCache.delete(k);
            }
    }
    applyThemeLights();
    if (theme) {
        buildBoard(size);
        if (lastBoard)
            setBoard(lastBoard);
    }
    buildParticles();
    // shadow state and environment are compiled into the programs
    scene.traverse((o) => {
        const mat = o.material;
        if (Array.isArray(mat))
            mat.forEach((m) => { m.needsUpdate = true; });
        else if (mat)
            mat.needsUpdate = true;
    });
    adaptiveScale = 1;
    frameTimes = [];
    postKey = null; // rebuild the post chain on the next frame
    postFailed = false;
    fpsVisible(q.showFps);
    canvasEl?.setAttribute('data-gfx-preset', q.preset);
    applySize();
}
/** What the settings panel shows: GPU, Auto's choice, resolved tiers, cost and frame rate. */
export function graphicsInfo() {
    const px = [Math.round(cssSize[0] * pixelRatio), Math.round(cssSize[1] * pixelRatio)];
    const resolved = q;
    return {
        gpu, detected, resolved, pixels: px, fps: Math.round(fps), adaptiveScale, postFailed,
        summary: (words) => describe(resolved, px, words),
    };
}
function fpsVisible(on) {
    let el = document.getElementById('fps-meter');
    if (on && !el) {
        el = document.createElement('div');
        el.id = 'fps-meter';
        el.setAttribute('aria-hidden', 'true');
        el.textContent = '…';
        document.body.append(el);
    }
    if (el)
        el.hidden = !on;
}
// Colour grade + vignette (linear HDR in, before OutputPass).
const GradeShader = {
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.24 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      vec3 lc = clamp(c, 0.0, 1.0);
      // gentle S-curve, a touch more saturation, cool shadows / warm highlights
      vec3 s = mix(lc, lc * lc * (3.0 - 2.0 * lc), 0.18);
      float l = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(l), s, 1.1);
      s *= mix(vec3(0.95, 0.98, 1.06), vec3(1.03, 1.0, 0.97), smoothstep(0.2, 0.8, l));
      c = mix(c, s + max(c - 1.0, 0.0), uAmount);
      float d = length(vUv - 0.5);
      c *= 1.0 - uVignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(c, src.a);
    }`,
};
function currentPostKey() {
    return q.post ? [q.ao, q.bloom, q.grade, q.antialias, cssSize[0], cssSize[1], pixelRatio].join('|') : 'none';
}
function buildPost() {
    composer?.dispose();
    composer = null;
    if (!q.post || !renderer || !scene || !camera || postFailed)
        return;
    const [w, h] = cssSize;
    const pw = Math.max(1, Math.round(w * pixelRatio));
    const ph = Math.max(1, Math.round(h * pixelRatio));
    try {
        const target = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, samples: q.antialias === 'msaa' ? 4 : 0 });
        const c = new EffectComposer(renderer, target);
        c.setPixelRatio(pixelRatio);
        c.setSize(w, h);
        c.addPass(new RenderPass(scene, camera));
        if (q.ao !== 'off') {
            const ao = new GTAOPass(scene, camera, pw, ph);
            ao.output = GTAOPass.OUTPUT.Default;
            ao.blendIntensity = 0.75;
            ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: q.ao === 'high' ? 16 : 8 });
            ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: q.ao === 'high' ? 6 : 4, rings: 2, samples: q.ao === 'high' ? 16 : 8 });
            c.addPass(ao);
        }
        if (q.bloom === 'on') {
            // HDR threshold above lit-surface levels: only the light-trace frame, the
            // emissive sides of 128+ tiles and hot specular glints bloom
            c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.3, 2.0));
        }
        if (q.grade === 'on')
            c.addPass(new ShaderPass(GradeShader));
        c.addPass(new OutputPass());
        if (q.antialias === 'smaa')
            c.addPass(new SMAAPass());
        if (q.antialias === 'fxaa')
            c.addPass(new FXAAPass());
        composer = c;
    }
    catch {
        // post-processing is an enhancement: render directly if the chain cannot be built
        postFailed = true;
        composer = null;
    }
}
/** Adaptive resolution over ~90-frame windows; also feeds the frame-rate readout. */
function adapt(dtMs) {
    frameTimes.push(dtMs);
    if (frameTimes.length < 90)
        return false;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    frameTimes = [];
    fps = 1000 / avg;
    const el = document.getElementById('fps-meter');
    if (el && !el.hidden)
        el.textContent = `${Math.round(fps)} fps · ${Math.round(pixelRatio * 100) / 100}×`;
    if (!q.adaptive)
        return false;
    const before = adaptiveScale;
    adaptiveScale = adaptStep(adaptiveScale, avg);
    return before !== adaptiveScale;
}
function applySize() {
    if (!renderer)
        return;
    const ratio = Math.min(dpr, q.pixelCap) * q.scale * adaptiveScale;
    if (ratio !== pixelRatio || renderer.getPixelRatio() !== ratio) {
        pixelRatio = ratio;
        renderer.setPixelRatio(ratio);
    }
    renderer.setSize(cssSize[0], cssSize[1], false);
}
/* ---------------- frame ---------------- */
let lastTime = 0;
export function frame(time) {
    if (!renderer || !scene || !camera || disposed)
        return;
    const rawMs = lastTime ? Math.min(250, time - lastTime) : 16;
    const dt = Math.min(0.05, rawMs / 1000 || 0.016);
    lastTime = time;
    if (adapt(rawMs))
        applySize();
    const moving = !cfg.reducedMotion;
    if (moving)
        clock += dt;
    // settle tile animation toward exact end state
    for (const row of tiles) {
        for (const t of row) {
            if (!t)
                continue;
            const s = t.mesh.scale.x;
            if (s < 1)
                t.mesh.scale.setScalar(Math.min(1, s + dt * 6));
            if (t.pulse > 0) {
                t.pulse = Math.max(0, t.pulse - dt * 4);
                const k = 1 + Math.sin(t.pulse * Math.PI) * 0.18;
                t.mesh.scale.setScalar(Math.max(t.mesh.scale.x, k));
                if (t.pulse === 0)
                    t.mesh.scale.setScalar(1);
            }
        }
    }
    if (shake > 0.001 && camera) {
        shake *= Math.pow(0.001, dt); // critically damped decay
        camera.position.x = camPos.x + Math.sin(time * 0.09) * shake * 0.06;
        camera.position.y = camPos.y + Math.cos(time * 0.11) * shake * 0.04;
        camera.lookAt(CAM_TARGET);
    }
    else if (camera && shake !== 0) {
        shake = 0;
        camera.position.copy(camPos);
        camera.lookAt(CAM_TARGET);
    }
    if (glow) {
        glow.intensity += (8 - glow.intensity) * Math.min(1, dt * 3);
        // slow drift of the accent light across the glass (ambient shimmer)
        glow.position.set(Math.sin(clock * 0.35) * 1.6, 3, 2 + Math.cos(clock * 0.27) * 0.8);
    }
    if (moving)
        animateParticles(dt);
    const pk = currentPostKey();
    if (pk !== postKey) {
        postKey = pk;
        buildPost();
    }
    if (composer) {
        try {
            composer.render(dt);
            return;
        }
        catch {
            postFailed = true;
            composer.dispose();
            composer = null;
        }
    }
    renderer.render(scene, camera);
}
export function resize(w, h, devicePixelRatio) {
    if (!renderer || !camera)
        return;
    cssSize = [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
    dpr = devicePixelRatio || 1;
    applySize();
    camera.aspect = cssSize[0] / cssSize[1];
    camera.updateProjectionMatrix();
    frameCamera();
}
export function updateSettings(s) {
    cfg = s;
    setGraphics(s.gfx);
}
export function disposeRender() {
    disposed = true;
    composer?.dispose();
    composer = null;
    for (const tex of texCache.values())
        tex.dispose();
    texCache.clear();
    clearTileMaterials();
    for (const g of geoCache.values())
        g.dispose();
    geoCache.clear();
    envTex?.dispose();
    envTex = null;
    if (scene) {
        scene.traverse((o) => {
            const m = o;
            if (m.geometry)
                m.geometry.dispose();
            const mat = m.material;
            if (Array.isArray(mat))
                mat.forEach((x) => x.dispose());
            else if (mat)
                mat.dispose();
        });
    }
    renderer?.dispose();
    renderer = null;
    scene = null;
    camera = null;
    boardGroup = null;
    tiles = [];
    boardMeshes = [];
    particles = null;
    ground = null;
    key = null;
    rim = null;
    hemi = null;
    glow = null;
}
