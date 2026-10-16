/**
 * Localization coverage: every English key the markup and code use is
 * translated in every locale (en-GB → en-US, es-ES → es-419, fr-CA → fr-FR
 * inherit), placeholders survive, the language follows sh-language.js and
 * switches live, and the Graphics and StarHermit strings cover the nine locales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-ignore — plain ESM helper shared with the other games' tests
import { loadTables, codeKeys, htmlKeys, audit, bootI18n, LOCALES } from './i18n-common.mjs';
import { GFX_LOCALES } from '../src/gfxtext';
import { SH_STRINGS } from '../src/sh-strings';
import { ACHIEVEMENTS, LESSONS, THEMES } from '../src/content';

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8');

function usedKeys(): string[] {
  const keys = new Set<string>(htmlKeys(read('index.html')));
  for (const f of ['main', 'ui', 'platform', 'audio', 'content']) {
    for (const k of codeKeys(read(`src/${f}.ts`), ['caption'])) keys.add(k);
  }
  return [...keys].sort();
}

describe('localization', () => {
  it('every used key is translated in every locale; placeholders intact', () => {
    const used = usedKeys();
    expect(used.length).toBeGreaterThan(150);
    expect(audit(loadTables(ROOT, 'lang/strings.js', 'MM_STRINGS'), used)).toEqual([]);
  });

  it('every theme, lesson and achievement text is a translation key', () => {
    const de = loadTables(ROOT, 'lang/strings.js', 'MM_STRINGS')['de-DE'];
    for (const k of [...THEMES.map((t) => t.name), ...LESSONS.flatMap((l) => [l.title, l.text]), ...ACHIEVEMENTS.flatMap((a) => [a.name, a.desc])]) {
      expect(de[k], k).toBeTruthy();
    }
  });

  it('the locale follows sh-language and switches live', () => {
    const { I18N, events, doc } = bootI18n(ROOT, { strings: 'lang/strings.js', i18n: 'lang/i18n.js', global: 'MMI18N', languages: ['de-DE'] });
    expect(I18N.lang).toBe('de-DE');
    expect(doc.documentElement.lang).toBe('de-DE');
    expect(I18N.T('Moves')).toBe('Züge');
    I18N.language.setChoice('fr-CA');
    expect(I18N.lang).toBe('fr-CA');
    expect(events.at(-1)).toBe('fr-CA');
    expect(I18N.T('Score')).toBe('Pointage');
    expect(I18N.T('Moves')).toBe('Coups');
    I18N.language.setChoice('es-ES');
    expect(I18N.T('Settings')).toBe('Ajustes');
    expect(I18N.T('Reach a {n} block.', { n: 512 })).toBe('Alcanza un bloque de 512.');
  });

  it('Graphics and StarHermit strings cover all nine locales', () => {
    const shKeys = Object.keys(SH_STRINGS['en-US']);
    for (const l of LOCALES as string[]) {
      expect(GFX_LOCALES[l], l).toBeTruthy();
      for (const k of shKeys) expect((SH_STRINGS as Record<string, Record<string, string>>)[l][k], `${l} ${k}`).toBeTruthy();
    }
  });
});
