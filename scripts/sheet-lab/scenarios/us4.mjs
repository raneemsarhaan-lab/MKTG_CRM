// US4: assign editors and fill details inline (FR-025, FR-037–FR-039).
const typeInto = async (t, row, col, text, key = 'Enter') => {
  await t.focusCell(row, col)
  await t.page.keyboard.press('Enter')
  const input = t.page.locator(`[data-cell="${row}|${col}"] input`)
  await input.waitFor()
  await input.fill(text)
  await t.page.keyboard.press(key)
  await t.idle(200)
}

export const us4 = [
  {
    id: 'us4-1',
    async run(t) {
      await typeInto(t, 'c:c06', 'title', 'Clear Roles, Clear Results')
      t.eq((await t.task('c06')).name, 'Clear Roles, Clear Results', 'saved on Enter')
      t.eq(await t.active(), 'c:c07|title', 'Enter moves down')
      await t.page.keyboard.press('Enter')
      await t.page.locator('[data-cell="c:c07|title"] input').fill('Something else')
      await t.page.keyboard.press('Escape')
      await t.idle(100)
      t.eq((await t.task('c07')).name, 'Can Your Team See the Strategy?', 'Esc cancels')
      t.eq(await t.active(), 'c:c07|title', 'focus stays on the cell')
      await typeInto(t, 'c:c08', 'source', 'IMG_9999', 'Tab')
      t.eq((await t.task('c08')).clip.source, 'IMG_9999', 'saved on Tab')
      t.assert(await t.page.locator('[data-cell="c:c08|fileName"] input').count() === 1, 'Tab moves to the next cell to type in')
      await t.page.keyboard.type('renamed.mp4')
      await t.page.locator('[data-cell="c:c08|title"]').click()
      await t.idle(200)
      t.eq((await t.task('c08')).clip.file_name, 'renamed.mp4', 'saved on leaving the cell')
    },
  },
  {
    id: 'us4-2',
    async run(t) {
      await t.cell('c:c09', 'editor').click()
      const items = await t.page.$$eval('[data-sheet-menu] [role="menuitem"]', els => els.map(e => e.querySelector('.fx-sheet-menu-label').textContent))
      t.eq(items, ['Hadi', 'Lina', 'Omar', 'Mona', 'Raneem', 'Sara', 'Yosra', 'Unassigned'], 'people, editing roles first, then Unassigned')
      await t.page.locator('[data-menu-item="hadi"]').click()
      await t.idle(200)
      t.eq((await t.task('c09')).assignee_id, 'hadi', 'assigned')
      t.eq((await t.text('c:c09', 'editor')).trim(), 'Hadi', 'shown')
      await t.cell('c:c09', 'editor').click()
      await t.page.locator('[data-menu-item=""]').click()
      await t.idle(200)
      t.eq((await t.task('c09')).assignee_id, null, 'Unassigned')
    },
  },
  {
    id: 'us4-3',
    async run(t) {
      await typeInto(t, 'c:c02', 'out', '3:00.0')
      t.eq((await t.task('c02')).clip.out_ms, 306800, 'an out time before the in time is not saved')
      t.assert((await t.text('c:c02', 'out')).includes('The out time must be after the in time.'), 'with a note')
      t.eq((await t.lab()).calls.filter(c => c.fn === 'updateClip').length, 0, 'refused before the server')
      await typeInto(t, 'c:c02', 'out', '5:30')
      t.eq((await t.task('c02')).clip.out_ms, 330000, 'saved')
      t.eq((await t.text('c:c02', 'length')).trim(), '1:33.9', 'length recomputed')
      await typeInto(t, 'c:c02', 'in', 'soon')
      t.assert((await t.text('c:c02', 'in')).includes('like 2:20.2'), 'unreadable time explained')
    },
  },
  {
    id: 'us4-4',
    hash: 'me=mona',
    async run(t) {
      await t.focusCell('c:c05', 'title')
      await t.page.keyboard.press('Enter')
      await t.idle(80)
      t.eq(await t.page.locator('[data-cell="c:c05|title"] input').count(), 0, 'read-only')
      t.assert((await t.text('c:c05', 'title')).includes('You can only change clips you own or are assigned to.'), 'says why')
      await t.cell('c:c05', 'editor').click()
      t.eq(await t.menuOpen(), false, 'no editor menu')
      t.assert(!(await t.text('c:c05', 'status')).includes('▾'), 'status shows no moves')
      t.assert(await t.page.locator('[data-row="a:v1"]').count() === 1, 'but + Clip is there (FR-030)')
    },
  },
  {
    id: 'us4-5',
    async run(t) {
      await t.focusCell('c:c01', 'title')
      await t.page.keyboard.press('ArrowRight')
      t.eq(await t.active(), 'c:c01|clipNo', '→')
      await t.page.keyboard.press('ArrowDown')
      t.eq(await t.active(), 'c:c02|clipNo', '↓')
      await t.page.keyboard.press('Home')
      t.eq(await t.active(), 'c:c02|rowNo', 'Home')
      await t.page.keyboard.press('End')
      t.eq(await t.active(), 'c:c02|drop', 'End')
      await t.page.keyboard.press('Control+Home')
      t.eq(await t.active(), 'v:v1|rowNo', 'Ctrl+Home')
      await t.page.keyboard.press('ArrowUp')
      t.eq(await t.active(), 'v:v1|rowNo', 'stops at the edge')
      await t.focusCell('c:c03', 'source')
      await t.page.keyboard.type('X')
      t.eq(await t.page.locator('[data-cell="c:c03|source"] input').inputValue(), 'X', 'typing starts editing')
      await t.page.keyboard.press('Shift+Tab')
      await t.idle(200)
      t.assert(await t.page.locator('[data-cell="c:c03|clipNo"] input').count() === 1, 'Shift+Tab: previous cell to type in')
    },
  },
]
