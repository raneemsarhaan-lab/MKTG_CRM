/**
 * Spec 020 stage A (US1–US3, power tips) on the running app, against `next start`.
 *   node scripts/spreadsheet-lab/realapp/tips-a.cjs [base]
 * Seeds a team folder with a sheet, then checks quickstart.md Stage A:
 * rows and columns, Go To Special › Blanks + Ctrl+Enter, F4, the fill handle
 * (series, months in English and Arabic, weekdays, double-click, drag back,
 * Shift, Auto Fill Options, the right-drag menu, a custom list), Ctrl+; and
 * Flash Fill, data validation (▾, the Stop alert, pasted values, an insert
 * inside the range), Alt+↓, zoom, Shift+wheel, Ctrl+F1, KeyTips, the status
 * bar, the Content sheet, Arabic, a phone and axe. The folder and the list it
 * adds are removed at the end.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
const ADMIN = sql(`select email from members where access='admin' and password_hash is not null order by created_at limit 1`)
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }
const errors = []

function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Tips lab ' || floor(random()*1e6)) returning id`)
  const sheet = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Plan', 0, 200, 14) returning id`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 200) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 14) g`)
  // A1:C6 with five gaps (the used range for Go To Special › Blanks).
  const data = [['Week', 'Owner', 'Reach'], ['W1', 'Samaa', '5'], ['W2', '', '10'], ['', 'Islam', ''], ['W4', '', '20'], ['W5', 'Roaa', '']]
  const vals = []
  data.forEach((row, r) => row.forEach((v, c) => { if (v) vals.push(`(${r + 1}, ${c + 1}, '${v}')`) }))
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value)
       select '${sheet}', r.id, k.id, v.val from (values ${vals.join(',')}) as v(rp, cp, val)
       join sheet_rows r on r.sheet_id='${sheet}' and r.position=v.rp join sheet_cols k on k.sheet_id='${sheet}' and k.position=v.cp`)
  return { folder, sheet }
}
const dbCell = (sheet, r, c) => sql(`select coalesce((select value from sheet_cells where sheet_id='${sheet}'
  and row_id=(select id from sheet_rows where sheet_id='${sheet}' order by position offset ${r} limit 1)
  and col_id=(select id from sheet_cols where sheet_id='${sheet}' order by position offset ${c} limit 1)), '')`)
const dbCol = (sheet, c, r0, r1) => Array.from({ length: r1 - r0 + 1 }, (_, i) => dbCell(sheet, r0 + i, c))

async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], ...opts })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: 'lab-pass-1' } })
  if (!r.ok()) throw new Error(`login: ${r.status()}`)
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${e}`))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  // The hours reminder can pop up over the sheet: put it off whenever it shows.
  await page.addLocatorHandler(page.locator('[data-hours-later]'), async () => { await page.locator('[data-hours-later]').click() })
  return { ctx, page }
}
async function axe(page, name) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run({ exclude: [['aside.fx-sidebar'], ['.fx-tabbar']] }, { resultTypes: ['violations'] })
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id} (${v.nodes.length}): ${v.nodes.map(n => n.target.join(' ')).slice(0, 2).join(' ; ')}`)
  })
  ok(res.length === 0, `axe: ${name}`, res.slice(0, 3).join(' | '))
}
// The sheet has 200 rows, so the grid draws only what's in view: rows are found by their row index, not their place in the DOM.
const cellOf = (page, r, c) => page.locator(`[data-blank-sheet] .fx-sheet-tr[data-row][aria-rowindex="${r + 2}"]`).locator('.fx-sheet-td').nth(c + 1)
const text = async (page, r, c) => (await cellOf(page, r, c).innerText()).trim()
const letters = c => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
/** A row the grid hasn't drawn yet (it draws what's in view): go there through the name box first. */
const at = async (page, r, c, opts) => { await reach(page, r, c); await cellOf(page, r, c).click(opts) }
async function reach(page, r, c) {
  if (await cellOf(page, r, c).count()) return
  await page.fill('[data-namebox]', `${letters(c)}${r + 1}`); await page.keyboard.press('Enter')
  await cellOf(page, r, c).waitFor()
}
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 15000 })
// Non-Latin text is inserted without key presses (as an input method does), so the cell is opened with F2 first.
const typeAt = async (page, r, c, v) => {
  await reach(page, r, c)
  await cellOf(page, r, c).click()
  if (/[^\x00-\x7F]/.test(v)) { await page.keyboard.press('F2'); await page.keyboard.insertText(v) } else await page.keyboard.type(v)
  await page.keyboard.press('Enter')
}
/** A range through the name box (one step, however far apart its corners are). */
const select = async (page, a, b) => {
  await page.fill('[data-namebox]', `${letters(a[1])}${a[0] + 1}:${letters(b[1])}${b[0] + 1}`); await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}
