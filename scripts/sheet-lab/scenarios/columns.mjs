// Sheet columns you can shape (spec 010): one or more scenarios per acceptance
// scenario, then keyboard, Arabic and axe. `cols=1` loads column-fixtures.ts:
// Content has Copy status (renamed Status), a hidden Pillar, and custom Hook
// (text), Platform (choice), Reviewer (person), Approved (checkbox), Words
// (number), Go-live (date) and Brief (link); the Video sheet has Hook and
// Music cleared in Full and Editing.

const C = 'view=content&cols=1'
const POST1 = 'f51f43c9-069d-46af-95c0-04cba2f72efa'
const POST2 = '3be798dc-ba7a-4742-a1df-d48722c2b039'
const heads = t => t.page.$$eval('[role="columnheader"]', hs => hs.slice(1).map(h => (h.querySelector('.fx-sheet-th-name')?.textContent ?? h.textContent).trim()))
const cols = t => t.page.evaluate(() => window.__cols)
const calls = async (t, fn) => (await t.lab()).calls.filter(c => c.fn === fn).map(c => c.args)
async function headMenu(t, key) {
  await t.page.locator(`[data-col-menu="${key}"]`).click({ force: true })
  await t.page.waitForSelector('[data-sheet-menu]')
}
const pick = (t, item) => t.page.locator(`[data-sheet-menu] [data-menu-item="${item}"]`).click()
const valueOf = async (t, id, task) => (await cols(t)).values[id]?.[task]

