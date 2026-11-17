/**
 * Spec 020 stage B (US4–US6, power tips) on the running app, against `next start`.
 *   node scripts/spreadsheet-lab/realapp/tips-b.cjs [base]
 * Seeds a team folder with a sheet, then checks quickstart.md Stage B:
 * Ctrl+Shift+1, custom codes (1.3M, ;;;, a refused code), Center Across
 * Selection, a whole-row rule and icon sets, AutoFit; Remove Duplicates on 300
 * rows, Trim, Proper Case, Text→Number and its green corner, Text to Columns,
 * Find ~*, Paste Special › Multiply; Ctrl+T, the Total row, a slicer, the
 * Advanced Filter (in place, and copied to a new sheet), groups (kept after a
 * reload); the status bar's Min and Max; the Content sheet; Arabic and axe.
 * The folder is removed at the end.
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
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Tips B lab ' || floor(random()*1e6)) returning id`)
  const sheet = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Plan', 0, 400, 14) returning id`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 400) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 14) g`)
  const cells = []
  const put = (r, c, v) => cells.push(`(${r + 1}, ${c + 1}, '${String(v).replace(/'/g, "''")}')`)
  // A1:E6, the campaigns; G1 a big number; J1:K3 the Advanced Filter's criteria.
  ;[['Campaign', 'Owner', 'Channel', 'Spend', 'Status'], ['Ramadan', 'Samaa', 'Meta', '1800', 'Live'], ['Eid', 'Hisham', 'TikTok', '650', 'Draft'],
    ['Back to school', 'Islam', 'Google', '2400', 'Live'], ['Launch teaser', 'Raneem', 'Meta', '300', 'Done'], ['Black Friday', 'Roaa', 'Meta', '3100', 'Planned']]
    .forEach((row, r) => row.forEach((v, c) => put(r, c, v)))
  put(0, 6, '1250000'); put(0, 7, '42')
  ;[['Channel', 'Spend'], ['Meta', '>1000'], ['Google', '']].forEach((row, r) => row.forEach((v, c) => { if (v) put(r, 9 + c, v) }))
  put(10, 0, 'Q4 campaign plan')
  // A21:C321: 300 rows, the last 12 repeat the first 12 (whole rows), with untidy names.
  put(20, 0, 'Email'); put(20, 1, 'Name'); put(20, 2, 'City')
  // H22:H25 to split; L22:L24 numbers kept as text; N22:N26 to multiply.
  ;['Samaa Adel, Cairo', 'Islam Saadany, Giza', 'Raneem Sarhan, Cairo', 'Hisham Badawy, Alex'].forEach((v, i) => put(21 + i, 7, v))
  put(22, 8, 'old')
  ;['1,200', '850', '2,050'].forEach((v, i) => put(21 + i, 11, v))
  ;['1.2', '2', 'x', '3.5'].forEach((v, i) => put(21 + i, 13, v))
  put(29, 12, '5* rating'); put(30, 12, 'Q4 plan')
  // Rows 341–344 to group.
  ;['Oct', 'Ramadan', 'Eid', 'Launch', 'Teaser', 'Nov'].forEach((v, i) => put(339 + i, 0, v))
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value)
       select '${sheet}', r.id, k.id, v.val from (values ${cells.join(',')}) as v(rp, cp, val)
       join sheet_rows r on r.sheet_id='${sheet}' and r.position=v.rp join sheet_cols k on k.sheet_id='${sheet}' and k.position=v.cp`)
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value)
       select '${sheet}', r.id, k.id, case k.position when 1 then 'user' || ((r.position::int - 22) % 288) || '@acme.io'
                                                      when 2 then '  name ' || ((r.position::int - 22) % 288) || '   SMITH ' else 'Cairo' end
       from sheet_rows r join sheet_cols k on k.sheet_id='${sheet}' and k.position between 1 and 3
       where r.sheet_id='${sheet}' and r.position between 22 and 321`)
  // L22:L24 carry the Text format (as typed with a leading apostrophe).
  sql(`insert into sheet_formats (sheet_id, row_key, col_key, style)
       select '${sheet}', r.id::text, k.id::text, '{"num":{"kind":"text"}}'::jsonb from sheet_rows r join sheet_cols k on k.sheet_id='${sheet}' and k.position=12
       where r.sheet_id='${sheet}' and r.position between 22 and 24`)
  return { folder, sheet }
}
const rowId = (sheet, r) => sql(`select id from sheet_rows where sheet_id='${sheet}' order by position offset ${r} limit 1`)
const dbCell = (sheet, r, c) => sql(`select coalesce((select value from sheet_cells where sheet_id='${sheet}'
  and row_id=(select id from sheet_rows where sheet_id='${sheet}' order by position offset ${r} limit 1)
  and col_id=(select id from sheet_cols where sheet_id='${sheet}' order by position offset ${c} limit 1)), '')`)
const dbFmt = (sheet, r, c) => sql(`select coalesce((select style::text from sheet_formats where sheet_id='${sheet}'
  and row_key=(select id::text from sheet_rows where sheet_id='${sheet}' order by position offset ${r} limit 1)
  and col_key=(select id::text from sheet_cols where sheet_id='${sheet}' order by position offset ${c} limit 1)), '')`)

async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], ...opts })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: 'lab-pass-1' } })
  if (!r.ok()) throw new Error(`login: ${r.status()}`)
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${e}`))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  await page.addLocatorHandler(page.locator('[data-hours-later]'), async () => { await page.locator('[data-hours-later]').click() })
  return { ctx, page }
}
async function axe(page, name) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run({ exclude: [['aside.fx-sidebar'], ['.fx-tabbar']] }, { resultTypes: ['violations'] })
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id} (${v.nodes.length}): ${v.nodes.map(n => `${n.target.join(' ')} ${n.any?.[0]?.message ?? ''}`).slice(0, 2).join(' ; ')}`)
  })
  ok(res.length === 0, `axe: ${name}`, res.slice(0, 3).join(' | '))
}
const cellOf = (page, r, c) => page.locator(`[data-blank-sheet] .fx-sheet-tr[data-row][aria-rowindex="${r + 2}"]`).locator('.fx-sheet-td').nth(c + 1)
const text = async (page, r, c) => (await cellOf(page, r, c).innerText()).trim()
const letters = c => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const at = async (page, r, c, opts) => { await reach(page, r, c); await cellOf(page, r, c).click(opts) }
async function reach(page, r, c) {
  if (await cellOf(page, r, c).count()) return
  await page.fill('[data-namebox]', `${letters(c)}${r + 1}`); await page.keyboard.press('Enter')
  await cellOf(page, r, c).waitFor()
}
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 15000 })
const typeAt = async (page, r, c, v) => { await reach(page, r, c); await cellOf(page, r, c).click(); await page.keyboard.type(v); await page.keyboard.press('Enter') }
const select = async (page, a, b) => {
  await page.fill('[data-namebox]', `${letters(a[1])}${a[0] + 1}:${letters(b[1])}${b[0] + 1}`); await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}
const mb = async (page, menu, ...path) => {
  await page.click(`[data-mb="${menu}"]`)
  for (const item of path) { await page.locator(`[role="menu"]:visible [role^="menuitem"]:has-text("${item}")`).last().click(); await page.waitForTimeout(80) }
}
/** The Total row's Spend cell (rows above it may be filtered out, so it is found by its label). */
const totalSpend = async page => (await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]:has(.fx-sheet-td [data-total="label"])').locator('.fx-sheet-td').nth(4).innerText()).trim()
const toast = async page => (await page.locator('[data-sheets-toast]').innerText().catch(() => '')).replace(/\s+/g, ' ')