const selCount = page => page.locator('[data-blank-sheet] .fx-sheet-td.is-selected, [data-blank-sheet] .fx-sheet-td.is-anchor').count()
const nameBox = page => page.locator('[data-namebox]').inputValue()
/** The name box follows the selection a moment later. */
const nameIs = async (page, v) => { for (let i = 0; i < 20; i++) { if (await nameBox(page) === v) return true; await page.waitForTimeout(100) } return false }
const mb = async (page, menu, item) => { await page.click(`[data-mb="${menu}"]`); await page.click(`[data-mb-${menu}] [role^="menuitem"]:has-text("${item}")`) }
/** Drag the fill handle to the middle of cell (r, c); `check` runs while the mouse is still down. */
async function dragHandle(page, r, c, { button = 'left', shift = false, check } = {}) {
  await reach(page, r, c); await cellOf(page, r, c).scrollIntoViewIfNeeded()
  const h = await page.locator('[data-fill-handle]').boundingBox()
  const t = await cellOf(page, r, c).boundingBox()
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.down({ button })
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 })
  if (check) await check()
  await page.mouse.up({ button })
  if (shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(300)
}

;(async () => {
  const ids = seed()
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  const listsBefore = sql(`select coalesce((select fill_lists::text from workspace_settings where id=1), '[]')`)
  try {
    const A = await login(browser, ADMIN), page = A.page
    const url = `${BASE}/sheets/${ids.folder}?sheet=${ids.sheet}`
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]'); await page.waitForSelector('[data-format-bar]')

    console.log('1. Rows, columns, blanks (US1)')
    await at(page, 2, 1); await page.keyboard.press('Shift+Space')
    ok(await nameIs(page, '3:3'), 'Shift+Space selects the row', await nameBox(page))
    // Shift+Space puts the active cell at the row's start (the grid keeps it on a corner): Ctrl+Space from B.
    await at(page, 2, 1); await page.keyboard.press('Control+Space')
    ok(await nameIs(page, 'B:B'), 'Ctrl+Space selects the column', await nameBox(page))
    await at(page, 0, 0); await page.keyboard.press('F5')
    await page.waitForSelector('[data-goto-dialog]')
    ok(true, 'F5 opens Go To (not a reload)')
    await axe(page, 'Go To')
    await page.click('[data-goto-special]'); await page.waitForSelector('[data-goto-special-dialog]')
    ok(await page.locator('[data-gs="formulas"]').isDisabled() && await page.locator('[data-gs="blanks"]').isChecked(), 'Go To Special: formulas greyed, Blanks chosen')
    await axe(page, 'Go To Special')
    await page.click('[data-goto-special-dialog] [data-ok]'); await page.waitForTimeout(300)
    ok(await selCount(page) === 5, 'Blanks selects only the five empty cells of the used range', `(${await selCount(page)})`)
    await page.keyboard.type('TBD'); await page.keyboard.press('Control+Enter'); await saved(page)
    ok(+sql(`select count(*) from sheet_cells where sheet_id='${ids.sheet}' and value='TBD'`) === 5, '"TBD" + Ctrl+Enter fills them all')
    await page.click('[data-undo]'); await saved(page)
    ok(+sql(`select count(*) from sheet_cells where sheet_id='${ids.sheet}' and value='TBD'`) === 0, 'one undo step')
    await at(page, 0, 0); await page.keyboard.press('Control+g'); await page.waitForSelector('[data-goto-dialog]')
    await page.fill('[data-goto-ref]', 'C5'); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
    ok(await nameIs(page, 'C5'), 'Ctrl+G, C5, Enter goes there', await nameBox(page))

    console.log('2. Repeat (F4)')
    const rows0 = +sql(`select count(*) from sheet_rows where sheet_id='${ids.sheet}'`)
    await at(page, 8, 0, { button: 'right' }); await page.click('[data-cell-menu] [role^="menuitem"]:has-text("above")')
    await at(page, 12, 0); await page.keyboard.press('F4'); await saved(page)
    ok(+sql(`select count(*) from sheet_rows where sheet_id='${ids.sheet}'`) === rows0 + 2, 'F4 inserts a row there too')
    await page.keyboard.press('Control+y'); await saved(page)
    ok(+sql(`select count(*) from sheet_rows where sheet_id='${ids.sheet}'`) === rows0 + 3, 'Ctrl+Y with nothing to redo repeats')

    console.log('3. The fill handle (US2)')
    await typeAt(page, 20, 4, '5'); await typeAt(page, 21, 4, '10')
    await select(page, [20, 4], [21, 4])
    let tip = ''
    await dragHandle(page, 25, 4, { check: async () => { tip = (await page.locator('[data-fill-tip]').innerText().catch(() => '')).trim() } })
    await saved(page)
    ok(tip === '30', 'the tip shows the last value while dragging', `(${tip})`)
    ok(JSON.stringify(dbCol(ids.sheet, 4, 22, 25)) === JSON.stringify(['15', '20', '25', '30']), '5, 10 dragged down 4 rows gives 15–30', JSON.stringify(dbCol(ids.sheet, 4, 22, 25)))
    ok(await page.locator('[data-autofill-options]').isVisible(), 'Auto Fill Options shows by the target')
    await page.click('[data-autofill-options]'); await page.waitForSelector('[data-fill-menu]')
    await axe(page, 'Auto Fill Options')
    await page.click('[data-fill-menu] [role^="menuitem"]:has-text("Copy Cells")'); await saved(page)
    ok(JSON.stringify(dbCol(ids.sheet, 4, 22, 25)) === JSON.stringify(['5', '10', '5', '10']), 'Copy Cells replaces the fill', JSON.stringify(dbCol(ids.sheet, 4, 22, 25)))
    await page.click('[data-undo]'); await saved(page)
    ok(dbCell(ids.sheet, 22, 4) === '', 'one undo puts it all back (the replaced fill is gone too)')

    await typeAt(page, 30, 5, 'Jan'); await at(page, 30, 5)
    await dragHandle(page, 34, 5); await saved(page)
    ok(JSON.stringify(dbCol(ids.sheet, 5, 31, 34)) === JSON.stringify(['Feb', 'Mar', 'Apr', 'May']), '"Jan" gives Feb–May')
    await typeAt(page, 30, 6, 'يناير'); await at(page, 30, 6)
    await dragHandle(page, 32, 6); await saved(page)
    ok(JSON.stringify(dbCol(ids.sheet, 6, 31, 32)) === JSON.stringify(['فبراير', 'مارس']), 'Arabic month names continue in Arabic')
    // 10/12/2026 is a Thursday: Fill Weekdays skips Friday and Saturday.
    await typeAt(page, 30, 7, '10/12/2026'); await at(page, 30, 7)
    await dragHandle(page, 31, 7); await saved(page)
    await page.click('[data-autofill-options]'); await page.click('[data-fill-menu] [role^="menuitem"]:has-text("Weekdays")'); await saved(page)
    ok(dbCell(ids.sheet, 31, 7) === '13/12/2026', 'a date + Fill Weekdays skips Friday and Saturday', dbCell(ids.sheet, 31, 7))
    // Double-click: down as far as the column beside it.
    for (let i = 0; i < 6; i++) await typeAt(page, 40 + i, 8, `Item ${i + 1}`)
    await typeAt(page, 40, 9, 'x'); await at(page, 40, 9)
    await page.locator('[data-fill-handle]').dblclick(); await saved(page)
    ok(dbCell(ids.sheet, 45, 9) === 'x' && dbCell(ids.sheet, 46, 9) === '', 'double-clicking the handle fills to the data\'s end')
    // Drag back inside the block clears.
    await select(page, [40, 8], [45, 8])
    await dragHandle(page, 42, 8); await saved(page)
    ok(dbCell(ids.sheet, 43, 8) === '' && dbCell(ids.sheet, 42, 8) === 'Item 3', 'dragging back clears the cells it leaves')
    // Shift+drag inserts rows.
    const rows1 = +sql(`select count(*) from sheet_rows where sheet_id='${ids.sheet}'`)
    await at(page, 40, 8)
    await dragHandle(page, 42, 8, { shift: true }); await saved(page)
    ok(+sql(`select count(*) from sheet_rows where sheet_id='${ids.sheet}'`) === rows1 + 2 && dbCell(ids.sheet, 41, 8) === 'Item 2', 'Shift+drag inserts rows for the fill')
    // The right-drag menu.
    await typeAt(page, 60, 10, '2'); await typeAt(page, 61, 10, '4'); await select(page, [60, 10], [61, 10])
    await dragHandle(page, 63, 10, { button: 'right' })
    await page.waitForSelector('[data-fill-menu]')
    ok(await page.locator('[data-fill-menu] [role^="menuitem"]:has-text("Fill Days")').getAttribute('aria-disabled') === 'true', 'the right-drag menu greys what doesn\'t fit')
    await page.click('[data-fill-menu] [role^="menuitem"]:has-text("Growth Trend")'); await saved(page)
    ok(JSON.stringify(dbCol(ids.sheet, 10, 62, 63)) === JSON.stringify(['8', '16']), 'Growth Trend: 2, 4 → 8, 16')
    // A custom list (Data › Custom Lists…, admins).
    await mb(page, 'data', 'Custom Lists'); await page.waitForSelector('[data-custom-lists]')
    await axe(page, 'Custom Lists')
    await page.fill('[data-list-entries]', 'Plan\nShoot\nEdit\nPublish'); await page.click('[data-list-add]'); await page.click('[data-custom-lists] [data-ok]')
    await page.waitForTimeout(800)
    ok(sql(`select fill_lists::text from workspace_settings where id=1`).includes('Shoot'), 'an admin saves a custom list')
    await typeAt(page, 70, 11, 'Shoot'); await at(page, 70, 11)
    await dragHandle(page, 72, 11); await saved(page)
    ok(JSON.stringify(dbCol(ids.sheet, 11, 71, 72)) === JSON.stringify(['Edit', 'Publish']), 'the custom list continues')

    console.log('4. Quick entry: Ctrl+; and Flash Fill')
    await at(page, 80, 0); await page.keyboard.press('Control+;')
    await page.waitForSelector('[data-blank-sheet] .fx-sheet-input')
    await page.keyboard.press('Enter'); await saved(page)
    const d = new Date(), p2 = n => String(n).padStart(2, '0')
    ok(dbCell(ids.sheet, 80, 0) === `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`, "Ctrl+; enters today's date", dbCell(ids.sheet, 80, 0))
    await typeAt(page, 81, 0, "'007"); await saved(page)
    ok(dbCell(ids.sheet, 81, 0) === '007' && (await text(page, 81, 0)) === '007', 'a leading apostrophe keeps the zeros and is not stored')
    for (const [i, n] of ['Hisham El Badawy', 'Islam Saadany', 'Raneem Sarhan', 'Samaa Adel'].entries()) await typeAt(page, 90 + i, 0, n)
    await typeAt(page, 90, 1, 'Hisham'); await at(page, 91, 1); await page.keyboard.press('Control+e'); await saved(page)
    ok(JSON.stringify(dbCol(ids.sheet, 1, 91, 93)) === JSON.stringify(['Islam', 'Raneem', 'Samaa']), 'Ctrl+E fills first names from full names')
    ok((await page.locator('[data-sb-mode]').innerText()).includes('3'), 'the status bar says how many cells Flash Fill changed', await page.locator('[data-sb-mode]').innerText())
    ok(await page.locator('[data-autofill-options]').isVisible(), 'Flash Fill Options shows')
    await page.click('[data-undo]'); await saved(page)
    await typeAt(page, 90, 1, 'Something else'); await at(page, 91, 1); await page.keyboard.press('Control+e'); await page.waitForTimeout(300)
    ok(dbCell(ids.sheet, 91, 1) === '' && await page.locator('[data-sheets-toast]').isVisible(), 'an example it can\'t follow is refused, with a note')

    console.log('5. Data validation (US3)')
    await select(page, [100, 2], [130, 2])
    await mb(page, 'data', 'Data Validation'); await page.waitForSelector('[data-dv-dialog]')
    await axe(page, 'Data Validation')
    await page.selectOption('[data-dv-allow]', 'list'); await page.fill('[data-dv-source]', 'To do, Doing, Done')
    await page.click('[data-dv-tab="input"]'); await page.fill('[data-dv-in-title]', 'Progress'); await page.fill('[data-dv-in-msg]', 'Pick from the list.')
    await page.click('[data-dv-dialog] [data-ok]'); await saved(page)
    ok(+sql(`select count(*) from sheet_validations where sheet_id='${ids.sheet}'`) === 1, 'the rule is saved')
    await at(page, 102, 2)
    ok(await page.locator('[data-dv-drop]').isVisible() && (await page.locator('[data-dv-input]').innerText()).includes('Pick from the list'), 'the selected cell shows ▾ and its input message')
    await page.click('[data-dv-drop]'); await page.waitForSelector('[data-pick-list]')
    ok((await page.locator('[data-pick-list] [role^="menuitem"]').count()) === 3, 'the ▾ lists the three values')
    await page.click('[data-pick-list] [role^="menuitem"]:has-text("Doing")'); await saved(page)
    ok(dbCell(ids.sheet, 102, 2) === 'Doing', 'picking writes the value')
    await at(page, 103, 2); await page.keyboard.type('Maybe'); await page.keyboard.press('Enter')
    await page.waitForSelector('[data-dv-alert]')
    ok(true, 'typing an outside value brings the Stop alert')
    await axe(page, 'the Stop alert')
    await page.click('[data-dv-cancel]'); await page.waitForTimeout(300)
    ok(dbCell(ids.sheet, 103, 2) === '', 'Cancel leaves the cell as it was')
    await at(page, 104, 2); await page.keyboard.type('done'); await page.keyboard.press('Enter'); await saved(page)
    ok(dbCell(ids.sheet, 104, 2) === 'Done', 'a value in the list is taken, spelled as in the list')
    await page.evaluate(() => navigator.clipboard.writeText('Maybe\nDoing'))
    await at(page, 105, 2); await page.keyboard.press('Control+v'); await saved(page)
    ok(dbCell(ids.sheet, 105, 2) === '' && dbCell(ids.sheet, 106, 2) === 'Doing', 'a paste keeps the allowed values only')
    ok(/1/.test(await page.locator('[data-skip-note]').innerText().catch(() => '')), 'the refused one is counted', await page.locator('[data-skip-note]').innerText().catch(() => ''))
    await at(page, 110, 0, { button: 'right' }); await page.click('[data-cell-menu] [role^="menuitem"]:has-text("above")'); await saved(page)
    await at(page, 131, 2)
    ok(await page.locator('[data-dv-drop]').count() === 1, 'inserting a row inside the range grows it')
    await at(page, 96, 0); await page.keyboard.press('Alt+ArrowDown'); await page.waitForSelector('[data-pick-list]')
    ok((await page.locator('[data-pick-list] [role^="menuitem"]').count()) >= 4, 'Alt+↓ lists the column\'s values')
    await page.keyboard.press('Escape')

    console.log('6. Zoom, the toolbar, KeyTips and the status bar')
    await at(page, 0, 0)
    const g = await page.locator('[data-blank-sheet]').boundingBox()
    await page.mouse.move(g.x + 200, g.y + 200); await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control')
    await page.waitForTimeout(200)
    ok(await page.locator('[data-sheet-grid][data-zoom="110"]').count() === 1 && (await page.locator('[data-zoom-pct]').innerText()) === '110%', 'Ctrl+wheel zooms (110%)')
    await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    ok(await page.locator('[data-sheet-grid][data-zoom="110"]').count() === 1, 'the zoom is kept after a reload')
    await at(page, 0, 0); await page.keyboard.press('Control+0')
    ok(await page.locator('[data-sheet-grid][data-zoom]').count() === 0, 'Ctrl+0 goes back to 100%')
    const sc = page.locator('[data-blank-sheet]')
    const x0 = await sc.evaluate(e => e.scrollLeft)
    await page.mouse.move(g.x + 200, g.y + 200); await page.keyboard.down('Shift'); await page.mouse.wheel(0, 300); await page.keyboard.up('Shift')
    await page.waitForTimeout(200)
    ok(await sc.evaluate(e => e.scrollLeft) > x0, 'Shift+wheel scrolls sideways')
    await page.keyboard.press('Control+F1')
    ok(await page.locator('[data-format-bar]').isHidden(), 'Ctrl+F1 collapses the toolbar')
    await page.keyboard.press('Control+F1')
    ok(await page.locator('[data-format-bar]').isVisible(), 'and brings it back')
    await at(page, 0, 0); await page.keyboard.press('Alt')
    ok(await page.locator('[data-keytip="A"]').isVisible(), 'Alt shows the key letters')
    await page.keyboard.press('a'); await page.waitForSelector('[data-mb-data]')
    ok(true, 'Alt, A opens the Data menu'); await page.keyboard.press('Escape')
    await select(page, [20, 4], [21, 4])
    // The totals follow the selection a moment later: wait for them rather than a fixed pause.
    await page.waitForFunction(() => /Sum/.test(document.querySelector('[data-statusbar]')?.textContent ?? ''), null, { timeout: 3000 }).catch(() => {})
    const bar = (await page.locator('[data-statusbar]').innerText()).replace(/\s+/g, ' ')
    ok(/Sum 15/.test(bar) && /Count 2/.test(bar) && /Average 7\.5/.test(bar), 'the status bar shows Average, Count and Sum', bar)
    await axe(page, 'the sheet with the status bar')

    console.log('7. The Content sheet (the board\'s own rules)')
    const contentFolder = sql(`select id from sheet_folders where kind='content' limit 1`)
    await page.goto(`${BASE}/sheets/${contentFolder}`); await page.waitForSelector('[data-content-sheet] [data-cell]')
    // A task row's title (a theme or pillar heading opens its own menu).
    const title = page.locator('[data-content-sheet] .fx-sheet-tr[data-task]:not(.is-video):not(.fx-content-pillar-row):not(.is-add):not(.is-dropped) .fx-sheet-td[data-col="title"]').first()
    await title.click()
    ok(await page.locator('[data-content-sheet] [data-fill-handle]').count() === 1, 'a selected cell has the fill handle')
    await page.keyboard.press('Alt+ArrowDown'); await page.waitForSelector('[data-pick-list]')
    ok(await page.locator('[data-pick-list] [role^="menuitem"]').count() > 1, 'Alt+↓ lists the column\'s values')
    await page.keyboard.press('Escape')
    const cg = await page.locator('[data-content-sheet]').boundingBox()
    await page.mouse.move(cg.x + 300, cg.y + 150); await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control'); await page.waitForTimeout(200)
    ok(await page.locator('[data-content-sheet] [data-sheet-grid][data-zoom="110"]').count() === 1, 'Ctrl+wheel zooms the Content sheet too')
    await page.click('[data-zoom-pct]'); await page.click('[data-zoom-menu] [role^="menuitem"]:has-text("100%")'); await page.waitForTimeout(200)
    ok(await page.locator('[data-content-sheet] [data-sheet-grid][data-zoom]').count() === 0, 'and the status bar\'s zoom menu goes back to 100%')
    // Go To by the row number shown on the left, and Go To Special.
    const sheetId = sql(`select id from sheets where linked_key='linked_content'`)
    const fmt0 = sql(`select count(*) from sheet_formats where sheet_id='${sheetId}'`)
    await title.click(); await page.keyboard.press('Control+g'); await page.waitForSelector('[data-goto-dialog]')
    const label = (await page.locator('[data-content-sheet] .fx-sheet-tr[data-task]:not(.is-video):not(.fx-content-pillar-row):not(.is-add):not(.is-dropped)').nth(2).locator('.fx-sheet-td').first().innerText()).trim().split(/\s+/).pop()
    await page.fill('[data-goto-ref]', label); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    const activeLabel = (await page.locator('[data-content-sheet] .fx-sheet-tr:has(.fx-sheet-td.is-active) .fx-sheet-td').first().innerText()).trim().split(/\s+/).pop()
    ok(activeLabel === label, 'Ctrl+G goes to a row by its number on the Content sheet', `(${label} → ${activeLabel})`)
    await page.keyboard.press('F5'); await page.click('[data-goto-special]'); await page.waitForSelector('[data-goto-special-dialog]')
    ok(!(await page.locator('[data-gs="constants"]').isDisabled()) && await page.locator('[data-gs="validation"]').isDisabled(), 'Go To Special offers what fits the board\'s sheets')
    await page.click('[data-gs="constants"]'); await page.click('[data-goto-special-dialog] [data-ok]'); await page.waitForTimeout(400)
    ok(await page.locator('[data-content-sheet] .fx-sheet-td.is-selected').count() > 3, 'Constants selects the filled cells')
    const cbar = (await page.locator('[data-statusbar]').innerText()).replace(/\s+/g, ' ')
    ok(/Count \d+/.test(cbar), 'the status bar counts the Content sheet\'s selection', cbar)
    // F4 repeats Bold on the next title; both undo.
    await title.click(); await page.keyboard.press('Control+b'); await page.waitForTimeout(300)
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('F4'); await page.waitForTimeout(800)
    ok(+sql(`select count(*) from sheet_formats where sheet_id='${sheetId}'`) >= +fmt0 + 2, 'F4 repeats Bold on the Content sheet')
    await page.keyboard.press('Control+z'); await page.waitForTimeout(400); await page.keyboard.press('Control+z'); await page.waitForTimeout(800)
    ok(sql(`select count(*) from sheet_formats where sheet_id='${sheetId}'`) === fmt0, 'and both undo')
    // Flash Fill over a full column has nothing to fill and says so.
    await title.click(); await page.keyboard.press('Control+e'); await page.waitForTimeout(300)
    const said = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map(e => e.textContent).join(' | '))
    ok(/Flash Fill/.test(said), 'Ctrl+E answers on the Content sheet (nothing to fill: it says so)')
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]')

    console.log('8. Arabic and a phone')
    await A.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    await at(page, 30, 5)
    const hb = await page.locator('[data-fill-handle]').boundingBox(), cb = await cellOf(page, 30, 5).boundingBox()
    ok(hb && Math.abs(hb.x + hb.width / 2 - cb.x) < 8, 'in Arabic the handle sits at the cell\'s left corner', JSON.stringify({ hb, cb }))
    await axe(page, 'Arabic')
    await A.ctx.addCookies([{ name: 'fluxo-locale', value: 'en', url: BASE }])
    const P = await login(browser, ADMIN, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    await P.page.goto(url); await P.page.waitForSelector('[data-blank-sheet]')
    ok(await P.page.locator('[data-statusbar]').isVisible() && await P.page.locator('[data-sb-zoom]').count() === 0, 'a phone has the status bar without the zoom slider')
    await P.ctx.close()
  } catch (e) {
    fail++; console.log('  ✗ crashed:', e.message.split('\n')[0])
  } finally {
    sql(`delete from sheet_folders where id='${ids.folder}'`)
    sql(`update workspace_settings set fill_lists='${listsBefore.replace(/'/g, "''")}'::jsonb where id=1`)
    await browser.close()
  }
  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
