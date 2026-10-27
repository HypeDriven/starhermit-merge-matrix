// Localization: the browser build's tables (lang/strings.js, English source
// strings as the keys, the nine StarHermit locales; src/sh-strings.ts for the
// StarHermit account lines) in the interface language the runtime reports
// (preferences().language: the player's choice in Options › Language, else the
// account's preferred language or the device's). The runtime's Options replace
// the game's own Language setting (sh-language.js) and lang/i18n.js's DOM
// re-labelling: every string is drawn through T() each frame, so a change
// shows on the next frame.
import { onPreferencesChange, preferences } from "starhermit:engine";
import { loadClassic } from "starhermit:script";
import * as ui from "starhermit:ui";
import { SH_STRINGS, type ShStrings } from "../src/sh-strings.ts";

loadClassic("lang/strings.js");
const TABLES = (globalThis as unknown as { MM_STRINGS: Record<string, Record<string, string>> }).MM_STRINGS;
export const LOCALES = ["en-US", "en-GB", "es-419", "es-ES", "de-DE", "fr-FR", "fr-CA", "pt-BR", "it-IT"];
const PARENT: Record<string, string> = { "en-GB": "en-US", "es-ES": "es-419", "fr-CA": "fr-FR" };

let locale = "en-US";
export type Vars = Record<string, string | number>;

/** The supported locale for a language tag (exact, then the same language: es-MX → es-419, fr-BE → fr-FR). */
export function pickLocale(tag: string): string {
  const t = String(tag || "").toLowerCase();
  const exact = LOCALES.find((l) => l.toLowerCase() === t);
  if (exact) return exact;
  const lang = t.split(/[-_]/)[0];
  if (lang === "es") return t === "es" || t.startsWith("es-es") ? "es-ES" : "es-419";
  if (lang === "fr") return t.startsWith("fr-ca") ? "fr-CA" : "fr-FR";
  if (lang === "en") return t.startsWith("en-gb") || t.startsWith("en-ie") || t.startsWith("en-au") || t.startsWith("en-nz") ? "en-GB" : "en-US";
  return LOCALES.find((l) => l.toLowerCase().split("-")[0] === lang) ?? "en-US";
}

function lookup(key: string): string {
  for (let l: string | undefined = locale; l; l = PARENT[l]) {
    const t = TABLES[l];
    if (t && Object.prototype.hasOwnProperty.call(t, key)) return t[key]!;
  }
  return key;
}
/** An English source string in the player's language; `{name}` placeholders from vars. */
export function T(key: string, vars?: Vars | null): string {
  const s = lookup(key);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
/** Marks an English key that is translated with T() where it is shown. */
export const N = (s: string): string => s;
/** The StarHermit account strings (sign-in, invite, toasts, leaderboard line) in the game language. */
export function account(): ShStrings { return SH_STRINGS[locale] ?? SH_STRINGS["en-US"]!; }
export function currentLocale(): string { return locale; }

function apply(tag: string): void {
  locale = pickLocale(tag);
  ui.setLanguage(locale);
}
apply(preferences().language);
onPreferencesChange((p) => { if (pickLocale(p.language) !== locale) apply(p.language); });
