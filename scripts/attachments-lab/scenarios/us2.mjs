// US2: preview and step through files without leaving the task (FR-020–FR-025).
const counter = t => t.page.textContent('.fx-att-pv-count')
const openOn = (t, name) => t.tile(name).locator('[data-att-open]').click()

export const us2 = [
  {
    id: 'us2-1',
    async run(t) {
      await openOn(t, 'v3 FINAL')
      const pv = t.page.locator('[data-att-preview]')
      t.assert(await pv.isVisible(), 'the preview opens')
      t.eq(await counter(t), '1 of 4', 'counter')
      const top = await pv.locator('.fx-att-pv-top').textContent()
      t.assert(top.includes('Forefront Consulting - AI Gap Post v3 FINAL.png'), 'full name')
      t.assert(top.includes('yosra · 2h ago · 1.3 MB'), `uploader, age and size: ${top}`)
      t.assert(await pv.locator('a', { hasText: 'Download' }).count() === 1, 'Download')
      t.eq(await pv.locator('.fx-att-pv-film button').count(), 4, 'a strip of every file')
      t.assert(await pv.locator('button[aria-label="Previous file"]').isDisabled(), 'no previous on the first')
    },
  },
  {
    id: 'us2-2',
    async run(t) {
      await openOn(t, 'v3 FINAL')
      for (let i = 0; i < 3; i++) await t.page.keyboard.press('ArrowRight')
      t.eq(await counter(t), '4 of 4', 'three presses reach the fourth (SC-006)')
      await t.page.keyboard.press('ArrowLeft')
      t.eq(await counter(t), '3 of 4', 'back one')
      await t.page.locator('.fx-att-pv-film button').first().click()
      t.eq(await counter(t), '1 of 4', 'the strip')
      await t.page.keyboard.press('End')
      t.eq(await counter(t), '4 of 4', 'End')
      await t.page.locator('button[aria-label="Previous file"]').click()
      t.eq(await counter(t), '3 of 4', 'the button')
    },
  },
  {
    id: 'us2-2-arabic',
    hash: 'locale=ar',
    async run(t) {
      await openOn(t, 'v3 FINAL')
      await t.page.keyboard.press('ArrowLeft')
      t.eq(await counter(t), '2 من 4', 'in Arabic, ← moves to the next file')
    },
  },
  {
    id: 'us2-3',
    async run(t) {
      // A 400 × 500 poster already at full size: nothing to zoom.
      const size = t.page.viewportSize()
      await openOn(t, 'Post v1')
      const img = t.page.locator('.fx-att-pv-body img')
      await img.click()
      t.assert(await t.page.locator('.fx-att-pv-body.is-zoomed').count() === 0, 'an image shown at its own size doesn’t zoom')
      // A short window shows it smaller; a click shows its real size, 400 × 500.
      await t.page.setViewportSize({ width: size.width, height: 460 })
      await t.page.waitForTimeout(150)
      const fitted = await img.boundingBox()
      t.assert(fitted.height < 500, `fitted smaller than the file (${Math.round(fitted.height)})`)
      await img.click()
      t.assert(await t.page.locator('.fx-att-pv-body.is-zoomed').count() === 1, 'zoomed in')
      const real = await img.boundingBox()
      t.eq([Math.round(real.width), Math.round(real.height)], [400, 500], 'zoom shows the real size')
      await t.page.locator('.fx-att-pv-body img').click()
      t.assert(await t.page.locator('.fx-att-pv-body.is-zoomed').count() === 0, 'fitted again')
      await t.page.locator('.fx-att-pv-body img').click()
      await t.page.keyboard.press('ArrowRight')
      t.assert(await t.page.locator('.fx-att-pv-body.is-zoomed').count() === 0, 'zoom resets on another file')
      await t.page.setViewportSize(size)
    },
  },
  {
    id: 'us2-4',
    async run(t) {
      await openOn(t, 'v3 FINAL')
      const box = await t.page.locator('.fx-att-pv-stage').boundingBox()
      // A point on the dark area: between the left arrow and the picture.
      await t.page.mouse.click(box.x + 90, box.y + box.height / 2)
      t.eq(await t.page.locator('[data-att-preview]').count(), 0, 'a click on the dark area closes it')
      await t.page.waitForFunction(() => document.activeElement?.closest('[data-att-tile]')?.textContent?.includes('v3 FINAL'), null, { timeout: 2000 })
        .catch(() => { throw new Error('focus is back on the tile') })
      await openOn(t, 'Post v2')
      await t.page.locator('.fx-att-pv-body img').click()
      t.eq(await t.page.locator('[data-att-preview]').count(), 1, 'a click on the picture does not close it')
      await t.page.keyboard.press('Escape')
      t.eq(await t.page.locator('[data-att-preview]').count(), 0, 'Esc closes it')
    },
  },
  {
    id: 'us2-5',
    touch: true,
    viewport: { width: 390, height: 844 },
    async run(t) {
      await openOn(t, 'v3 FINAL')
      await t.page.evaluate(() => {
        const el = document.querySelector('[data-att-preview]')
        const ev = (type, x) => new PointerEvent(type, { bubbles: true, pointerType: 'touch', clientX: x, clientY: 400 })
        el.dispatchEvent(ev('pointerdown', 300)); el.dispatchEvent(ev('pointerup', 120))
      })
      t.eq(await counter(t), '2 of 4', 'a swipe to the left moves to the next file')
    },
  },
  {
    id: 'us2-6',
    async run(t) {
      await openOn(t, 'Brief')
      const tab = t.page.locator('[data-att-preview] a', { hasText: 'Open in new tab' })
      t.eq(await tab.count(), 1, 'PDFs offer a new tab')
      t.eq(await tab.getAttribute('target'), '_blank', 'opens in a tab')
      t.eq(await t.page.locator('[data-att-preview] iframe').count(), 1, 'and preview inline')
    },
  },
  {
    id: 'us2-7',
    hash: 'files=many',
    async run(t) {
      await t.page.click('[data-att-show-all]')
      await openOn(t, 'Script - CEO guide v2.docx')
      const card = await t.page.textContent('.fx-att-pv-card')
      t.assert(card.includes('There is no preview for .docx files.'), card)
      t.assert(card.includes('Download'), 'offers Download')
    },
  },
  {
    id: 'preview-includes-hidden',
    hash: 'files=many',
    async run(t) {
      await openOn(t, 'v3 FINAL')
      t.eq(await counter(t), '1 of 15', 'every stored file, not only the seven shown')
      await t.page.keyboard.press('End')
      t.eq(await counter(t), '15 of 15', 'reaches the hidden ones')
      const last = (await t.page.textContent('.fx-att-pv-title b')).trim()
      await t.page.keyboard.press('Escape')
      await t.page.waitForTimeout(150)
      t.eq(await t.page.getAttribute('[data-att-show-all]', 'aria-expanded'), 'true', 'Show all opens to show its tile')
      const focused = await t.page.evaluate(() => document.activeElement?.closest('[data-att-tile]')?.textContent ?? '')
      t.assert(focused.includes(last), `focus on the last file shown (${last})`)
    },
  },
  {
    id: 'edge-deleted-while-previewed',
    async run(t) {
      await openOn(t, 'Post v2')
      t.eq(await counter(t), '2 of 4', 'on v2')
      await t.page.evaluate(() => {
        window.__lab.server = window.__lab.server.filter(f => !f.filename.includes('Post v2'))
        window.__lab.handle.reload()
      })
      await t.page.waitForFunction(() => document.querySelector('.fx-att-pv-count')?.textContent === '2 of 3')
      t.assert(!(await t.page.textContent('.fx-att-pv-title b')).includes('Post v2'), 'moved to another file')
      t.assert((await t.page.textContent('[data-att-section]')).includes('That file was removed by someone else.'), 'says why')
    },
  },
]
