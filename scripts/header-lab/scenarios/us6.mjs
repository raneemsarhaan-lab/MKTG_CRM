// US6: Arabic and keyboard.
import fs from 'node:fs'
import path from 'node:path'
export const us6 = [
  {
    id: 'h6-rtl', hash: 'locale=ar',
    async run(t) {
      const tab = await t.box('[data-tab="pipeline"]'), acc = await t.box('[data-account]')
      t.assert(tab.x > acc.x, 'tabs on the right, avatar on the left')
      t.eq(await t.page.locator('[data-top-bar] [role="tab"]').allInnerTexts(), ['خط الإنتاج', 'المحتوى'], 'Arabic tabs')
      const txt = await t.page.locator('[data-board-header], [data-toolbar]').allInnerTexts()
      t.assert(!/Pipeline|Content|My tasks|Filters|Display options|All brands|New task/.test(txt.join(' ')), 'no English labels left')
      t.eq(await t.page.locator('[data-header-search]').getAttribute('placeholder'), 'ابحث في المهام والحملات والملفات…', 'Arabic placeholder')
    },
  },
  {
    id: 'h6-tab-order',
    async run(t) {
      await t.page.locator('body').click({ position: { x: 5, y: 5 } })
      const order = []
      for (let i = 0; i < 13; i++) {
        await t.page.keyboard.press('Tab')
        order.push(await t.page.evaluate(() => {
          const e = document.activeElement
          return e?.getAttribute('data-tab') ? 'tab' : e?.hasAttribute('data-header-search') ? 'search' : e?.hasAttribute('data-bell') ? 'bell' : e?.hasAttribute('data-inbox-button') ? 'inbox'
            : e?.hasAttribute('data-account') ? 'account' : e?.hasAttribute('data-new-task') ? 'new' : e?.getAttribute('data-scope') ? 'scope'
            : e?.hasAttribute('data-brand-menu') ? 'brands' : e?.hasAttribute('data-filters') ? 'filters' : e?.closest('[data-view-pair]') ? 'pair'
            : e?.hasAttribute('data-display-options') ? 'display' : e?.tagName
        }))
      }
      const seen = order.filter((x, i) => order.indexOf(x) === i)
      t.eq(seen.slice(0, 11), ['tab', 'search', 'bell', 'inbox', 'account', 'new', 'scope', 'brands', 'filters', 'pair', 'display'], 'screen order (the bell before the Inbox, spec 012)')
    },
  },
  {
    id: 'h6-tabs-arrows',
    async run(t) {
      await t.page.locator('[data-tab="pipeline"]').focus()
      await t.page.keyboard.press('ArrowRight')
      await t.page.waitForTimeout(80) // focus moves on the next frame
      t.eq((await t.host()).view, 'content', '→ moves to Content')
      t.eq(await t.page.evaluate(() => document.activeElement?.getAttribute('data-tab')), 'content', 'focus follows')
    },
  },
  {
    id: 'h6-menus-keyboard',
    async run(t) {
      for (const sel of ['[data-filters]', '[data-display-options]']) {
        await t.page.locator(sel).focus()
        await t.page.keyboard.press('Enter')
        await t.idle()
        t.assert(await t.page.evaluate(() => !!document.activeElement?.closest('.fx-hd-pop, .fx-view-menu')), `${sel}: focus moves inside`)
        await t.page.keyboard.press('Escape')
        await t.idle()
        t.eq(await t.page.evaluate(s => document.activeElement?.matches(s), sel), true, `${sel}: Esc returns focus`)
      }
    },
  },
  {
    id: 'h6-axe',
    async run(t) {
      t.eq(await t.axe('[data-lab-ready]'), [], 'English')
      await t.page.locator('[data-brand-menu]').click()
      t.eq(await t.axe('.fx-hd-pop'), [], 'brand list')
      await t.open('locale=ar')
      t.eq(await t.axe('[data-lab-ready]'), [], 'Arabic')
    },
  },
  {
    id: 'h6-parity',
    async run(t) {
      const read = f => JSON.parse(fs.readFileSync(path.join(t.root, 'messages', f), 'utf8')).header
      const en = Object.keys(read('en.json')).sort(), ar = Object.keys(read('ar.json')).sort()
      t.eq(ar, en, 'header.* in both languages')
    },
  },
]
