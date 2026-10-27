// Localization coverage: every English key the engine client and the pure
// content use (T('…'), N('…')) is translated in every locale (en-GB → en-US,
// es-ES → es-419, fr-CA → fr-FR inherit), placeholders survive, no table row
// is unused, and the StarHermit account strings cover the nine locales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTables, codeKeys, audit, LOCALES } from './i18n-common.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const tables = loadTables(ROOT, 'lang/strings.js', 'MM_STRINGS');

function usedKeys() {
  const keys = new Set();
  const files = [...readdirSync(new URL('native/', ROOT)).map((f) => `native/${f}`), 'src/content.ts', 'src/modes.ts'];
  for (const f of files) for (const k of codeKeys(read(f))) keys.add(k);
  return [...keys].sort();
}

test('every used key is translated in every locale; placeholders intact; no unused rows', () => {
  const used = usedKeys();
  assert.ok(used.length > 150, `only ${used.length} keys found`);
  assert.deepEqual(audit(tables, used), []);
});

test('themes, lessons, achievements and challenges are translation keys', async () => {
  const C = await import('../src/content.ts');
  const M = await import('../src/modes.ts');
  const de = tables['de-DE'];
  for (const k of [...C.THEMES.map((t) => t.name), ...C.LESSONS.flatMap((l) => [l.title, l.text]), ...C.ACHIEVEMENTS.flatMap((a) => [a.name, a.desc]),
    ...M.CHALLENGES.map((c) => c.label), ...M.PRACTICE_GOALS.map((g) => g[1]), ...M.PRACTICE_SIZES.map((g) => g[1])].filter((k) => /[A-Za-z]/.test(k))) assert.ok(de[k], k);
});

test('regional tables inherit and override', () => {
  assert.equal(tables['fr-CA'].Score, 'Pointage');
  assert.equal(tables['es-ES'].Settings, 'Ajustes');
  assert.equal(tables['es-419']['Reach a {n} block.'], 'Alcanza un bloque de {n}.');
});

test('StarHermit account strings cover all nine locales', async () => {
  const { SH_STRINGS } = await import('../src/sh-strings.ts');
  const keys = Object.keys(SH_STRINGS['en-US']);
  for (const l of LOCALES) for (const k of keys) assert.ok(SH_STRINGS[l]?.[k], `${l} ${k}`);
});
