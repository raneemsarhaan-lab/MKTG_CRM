// US4, no accidental damage + click to edit: FR-010–017, SC-002, SC-011.
const menuBtn = (t, title) => t.page.locator(`button[title="${title}"]`).first()

/** Rect of the first occurrence of `word` inside `root` (a CSS selector). */
async function wordRect(t, root, word) {
  return t.page.evaluate(([root, word]) => {
    const el = document.querySelector(root)
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = n.textContent.indexOf(word)
      if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } }
    }
    return null
  }, [root, word])
}

export const editing = [
  {
    id: 'esc-closes-menu-only',
    async run(t) {
      await t.focusEnd()
      for (const title of ['Text style', 'Insert', 'More actions']) {
        await menuBtn(t, title).click()
        t.assert(await t.page.locator('[role=menu]').isVisible(), `${title} menu opened`)
        await t.page.keyboard.press('Escape')
        await t.page.waitForTimeout(100)
        t.eq(await t.page.locator('[role=menu]').count(), 0, `${title} menu closed by Esc`)
        t.assert(await t.editor().isVisible(), `editor still open after Esc on ${title}`)
        t.eq(await t.page.evaluate(() => document.activeElement?.getAttribute('title')), title, `focus back on ${title}`)
      }
      t.eq((await t.lab()).done, 0, 'never left editing')
    },
  },
  {
    id: 'clear-format-selection-only',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' **loud** words')
      await t.page.waitForTimeout(150)
      await menuBtn(t, 'More actions').click()
      t.eq(await t.page.locator('[role=menuitem]', { hasText: 'Clear format' }).getAttribute('aria-disabled'), 'true', 'disabled with nothing selected')
      await t.page.keyboard.press('Escape')
      await t.editor().locator('strong', { hasText: 'loud' }).dblclick()
      await t.page.waitForTimeout(120)
      await menuBtn(t, 'More actions').click()
      await t.page.locator('[role=menuitem]', { hasText: 'Clear format' }).click()
      const md = await t.md()
      t.assert(!md.includes('**loud**') && md.includes('loud words'), 'bold cleared from the selection')
      t.assert(md.includes('## Goal') && md.includes('- [ ] Swap'), 'rest of the brief untouched')
    },
  },
  {
    id: 'undo-redo-buttons',
    async run(t) {
      await t.focusEnd()
      const undo = menuBtn(t, 'Undo (Ctrl+Z)'), redo = menuBtn(t, 'Redo (Ctrl+Shift+Z)')
      t.assert(await undo.isDisabled(), 'Undo disabled before any change')
      await t.page.keyboard.type(' typed')
      await t.page.waitForTimeout(100)
      t.assert(!(await undo.isDisabled()), 'Undo enabled after typing')
      await undo.click()
      t.assert(!(await t.editor().innerText()).includes('typed'), 'Undo removed the typing')
      t.assert(!(await redo.isDisabled()), 'Redo enabled')
      await redo.click()
      t.assert((await t.editor().innerText()).includes('typed'), 'Redo brought it back')
    },
  },
  {
    id: 'click-to-edit-cursor',
    hash: 'host=modal',
    async run(t) {
      for (const [word, where] of [['founder', 'paragraph'], ['Arabic', 'list item'], ['Shot list', 'heading'], ['insight', 'table cell']]) {
        await t.open('host=modal')
        const before = await wordRect(t, '#read', word)
        await t.page.mouse.click(before.x + 2, before.y + before.h / 2)
        await t.page.waitForSelector('.ProseMirror')
        await t.page.waitForTimeout(150)
        const after = await wordRect(t, '.ProseMirror', word)
        t.assert(Math.abs(after.y - before.y) <= 4, `${where}: text moved ${Math.round(after.y - before.y)}px`)
        await t.page.keyboard.type('Q')
        const text = await t.editor().innerText()
        const qWord = word.slice(0, 1) === 'S' ? `Q${word}` : null
        t.assert(text.includes(qWord ?? `Q${word.slice(1)}`) || text.includes(`${word.slice(0, 1)}Q${word.slice(1)}`) || text.includes(`Q${word}`),
          `${where}: cursor landed on "${word}"`)
      }
      t.assert(!(await t.page.locator('button', { hasText: /^Done$/ }).count()), 'no Done button')
    },
  },
  {
    id: 'click-away-exits',
    async run(t) {
      await t.focusEnd()
      await t.page.click('#outside')
      await t.page.waitForTimeout(150)
      t.eq((await t.lab()).done, 1, 'a click outside ends editing')
      await t.open('save=fail')
      await t.focusEnd()
      await t.page.keyboard.type(' z')
      await t.page.waitForTimeout(600)
      await t.page.click('#outside')
      await t.page.waitForTimeout(150)
      t.assert(await t.page.locator('[data-confirm-leave]').isVisible(), 'asks first after a failed save')
      t.eq((await t.lab()).done, 0, 'did not leave')
    },
  },
  {
    id: 'menu-then-click-away',
    async run(t) {
      await t.focusEnd()
      await menuBtn(t, 'Insert').click()
      await t.page.click('#outside', { force: true })
      await t.page.waitForTimeout(150)
      t.eq(await t.page.locator('[role=menu]').count(), 0, 'first click closed the menu')
      t.eq((await t.lab()).done, 0, 'still editing')
      await t.page.click('#outside')
      await t.page.waitForTimeout(150)
      t.eq((await t.lab()).done, 1, 'second click ends editing')
    },
  },
  {
    id: 'drag-select-outside',
    async run(t) {
      const r = await wordRect(t, '.ProseMirror', 'Redesign')
      const o = await t.page.locator('#outside').boundingBox()
      await t.page.mouse.move(r.x + 2, r.y + r.h / 2)
      await t.page.mouse.down()
      await t.page.mouse.move(o.x + 20, o.y + 20, { steps: 8 })
      await t.page.mouse.up()
      await t.page.waitForTimeout(150)
      t.eq((await t.lab()).done, 0, 'a drag-selection ending outside keeps editing')
    },
  },
  {
    id: 'read-link-opens',
    hash: 'host=modal',
    async run(t) {
      const popup = t.context.waitForEvent('page', { timeout: 2000 }).catch(() => null)
      await t.page.locator('#read a', { hasText: 'Canva draft' }).click()
      t.assert(await popup, 'a link in the read view opens')
      t.eq(await t.page.locator('.ProseMirror').count(), 0, 'and does not start editing')
    },
  },
]

editing.push({
  id: 'esc-from-toolbar-leaves-editing',
  async run(t) {
    await t.focusEnd()
    await t.page.locator('button[title="Insert"]').click()
    await t.page.keyboard.press('Escape')
    t.eq(await t.page.evaluate(() => document.activeElement?.getAttribute('title')), 'Insert', 'focus back on the toolbar')
    const handled = await t.page.evaluate(() => new Promise(resolve => {
      window.addEventListener('keydown', e => resolve(e.defaultPrevented), { once: true })
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    }))
    await t.page.waitForTimeout(150)
    t.eq((await t.lab()).done, 1, 'Esc on the toolbar leaves editing')
    t.eq(handled, true, 'and is marked handled, so the panel does not also close')
  },
})
