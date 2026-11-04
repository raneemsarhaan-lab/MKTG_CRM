// US7, long briefs and phones: FR-070, FR-071, SC-008.
export const layout = [
  {
    id: 'sticky-toolbar',
    async run(t) {
      await t.focusEnd()
      for (let i = 0; i < 40; i++) { await t.page.keyboard.press('Enter'); await t.page.keyboard.type(`line ${i}`) }
      // Scroll so the middle of the brief is at the top of the panel.
      await t.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const ed = document.querySelector('.ProseMirror').getBoundingClientRect()
        sc.scrollTop += ed.top + ed.height / 2
      })
      await t.page.waitForTimeout(150)
      const bar = await t.page.locator('[data-brief-toolbar]').boundingBox()
      const ed = await t.editor().boundingBox()
      t.assert(ed.y < -200, `the brief scrolled up (${Math.round(ed.y)})`)
      t.assert(bar.y >= -1 && bar.y < 5, `toolbar still at the top (${Math.round(bar.y)})`)
    },
  },
  {
    id: 'phone-toolbar',
    viewport: { width: 390, height: 800 },
    async run(t) {
      const bar = await t.page.locator('[data-brief-toolbar]').boundingBox()
      t.assert(bar.height <= 56, `one row (${bar.height}px)`)
      t.eq(await t.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways page scroll')
      const wraps = await t.page.locator('[data-brief-toolbar]').evaluate(el => getComputedStyle(el).flexWrap)
      t.eq(wraps, 'nowrap', 'the row scrolls instead of wrapping')
      t.eq(await t.page.locator('[data-brief-toolbar] [role=separator], [data-brief-toolbar] > span[aria-hidden=true][style*="width: 1px"]').count(), 0, 'no dividers to start a row')
      t.eq(await t.page.locator('[data-save-status] [role=status]').innerText(), 'Saved', 'status still readable')
      t.assert(!(await t.page.locator('button[title^="Strikethrough"]').count()), 'strike moved off the row')
      await t.page.locator('button[title="More actions"]').click()
      const strike = t.page.locator('[role=menuitem]', { hasText: 'Strikethrough' })
      t.assert(await strike.isVisible(), 'and into ⋯, visible, not clipped')
    },
  },
]
