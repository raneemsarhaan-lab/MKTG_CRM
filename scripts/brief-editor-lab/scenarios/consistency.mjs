// US9, what you see is what's saved: FR-080, FR-081.
export const consistency = [
  {
    id: 'underline-readview',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' ')
      await t.page.keyboard.press('Control+u')
      await t.page.keyboard.type('underlined')
      const md = await t.md()
      t.assert(md.includes('<u>underlined</u>'), 'saved as <u>')
      await t.page.click('#outside')
      await t.page.waitForSelector('#read')
      t.eq(await t.page.locator('#read u', { hasText: 'underlined' }).count(), 1, 'still underlined in the read view')
    },
  },
  {
    id: 'list-spacing',
    hash: 'initial=clickup-import',
    async run(t) {
      const gap = sel => t.page.evaluate(sel => {
        const items = [...document.querySelectorAll(sel)].slice(0, 2).map(li => li.getBoundingClientRect())
        return Math.round(items[1].top - items[0].bottom)
      }, sel)
      const margins = await t.editor().locator('li > p').first().evaluate(p => getComputedStyle(p).marginBottom)
      t.eq(margins, '0px', 'no paragraph margin inside list items')
      const inEditor = await gap('.ProseMirror ol > li')
      await t.page.click('#outside')
      await t.page.waitForSelector('#read')
      const inRead = await gap('#read ol > li')
      t.assert(Math.abs(inEditor - inRead) <= 1, `same spacing in both views (${inEditor} vs ${inRead})`)
    },
  },
]
