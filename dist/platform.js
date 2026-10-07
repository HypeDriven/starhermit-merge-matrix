/**
 * Merge Matrix — StarHermit platform client over the shared SDK
 * (`starhermit-sdk.js`, loaded before dist/main.js; typed in
 * starhermit-sdk.d.ts). The SDK owns the launch token + renewal, sign-in,
 * profiles, the game:<slug> cloud-save slot, the settings KV and key
 * bindings. Hosted mode = signed in. Without a token every entry point
 * no-ops and local play is unchanged.
 */
let sdk = null;
let nickname = '';
let syncCb = null;
const authCbs = [];
function sh() {
    return sdk ?? globalThis.StarHermit ?? null;
}
export function isHosted() {
    return !!sh()?.signedIn;
}
export function nicknameNow() {
    return nickname;
}
export function onSyncStatus(cb) {
    syncCb = cb;
}
export function onAuth(cb) {
    authCbs.push(cb);
}
function setSync(s) {
    syncCb?.(s);
}
/** Platform clock offset (serverTime - clientTime, round-trip adjusted).
 * Signed in only; standalone makes no request and uses the local clock (0). */
export async function serverTimeOffset() {
    if (!isHosted())
        return 0;
    try {
        const t0 = Date.now();
        const r = await sh().api('/api/v1/time');
        if (r && typeof r.now === 'number')
            return r.now - (t0 + Date.now()) / 2;
    }
    catch { /* local clock */ }
    return 0;
}
export function canSignIn() { return !!sh()?.canSignIn(); }
export function signIn() { sh()?.signIn(); }
export function inviteLink() { return isHosted() ? sh().inviteLink() : null; }
/** Player bindings ({action: codes[]}) with platform overrides when signed in. */
export function loadBindings(defaults) {
    return isHosted() ? sh().loadBindings(defaults) : Promise.resolve(defaults);
}
/** The game's first platform board, top-N; null when unavailable (no token / no board). */
export async function leaderboardEntries(limit) {
    const s = sh();
    if (!s?.signedIn)
        return null;
    const page = await s.leaderboard(null, { pageSize: limit });
    if (!page.board || !page.items.length)
        return null;
    const out = [];
    for (const e of page.items.slice(0, limit)) {
        const p = e.userId ? await s.profile(String(e.userId)) : null;
        out.push({ name: p ? p.displayName : 'Player ?', score: Number(e.score ?? 0) });
    }
    return out;
}
/** Post a finished ranked run's total to the high-score board (score-script.js);
 * resolves the player's rank on that board (null when unknown). */
export async function submitScore(total) {
    const s = sh();
    if (!s?.signedIn || typeof s.submitScores !== 'function')
        return { posted: false, rank: null };
    let keys;
    try {
        keys = await s.submitScores({ 'high-score': total });
    }
    catch {
        return { posted: false, rank: null };
    }
    if (!keys || !keys.includes('high-score'))
        return { posted: false, rank: null };
    try {
        const page = await s.leaderboard('high-score', { pageSize: 100 });
        const me = (page.items || []).find((i) => i.userId === s.userId);
        return { posted: true, rank: me && typeof me.rank === 'number' ? me.rank : null };
    }
    catch {
        return { posted: true, rank: null };
    }
}
/* ---------------- cloud save (game:<slug> slot) ---------------- */
export async function loadCloudSave() {
    const s = sh();
    if (!s?.signedIn)
        return null;
    return s.loadJSON();
}
/** Debounced (~2 s) save; flushed with keepalive on pagehide / hidden tab. */
export function queueCloudSave(doc) {
    const s = sh();
    if (!s?.signedIn)
        return;
    setSync('saving');
    s.saveJSON(doc, 2000);
}
/* ---------------- settings KV (changed keys only) ---------------- */
let lastSettings = null;
let pendingPatch = null;
let settingsTimer = null;
/** Stored per-player settings ({} when signed out). */
export async function loadSettings() {
    const s = sh();
    return s?.signedIn ? s.getSettings() : {};
}
/** Seed the change detector once platform values are applied. */
export function primeSettings(obj) {
    lastSettings = JSON.stringify(obj);
}
export function pushSettings(obj) {
    if (!isHosted() || lastSettings === null)
        return;
    const json = JSON.stringify(obj);
    if (json === lastSettings)
        return;
    const prev = JSON.parse(lastSettings);
    lastSettings = json;
    const cur = obj;
    pendingPatch = pendingPatch ?? {};
    for (const k of Object.keys(cur)) {
        if (JSON.stringify(cur[k]) !== JSON.stringify(prev[k]))
            pendingPatch[k] = cur[k];
    }
    if (settingsTimer !== null)
        clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => { void flushSettings(); }, 1500);
}
export function flushSettings() {
    if (settingsTimer !== null) {
        clearTimeout(settingsTimer);
        settingsTimer = null;
    }
    const s = sh();
    if (!pendingPatch || !s?.signedIn)
        return Promise.resolve(null);
    const patch = pendingPatch;
    pendingPatch = null;
    return s.patchSettings(patch);
}
/* ---------------- init ---------------- */
/** Read the launch token (via the SDK) and load the profile. `inject` is for tests. */
export async function initPlatform(inject) {
    if (inject)
        sdk = inject;
    const s = sh();
    if (!s)
        return { hosted: false, userId: '', nickname: '' };
    s.init();
    s.on('saved', (ok) => setSync(ok ? 'synced' : 'offline'));
    s.on('auth', (e) => {
        if (!e.signedIn)
            nickname = '';
        for (const cb of authCbs)
            cb(e);
    });
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const flush = () => { if (isHosted()) {
            void s.flushSave(true);
            void flushSettings();
        } };
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', () => { if (document.hidden)
            flush(); });
    }
    if (s.signedIn) {
        const p = await s.profile();
        nickname = p ? p.displayName : 'Player ' + String(s.userId).slice(0, 6);
    }
    return { hosted: s.signedIn, userId: s.userId ?? '', nickname };
}
