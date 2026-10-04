/**
 * StarHermit adapter (src/platform.ts) over the real shared SDK
 * (starhermit-sdk.js) with a stubbed fetch and launch fragment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import type { StarHermitSDK } from '../src/starhermit-sdk';

const SDK_SRC = fs.readFileSync(new URL('../starhermit-sdk.js', import.meta.url), 'utf8');
function loadSdk(): StarHermitSDK {
  const mod: { exports: StarHermitSDK } = { exports: {} as StarHermitSDK };
  new Function('module', 'exports', 'self', SDK_SRC)(mod, mod.exports, globalThis);
  return mod.exports;
}

const USER = 'a1b2c3d4-0000-4000-8000-000000000001';
const SLUG = 'merge-matrix';

interface Call { url: string; method: string; body?: any; auth?: string }

function fixture(href: string) {
  const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64url({ alg: 'none' })}.${b64url({ sub: USER, game_scope: SLUG, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  const u = new URL(href.replace('{jwt}', jwt));
  const win: any = {
    location: { href: u.href, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin, assign() {} },
    history: { state: null, replaceState(_s: unknown, _t: string, url: string) { win.replaced = url; } },
  };
  const calls: Call[] = [];
  let slot: Uint8Array | null = null;
  const kv: Record<string, unknown> = { theme: 'neon' };
  const res = (status: number, body?: unknown, bytes?: Uint8Array) => ({
    ok: status >= 200 && status < 300, status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
    arrayBuffer: async () => bytes!.buffer.slice(bytes!.byteOffset, bytes!.byteOffset + bytes!.byteLength),
  });
  const fetch = async (url: string, init: any = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body, auth: (init.headers || {}).Authorization });
    if (url === `/api/v1/users/${USER}/profile`) return res(200, { nickname: 'Tile Tamer', username: 'hidden' });
    if (url === `/api/v1/me/cloud-saves/${encodeURIComponent('game:' + SLUG)}`) {
      if (method === 'PUT') { slot = new Uint8Array(Buffer.from(body.dataBase64, 'base64')); return res(204); }
      return slot ? res(200, null, slot) : res(404);
    }
    if (url === `/api/v1/games/${SLUG}/settings`) {
      if (method === 'PATCH') Object.assign(kv, body.settings);
      return res(200, { settings: kv });
    }
    if (url === `/api/v1/games/${SLUG}/controls`) return res(200, { actions: [{ action: 'undo', codes: ['KeyU'] }] });
    if (url === '/api/v1/time') return res(200, { now: Date.now() + 60_000 });
    return res(404);
  };
  const setTimeout = (fn: () => void, ms: number) => { const t = globalThis.setTimeout(fn, ms); t.unref(); return t; };
  const sh = loadSdk().create({ window: win, fetch, setTimeout, clearTimeout });
  return { sh, win, calls, kv };
}

let platform: typeof import('../src/platform');
beforeEach(async () => {
  vi.resetModules();
  platform = await import('../src/platform');
});

describe('StarHermit adapter', () => {
  it('reads the launch token, loads the nickname and round-trips the game:<slug> cloud save', async () => {
    const f = fixture('https://merge-matrix.starhermit.com/#game_token={jwt}');
    const info = await platform.initPlatform(f.sh);
    expect(info).toEqual({ hosted: true, userId: USER, nickname: 'Tile Tamer' });
    expect(platform.isHosted()).toBe(true);
    expect(String(f.win.replaced)).not.toContain('game_token');
    expect(f.calls.every((c) => /^Bearer /.test(c.auth ?? ''))).toBe(true);
    const states: string[] = [];
    platform.onSyncStatus((s) => states.push(s));
    platform.queueCloudSave({ version: 1, progress: { gamesPlayed: 4 } });
    await f.sh.flushSave();
    expect(f.calls.find((c) => c.method === 'PUT')!.url).toBe('/api/v1/me/cloud-saves/game%3Amerge-matrix');
    expect(await platform.loadCloudSave()).toEqual({ version: 1, progress: { gamesPlayed: 4 } });
    expect(states).toEqual(['saving', 'synced']);
  });

  it('loads and patches the settings KV, applies binding overrides, builds the invite link', async () => {
    const f = fixture('https://x.example/#game_token={jwt}');
    await platform.initPlatform(f.sh);
    expect(await platform.loadSettings()).toEqual({ theme: 'neon' });
    platform.pushSettings({ theme: 'x' }); // not primed yet: ignored
    platform.primeSettings({ theme: 'neon', muted: false });
    platform.pushSettings({ theme: 'neon', muted: true });
    await platform.flushSettings();
    const patches = f.calls.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe(`/api/v1/games/${SLUG}/settings`);
    expect(patches[0].body).toEqual({ settings: { muted: true } });
    expect(await platform.loadBindings({ undo: ['KeyZ'], hint: ['KeyH'] })).toEqual({ undo: ['KeyU'], hint: ['KeyH'] });
    expect(platform.inviteLink()).toBe(`https://dashboard.starhermit.com/game-invite/${USER}/${SLUG}`);
  });

  it('makes no network calls standalone', async () => {
    const f = fixture('http://localhost:8080/index.html');
    const info = await platform.initPlatform(f.sh);
    expect(info.hosted).toBe(false);
    expect(await platform.loadCloudSave()).toBeNull();
    expect(await platform.loadSettings()).toEqual({});
    expect(await platform.leaderboardEntries(10)).toBeNull();
    expect(await platform.loadBindings({ hint: ['KeyH'] })).toEqual({ hint: ['KeyH'] });
    platform.queueCloudSave({ a: 1 });
    platform.primeSettings({});
    platform.pushSettings({ muted: true });
    expect(platform.canSignIn()).toBe(false);
    expect(platform.inviteLink()).toBeNull();
    expect(await platform.serverTimeOffset()).toBe(0); // local clock, no request
    expect(f.calls).toHaveLength(0);
  });

  it('reads the platform clock only when signed in (authenticated)', async () => {
    const f = fixture('https://merge-matrix.starhermit.com/#game_token={jwt}');
    await platform.initPlatform(f.sh);
    const off = await platform.serverTimeOffset();
    expect(off).toBeGreaterThan(50_000);
    const t = f.calls.find((c) => c.url === '/api/v1/time')!;
    expect(t.auth).toMatch(/^Bearer /);
  });

  it('offers sign-in on the platform host without a token', async () => {
    const f = fixture('https://merge-matrix.starhermit.com/');
    await platform.initPlatform(f.sh);
    expect(platform.canSignIn()).toBe(true);
    expect(f.calls).toHaveLength(0);
  });
});
