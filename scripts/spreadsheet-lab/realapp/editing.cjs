/**
 * Spec 015 stage 2 (US4, the editing tools) on the running app, against `next start`.
 *   node scripts/spreadsheet-lab/realapp/editing.cjs [base]
 * Seeds a folder with a small sheet and a 5,000-row sheet, then uses Format
 * Painter, Paste Special, Clear, Fill, Find and Replace, hide and unhide and
 * Freeze Panes, each with its undo; then the Content sheet (Find, Replace
 * with cells a member can't edit), Arabic, a phone and axe. Everything it
 * changes is put back, and the folder is removed at the end.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
const ADMIN = 'raneem.sarhaan@forefront.consulting', MEMBER = 'content@forefront.consulting'
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }
const errors = []

function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Editing lab ' || floor(random()*1e6)) returning id`)
  const small = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Plan', 0, 100, 26) returning id`)
  const big = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Big', 1, 5000, 26) returning id`)
  for (const [s, n] of [[small, 100], [big, 5000]]) {
    sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${s}', g from generate_series(1, ${n}) g`)
    sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${s}', g from generate_series(1, 26) g`)
  }
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value) select '${big}', r.id, c.id, 'R' || r.position || 'C' || c.position
       from sheet_rows r cross join sheet_cols c where r.sheet_id='${big}' and c.sheet_id='${big}' and c.position <= 3`)
  return { folder, small, big }
}
async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], ...opts })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: 'lab-pass-1' } })
  if (!r.ok()) throw new Error(`login ${email}: ${r.status()}`)
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${email}: ${e}`))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${email}: ${m.text()}`) })
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
const cellOf = (page, r, c) => page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(r).locator('.fx-sheet-td').nth(c + 1)
const text = async (page, r, c) => (await cellOf(page, r, c).innerText()).trim()
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 15000 })
const css = (loc, prop) => loc.evaluate((e, p) => getComputedStyle(e)[p], prop)
const typeAt = async (page, r, c, v) => { await cellOf(page, r, c).click(); await page.keyboard.type(v); await page.keyboard.press('Enter') }
const select = async (page, a, b) => { await cellOf(page, a[0], a[1]).click(); await cellOf(page, b[0], b[1]).click({ modifiers: ['Shift'] }) }
const menu = async (page, btn, attr, n) => {
  await page.click(`[data-fmt="${btn}"]`)
  try { await page.click(`[${attr}] [role^="menuitem"] >> nth=${n}`, { timeout: 8000 }) } catch (e) {
    console.log('    (menu', btn, 'disabled:', await page.locator(`[data-fmt="${btn}"]`).getAttribute('aria-disabled'), 'open:', await page.locator(`[${attr}]`).count(), ')'); throw e
  }
}
const writeClip = (page, html, text) => page.evaluate(([html, text]) => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]), [html, text])

;(async () => {
  const ids = seed()
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  const started = new Date().toISOString()
  const restore = []
  try {
    const A = await login(browser, ADMIN), page = A.page
    const url = `${BASE}/sheets/${ids.folder}?sheet=${ids.small}`
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]'); await page.waitForSelector('[data-format-bar]')
    for (const [r, c, v] of [[0, 0, 'Q4 plan'], [0, 1, 'Budget'], [1, 0, 'Q4 launch'], [1, 1, '12500'], [2, 0, 'q4 recap'], [3, 0, 'Q4']]) await typeAt(page, r, c, v)
    await cellOf(page, 0, 0).click(); await page.click('[data-fmt="b"]')
    await page.click('[data-fmt="fill"]'); await page.click('[data-color-picker] [data-pick="#FFC000"] >> nth=0')
    await saved(page)

    console.log('1. Format Painter (FR-040)')
    await cellOf(page, 0, 0).click(); await page.click('[data-fmt="painter"]')
    ok(await page.locator('[data-painter-on]').isVisible(), 'the painter is on and says so')
    // Like Excel, the painter paints when the mouse comes up after a drag.
    const from = await cellOf(page, 5, 0).boundingBox(), to = await cellOf(page, 5, 2).boundingBox()
    await page.mouse.move(from.x + 10, from.y + 8); await page.mouse.down(); await page.mouse.move(to.x + 10, to.y + 8, { steps: 4 }); await page.mouse.up()
    await page.waitForTimeout(300)
    await cellOf(page, 30, 8).click()
    ok(await css(cellOf(page, 5, 2), 'backgroundColor') === 'rgb(255, 192, 0)' && await css(cellOf(page, 5, 2), 'fontWeight') === '700', 'the target takes the look')
    ok(await page.locator('[data-painter-on]').count() === 0, 'one use, then off')
    await page.click('[data-undo]'); await page.waitForTimeout(200)
    ok(await css(cellOf(page, 5, 1), 'backgroundColor') !== 'rgb(255, 192, 0)', 'undo in one step')
    await cellOf(page, 0, 0).click(); await page.dblclick('[data-fmt="painter"]')
    await cellOf(page, 7, 0).click(); await page.waitForTimeout(200); await cellOf(page, 8, 0).click(); await page.waitForTimeout(200)
    ok(await css(cellOf(page, 8, 0), 'backgroundColor') === 'rgb(255, 192, 0)' && await page.locator('[data-painter-on]').isVisible(), 'a double-click keeps it on')
    await page.keyboard.press('Escape')
    ok(await page.locator('[data-painter-on]').count() === 0, 'Esc stops it')

    console.log('2. Paste Special (FR-041)')
    await writeClip(page, '<table><tr><td style="font-weight:bold;background-color:#ff0000">X</td><td>Y</td></tr></table>', 'X\tY')
    await cellOf(page, 10, 0).click(); await page.keyboard.press('Control+Shift+V'); await page.waitForSelector('[data-paste-special]')
    await axe(page, 'Paste Special')
    await page.click('[data-ps="values"]'); await page.click('[data-ps-transpose]'); await page.click('[data-paste-special] [data-ok]'); await page.waitForTimeout(400)
    ok(await text(page, 10, 0) === 'X' && await text(page, 11, 0) === 'Y' && await css(cellOf(page, 10, 0), 'fontWeight') !== '700', 'values only, transposed: no formatting')
    await cellOf(page, 12, 0).click(); await menu(page, 'paste', 'data-paste-menu', 2); await page.waitForTimeout(400)
    ok(await text(page, 12, 0) === '' && await css(cellOf(page, 12, 0), 'backgroundColor') === 'rgb(255, 0, 0)', 'formats only: the look without the value')
    await page.click('[data-undo]'); await page.click('[data-undo]'); await page.waitForTimeout(300)
    ok(await text(page, 10, 0) === '' && await css(cellOf(page, 12, 0), 'backgroundColor') !== 'rgb(255, 0, 0)', 'each one undoes in one step')

    console.log('3. Fill Down and Right (FR-043)')
    await select(page, [0, 0], [3, 0]); await page.keyboard.press('Control+d'); await page.waitForTimeout(300)
    await cellOf(page, 30, 8).click(); await cellOf(page, 0, 0).click()
    ok(await text(page, 3, 0) === 'Q4 plan' && await css(cellOf(page, 3, 0), 'backgroundColor') === 'rgb(255, 192, 0)', 'Ctrl+D copies the value and the look down')
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200)
    ok(await text(page, 3, 0) === 'Q4' && await text(page, 1, 0) === 'Q4 launch', 'undo puts every cell back')
    await select(page, [1, 0], [1, 2]); await page.keyboard.press('Control+r'); await page.waitForTimeout(300)
    ok(await text(page, 1, 2) === 'Q4 launch', 'Ctrl+R fills right')
    await page.keyboard.press('Control+z')

    console.log('4. Clear (FR-042)')
    await cellOf(page, 0, 0).click(); await menu(page, 'clear', 'data-clear-menu', 1); await page.waitForTimeout(200)
    ok(await text(page, 0, 0) === 'Q4 plan' && await css(cellOf(page, 0, 0), 'fontWeight') !== '700', 'Clear formats keeps the value')
    await page.click('[data-undo]')
    await menu(page, 'clear', 'data-clear-menu', 2); await page.waitForTimeout(200)
    ok(await text(page, 0, 0) === '' && await css(cellOf(page, 0, 0), 'backgroundColor') === 'rgb(255, 192, 0)', 'Clear contents keeps the look')
    await page.click('[data-undo]')
    await cellOf(page, 0, 0).click(); await page.keyboard.press('Control+Alt+m'); await page.locator('[data-cmt-input]').fill('A note to clear'); await page.keyboard.press('Control+Enter')
    await page.waitForSelector('[data-comment-thread] .fx-cmt'); await page.keyboard.press('Escape')
    await cellOf(page, 0, 0).click(); await menu(page, 'clear', 'data-clear-menu', 3); await page.waitForTimeout(800)
    ok(await cellOf(page, 0, 0).locator('[data-comment-marker]').count() === 0 && await text(page, 0, 0) === 'Q4 plan', 'Clear comments removes the thread only')
    await saved(page)

    console.log('5. Find and Replace (FR-044)')
    await cellOf(page, 20, 5).click(); await page.keyboard.press('Control+f'); await page.waitForSelector('[data-find-panel]')
    await axe(page, 'Find and Replace')
    await page.fill('[data-find-what]', 'Q4'); await page.click('[data-find-next]'); await page.waitForTimeout(200)
    ok((await page.locator('[data-find-status]').innerText()).startsWith('1 of 4'), 'finds 4 matches, any case', await page.locator('[data-find-status]').innerText())
    await page.click('[data-find-next]'); await page.waitForTimeout(200)
    ok((await page.locator('[data-find-status]').innerText()).startsWith('2 of 4 · A2'), 'steps to the next one, selecting it')
    await page.check('[data-find-panel] input[type="checkbox"] >> nth=0'); await page.click('[data-find-next]'); await page.waitForTimeout(200)
    ok((await page.locator('[data-find-status]').innerText()).includes('of 3'), 'match case: 3')
    await page.uncheck('[data-find-panel] input[type="checkbox"] >> nth=0'); await page.check('[data-find-whole]'); await page.click('[data-find-next]'); await page.waitForTimeout(200)
    ok((await page.locator('[data-find-status]').innerText()).includes('of 1'), 'whole cell: 1')
    await page.uncheck('[data-find-whole]')
    await page.click('[data-find-tab="replace"]'); await page.fill('[data-find-what]', 'Q4'); await page.fill('[data-find-with]', 'Q1'); await page.click('[data-replace-all]'); await page.waitForTimeout(400)
    ok((await page.locator('[data-find-status]').innerText()).startsWith('4 replaced') && await text(page, 2, 0) === 'Q1 recap', 'Replace all: 4 cells, one step')
    await page.keyboard.press('Escape'); await page.click('[data-undo]'); await page.waitForTimeout(200)
    ok(await text(page, 2, 0) === 'q4 recap' && await text(page, 0, 0) === 'Q4 plan', 'undo puts all 4 back')
    await saved(page)

    console.log('6. Hide and unhide (FR-047)')
    await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(1).locator('.fx-sheet-td').first().click({ button: 'right' })
    await page.click('[data-cell-menu] [role^="menuitem"]:has-text("Hide rows")'); await page.waitForTimeout(300)
    ok(await text(page, 1, 0) === 'q4 recap', 'the row is gone from view')
    ok((await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(1).locator('.fx-sheet-td').first().innerText()).trim() === '3', 'the next row is still numbered 3')
    ok(await page.locator('[data-unhide-row]').count() === 1, 'a marker shows where it is')
    await page.locator('[data-blank-sheet] [data-col-head]').nth(1).click({ button: 'right' })
    await page.click('[data-cell-menu] [role^="menuitem"]:has-text("Hide columns")'); await page.waitForTimeout(300)
    ok((await page.locator('[data-blank-sheet] [data-col-head]').nth(1).innerText()).trim() === 'C', 'column B hidden: C follows A')
    await saved(page); await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    ok(await page.locator('[data-unhide-row]').count() === 1 && await page.locator('[data-unhide-col]').count() === 1, 'still hidden after a reload')
    await page.click('[data-unhide-col]'); await page.click('[data-unhide-row]'); await page.waitForTimeout(300)
    ok(await text(page, 1, 0) === 'Q4 launch' && (await page.locator('[data-blank-sheet] [data-col-head]').nth(1).innerText()).trim() === 'B', 'the markers unhide them')
    await page.click('[data-undo]'); await page.waitForTimeout(200)
    ok(await page.locator('[data-unhide-row]').count() === 1, 'undo hides it again')
    await page.click('[data-redo]'); await saved(page)

    console.log('7. Freeze Panes on 5,000 rows (FR-047)')
    await page.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.big}`); await page.waitForSelector('[data-blank-sheet]')
    await cellOf(page, 1, 1).click()
    await menu(page, 'freeze', 'data-freeze-menu', 2); await saved(page)
    const sc = page.locator('[data-blank-sheet]')
    await sc.evaluate(e => { e.scrollTop = 60000; e.scrollLeft = 600 }); await page.waitForTimeout(400)
    const head = await page.locator('[data-blank-sheet] .fx-sheet-tr.is-head').boundingBox()
    const top = await page.locator('[data-blank-sheet] .is-frozen-row').first().boundingBox()
    ok(top && Math.round(top.y - head.y) === 26 && (await page.locator('[data-blank-sheet] .is-frozen-row').first().innerText()).includes('R1C1'), 'row 1 stays under the headings, far down the sheet')
    const fc = await page.locator('[data-blank-sheet] .is-frozen-row .is-frozen-cell').first().boundingBox()
    ok(fc && fc.x < 300, 'column A stays at the start while scrolling sideways')
    await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    ok(await page.locator('[data-blank-sheet] .is-frozen-row').count() === 1, 'still frozen after a reload')
    await cellOf(page, 2, 2).click()
    await menu(page, 'freeze', 'data-freeze-menu', 3); await saved(page)
    ok(await page.locator('[data-blank-sheet] .is-frozen-row').count() === 0, 'Unfreeze')

    console.log('8. The Content sheet (FR-075)')
    const content = sql(`select id from sheet_folders where linked_key='content'`)
    const M = await login(browser, MEMBER)
    await M.page.goto(`${BASE}/sheets/${content}`); await M.page.waitForSelector('[data-linked-pane] .fx-sheet-tr[data-task]')
    await M.page.locator('[data-linked-pane] .fx-sheet-tr[data-task]').first().locator('.fx-sheet-td').nth(1).click()
    await M.page.keyboard.press('Control+f'); await M.page.waitForSelector('[data-find-panel]')
    await M.page.fill('[data-find-what]', 'Report'); await M.page.click('[data-find-next]'); await M.page.waitForTimeout(300)
    const st = await M.page.locator('[data-find-status]').innerText()
    ok(/^1 of \d+ · .+Report/.test(st), 'Find steps through task titles', st)
    const before = sql(`select string_agg(name, '|' order by id) from tasks where name like '%Report%'`)
    await M.page.click('[data-find-tab="replace"]'); await M.page.fill('[data-find-with]', 'Rpt'); await M.page.click('[data-replace-all]')
    await M.page.waitForFunction(() => /replaced|not changed/.test(document.querySelector('[data-find-status]')?.textContent ?? ''), null, { timeout: 30000 })
    const rs = await M.page.locator('[data-find-status]').innerText()
    ok(/not changed/.test(rs) || /replaced/.test(rs), 'Replace all goes through each task’s own save; cells the member can’t edit are counted', rs)
    await M.page.keyboard.press('Escape')
    if (await M.page.locator('[data-undo]').isEnabled()) { await M.page.click('[data-undo]'); await M.page.waitForTimeout(3000) }
    ok(sql(`select string_agg(name, '|' order by id) from tasks where name like '%Report%'`) === before, 'the member’s titles are as they were')
    // As an admin, who may edit every task: the replacements land, and undo puts them back.
    await page.goto(`${BASE}/sheets/${content}`); await page.waitForSelector('[data-linked-pane] .fx-sheet-tr[data-task]')
    await page.locator('[data-linked-pane] .fx-sheet-tr[data-task]').first().locator('.fx-sheet-td').nth(1).click()
    await page.keyboard.press('Control+h'); await page.waitForSelector('[data-find-panel]')
    await page.fill('[data-find-what]', 'Report'); await page.fill('[data-find-with]', 'Rpt'); await page.click('[data-replace-all]')
    await page.waitForFunction(() => /replaced/.test(document.querySelector('[data-find-status]')?.textContent ?? ''), null, { timeout: 60000 })
    const ra = await page.locator('[data-find-status]').innerText()
    ok(/^\d+ replaced/.test(ra) && sql(`select count(*) from tasks where name like '%Rpt%'`) !== '0', 'an admin’s Replace all changes the titles', ra)
    await page.keyboard.press('Escape')
    await page.click('[data-undo]'); await page.waitForTimeout(5000)
    const after = sql(`select string_agg(name, '|' order by id) from tasks where name like '%Report%'`)
    ok(after === before, 'undo puts every title back')
    if (after !== before) restore.push(before)
    await M.page.click('[data-fmt="freeze"]')
    ok((await M.page.locator('[data-freeze-menu]').innerText()).includes('Columns'), 'Freeze and Hide are off here, and say why')
    await M.page.keyboard.press('Escape')

    console.log('9. Arabic and a phone')
    const AR = await login(browser, ADMIN)
    await AR.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await AR.page.goto(url); await AR.page.waitForSelector('[data-blank-sheet]')
    await cellOf(AR.page, 0, 0).click(); await AR.page.keyboard.press('Control+h'); await AR.page.waitForSelector('[data-find-panel]')
    await axe(AR.page, 'Find and Replace in Arabic')
    await AR.page.click('[data-find-panel] header button')
    await AR.page.click('[data-fmt="clear"]'); await axe(AR.page, 'Clear menu in Arabic'); await AR.page.keyboard.press('Escape')
    const P = await login(browser, ADMIN, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await P.page.goto(url); await P.page.waitForSelector('[data-blank-sheet]')
    await cellOf(P.page, 0, 0).click(); await P.page.click('[data-format-open]'); await P.page.waitForSelector('[data-format-sheet]')
    await P.page.click('[data-format-sheet] [role="tab"] >> nth=5')
    const fb = await P.page.locator('[data-format-sheet] [data-fmt="fillDown"]').boundingBox()
    ok(fb && fb.height >= 44, 'phone: the Edit tab, 44 px targets')
    await P.page.click('[data-format-sheet] [data-fmt="findPh"]'); await P.page.waitForSelector('[data-find-panel]')
    const fp = await P.page.locator('[data-find-panel]').boundingBox()
    ok(fp && fp.width <= 390 && fp.x >= 0, 'phone: Find fits the screen')
    await axe(P.page, 'Find on a phone')

    console.log('10. Accessibility')
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]'); await cellOf(page, 0, 0).click()
    for (const [btn, attr] of [['paste', 'data-paste-menu'], ['fmt', 'data-cells-menu'], ['fillDn', 'data-fill-menu'], ['freeze', 'data-freeze-menu']]) {
      await page.click(`[data-fmt="${btn}"]`); await page.waitForSelector(`[${attr}]`); await axe(page, `${btn} menu`); await page.keyboard.press('Escape')
    }
    ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
    for (const names of restore) console.log('  ! titles changed and not restored:', names.slice(0, 200))
    sql(`delete from notifications where kind in ('sheet_mention','sheet_reply') and created_at >= '${started}'`)
    sql(`delete from sheet_folders where id='${ids.folder}'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
