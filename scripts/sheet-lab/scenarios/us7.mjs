// US7: published links and dropped clips (FR-047, FR-048, FR-060–FR-063).
const summary = t => t.page.locator('[data-summary]').innerText().then(s => s.replace(/\s+/g, ' '))

export const us7 = [
  {
    id: 'us7-1',
    async run(t) {
      await t.cell('c:c04', 'status').click()
      await t.page.locator('[data-menu-item="publish"]').click()
      const input = t.page.locator('[data-sheet-pop] input')
      await input.waitFor({ timeout: 3000 })
      t.assert((await t.page.locator('[data-sheet-pop]').innerText()).includes('Published! Paste the post link'), 'asks for the post link')
      await input.fill('not a link')
      await t.page.keyboard.press('Enter')
      t.assert((await t.page.locator('[data-sheet-pop]').innerText()).includes("That isn't a web address."), 'checks it')
      await input.fill('https://www.instagram.com/reel/xyz')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq((await t.task('c04')).published_url, 'https://www.instagram.com/reel/xyz', 'saved')
      t.eq((await t.text('c:c04', 'published')).trim(), 'instagram.com', 'shown')
    },
  },
  {
    id: 'us7-2',
    async run(t) {
      t.assert((await summary(t)).includes('3 published (1 no link)'), 'before')
      await t.cell('c:c04', 'status').click()
      await t.page.locator('[data-menu-item="publish"]').click()
      await t.page.locator('[data-sheet-pop]').getByRole('button', { name: 'Skip' }).click()
      await t.idle(200)
      t.eq((await t.text('c:c04', 'published')).trim(), 'Missing link', 'Missing link')
      t.assert((await summary(t)).includes('4 published (2 no link)'), `counted: ${await summary(t)}`)
      t.eq((await t.text('c:c02', 'published')).trim(), 'Missing link', 'a published clip from the fixture too')
    },
  },
  {
    id: 'us7-3',
    async run(t) {
      await t.cell('c:c06', 'drop').click()
      t.assert((await t.page.locator('[data-drop-confirm]').innerText()).includes('Drop clip 12?'), 'asks first')
      await t.page.locator('[data-drop-confirm]').getByRole('button', { name: 'Drop' }).click()
      await t.idle(200)
      t.assert(await t.page.locator('[data-row="c:c06"].is-dropped').count() === 1, 'struck through and greyed')
      t.assert((await t.page.locator('[data-cell="c:c06|title"] .fx-sheet-sr').innerText()).includes('dropped'), 'and says so to screen readers')
      const s = await summary(t)
      t.assert(s.includes('12 clips') && s.includes('2 dropped') && s.includes('4 editing'), `summary counts it as dropped only: ${s}`)
      t.assert((await t.toast()).includes('Clip dropped'), 'with a message')
      t.assert((await t.task('c06')).status === 'final-check', 'its stage is kept (FR-063)')
      await t.page.locator('[data-sheet-toast] button').click()
      await t.idle(200)
      t.eq((await t.task('c06')).dropped_at, null, 'Undo restores it')
    },
  },
  {
    id: 'us7-4',
    async run(t) {
      const before = await t.task('c13')
      await t.cell('c:c13', 'drop').click()
      await t.idle(200)
      const after = await t.task('c13')
      t.eq(after.dropped_at, null, 'restored')
      t.eq(after.status, before.status, 'at the stage it had')
      t.assert(after.stage_date >= before.stage_date, 'its SLA clock moved on by the time it was dropped')
      t.assert((await t.toast()).includes('Restored to the board at Editing'), await t.toast())
    },
  },
  {
    id: 'us7-5',
    async run(t) {
      t.assert((await t.rows()).includes('c:c13'), 'dropped clips shown by default')
      await t.page.locator('[data-show-dropped]').click()
      t.assert(!(await t.rows()).includes('c:c13'), 'Show dropped off hides them')
      await t.open('')
      t.assert(!(await t.rows()).includes('c:c13'), 'remembered')
    },
  },
  {
    id: 'us7-restore-editing',
    hash: 'me=omar',
    async run(t) {
      t.eq(await t.page.$eval('[data-sets] [aria-pressed="true"]', b => b.dataset.set), 'editing', 'Editing set, no Drop column')
      await t.focusCell('c:c13', 'title')
      await t.page.keyboard.press('Home')
      await t.page.keyboard.press('Enter')
      t.eq(await t.menuItems(), ['restore', 'task'], 'the row menu offers Restore')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq((await t.task('c13')).dropped_at, null, 'restored from the Editing set')
      await t.focusCell('c:c09', 'title')
      await t.page.keyboard.press('Delete')
      t.assert(await t.page.locator('[data-drop-confirm]').count() === 1, 'Delete on a row opens Drop')
    },
  },
]