export const columns = [
  // ── US1: rename ──────────────────────────────────────────────────────────
  {
    id: 'col-1-rename', hash: C,
    async run(t) {
      await headMenu(t, 'status')
      await pick(t, 'rename')
      await t.page.locator('[data-column-rename] input').fill('Stage')
      await t.page.locator('[data-column-rename] button[type="submit"]').click()
      await t.idle(200)
      t.assert((await heads(t)).includes('Stage'), 'renamed for everyone (the shared layout)')
      t.eq((await calls(t, 'col.rename')).length, 1, 'saved')
      await t.cell(`k:${POST1}`, 'status').click()
      t.assert((await t.menuItems()).length > 0, 'the status menu still works under its new name (SC-005)')
    },
  },
  {
    id: 'col-1-taken', hash: C,
    async run(t) {
      await headMenu(t, 'c:hook')
      await pick(t, 'rename')
      await t.page.locator('[data-column-rename] input').fill('assignee')
      await t.page.locator('[data-column-rename] button[type="submit"]').click()
      await t.idle(150)
      t.assert(/already a column/.test(await t.page.locator('[data-column-rename] [role="alert"]').innerText()), 'a name in use is refused')
      await t.page.locator('[data-column-rename] input').fill('')
      await t.page.locator('[data-column-rename] button[type="submit"]').click()
      await t.idle(100)
      t.assert(/needs a name/.test(await t.page.locator('[data-column-rename] [role="alert"]').innerText()), 'an empty name is refused')
      t.eq((await calls(t, 'col.rename')).length, 0, 'nothing saved')
    },
  },
  {
    id: 'col-1-reset', hash: `${C}&locale=ar`,
    async run(t) {
      t.assert((await heads(t)).includes('Copy status'), 'a renamed column shows its name as typed, in Arabic too')
      await headMenu(t, 'status')
      t.assert((await t.menuItems()).includes('reset'), 'Reset name offered')
      await pick(t, 'reset')
      await t.idle(200)
      t.assert((await heads(t)).includes('المرحلة'), 'the default name returns, translated (FR-012)')
    },
  },
  // ── US2: add a column of your own ────────────────────────────────────────
  {
    id: 'col-2-add', hash: C,
    async run(t) {
      await t.page.locator('[data-add-column]').click()
      await t.page.locator('[data-column-editor] input[type="text"]').first().fill('Notes')
      await t.page.locator('[data-column-editor] button[type="submit"]').click()
      await t.idle(200)
      t.eq((await heads(t)).at(-1), 'Notes', 'added at the end')
      const rec = (await cols(t)).records.find(r => r.name === 'Notes')
      t.assert(rec && rec.kind === 'text', 'a Text column')
      await t.focusCell(`k:${POST1}`, rec.key)
      await t.page.keyboard.type('Check the numbers')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq(await valueOf(t, rec.id, POST1), 'Check the numbers', 'a value typed and saved')
    },
  },
  {
    id: 'col-2-insert', hash: C,
    async run(t) {
      await headMenu(t, 'type')
      await pick(t, 'after')
      await t.page.locator('[data-column-editor] input[type="text"]').first().fill('Angle')
      await t.page.locator('[data-column-editor] button[type="submit"]').click()
      await t.idle(200)
      const h = await heads(t)
      t.eq(h.slice(0, 3), ['Title', 'Type', 'Angle'], 'inserted right after Type (FR-021)')
    },
  },
  {
    id: 'col-2-kinds', hash: C,
    async run(t) {
      // Number refuses words; the old value stays (FR-023).
      await t.focusCell(`k:${POST1}`, 'c:words')
      await t.page.keyboard.type('abc')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.assert(/Not a number/.test(await t.text(`k:${POST1}`, 'c:words')), 'Not a number')
      t.eq(await valueOf(t, 'words', POST1), '184', 'old value kept')
      // Date takes 20/11/2026.
      await t.focusCell(`k:${POST1}`, 'c:golive')
      await t.page.keyboard.type('20/11/2026')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq(await valueOf(t, 'golive', POST1), '2026-11-20', 'DD/MM/YYYY read')
      // Checkbox: Space toggles.
      await t.focusCell(`k:${POST1}`, 'c:approved')
      await t.idle(200)
      t.eq(await valueOf(t, 'approved', POST1), undefined, 'a click unchecks it')
      await t.page.keyboard.press(' ')
      await t.idle(200)
      t.eq(await valueOf(t, 'approved', POST1), '1', 'Space checks it again')
      // Link refuses a non-link.
      await t.cell(`k:${POST1}`, 'c:brief').click()
      await t.page.locator('[data-sheet-pop] input').fill('not a link')
      await t.page.keyboard.press('Enter')
      await t.idle(150)
      t.assert(await t.page.locator('[data-sheet-pop]').count() === 1, 'the link box stays open on a non-link')
      await t.page.locator('[data-sheet-pop] input').fill('https://docs.google.com/document/d/brief')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq((await t.text(`k:${POST1}`, 'c:brief')).trim(), 'Google Docs', 'shown by site name')
      // Person: a menu with avatars.
      await t.cell(`k:${POST1}`, 'c:reviewer').click()
      await t.page.locator('[data-sheet-menu] [data-menu-item="noran"]').click()
      await t.idle(200)
      t.eq(await valueOf(t, 'reviewer', POST1), 'noran', 'a team member')
      // Delete clears a custom cell.
      await t.focusCell(`k:${POST1}`, 'c:reviewer')
      await t.page.keyboard.press('Escape')
      await t.page.keyboard.press('Delete')
      await t.idle(200)
      t.eq(await valueOf(t, 'reviewer', POST1), undefined, 'Delete clears it')
    },
  },
  {
    id: 'col-2-choice-typeahead', hash: C,
    async run(t) {
      await t.focusCell('k:v1', 'c:platform')
      await t.page.keyboard.type('ins')
      await t.page.waitForSelector('[data-sheet-combo]')
      t.eq(await t.page.locator('[data-sheet-combo] input').inputValue(), 'ins', 'typed letters stay in order')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq(await valueOf(t, 'platform', 'v1'), 'ig', 'Instagram picked')
      await t.focusCell('k:v1', 'c:platform')
      await t.page.keyboard.type('Threads')
      await t.page.waitForSelector('[data-combo-add]')
      await t.page.keyboard.press('Enter')
      await t.idle(300)
      const rec = (await cols(t)).records.find(r => r.key === 'c:platform')
      t.assert(rec.options.some(o => o.name === 'Threads'), 'a missing option added, for everyone')
      t.eq(rec.options.find(o => o.name === 'Threads').id, await valueOf(t, 'platform', 'v1'), 'and set on the row')
    },
  },
  {
    id: 'col-2-readonly', hash: `${C}&me=sara`,
    async run(t) {
      await t.focusCell(`k:${POST1}`, 'c:hook')
      await t.page.keyboard.press('Enter')
      await t.idle(150)
      t.assert(/can't edit/.test(await t.text(`k:${POST1}`, 'c:hook')), 'a row the member may not edit is read-only (FR-024)')
      t.eq((await calls(t, 'col.value')).length, 0, 'nothing sent')
      // But anyone may shape the columns (FR-003).
      await headMenu(t, 'c:hook')
      t.assert((await t.menuItems()).includes('rename'), 'the column menu is open to everyone')
    },
  },
  // ── US3: rearrange ───────────────────────────────────────────────────────
  {
    id: 'col-3-move', hash: C,
    async run(t) {
      await headMenu(t, 'assignee')
      await pick(t, 'left')
      await t.idle(200)
      const h = await heads(t)
      t.assert(h.indexOf('Assignee') === h.indexOf('Copy status') - 1, `moved left (${h.slice(0, 5)})`)
      await t.cell(`k:${POST1}`, 'status').click()
      t.assert((await t.menuItems()).length > 0, 'built-in cells work wherever they sit')
    },
  },
  {
    id: 'col-3-drag', hash: C,
    async run(t) {
      await t.page.dragAndDrop('[data-col-head="c:hook"]', '[data-col-head="type"]')
      await t.idle(250)
      const h = await heads(t)
      t.eq(h.slice(0, 3), ['Title', 'Hook', 'Type'], 'dragged before Type')
      await t.page.dragAndDrop('[data-col-head="c:words"]', '[data-col-head="title"]')
      await t.idle(200)
      t.eq((await heads(t))[0], 'Title', 'nothing goes before Title (FR-031)')
    },
  },
  {
    id: 'col-3-panel', hash: C,
    async run(t) {
      await t.page.locator('[data-columns-button]').click()
      await t.page.waitForSelector('[data-columns-panel]')
      const who = await t.page.locator('[data-panel-col="c:hook"] .fx-col-who').innerText()
      t.assert(/Changed by Samaa/.test(who), `who changed it (FR-004): ${who}`)
      await t.page.locator('[data-panel-col="c:hook"] button[aria-label^="Move Hook up"]').click()
      await t.idle(200)
      const h = await heads(t)
      t.assert(h.indexOf('Hook') < h.indexOf('Assignee'), 'moved up from the panel (keyboard path)')
    },
  },
  // ── US4: hide, show, delete ──────────────────────────────────────────────
  {
    id: 'col-4-hide', hash: C,
    async run(t) {
      t.assert(!(await heads(t)).includes('Pillar'), 'a hidden built-in stays hidden')
      await headMenu(t, 'c:hook')
      await pick(t, 'hide')
      await t.idle(200)
      t.assert(!(await heads(t)).includes('Hook'), 'hidden')
      await t.page.locator('[data-columns-button]').click()
      await t.page.locator('[data-panel-col="c:hook"] input[type="checkbox"]').click()
      await t.idle(250)
      t.assert((await heads(t)).includes('Hook'), 'shown again from Columns')
      t.assert(await t.page.locator('[data-panel-col="title"] input[type="checkbox"]').isDisabled(), 'Title cannot be hidden')
    },
  },
  {
    id: 'col-4-delete-undo', hash: C,
    async run(t) {
      await headMenu(t, 'type')
      t.assert(!(await t.menuItems()).includes('delete'), 'built-in columns offer no Delete (FR-040)')
      await t.page.keyboard.press('Escape')
      await headMenu(t, 'c:words')
      await pick(t, 'delete')
      t.assert(/2 rows have a value/.test(await t.page.locator('[data-column-delete]').innerText()), 'the count first')
      await t.page.locator('[data-column-delete] .is-danger').click()
      await t.idle(250)
      t.assert(!(await heads(t)).includes('Words'), 'deleted')
      await t.page.locator('[data-sheet-toast] button').click()
      await t.idle(250)
      t.assert((await heads(t)).includes('Words'), 'Undo brings it back (SC-007)')
      t.eq(await valueOf(t, 'words', POST1), '184', 'with its values')
    },
  },
  // ── US5: settings ────────────────────────────────────────────────────────
  {
    id: 'col-5-kind', hash: C,
    async run(t) {
      await headMenu(t, 'c:hook')
      await pick(t, 'edit')
      await t.page.locator('[data-column-editor] [data-kind="number"]').click()
      t.assert(/2 of 2 values won't fit Number/.test(await t.page.locator('[data-kind-review]').innerText()), 'the review before the change')
      await t.page.locator('[data-column-editor] button[type="submit"]').click()
      await t.idle(250)
      t.eq((await cols(t)).records.find(r => r.key === 'c:hook').kind, 'number', 'kind changed')
      t.eq(Object.keys((await cols(t)).values.hook ?? {}).length, 0, 'values that did not fit were cleared')
    },
  },
  {
    id: 'col-5-option-in-use', hash: C,
    async run(t) {
      await headMenu(t, 'c:platform')
      await pick(t, 'edit')
      await t.page.locator('[data-column-editor] [data-remove-option="LinkedIn"]').click()
      t.assert(/2 rows use “LinkedIn”/.test(await t.page.locator('[data-column-editor]').innerText()), 'asks what the rows using it get')
      await t.page.locator('[data-column-editor] button[type="submit"]').click()
      t.assert(/Choose what the rows/.test(await t.page.locator('[data-column-editor] .fx-col-err').innerText()), 'not saved until chosen')
      await t.page.locator('[data-column-editor] button', { hasText: 'Use “Instagram”' }).click()
      await t.page.locator('[data-column-editor] button[type="submit"]').click()
      await t.idle(250)
      t.eq(await valueOf(t, 'platform', POST1), 'ig', 'rows moved to Instagram')
    },
  },
  // ── US6: resize ──────────────────────────────────────────────────────────
  {
    id: 'col-6-resize', hash: C,
    async run(t) {
      const box = await t.page.locator('[data-col-resize="c:hook"]').boundingBox()
      await t.page.mouse.move(box.x + 3, box.y + box.height / 2)
      await t.page.mouse.down()
      await t.page.mouse.move(box.x + 83, box.y + box.height / 2, { steps: 4 })
      await t.page.mouse.up()
      await t.idle(200)
      const w = (await cols(t)).records.find(r => r.key === 'c:hook').width
      t.assert(w >= 210 && w <= 230, `wider, saved (${w})`)
      await t.page.locator('[data-col-resize="c:words"]').dblclick()
      await t.idle(200)
      const fit = (await cols(t)).records.find(r => r.key === 'c:words').width
      t.assert(fit >= 60 && fit < 140, `fitted to its content (${fit})`)
    },
  },
  // ── Type: type-ahead with add-if-missing ─────────────────────────────────
  {
    id: 'col-type-ahead', hash: C,
    async run(t) {
      await t.focusCell(`k:${POST1}`, 'type')
      await t.page.keyboard.type('rep')
      await t.page.waitForSelector('[data-sheet-combo]')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq((await t.task(POST1)).content_type_label, 'Report', 'typed, picked')
      await t.focusCell(`k:${POST1}`, 'type')
      await t.page.keyboard.type('Newsletter')
      await t.page.waitForSelector('[data-combo-add]')
      await t.page.keyboard.press('Enter')
      await t.idle(250)
      t.assert((await cols(t)).types.includes('Newsletter'), 'an admin adds a missing type')
      t.eq((await t.task(POST1)).content_type_label, 'Newsletter', 'and it is set')
    },
  },
  {
    id: 'col-type-user', hash: `${C}&me=hadi`,
    async run(t) {
      await t.focusCell(`k:${POST1}`, 'type')
      await t.page.keyboard.type('Podcast')
      await t.page.waitForSelector('[data-combo-add]')
      t.assert(await t.page.locator('[data-combo-add]').isDisabled(), 'only admins add types')
      t.assert(/Ask an admin/.test(await t.page.locator('[data-combo-add]').innerText()), 'and it says so')
    },
  },
  // ── Video sheet ──────────────────────────────────────────────────────────
  {
    id: 'vcol-sets', hash: 'cols=1&me=raneem',
    async run(t) {
      await t.page.locator('[data-set="editing"]').click()
      t.assert((await heads(t)).includes('Hook'), 'Hook in Editing')
      await headMenu(t, 'c:vhook')
      await pick(t, 'hide')
      await t.idle(200)
      t.assert(!(await heads(t)).includes('Hook'), 'hidden in Editing')
      await t.page.locator('[data-set="full"]').click()
      t.assert((await heads(t)).includes('Hook'), 'still in Full (FR-033)')
      t.assert((await t.text('c:c09', 'c:music')).includes('Yes'), 'the checkbox shows on a clip')
      await t.page.locator('[data-add-column]').click()
      await t.page.locator('[data-column-editor] input[type="text"]').first().fill('Caption')
      await t.page.locator('[data-column-editor] button[type="submit"]').click()
      await t.idle(200)
      const rec = (await cols(t)).records.find(r => r.name === 'Caption')
      t.eq([rec.sheet, rec.shownIn.sort()], ['video', ['full']], 'a new Video column shows in Full and its set (FR-034)')
    },
  },
  // ── Polish ───────────────────────────────────────────────────────────────
  {
    id: 'cols-kbd', hash: C,
    async run(t) {
      await t.focusCell(`k:${POST1}`, 'c:hook')
      await t.page.keyboard.press('Alt+ArrowDown')
      await t.page.waitForSelector('[data-sheet-menu]')
      t.assert((await t.menuItems()).includes('edit'), 'Alt+↓ opens the column menu')
      await t.page.keyboard.press('Escape')
      await t.page.locator('[data-columns-button]').focus()
      await t.page.keyboard.press('Enter')
      await t.page.waitForSelector('[data-columns-panel]')
      t.assert(await t.page.evaluate(() => !!document.activeElement?.closest('[data-columns-panel]')), 'focus moves into the Columns panel')
    },
  },
  {
    id: 'cols-axe', hash: C,
    async run(t) {
      t.eq(await t.axe('[data-content-sheet]'), [], 'sheet with custom columns')
      await t.page.locator('[data-columns-button]').click()
      t.eq(await t.axe('[data-columns-panel]'), [], 'Columns panel')
      await t.page.keyboard.press('Escape')
      await t.page.locator('[data-add-column]').click()
      t.eq(await t.axe('[data-column-editor]'), [], 'column editor')
      await t.page.keyboard.press('Escape')
      await t.focusCell(`k:${POST1}`, 'type')
      await t.page.keyboard.type('p')
      await t.page.waitForSelector('[data-sheet-combo]')
      t.eq(await t.axe('[data-sheet-combo]'), [], 'type-ahead')
    },
  },
]
