/**
 * Merge Matrix — StarHermit platform client.
 * Hosted mode activates iff a launch token was read from the URL fragment
 * (#game_token=<jwt>, optional &session_id=; ?token=/ ?launch= are local-dev
 * fallbacks). Bearer auth on every call, 45-min launch-token refresh, profile
 * nickname, one zip+base64 cloud-save slot, read-only platform leaderboard.
 * Without a token every entry point no-ops and local play is unchanged.
 */
let token = null;
let userId = '';
let gameSlug = ''; // from game_scope — never hard-coded
let nickname = '';
let refreshTimer = null;
let syncCb = null;
export function isHosted() {
    return token !== null;
}
export function nicknameNow() {
    return nickname;
}
export function onSyncStatus(cb) {
    syncCb = cb;
}
function setSync(s) {
    syncCb?.(s);
}
/* ---------------- launch token ---------------- */
function decodeJwtPayload(jwt) {
    try {
        const part = jwt.split('.')[1];
        if (!part)
            return {};
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
        const payload = JSON.parse(atob(b64));
        return payload && typeof payload === 'object' ? payload : {};
    }
    catch {
        return {};
    }
}
function readLaunchToken() {
    // the fragment is authoritative; query fallbacks exist for local dev only
    const m = /(?:^|&)game_token=([^&]+)/.exec(location.hash.slice(1));
    if (m) {
        const t = decodeURIComponent(m[1]);
        // read once, then strip: keep any other fragment params, drop the token
        const rest = location.hash.slice(1).split('&').filter((p) => p && !p.startsWith('game_token='));
        history.replaceState(null, '', location.pathname + location.search + (rest.length ? '#' + rest.join('&') : ''));
        return t;
    }
    const q = new URLSearchParams(location.search);
    return q.get('token') ?? q.get('launch');
}
/* ---------------- authenticated api ---------------- */
function authHeaders() {
    return token ? { authorization: `Bearer ${token}` } : {};
}
/** Authenticated JSON call; null on any failure (callers degrade gracefully). */
export async function api(path, init) {
    if (!token)
        return null;
    try {
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Bearer ${token}`);
        const res = await fetch('/api/v1' + path, { ...init, headers });
        if (!res.ok)
            return null;
        return await res.json().catch(() => null);
    }
    catch {
        return null;
    }
}
function scheduleRefresh() {
    if (refreshTimer !== null)
        clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { void refreshToken(); }, 45 * 60 * 1000);
}
async function refreshToken() {
    try {
        const res = await fetch(`/api/v1/games/${encodeURIComponent(gameSlug)}/launch-token`, {
            method: 'POST', headers: authHeaders(),
        });
        if (!res.ok)
            throw new Error('refresh failed');
        const body = await res.json().catch(() => null);
        if (body?.token)
            token = body.token;
        scheduleRefresh();
    }
    catch {
        if (refreshTimer !== null)
            clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { void refreshToken(); }, 60 * 1000);
    }
}
/* ---------------- profile ---------------- */
const nickCache = new Map();
async function profileNickname(id) {
    const cached = nickCache.get(id);
    if (cached)
        return cached;
    let name = '';
    const p = await api(`/users/${encodeURIComponent(id)}/profile`);
    if (p?.nickname)
        name = String(p.nickname);
    if (!name)
        name = 'Player ' + id.slice(0, 8);
    nickCache.set(id, name);
    return name;
}
async function loadOwnProfile() {
    const p = await api(`/users/${encodeURIComponent(userId)}/profile`);
    nickname = p?.nickname ? String(p.nickname) : 'Player ' + userId.slice(0, 8);
}
/** Platform leaderboard top-N; null when unavailable (no token / no board). */
export async function leaderboardEntries(limit) {
    if (!token || !gameSlug)
        return null;
    const g = await api(`/games/${encodeURIComponent(gameSlug)}`);
    const lid = g?.leaderboardId;
    if (!lid)
        return null;
    const r = await api(`/leaderboards/${encodeURIComponent(lid)}/entries?page=1&pageSize=${limit}`);
    if (!r?.entries)
        return null;
    const out = [];
    for (const e of r.entries.slice(0, limit)) {
        let name = e.nickname ?? e.name ?? '';
        if (!name && e.userId)
            name = await profileNickname(String(e.userId));
        out.push({ name: name || 'Player ?', score: Number(e.score ?? 0) });
    }
    return out;
}
/* ---------------- cloud save (one zip+base64 slot) ---------------- */
let saveTimer = null;
let pendingDoc = null;
export async function loadCloudSave() {
    if (!token || !gameSlug)
        return null;
    try {
        const res = await fetch(`/api/v1/me/cloud-saves/${encodeURIComponent(gameSlug)}`, { headers: authHeaders() });
        if (res.status === 404)
            return null;
        if (!res.ok) {
            setSync('offline');
            return null;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        return JSON.parse(new TextDecoder().decode(unzipFirstEntry(bytes)));
    }
    catch {
        setSync('offline');
        return null;
    }
}
/** Debounced (~2 s) save; flushes on pagehide/visibilitychange via init below. */
export function queueCloudSave(doc) {
    if (!token || !gameSlug)
        return;
    pendingDoc = doc;
    setSync('saving');
    if (saveTimer !== null)
        clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void flushCloudSave(); }, 2000);
}
async function flushCloudSave() {
    if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (!token || !gameSlug || pendingDoc === null)
        return false;
    const doc = pendingDoc;
    pendingDoc = null;
    try {
        const bytes = zipStore('save.json', new TextEncoder().encode(JSON.stringify(doc)));
        const res = await fetch(`/api/v1/me/cloud-saves/${encodeURIComponent(gameSlug)}`, {
            method: 'PUT',
            headers: { ...authHeaders(), 'content-type': 'application/json' },
            body: JSON.stringify({ dataBase64: bytesToBase64(bytes) }),
            keepalive: true,
        });
        if (!res.ok) {
            pendingDoc = doc;
            setSync('offline');
            return false;
        }
        setSync('synced');
        return true;
    }
    catch {
        pendingDoc = doc; // keep the latest doc around for the next flush
        setSync('offline');
        return false;
    }
}
/* ---------------- init ---------------- */
export async function initPlatform() {
    const t = readLaunchToken();
    if (t) {
        const payload = decodeJwtPayload(t);
        if (payload.sub && payload.game_scope) {
            token = t;
            userId = String(payload.sub);
            gameSlug = String(payload.game_scope);
            window.addEventListener('pagehide', () => { void flushCloudSave(); });
            document.addEventListener('visibilitychange', () => { if (document.hidden)
                void flushCloudSave(); });
            await loadOwnProfile();
            scheduleRefresh();
        }
    }
    return { hosted: token !== null, userId, nickname };
}
/* ---------------- stored-zip helpers (no compression, CRC32) ---------------- */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++)
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function zipStore(name, dataBytes) {
    const enc = new TextEncoder();
    const nameB = enc.encode(name);
    const crc = crc32(dataBytes);
    const out = [];
    const u16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
    const u32 = (v) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    u32(0x04034b50);
    u16(20);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(crc);
    u32(dataBytes.length);
    u32(dataBytes.length);
    u16(nameB.length);
    u16(0);
    const head = new Uint8Array(out);
    const cd = [];
    const c16 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff);
    const c32 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    c32(0x02014b50);
    c16(20);
    c16(20);
    c16(0);
    c16(0);
    c16(0);
    c16(0);
    c32(crc);
    c32(dataBytes.length);
    c32(dataBytes.length);
    c16(nameB.length);
    c16(0);
    c16(0);
    c16(0);
    c16(0);
    c32(0);
    c32(0); // attrs + local-header offset
    const cdHead = new Uint8Array(cd);
    const cdOff = head.length + nameB.length + dataBytes.length;
    const parts = [head, nameB, dataBytes, cdHead, nameB];
    const eocd = [];
    const e32 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    const e16 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff);
    e32(0x06054b50);
    e16(0);
    e16(0);
    e16(1);
    e16(1);
    e32(cdHead.length + nameB.length);
    e32(cdOff);
    e16(0);
    parts.push(new Uint8Array(eocd));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const buf = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
        buf.set(p, o);
        o += p.length;
    }
    return buf;
}
function unzipFirstEntry(zipBytes) {
    // stored single-entry reader: scan local headers for compression 0
    const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    let off = 0;
    while (off + 30 <= zipBytes.length && dv.getUint32(off, true) === 0x04034b50) {
        const method = dv.getUint16(off + 8, true);
        const size = dv.getUint32(off + 18, true);
        const nameLen = dv.getUint16(off + 26, true);
        const extraLen = dv.getUint16(off + 28, true);
        const dataOff = off + 30 + nameLen + extraLen;
        if (method !== 0)
            throw new Error('unsupported zip entry');
        return zipBytes.slice(dataOff, dataOff + size);
    }
    throw new Error('bad zip');
}
function bytesToBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    return btoa(s);
}
function base64ToBytes(b64) {
    const s = atob(b64);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++)
        b[i] = s.charCodeAt(i);
    return b;
}
