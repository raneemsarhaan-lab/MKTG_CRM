// Keyboard only (SC-008), Arabic, phone width and axe (FR-080, FR-082).
export const cross = [
  {
    id: 'kbd-only',
    hash: 'me=sara',
    async run(t) {
      const k = key => t.page.keyboard.press(key)
      await t.page.keyboard.press('Tab')
      for (let i = 0; i < 12 && !(await t.active())?.includes('|'); i++) await k('Tab')
      t.assert((await t.active())?.includes('|'), `Tab reaches the grid: ${await t.active()}`)
      // Clip 22 is Sara's, in Script (c-prog): move it on, by keyboard.
      await k('Control+Home')
      for (let i = 0; i < 11; i++) await k('ArrowDown')
      t.eq(await t.active(), 'c:c11|rowNo', 'down to clip 22')
      for (let i = 0; i < 4; i++) await k('ArrowRight')
      t.eq(await t.active(), 'c:c11|status', 'across to its status')
      await k('Enter'); await k('Enter')
      await t.idle(250)
      t.eq((await t.task('c11')).status, 'c-final', 'moved to Script Review')
      t.eq(await t.active(), 'c:c11|status', 'focus back on the cell')
      // Edit its title.
      await k('Home'); await k('ArrowRight'); await k('Enter')
      await t.page.keyboard.type(' (v2)'); await k('Enter')
      await t.idle(200)
      t.eq((await t.task('c11')).name, 'The Two Anchors of Leadership: Brutal Facts and Ultimate Faith (v2)', 'Enter edits with the caret at the end')
      // + Clip by keyboard.
      await k('Control+End')
      for (let i = 0; i < 20 && (await t.active()) !== 'a:v1|title'; i++) await k('ArrowLeft')
      await k('End'); for (let i = 0; i < 5; i++) await k('ArrowLeft')
      await t.page.locator('[data-cell="a:v1|title"]').focus()
      // Typing straight onto "+ Clip" starts the new clip with that letter.
      await t.page.keyboard.type('Keyboard clip'); await k('Enter')
      await t.idle(250)
      t.assert((await t.tasks()).some(x => x.name === 'Keyboard clip'), '+ Clip by keyboard')
      // Paste clips by keyboard: Shift+Tab out of the grid to the toolbar button.
      await t.page.locator('[data-paste-clips]').focus()
      await k('Enter')
      await t.page.waitForSelector('[data-paste-preview]')
      await k('Escape')
      t.eq(await t.page.locator('[data-paste-preview]').count(), 0, 'Esc closes Paste clips')
    },
  },
  {
    id: 'rtl-grid',
    hash: 'locale=ar',
    async run(t) {
      t.eq(await t.page.$eval('[data-sheet-grid]', g => getComputedStyle(g).direction), 'rtl', 'right to left')
      const pos = await t.page.evaluate(() => {
        const box = document.querySelector('.fx-sheet-scroll').getBoundingClientRect()
        const no = document.querySelector('[data-cell="c:c01|rowNo"]').getBoundingClientRect()
        return { right: Math.round(box.right - no.right) }
      })
      t.assert(pos.right <= 20, `row numbers on the right: ${pos.right}`)
      t.eq((await t.text('c:c07', 'status')).split('\n')[0].replace('▾', '').trim(), 'مونتاج', 'Arabic video name')
      t.eq((await t.text('c:c01', 'in')).trim(), '2:20.2', 'Western digits')
      t.assert((await t.page.locator('[data-summary]').innerText()).includes('13'), 'summary in Arabic with Western digits')
    },
  },
  {
    id: 'rtl-arrows',
    hash: 'locale=ar',
    async run(t) {
      await t.focusCell('c:c01', 'source')
      await t.page.keyboard.press('ArrowLeft')
      t.eq(await t.active(), 'c:c01|fileName', '← moves to the next column in Arabic')
      await t.page.keyboard.press('ArrowRight')
      t.eq(await t.active(), 'c:c01|source', '→ back')
    },
  },
  {
    id: 'rtl-paste',
    hash: 'locale=ar&me=sara',
    async run(t) {
      await t.page.locator('[data-paste-clips]').click()
      await t.page.locator('[data-paste-preview] textarea').fill('30_IMG_0296_6m12.4s-7m20.9s.mp4\tعنوان')
      t.eq(await t.page.$eval('[data-paste-preview]', d => getComputedStyle(d).direction), 'rtl', 'the preview mirrors')
      t.assert((await t.page.locator('[data-paste-counts]').innerText()).includes('1 جديد'), 'in Arabic')
    },
  },
  {
    id: 'phone-390',
    viewport: { width: 390, height: 844 },
    async run(t) {
      const m = await t.page.evaluate(() => ({
        page: document.scrollingElement.scrollWidth, vw: window.innerWidth,
        grid: document.querySelector('.fx-sheet-scroll').scrollWidth, box: document.querySelector('.fx-sheet-scroll').clientWidth,
      }))
      t.assert(m.page <= m.vw, `the page does not scroll sideways: ${m.page} > ${m.vw}`)
      t.assert(m.grid > m.box, 'the grid scrolls inside its own area')
      await t.page.locator('.fx-sheet-scroll').evaluate(e => { e.scrollLeft = 500 })
      const left = await t.page.$eval('[data-cell="c:c01|title"]', e => Math.round(e.getBoundingClientRect().left))
      t.assert(left >= 39 && left <= 42, `the title column stays: ${left}`)
    },
  },
  {
    id: 'axe-grid',
    async run(t) {
      const v = await t.axe('[data-video-sheet]')
      t.eq(v, [], 'no critical or serious issues')
    },
  },
  {
    id: 'axe-menus',
    async run(t) {
      await t.cell('c:c07', 'status').click()
      t.eq(await t.axe('[data-sheet-menu]'), [], 'status menu')
      await t.page.keyboard.press('Escape')
      await t.cell('c:c07', 'editor').click()
      t.eq(await t.axe('[data-sheet-menu]'), [], 'editor menu')
      await t.page.keyboard.press('Escape')
      await t.cell('c:c01', 'files').click()
      t.eq(await t.axe('[data-sheet-menu]'), [], 'files menu')
    },
  },
  {
    id: 'axe-dialogs',
    async run(t) {
      await t.page.locator('[data-paste-clips]').click()
      await t.page.locator('[data-paste-preview] textarea').fill('30_IMG_0296_6m12.4s-7m20.9s.mp4\tA\nQ&A\tB')
      t.eq(await t.axe('[data-paste-preview]'), [], 'paste preview')
      await t.page.keyboard.press('Escape')
      await t.cell('c:c02', 'published').click()
      t.eq(await t.axe('[data-sheet-pop]'), [], 'published prompt')
    },
  },
]
