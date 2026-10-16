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

interface Call { url: string; method: string; body?: any; auth?: string; ifMatch?: string }

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
  let version = 0; // the slot's ETag is "v<version>"; writes are conditional on it
  const kv: Record<string, unknown> = { theme: 'neon' };
  const res = (status: number, body?: unknown, bytes?: Uint8Array) => ({
    ok: status >= 200 && status < 300, status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
    arrayBuffer: async () => bytes!.buffer.slice(bytes!.byteOffset, bytes!.byteOffset + bytes!.byteLength),
  });
  const fetch = async (url: string, init: any = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const headers = init.headers || {};
    calls.push({ url, method, body, auth: headers.Authorization, ifMatch: headers['If-Match'] });
    if (url === `/api/v1/users/${USER}/profile`) return res(200, { nickname: 'Tile Tamer', username: 'hidden' });
    if (url === `/api/v1/me/cloud-saves/${encodeURIComponent('game:' + SLUG)}/info`) {
      return res(200, slot ? { exists: true, etag: `"v${version}"` } : { exists: false });
    }
    if (url === `/api/v1/me/cloud-saves/${encodeURIComponent('game:' + SLUG)}`) {
      if (method === 'PUT') {
        const cur = slot ? `"v${version}"` : null;
        if (headers['If-Match'] && headers['If-Match'] !== cur) return res(412, { error: 'precondition failed', etag: cur });
        if (headers['If-None-Match'] === '*' && slot) return res(412, { error: 'precondition failed', etag: cur });
        slot = new Uint8Array(Buffer.from(body.dataBase64, 'base64'));
        version++;
        return res(200, { etag: `"v${version}"` });
      }
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
  // Another device writes the slot (bumps the version behind this client's back).
  const writeElsewhere = (doc: unknown) => { slot = new Uint8Array(zipStored(JSON.stringify(doc))); version++; };
  return { sh, win, calls, kv, writeElsewhere };
}

/** A minimal stored (uncompressed) zip with one save.json entry, as the platform serves it. */
function zipStored(text: string): Buffer {
  const data = Buffer.from(text, 'utf8');
  const name = Buffer.from('save.json');
  let c = ~0;
  for (const b of data) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  const crc = (~c) >>> 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
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
    const f = fixture('https://0b9d6f2e-3c4a-4e5b-9a7c-1d2e3f405162.starhermit.com/');
    await platform.initPlatform(f.sh);
    expect(platform.canSignIn()).toBe(true);
    expect(f.calls).toHaveLength(0);
  });

  it('on a save conflict reloads the cloud copy, merges it and saves the merge', async () => {
    const session = await import('../src/session');
    const f = fixture('https://x.example/#game_token={jwt}');
    await platform.initPlatform(f.sh);
    expect(await platform.loadCloudSave()).toBeNull(); // empty slot: next write is If-None-Match: *
    const mine: import('../src/session').Progress = { version: 1, journeyCompleted: [0, 1], bestScores: { j01: 300 }, achievements: { 'first-clear': 50 }, dailyDays: ['2026-10-15'], tutorialDone: true, gamesPlayed: 5 };
    platform.queueCloudSave({ version: 1, progress: mine });
    await f.sh.flushSave();
    // Another device saves first; our next write is refused (412) and the merge handler runs.
    f.writeElsewhere({ version: 1, progress: { version: 1, journeyCompleted: [0, 2], bestScores: { j01: 200, j03: 900 }, achievements: { 'first-clear': 10, 'tile-4096': 20 }, dailyDays: ['2026-10-16'], tutorialDone: false, gamesPlayed: 9 } });
    let merged: import('../src/session').Progress | null = null;
    platform.onSaveConflict((remote) => {
      merged = session.mergeProgress(mine, (remote as { progress: import('../src/session').Progress }).progress);
      return { version: 1, progress: merged };
    });
    const states: string[] = [];
    platform.onSyncStatus((s) => states.push(s));
    platform.queueCloudSave({ version: 1, progress: mine });
    await f.sh.flushSave();
    await new Promise((r) => setTimeout(r, 30));
    await f.sh.flushSave();
    expect(merged).toEqual({ version: 1, journeyCompleted: [0, 1, 2], bestScores: { j01: 300, j03: 900 }, achievements: { 'first-clear': 10, 'tile-4096': 20 }, dailyDays: ['2026-10-15', '2026-10-16'], tutorialDone: true, gamesPlayed: 9 });
    const puts = f.calls.filter((c) => c.method === 'PUT');
    expect(puts.at(-1)!.ifMatch).toBe('"v2"');
    expect(f.sh.saveConflicted()).toBe(false);
    expect(states.at(-1)).toBe('synced');
    expect(await platform.loadCloudSave()).toEqual({ version: 1, progress: merged });
  });
});
