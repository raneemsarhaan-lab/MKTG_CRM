// US1, saving I can trust: FR-001–005, SC-001.
const status = t => t.page.locator('[data-save-status]').first()

export const save = [
  {
    id: 'save-fail-shows-error',
    hash: 'save=fail',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' more words')
      await t.page.waitForTimeout(700)
      t.eq(await status(t).getAttribute('data-save-status'), 'error', 'status after a failed save')
      t.assert((await status(t).innerText()).includes("Couldn't save"), 'error text shown')
      t.assert(await t.page.locator('[data-save-status] button', { hasText: 'Retry' }).isVisible(), 'Retry button shown')
      t.assert((await t.editor().innerText()).includes('more words'), 'text still in the editor')
      t.eq((await t.lab()).saves.length, 0, 'nothing stored')
    },
  },
  {
    id: 'save-retry-sends-latest',
    hash: 'save=fail',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' first')
      await t.page.waitForTimeout(600)
      await t.page.keyboard.type(' second')
      await t.page.waitForTimeout(600)
      t.eq(await status(t).getAttribute('data-save-status'), 'error', 'still failing')
      await t.page.evaluate(() => { window.__lab.save = 'ok' })
      await t.page.locator('[data-save-status] button', { hasText: 'Retry' }).click()
      await t.page.waitForTimeout(700)
      t.eq(await status(t).getAttribute('data-save-status'), 'saved', 'saved after Retry')
      const md = (await t.lab()).md
      t.assert(md.includes('first second'), `the newest text was saved: ${JSON.stringify(md.slice(-60))}`)
    },
  },
  {
    id: 'save-throw-is-a-failure',
    hash: 'save=throw',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' x')
      await t.page.waitForTimeout(600)
      t.eq(await status(t).getAttribute('data-save-status'), 'error', 'a thrown save counts as failed')
      await t.page.evaluate(() => { window.__lab.save = 'ok' })
      await t.page.keyboard.type('y')
      await t.page.waitForTimeout(800)
      t.eq(await status(t).getAttribute('data-save-status'), 'saved', 'typing again retries and saves')
      t.assert((await t.lab()).md.includes(' xy'), 'newest text stored')
    },
  },
  {
    id: 'save-hang-watchdog',
    hash: 'save=hang',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' z')
      await t.page.waitForTimeout(1000)
      t.eq(await status(t).getAttribute('data-save-status'), 'saving', 'still saving at 1 s')
      await t.page.waitForTimeout(20_500)
      t.eq(await status(t).getAttribute('data-save-status'), 'error', 'a hung save is failed by 21 s')
    },
  },
  {
    id: 'leave-guard',
    hash: 'save=fail',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' w')
      await t.page.waitForTimeout(700)
      await t.page.keyboard.press('Escape')
      await t.page.waitForTimeout(200)
      t.assert(await t.page.locator('[data-confirm-leave]').isVisible(), 'confirm bar shown')
      t.assert(await t.editor().isVisible(), 'editor still open')
      t.eq((await t.lab()).done, 0, 'did not leave')
      await t.page.locator('[data-confirm-leave] button', { hasText: 'Stay' }).click()
      t.assert(!(await t.page.locator('[data-confirm-leave]').count()), 'Stay closes the bar')
      await t.page.keyboard.press('Escape')
      await t.page.locator('[data-confirm-leave] button', { hasText: 'Leave anyway' }).click()
      await t.page.waitForTimeout(200)
      t.eq((await t.lab()).done, 1, 'Leave anyway leaves')
    },
  },
  {
    id: 'single-status',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' s')
      await t.page.waitForTimeout(700)
      const n = await t.page.locator('text=/^Saved$/').count()
      t.eq(n, 1, 'exactly one "Saved"')
    },
  },
]
