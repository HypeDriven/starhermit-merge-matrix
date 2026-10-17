// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in Settings → Graphics,
// starts Journey stage 1 and keeps sliding the board with the arrow keys (the game's own controls) —
// tile spawns, merge pops, glow pulses, camera shake and ambient particles run all the time. Retry or
// Next from the results screen starts another run.
export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

export async function setPreset(page, preset) {
  await page.waitForSelector('#screen-title:not([hidden])', { timeout: 20000 });
  await page.click('#btn-settings-top');
  await page.waitForSelector('#overlay-pause:not([hidden])');
  if (!(await page.locator('#set-quality').isVisible())) await page.click('#settings-graphics summary');
  await page.waitForSelector('#set-quality', { state: 'visible' });
  await page.selectOption('#set-quality', preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.click('#btn-resume-play');
  await page.waitForSelector('#overlay-pause', { state: 'hidden' });
}

const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowDown'];

export async function start(page) {
  await page.click('#btn-journey');
  await page.waitForSelector('#screen-journey:not([hidden])');
  await page.locator('#journey-grid .jcell').first().click();
  await page.waitForSelector('#screen-play:not([hidden])');
  await page.waitForSelector('#countdown', { state: 'hidden', timeout: 10000 });
  let open = true, i = 0;
  page.once('close', () => { open = false; });
  (async () => {
    while (open) {
      try {
        if (await page.locator('#screen-results:not([hidden])').count()) {
          const next = page.locator('#btn-next');
          await ((await next.isVisible()) ? next.click({ timeout: 3000 }) : page.click('#btn-retry', { timeout: 3000 }));
          await page.waitForSelector('#countdown', { state: 'hidden', timeout: 10000 });
        } else {
          // occasionally go up so the board doesn't lock into one corner
          await page.keyboard.press(i % 17 === 16 ? 'ArrowUp' : KEYS[i % KEYS.length]);
          i++;
        }
      } catch (e) { if (!open) return; if (process.env.BENCH_DEBUG) console.error(e.message); }
      await page.waitForTimeout(160).catch(() => {});
    }
  })();
  await page.waitForTimeout(1500);
}
