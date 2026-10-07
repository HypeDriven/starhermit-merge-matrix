/**
 * Type declarations for the shared StarHermit client `starhermit-sdk.js`
 * (copied unchanged to the repo root and loaded by index.html as a classic
 * script before dist/main.js; it defines `window.StarHermit`).
 */

export interface StarHermitProfile {
  userId: string;
  username: string | null;
  nickname: string | null;
  /** nickname, falling back to "Player " + id prefix */
  displayName: string;
}

export interface StarHermitFriend { userId: string; username?: string; online?: boolean; currentGame?: string | null }

export interface StarHermitControl { action: string; label?: string; defaultCodes?: string[]; codes: string[] }

export interface StarHermitBoard { id: string; key?: string; name?: string }

export interface StarHermitLeaderboardPage {
  items: { userId?: string; username?: string; score?: number; rank?: number; [k: string]: unknown }[];
  total: number;
  page?: number;
  pageSize?: number;
  board?: StarHermitBoard | null;
}

export interface StarHermitAuthEvent { signedIn: boolean; userId?: string | null; reason?: string }

export interface StarHermitConnection {
  send(data: unknown, realtime?: boolean): boolean;
  close(): void;
  readonly open: boolean;
}

export interface StarHermitSDK {
  base: string;
  token: string | null;
  claims: Record<string, unknown> | null;
  userId: string | null;
  slug: string | null;
  gameId?: string;
  launchSessionId: string | null;
  inviteQuery: string | null;
  signedIn: boolean;

  init(opts?: { base?: string; gameId?: string }): StarHermitSDK;
  create(env?: Record<string, unknown>): StarHermitSDK;
  on(type: 'auth', fn: (e: StarHermitAuthEvent) => void): () => void;
  on(type: 'saved', fn: (ok: boolean) => void): () => void;
  on(type: 'achievement', fn: (data: unknown) => void): () => void;
  on(type: string, fn: (value: any) => void): () => void;
  off(type: string, fn: (value: any) => void): void;
  setToken(token: string | null): void;
  signOut(reason?: string): void;
  refresh(): Promise<string | null>;
  canSignIn(): boolean;
  signIn(): boolean;
  decodeJwt(token: string): Record<string, unknown> | null;
  gamePath(suffix?: string): string;
  api<T = unknown>(path: string, opts?: { method?: string; body?: unknown; blob?: boolean; bytes?: boolean; keepalive?: boolean }): Promise<T | null>;

  getGame(): Promise<Record<string, unknown> | null>;
  profile(userId?: string): Promise<StarHermitProfile | null>;
  avatarUrl(userId?: string): Promise<string | null>;
  friends(): Promise<StarHermitFriend[]>;
  inviteLink(query?: string | Record<string, string>): string | null;

  saveInfo(): Promise<{ exists: boolean; sizeBytes?: number; updatedAt?: string } | null>;
  loadSave(): Promise<string | null>;
  writeSave(text: string, opts?: { keepalive?: boolean }): Promise<boolean>;
  loadJSON<T = unknown>(): Promise<T | null>;
  saveJSON(obj: unknown, delayMs?: number): void;
  flushSave(keepalive?: boolean): Promise<boolean>;

  getSettings(): Promise<Record<string, unknown>>;
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown): Promise<unknown>;
  patchSettings(obj: Record<string, unknown>): Promise<unknown>;
  deleteSetting(key: string): Promise<unknown>;
  clearSettings(): Promise<unknown>;

  getControls(): Promise<StarHermitControl[]>;
  setControl(action: string, codes: string[]): Promise<unknown>;
  setControls(bindings: Record<string, string[]>): Promise<unknown>;
  resetControls(): Promise<unknown>;
  loadBindings<T extends Record<string, string[]>>(defaults: T): Promise<T>;

  achievements(): Promise<unknown[]>;
  linkedAchievements(otherSlug: string): Promise<unknown[]>;
  leaderboards(): Promise<StarHermitBoard[]>;
  leaderboardEntries(boardId: string, opts?: { page?: number; pageSize?: number; scope?: string; region?: string }): Promise<StarHermitLeaderboardPage>;
  /** Post a finished run's scores ({ boardKey: number }) through the game's score script; resolves the accepted keys. */
  submitScores(scores: Record<string, number>): Promise<string[]>;
  leaderboard(key?: string | null, opts?: { page?: number; pageSize?: number; scope?: string; region?: string }): Promise<StarHermitLeaderboardPage>;

  mySessions(): Promise<unknown[]>;
  getSession(id: string): Promise<Record<string, unknown> | null>;
  startAiSession(): Promise<{ sessionId: string } | null>;
  queues(): Promise<unknown[]>;
  joinQueue(queues: string[]): Promise<unknown>;
  matchStatus(): Promise<Record<string, unknown> | null>;
  cancelMatch(): Promise<unknown>;
  waitForMatch(opts?: { intervalMs?: number; onTick?: (t: unknown) => void }): Promise<unknown> & { stop(): void };
  sendInvite(toUserId: string): Promise<unknown>;
  invites(): Promise<{ incoming: unknown[]; outgoing: unknown[] }>;
  acceptInvite(id: string): Promise<unknown>;
  declineInvite(id: string): Promise<unknown>;
  myReplays(limit?: number): Promise<unknown[]>;
  getReplay(id: string): Promise<unknown>;

  wsUrl(path: string, params: Record<string, string | null | undefined>): string;
  connect(sessionId: string, handlers?: Record<string, (...args: any[]) => void>, opts?: { build?: string }): StarHermitConnection;
  chatMessages(conversationId: string, opts?: { page?: number; pageSize?: number }): Promise<unknown>;
  sendChat(conversationId: string, content: string): Promise<unknown>;
  pollChat(conversationId: string, onMessages: (list: unknown[]) => void, intervalMs?: number): () => void;
  voice: Record<string, (...args: any[]) => any>;
  realtime: Record<string, (...args: any[]) => any>;
}

declare global {
  // eslint-disable-next-line no-var
  var StarHermit: StarHermitSDK | undefined;
  interface Window { StarHermit?: StarHermitSDK }
}
