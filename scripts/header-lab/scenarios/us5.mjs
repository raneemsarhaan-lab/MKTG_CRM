// US5: the header on a phone.
const PHONE = { width: 390, height: 700 }
export const us5 = [
  {
    id: 'h5-top', viewport: PHONE,
    async run(t) {
      t.eq(await t.page.locator('[data-header-search]').isVisible(), false, 'search folds into an icon')
      for (const s of ['[data-tab="pipeline"]', '[data-search-open]', '[data-inbox-button]', '[data-account]']) t.assert(await t.page.locator(s).isVisible(), `${s} visible`)
      const board = await t.box('[data-board]')
      t.assert(board.y <= 320, `the first column starts at ${board.y}px (≤ 320, SC-002)`)
      t.eq(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways page scroll')
    },
  },
  {
    id: 'h5-search', viewport: PHONE,
    async run(t) {
      await t.page.locator('[data-search-open]').click()
      await t.idle()
      t.eq(await t.page.evaluate(() => document.activeElement?.hasAttribute('data-header-search')), true, 'opens with focus')
      await t.page.keyboard.type('reel')
      await t.page.keyboard.press('Escape')
      await t.idle()
      t.eq(await t.page.locator('[data-header-search]').isVisible(), false, 'Esc closes')
      t.eq((await t.host()).search, 'reel', 'and keeps the text')
      t.eq(await t.page.evaluate(() => document.activeElement?.hasAttribute('data-search-open')), true, 'focus back on the icon')
    },
  },
  {
    id: 'h5-toolbar', viewport: PHONE,
    async run(t) {
      const sc = await t.page.locator('[data-toolbar]').evaluate(e => [e.scrollWidth, e.clientWidth])
      t.assert(sc[0] > sc[1], 'the toolbar scrolls sideways in one row')
      const small = await t.page.evaluate(() => [...document.querySelectorAll('[data-board-header] button, [data-toolbar] button')]
        .filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)] })
        .filter(([, w, h]) => w < 44 || h < 44))
      t.eq(small, [], 'every control at least 44 × 44')
    },
  },
  {
    id: 'h5-narrow', viewport: { width: 1100, height: 800 },
    async run(t) {
      t.eq(await t.page.locator('[data-display-options] .fx-hd-lbl').isVisible(), false, 'icons only at the far end')
      t.eq(await t.page.locator('[data-display-options]').getAttribute('aria-label'), 'Display options', 'names kept for screen readers')
      t.eq(await t.page.locator('[data-view-pair] [data-view="sheet"]').getAttribute('aria-label'), 'Sheet', 'Sheet named')
    },
  },
]
