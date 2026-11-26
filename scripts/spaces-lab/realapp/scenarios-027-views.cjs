// Spec 027, US1 (Stage A): views open directly; the Board's Cards / List toggle never opens the sheet;
// a saved view is renamed, duplicated and deleted from its tab; built-in tabs can't be deleted; the page
// reopens on the last view.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const node = key => `space:${space(key)}`
  return [
    {
      id: '027-us1-sheet-opens-on-click-refresh-and-link', as: 'admin',
      async run({ page, go, BASE }) {
        await go('/spaces/content?view=board')
        await page.click('[data-view-tab="sheet"]')
        await page.waitForSelector('[data-workbook]', { timeout: 20000 })
        ok(!(await page.$('[data-node-workbook-loading]')), 'no loading line once open')
        await page.reload()
        await page.waitForSelector('[data-workbook]', { timeout: 30000 })
        ok(true, 'a refresh on the Sheet tab opens the sheet')
        const p2 = await page.context().newPage()
        await p2.goto(`${BASE}/spaces/content?view=sheet`)
        await p2.waitForSelector('[data-workbook]', { timeout: 30000 })
        await p2.close()
      },
    },
    {
      // Owner, 26 Nov 2026: no Cards | List pair on any view; the board always shows its cards.
      id: '027-us1-no-cards-list-pair', as: 'admin',
      async run({ page, go }) {
        for (const url of ['/spaces/content?view=board', '/me?view=board']) {
          await go(url)
          await page.waitForSelector('.fx-board-cols', { timeout: 30000 })
          ok(!(await page.$('[data-view-pair], [data-layout]')), `no Cards | List buttons on ${url}`)
        }
        await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('momentum.board.layout.')) localStorage.setItem(k, 'list') })
        await go('/spaces/content?view=board')
        await page.waitForSelector('.fx-board-cols', { timeout: 30000 })
        ok(!(await page.$('[data-board-list]')), 'a List picked before still opens as cards')
      },
    },
    {
      id: '027-us1-view-tab-menu-rename-duplicate-delete', as: 'admin',
      async run({ page, go }) {
        const n = Math.floor(Math.random() * 1e6)
        const name = `Lab list ${n}`
        try {
          await go('/spaces/content?view=board')
          await page.click('[data-add-view]')
          await page.fill('[data-new-view-name]', name)
          await page.click('[data-new-view-type="list"]')
          await page.click('[data-new-view-create]')
          await page.waitForSelector('[data-list-view]', { timeout: 20000 })
          const id = psql(`select id from saved_views where name='${name}'`)
          ok(!!id, 'a List view is saved')
          // Rename
          await page.click(`[data-tab-menu="v:${id}"]`)
          await page.click('[data-tab-option="rename"]')
          await page.fill(`[data-view-rename="v:${id}"]`, `${name} renamed`)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1200)
          ok(psql(`select name from saved_views where id='${id}'`) === `${name} renamed`, 'renamed from its tab')
          // Duplicate
          await page.click(`[data-tab-menu="v:${id}"]`)
          await page.click('[data-tab-option="duplicate"]')
          await page.waitForTimeout(1500)
          ok(psql(`select count(*) from saved_views where name like '${name} renamed (copy)%'`) === '1', 'duplicated as a copy')
          // Delete, with a confirmation
          await page.click(`[data-tab-menu="v:${id}"]`)
          await page.click('[data-tab-option="delete"]')
          await page.waitForSelector('[data-view-delete-confirm]')
          await page.click('[data-view-delete-yes]')
          await page.waitForTimeout(1500)
          ok(psql(`select count(*) from saved_views where id='${id}'`) === '0', 'deleted after confirming')
          // Built-in tabs offer no Delete.
          for (const k of ['board', 'sheet', 'calendar']) {
            await page.click(`[data-tab-menu="${k}"]`)
            await page.waitForSelector('[data-tab-options]')
            ok(!(await page.$('[data-tab-option="delete"]')), `${k} can't be deleted`)
            await page.keyboard.press('Escape')
          }
        } finally {
          psql(`delete from saved_views where name like '${name}%'`)
        }
      },
    },
    {
      id: '027-us1-page-reopens-on-the-last-view', as: 'admin',
      async run({ page, go }) {
        await go('/spaces/content?view=calendar')
        await page.waitForTimeout(1500)
        await go('/spaces/content')
        ok(await page.getAttribute('[data-view-tab="calendar"]', 'aria-pressed') === 'true', 'the Space opens on Calendar, the view used last')
        await go('/spaces/content?view=board')
        await page.waitForTimeout(1500)
        ok(!!node('content'), 'node exists')
      },
    },
  ]
}
