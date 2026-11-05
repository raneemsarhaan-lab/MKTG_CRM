// US3: delete without fear (FR-030–FR-035).
const V1 = 'The Structural Gap - Post v1.png'
const V2 = 'AI Adoption Gap - Post v2.png'

async function del(t, name) {
  const tile = t.tile(name)
  await tile.hover()
  await tile.locator(`button[aria-label="Delete ${name}"]`).click()
  return Date.now()
}
const removes = t => t.lab().then(l => l.removes)

export const us3 = [
  {
    id: 'us3-1',
    async run(t) {
      await del(t, V1)
      const ghost = t.page.locator('[data-att-ghost]')
      t.eq(await ghost.count(), 1, 'the tile becomes "Deleted · Undo"')
      t.assert((await ghost.textContent()).includes(`Deleted ${V1}`), 'names the file')
      t.eq(await t.page.locator('.fx-att-timer').count(), 1, 'a countdown')
      t.eq(await t.page.evaluate(() => document.activeElement?.hasAttribute('data-undo')), true, 'focus on Undo')
      t.eq((await removes(t)).length, 0, 'nothing sent yet')
    },
  },
  {
    id: 'us3-2',
    async run(t) {
      await del(t, V1)
      await t.page.waitForTimeout(1500)
      await t.page.click('[data-undo]')
      t.assert((await t.names()).some(n => n.includes('Post v1')), 'the file is back')
      t.eq(await t.page.evaluate(() => document.activeElement?.closest('[data-att-tile]')?.textContent?.includes('Post v1')), true, 'focus on it')
      await t.page.waitForTimeout(4500)
      t.eq((await removes(t)).length, 0, 'never deleted on the server')
    },
  },
  {
    id: 'us3-3',
    async run(t) {
      await del(t, V1)
      await t.page.waitForTimeout(5600)
      t.eq((await removes(t)).length, 1, 'deleted after 5 seconds')
      t.eq(await t.page.locator('[data-att-ghost]').count(), 0, 'the ghost is gone')
      t.assert(!(await t.names()).some(n => n.includes('Post v1')), 'and the tile')
    },
  },
  {
    id: 'us3-4',
    async run(t) {
      await del(t, V1)
      await t.page.evaluate(() => window.__lab.unmount())
      const msg = t.page.locator('[data-pending-delete-message]')
      await msg.waitFor()
      t.assert((await msg.textContent()).includes(`Deleted ${V1}`.slice(0, 20)), 'the bottom message names the file')
      await t.page.waitForTimeout(5300)
      t.eq((await removes(t)).length, 0, 'at least 6 s to undo after closing')
      await t.page.click('[data-pending-undo]')
      await t.page.evaluate(() => window.__lab.remount())
      await t.page.waitForSelector('[data-att-tile]')
      t.assert((await t.names()).some(n => n.includes('Post v1')), 'Undo restores it')
      t.eq((await removes(t)).length, 0, 'nothing deleted')
    },
  },
  {
    id: 'panel-close-flush',
    async run(t) {
      const start = await del(t, V1)
      await t.page.evaluate(() => window.__lab.unmount())
      await t.page.waitForFunction(() => window.__lab.removes.length === 1, null, { timeout: 9000 })
      const [r] = await removes(t)
      t.assert(r.at - start >= 5900, `sent no sooner than 6 s after closing (${r.at - start} ms)`)
      t.eq(await t.page.locator('[data-pending-delete-message]').count(), 0, 'the message goes')
    },
  },
  {
    id: 'us3-5',
    async run(t) {
      await del(t, V1)
      await del(t, V2)
      const r = await removes(t)
      t.eq(r.length, 1, 'the first delete is completed when a second starts')
      t.eq(await t.page.locator('[data-att-ghost]').count(), 1, 'only the second waits')
      t.assert((await t.page.textContent('[data-att-ghost]')).includes('Post v2'), 'with its own Undo')
    },
  },
  {
    id: 'no-store-before-window',
    async run(t) {
      const start = await del(t, V2)
      await t.page.waitForTimeout(4500)
      t.eq((await removes(t)).length, 0, 'nothing sent at 4.5 s')
      await t.page.waitForFunction(() => window.__lab.removes.length === 1, null, { timeout: 3000 })
      const [r] = await removes(t)
      t.assert(r.at - start >= 4900, `sent at the end of the window (${r.at - start} ms)`)
    },
  },
  {
    id: 'edge-undo-gone',
    async run(t) {
      await del(t, V1)
      // Someone else removes the same file meanwhile.
      await t.page.evaluate(n => { window.__lab.server = window.__lab.server.filter(f => f.filename !== n) }, V1)
      await t.page.click('[data-undo]')
      await t.page.waitForFunction(n => document.querySelector('[data-att-section] [role="alert"]')?.textContent?.includes('can no longer be restored'), V1, { timeout: 3000 })
      t.assert(!(await t.names()).some(n => n.includes('Post v1')), 'not shown as restored')
    },
  },
]
