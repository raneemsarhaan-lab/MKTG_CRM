// US2: brands in a dropdown.
const open = async t => { await t.page.locator('[data-brand-menu]').click(); await t.page.waitForSelector('[data-brand-option]') }
export const us2 = [
  {
    id: 'h2-one',
    async run(t) {
      t.eq(await t.text('[data-brand-menu]'), 'All brands', 'starts at All brands')
      await open(t)
      await t.page.locator('[data-brand-option="ff"]').click()
      t.eq((await t.host()).brandIds, ['ff'], 'only Forefront')
      t.assert((await t.text('[data-brand-menu]')).includes('Forefront Consulting'), 'the button names it')
      t.assert(await t.page.locator('[data-brand-menu] .fx-hd-mark').count() === 1, 'with its mark')
      t.eq(await t.text('[data-no-project]'), '2 no project assigned', 'the note for one brand')
    },
  },
  {
    id: 'h2-two-all',
    async run(t) {
      await open(t)
      await t.page.locator('[data-brand-option="ff"]').click()
      await t.page.locator('[data-brand-option="om"]').click()
      t.eq((await t.host()).brandIds, ['ff', 'om'], 'two brands')
      t.eq(await t.text('[data-brand-menu]'), '2 brands', '"2 brands"')
      t.eq(await t.page.locator('[data-no-project]').count(), 0, 'no note for two')
      await t.page.locator('[data-brand-option="all"]').click()
      t.eq((await t.host()).brandIds, [], 'All brands clears')
      for (const id of ['ff', 'ip', 'om', 'sc']) await t.page.locator(`[data-brand-option="${id}"]`).click()
      t.eq((await t.host()).brandIds, [], 'every brand picked is All brands again')
    },
  },
  {
    id: 'h2-keyboard',
    async run(t) {
      await t.page.locator('[data-brand-menu]').focus()
      await t.page.keyboard.press('ArrowDown')
      await t.idle()
      t.eq(await t.page.evaluate(() => document.activeElement?.getAttribute('data-brand-option')), 'all', '↓ opens with focus on the first item')
      await t.page.keyboard.press('ArrowDown')
      await t.page.keyboard.press('Enter')
      t.eq((await t.host()).brandIds, ['ff'], 'Enter picks')
      await t.page.keyboard.press('Escape')
      await t.idle()
      t.eq(await t.page.evaluate(() => document.activeElement?.hasAttribute('data-brand-menu')), true, 'Esc returns focus to the button')
      t.eq(await t.page.locator('[data-brand-option]').count(), 0, 'closed')
    },
  },
  {
    id: 'h2-twelve', hash: 'brands=12', viewport: { width: 1280, height: 800 },
    async run(t) {
      const ys = await Promise.all(['[data-scope="me"]', '[data-brand-menu]', '[data-filters]', '[data-display-options]'].map(s => t.box(s)))
      t.assert(Math.max(...ys.map(b => b.y)) - Math.min(...ys.map(b => b.y)) < 10, 'one line at 1280 with 12 brands (SC-005)')
      await open(t)
      t.eq(await t.page.locator('[data-brand-option]').count(), 13, 'every brand in the list')
      t.assert(await t.page.locator('.fx-hd-pop').evaluate(e => e.scrollHeight > e.clientHeight), 'the list scrolls')
    },
  },
]
