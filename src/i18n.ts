/**
 * Merge Matrix — localization access for the compiled modules. The tables and
 * the runtime live in lang/strings.js + lang/i18n.js (plain scripts loaded
 * before dist/main.js, global MMI18N); this wrapper keeps the modules usable
 * in Node tests, where English keys are returned unchanged.
 */

type Vars = Record<string, string | number>;
interface I18NGlobal { T(key: string, vars?: Vars): string; readonly lang: string }
declare global { var MMI18N: I18NGlobal | undefined }

/** Translate an English source string; {name} placeholders are filled from vars. */
export function T(key: string, vars?: Vars): string {
  const I = globalThis.MMI18N;
  if (I) return I.T(key, vars);
  return vars ? key.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : key;
}

/** Marks an English key for a later T() (content tables, caption keys). */
export function N(key: string): string { return key; }

/** The game's current locale (en-US outside the browser). */
export function lang(): string {
  return globalThis.MMI18N?.lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
}

/** Run cb whenever the player changes the language (Settings → Language). */
export function onLanguage(cb: () => void): void {
  if (typeof document !== 'undefined') document.addEventListener('mm-language', () => cb());
}