;(async () => {
  const ids = seed()
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const A = await login(browser, ADMIN), page = A.page
    const url = `${BASE}/sheets/${ids.folder}?sheet=${ids.sheet}`
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]'); await page.waitForSelector('[data-format-bar]')

    console.log('1. Formats (US4)')
    await at(page, 1, 3); await page.keyboard.press('Control+Shift+!'); await saved(page)
    ok(JSON.parse(dbFmt(ids.sheet, 1, 3) || '{}').num?.kind === 'number', 'Ctrl+Shift+1 sets Number', dbFmt(ids.sheet, 1, 3))
    ok(await text(page, 1, 3) === '1,800.00', 'shown with two decimals and a separator', await text(page, 1, 3))
    await at(page, 0, 6); await page.keyboard.press('Control+1'); await page.waitForSelector('[data-format-dialog]')
    await page.click('[data-format-dialog] [role="option"]:has-text("Custom")')
    await page.click(`[data-fc-code='#,##0.0,,"M"']`)
    ok((await page.locator('[data-fc-sample]').innerText()).trim() === '1.3M', 'the sample shows 1.3M')
    await axe(page, 'Format Cells › Custom')
    await page.click('[data-format-dialog] [data-ok]'); await saved(page)
    ok(await text(page, 0, 6) === '1.3M' && dbCell(ids.sheet, 0, 6) === '1250000', '#,##0.0,,"M" shows 1.3M; the cell still holds 1250000')
    await at(page, 0, 7); await page.keyboard.press('Control+1'); await page.waitForSelector('[data-format-dialog]')
    await page.click('[data-format-dialog] [role="option"]:has-text("Custom")')
    await page.fill('[data-fc-pattern]', '[Red]0')
    ok(await page.locator('[data-format-dialog] [data-ok]').isDisabled() && await page.locator('[data-fc-why="color"]').count() === 1, 'a code it can\'t read is refused, with why')
    await page.fill('[data-fc-pattern]', ';;;'); await page.click('[data-format-dialog] [data-ok]'); await saved(page)
    ok(await text(page, 0, 7) === '' && dbCell(ids.sheet, 0, 7) === '42', ';;; hides the value; it is still there')
    // Center Across Selection over A11:F11: no merge.
    await select(page, [10, 0], [10, 5]); await page.keyboard.press('Control+1'); await page.waitForSelector('[data-format-dialog]')
    await page.click('[data-fc-tab="alignment"]'); await page.selectOption('[data-fc-ha]', 'across'); await page.click('[data-format-dialog] [data-ok]'); await saved(page)
    const across = await page.locator('[data-across]').first().getAttribute('data-across').catch(() => null)
    const w = await cellOf(page, 10, 0).boundingBox()
    ok(across && +across >= w.width * 5, 'Center Across spans A11:F11', `(${across}px over ${Math.round(w.width)}px cells)`)
    ok(+sql(`select count(*) from sheet_merges where sheet_id='${ids.sheet}'`) === 0, 'and nothing is merged')
    // A whole-row rule: Spend > 1000.
    await select(page, [1, 0], [5, 4])
    await mb(page, 'format', 'Conditional formatting', 'New rule'); await page.waitForSelector('[data-rule-dialog]')
    await page.click('[data-rule-kind="gt"]'); await page.fill('[data-rule-a]', '1000')
    await page.check('[data-rule-row]'); await page.selectOption('[data-rule-col]', { label: 'Column D' })
    await axe(page, 'New rule (whole row)')
    await page.click('[data-rule-dialog] [data-ok]'); await saved(page)
    await at(page, 8, 8)
    const bg = async (r, c) => cellOf(page, r, c).evaluate(el => getComputedStyle(el).backgroundColor)
    ok(await bg(1, 0) !== await bg(2, 0) && await bg(1, 0) === await bg(1, 4), 'rows where Spend > 1,000 take the look across the row', `${await bg(1, 0)} / ${await bg(2, 0)}`)
    // Icon sets.
    await select(page, [1, 3], [5, 3])
    await mb(page, 'format', 'Conditional formatting', 'Icon Sets', '3 Arrows'); await saved(page)
    ok(await page.locator('[data-blank-sheet] [data-cf-icon]').count() === 5, 'Icon Sets › 3 Arrows marks the five numbers')
    ok(await cellOf(page, 5, 3).locator('[data-cf-icon="arrows3:0"]').count() === 1 && await cellOf(page, 4, 3).locator('[data-cf-icon="arrows3:2"]').count() === 1, '3,100 ▲, 300 ▼')
    // AutoFit Column Width from the menu.
    await at(page, 20, 0); await page.keyboard.press('Control+Space'); await page.waitForTimeout(150)
    await mb(page, 'format', 'Cell size', 'AutoFit Column Width'); await saved(page)
    ok(+sql(`select coalesce(width, 0) from sheet_cols where sheet_id='${ids.sheet}' order by position limit 1`) > 100, 'AutoFit Column Width widens A to its longest value')

    console.log('2. Cleanup (US5)')
    await at(page, 21, 0)
    await mb(page, 'data', 'Clean up', 'Remove Duplicates'); await page.waitForSelector('[data-dedupe-dialog]')
    if (!(await page.locator('[data-dedupe-header]').isChecked())) await page.check('[data-dedupe-header]')
    await axe(page, 'Remove Duplicates')
    let t0 = Date.now()
    await page.click('[data-dedupe-dialog] [data-ok]'); await saved(page)
    const took = Date.now() - t0
    ok(/12 duplicate rows found and removed; 288 unique rows remain/.test(await toast(page)), 'Remove Duplicates says 12 removed, 288 remain', `(${took} ms; ${await toast(page)})`)
    ok(dbCell(ids.sheet, 308, 0) === 'user287@acme.io' && dbCell(ids.sheet, 309, 0) === '', 'the unique rows close up')
    await page.click('[data-toast-undo]'); await saved(page)
    ok(dbCell(ids.sheet, 320, 0) === 'user11@acme.io', 'Undo in the note brings every row back')
    await select(page, [21, 1], [320, 1])
    await mb(page, 'data', 'Clean up', 'Trim Spaces and Clean'); await saved(page)
    ok(/300 cells changed/.test(await toast(page)) && dbCell(ids.sheet, 21, 1) === 'name 0 SMITH', 'Trim Spaces and Clean: 300 cells changed', dbCell(ids.sheet, 21, 1))
    await mb(page, 'data', 'Clean up', 'Change Case', 'Proper Case'); await saved(page)
    ok(dbCell(ids.sheet, 21, 1) === 'Name 0 Smith', 'Proper Case', dbCell(ids.sheet, 21, 1))
    await page.keyboard.press('Control+z'); await saved(page)
    ok(dbCell(ids.sheet, 21, 1) === 'name 0 SMITH', 'one undo step')
    // Numbers kept as text: the green corner, then Convert to Number.
    await at(page, 21, 11)
    ok(await cellOf(page, 21, 11).locator('[data-num-text]').count() === 1, 'a number kept as text shows the green corner')
    await page.click('[data-num-text-btn]'); await page.click('[data-cell-menu] [role^="menuitem"]:has-text("Convert to Number")'); await saved(page)
    ok(!/text/.test(dbFmt(ids.sheet, 21, 11)) && await cellOf(page, 21, 11).locator('[data-num-text]').count() === 0, 'Convert to Number drops the Text format')
    await select(page, [22, 11], [23, 11]); await mb(page, 'data', 'Clean up', 'Convert Text to Numbers'); await saved(page)
    ok(/2 cells changed/.test(await toast(page)), 'Convert Text to Numbers on the rest', await toast(page))
    // Text to Columns by comma; I23 holds data, so it asks first.
    await select(page, [21, 7], [24, 7])
    await mb(page, 'data', 'Clean up', 'Text to Columns'); await page.waitForSelector('[data-split-dialog]')
    await page.click('[data-split-next]')
    ok((await page.locator('[data-split-preview]').innerText()).includes('Cairo'), 'the preview splits by comma')
    await axe(page, 'Text to Columns')
    await page.click('[data-split-dialog] [data-ok]'); await page.waitForSelector('[data-split-replace]')
    ok(true, 'data in the next column: "There\'s already data here. Replace it?"')
    await page.click('[data-split-replace] [data-ok]').catch(async () => { await page.click('[data-split-replace] button.is-go, [data-split-replace] button:has-text("Replace")') })
    await saved(page)
    ok(dbCell(ids.sheet, 21, 7) === 'Samaa Adel' && dbCell(ids.sheet, 21, 8) === 'Cairo' && dbCell(ids.sheet, 22, 8) === 'Giza', 'Text to Columns splits into H and I')
    // Find ~*.
    await at(page, 0, 0); await page.keyboard.press('Control+f'); await page.waitForSelector('[data-find-panel]')
    await page.fill('[data-find-what]', '~*'); await page.click('[data-find-next]'); await page.waitForTimeout(300)
    ok(await page.locator('[data-namebox]').inputValue() === 'M30', 'Find ~* finds the literal asterisk', await page.locator('[data-namebox]').inputValue())
    await page.fill('[data-find-what]', 'Q? plan'); await page.click('[data-find-next]'); await page.waitForTimeout(300)
    ok(await page.locator('[data-namebox]').inputValue() === 'M31', '? stands for one character')
    await page.locator('[data-find-panel] header button').click()
    // Paste Special › Multiply by 1000.
    await typeAt(page, 29, 13, '1000'); await at(page, 29, 13); await page.keyboard.press('Control+c')
    await select(page, [21, 13], [25, 13]); await page.keyboard.press('Control+Shift+V'); await page.waitForSelector('[data-paste-special]')
    await page.click('[data-ps-op="mul"]')
    await axe(page, 'Paste Special')
    await page.click('[data-paste-special] [data-ok]')
    await page.waitForFunction(() => /numbers? changed/.test(document.querySelector('[data-sheets-toast]')?.textContent ?? '')); await saved(page)
    ok(JSON.stringify([0, 1, 2, 3].map(i => dbCell(ids.sheet, 21 + i, 13))) === JSON.stringify(['1200', '2000', 'x', '3500']), 'Multiply ×1000: numbers change, text is left', JSON.stringify([0, 1, 2, 3].map(i => dbCell(ids.sheet, 21 + i, 13))))
    ok(/1 cell that isn't a number was left alone/.test(await toast(page)), 'and the note counts it', await toast(page))

    console.log('3. Tables, slicers, Advanced Filter, groups (US6)')
    await at(page, 0, 0); await page.keyboard.press('Control+t'); await page.waitForSelector('[data-create-table]')
    ok(await page.locator('[data-table-ref]').inputValue() === '=$A$1:$E$6', 'Ctrl+T offers the block around the cell', await page.locator('[data-table-ref]').inputValue())
    await page.click('[data-create-table] [data-ok]'); await saved(page)
    ok(+sql(`select count(*) from sheet_tables where sheet_id='${ids.sheet}'`) === 1, 'Create Table makes a table')
    await at(page, 1, 0); await mb(page, 'data', 'Table', 'Total Row'); await saved(page)
    ok(sql(`select totals is not null from sheet_tables where sheet_id='${ids.sheet}'`) === 't' && await text(page, 6, 0) === 'Total', 'Total Row adds a Total row under the table')
    await at(page, 6, 3); await page.click('[data-total-drop]'); await page.click('[data-cell-menu] [role^="menuitem"]:has-text("Sum")'); await saved(page)
    ok((await totalSpend(page)).includes('8,250'), 'its ▾ picks Sum: 8,250', await totalSpend(page))
    await page.keyboard.press('Escape'); await at(page, 1, 0); await mb(page, 'data', 'Table', 'Insert Slicer'); await page.waitForSelector('[data-insert-slicers]')
    await page.check('[data-slicer-col="Channel"]'); await page.click('[data-insert-slicers] [data-ok]'); await saved(page)
    await page.click('[data-slicer="Channel"] [data-slicer-item="Meta"]'); await saved(page)
    ok((await totalSpend(page)).includes('5,200'), 'a slicer click filters to Meta; the total follows', await totalSpend(page))
    await axe(page, 'slicer')
    await page.click('[data-slicer="Channel"] [data-slicer-clear]'); await saved(page)
    ok((await totalSpend(page)).includes('8,250'), 'Clear Filter shows every row again')
    // Advanced Filter in place, then copied (unique) to a new sheet.
    await at(page, 1, 0); await mb(page, 'data', 'Advanced Filter'); await page.waitForSelector('[data-advanced-filter]')
    await page.fill('[data-adv-list]', 'A1:E6'); await page.fill('[data-adv-criteria]', 'J1:K3')
    await axe(page, 'Advanced Filter')
    await page.click('[data-advanced-filter] [data-ok]'); await saved(page)
    const shown = await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').evaluateAll(rs => rs.map(r => r.querySelector('.fx-sheet-td:nth-child(2)')?.textContent?.trim()).slice(0, 6))
    ok(!shown.includes('Eid') && !shown.includes('Launch teaser') && shown.includes('Back to school'), 'in place: Meta over 1,000, or Google', JSON.stringify(shown))
    await mb(page, 'data', 'Advanced Filter'); await page.click('[data-adv-clear]'); await saved(page)
    await mb(page, 'data', 'Advanced Filter'); await page.waitForSelector('[data-advanced-filter]')
    await page.click('[data-adv-action="copy"]'); await page.fill('[data-adv-list]', 'A1:E6'); await page.fill('[data-adv-criteria]', 'J1:K3'); await page.check('[data-adv-unique]')
    await page.click('[data-advanced-filter] [data-ok]')
    await page.waitForFunction(id => document.querySelector('[data-blank-sheet]')?.getAttribute('data-blank-sheet') !== id, ids.sheet, { timeout: 15000 })
    await saved(page); await page.waitForTimeout(800)
    const other = sql(`select id from sheets where folder_id='${ids.folder}' and id<>'${ids.sheet}' limit 1`)
    const copied = other ? sql(`select string_agg(value, '|' order by value) from sheet_cells where sheet_id='${other}' and value in ('Ramadan','Black Friday','Back to school','Eid')`) : ''
    ok(copied === 'Back to school|Black Friday|Ramadan', 'Copy to a new sheet: the three matching rows', copied)
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]')
    // Groups: rows 341–344, Shift+Alt+→, collapse, kept after a reload.
    await select(page, [340, 0], [343, 0]); await page.keyboard.press('Shift+Alt+ArrowRight'); await saved(page)
    ok(/"level": ?1/.test(sql(`select view->'outline' from sheets where id='${ids.sheet}'`)), 'Shift+Alt+→ groups the rows')
    await reach(page, 344, 0); await page.click('[data-ol-toggle]'); await saved(page)
    ok(await page.locator('[data-blank-sheet] .fx-sheet-td:has(> .fx-sheet-cell-text:text-is("Teaser"))').count() === 0, '− collapses them')
    await page.reload(); await page.waitForSelector('[data-blank-sheet]'); await reach(page, 344, 0)
    ok(await page.locator('[data-ol-toggle][aria-expanded="false"]').count() === 1, 'still collapsed after a reload')
    await axe(page, 'groups')
    await page.click('[data-ol-toggle]'); await saved(page)
    ok(await text(page, 341, 0) === 'Eid', '+ expands them')
    await select(page, [340, 0], [343, 0]); await page.keyboard.press('Shift+Alt+ArrowLeft'); await saved(page)
    ok(sql(`select coalesce(view->>'outline', '')  from sheets where id='${ids.sheet}'`) === '', 'Shift+Alt+← ungroups')

    console.log('4. The status bar')
    await select(page, [1, 3], [5, 3]); await page.waitForTimeout(200)
    let bar = (await page.locator('[data-statusbar]').innerText()).replace(/\s+/g, ' ')
    ok(/Average 1,650/.test(bar) && /Count 5/.test(bar) && /Sum 8,250/.test(bar), 'Average, Count and Sum', bar)
    await page.locator('[data-statusbar]').click({ button: 'right' }); await page.waitForSelector('[data-sb-menu]')
    await axe(page, 'Customize Status Bar')
    await page.click('[data-sb-menu] [role^="menuitem"]:has-text("Minimum")')
    await page.locator('[data-statusbar]').click({ button: 'right' }); await page.click('[data-sb-menu] [role^="menuitem"]:has-text("Maximum")')
    bar = (await page.locator('[data-statusbar]').innerText()).replace(/\s+/g, ' ')
    ok(/Min 300/.test(bar) && /Max 3,100/.test(bar), 'Minimum and Maximum switched on', bar)
    await page.reload(); await page.waitForSelector('[data-blank-sheet]'); await select(page, [1, 3], [5, 3]); await page.waitForTimeout(200)
    ok(await page.locator('[data-sb-min]').count() === 1, 'and kept after a reload')

    console.log('5. The Content sheet')
    const contentFolder = sql(`select id from sheet_folders where kind='content' limit 1`)
    if (contentFolder) {
      await page.goto(`${BASE}/sheets/${contentFolder}`); await page.waitForSelector('[data-content-sheet] [data-cell]')
      await page.click('[data-mb="data"]'); await page.waitForTimeout(100)
      const clean = page.locator('[data-mb-data] [role^="menuitem"]:has-text("Clean up")')
      ok(await clean.getAttribute('aria-disabled') === 'true' || await clean.isDisabled(), 'Clean up is a team-sheet tool here (greyed, with why)')
      await page.keyboard.press('Escape')
      await page.locator('[data-content-sheet] [data-cell]').first().click(); await page.keyboard.press('Control+f'); await page.waitForSelector('[data-find-panel]')
      await page.fill('[data-find-what]', '*'); await page.click('[data-find-next]'); await page.waitForTimeout(300)
      ok(/\d+/.test(await page.locator('[data-find-status]').innerText()), 'Find takes wildcards on the Content sheet', await page.locator('[data-find-status]').innerText())
      await page.locator('[data-find-panel] header button').click()
    } else ok(true, 'no Content sheet folder here (skipped)')

    console.log('6. Arabic')
    await A.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]')
    await at(page, 1, 0)
    ok(await page.locator('[data-slicer]').count() === 1, 'the slicer shows in Arabic too')
    await axe(page, 'Arabic')
    await A.ctx.addCookies([{ name: 'fluxo-locale', value: 'en', url: BASE }])
  } catch (e) {
    fail++; console.log('  ✗ crashed:', e.message.split('\n')[0])
  } finally {
    sql(`delete from sheet_folders where id='${ids.folder}'`)
    await browser.close()
  }
  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
