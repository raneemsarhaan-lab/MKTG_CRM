/**
 * Spec 018 (spreadsheet-style sheet header) on the running app, against `next start`.
 *   node scripts/spreadsheet-lab/realapp/header.cjs [base]
 * Seeds a folder with one sheet, then checks the menu bar, the strip (its
 * order, the US1 formatting run, size −/+, the ⋮ overflow), the name box and
 * cell bar, Alt+/ and Ctrl+/, that every old toolbar control can still be
 * reached, the Content sheet, Arabic and axe. Signs in as the workspace admin
 * (read from the database). Everything it makes is removed at the end.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const { tool } = require('./toolbar.cjs')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }
const errors = []

function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Header lab ' || floor(random()*1e6)) returning id`)
  const sheet = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Plan', 0, 30, 8) returning id`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 30) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 8) g`)
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value) select '${sheet}', r.id, c.id, case when c.position = 2 then (r.position * 1250)::text else 'r' || r.position || 'c' || c.position end
       from sheet_rows r cross join sheet_cols c where r.sheet_id='${sheet}' and c.sheet_id='${sheet}' and r.position <= 10 and c.position <= 4`)
  return { folder, sheet }
}
async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], ...opts })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: 'lab-pass-1' } })
  if (!r.ok()) throw new Error(`login: ${r.status()}`)
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
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
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 15000 })
const styleAt = (sheet, r, c) => JSON.parse(sql(`select coalesce((select f.style::text from sheet_formats f join sheet_rows rr on rr.id::text=f.row_key join sheet_cols cc on cc.id::text=f.col_key where f.sheet_id='${sheet}' and rr.position=${r} and cc.position=${c}), '{}')`))
const valueAt = (sheet, r, c) => sql(`select coalesce((select value from sheet_cells x join sheet_rows rr on rr.id=x.row_id join sheet_cols cc on cc.id=x.col_id where x.sheet_id='${sheet}' and rr.position=${r} and cc.position=${c}), '')`)
const nameBox = page => page.locator('[data-namebox]').inputValue()
const toastHas = async (page, re) => { try { await page.waitForFunction(src => new RegExp(src).test(document.querySelector('[data-sheets-toast]')?.textContent ?? ''), re.source, { timeout: 5000 }); return true } catch { return false } }
const pick = async (page, menuAttr, item) => page.click(`[${menuAttr}] [data-item="${item}"]`)

;(async () => {
  const ids = seed()
  const admin = sql(`select email from members where access='admin' order by created_at limit 1`)
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const { page } = await login(browser, admin)
    const url = `${BASE}/sheets/${ids.folder}?sheet=${ids.sheet}`
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]'); await page.waitForSelector('[data-format-bar]')

    console.log('1. Layout (FR-001)')
    ok(await page.locator('[data-menubar][role="menubar"] > [role="menuitem"]').count() === 7, 'a menu bar with File, Edit, View, Insert, Format, Data, Help')
    const order = await page.locator('[data-format-bar] .fx-fmt-g').evaluateAll(gs => gs.map(g => g.dataset.group).join(','))
    ok(order === 'edit,number,font,size,text,cell,align,extra', 'the strip\'s groups are in the familiar order', order)
    const keys = await page.locator('[data-format-bar] [data-fmt]').evaluateAll(bs => bs.map(b => b.dataset.fmt).join(','))
    ok(keys.startsWith('find,undo,redo,painter,cur,pct,decDn,decUp,num,font,sizeDn,size,sizeUp,b,i,s,color,fill,borders,merge,align,valign,wrap,rotate,comment,filter'), 'and the tools inside them', keys.slice(0, 60))
    const h = (await page.locator('[data-format-bar]').boundingBox()).height
    ok(h <= 46, 'one row, rounded', `${h}px`)
    ok(await page.locator('.fx-sh-top [data-board-menu]').count() === 1 && await page.locator('.fx-sh-top [data-comments-btn]').count() === 1, 'Board ▾ and Comments sit in the title row')

    console.log('2. The strip (US1)')
    await cellOf(page, 0, 1).click()
    await tool(page, 'cur'); await pick(page, 'data-cur-menu', 'EGP'); await saved(page)
    await page.click('[data-fmt="decDn"]'); await page.click('[data-fmt="decDn"]'); await saved(page)
    await page.click('[data-fmt="b"]')
    await page.click('[data-fmt="fill"]'); await page.click('[data-color-picker] [data-pick="#FFC000"] >> nth=0')
    await tool(page, 'center')
    await page.click('[data-fmt="valign"]'); await pick(page, 'data-valign-menu', 'middle')
    await page.click('[data-fmt="wrap"]'); await pick(page, 'data-wrap-menu', 'wrap')
    await saved(page)
    const s1 = styleAt(ids.sheet, 1, 2)
    ok(s1.num?.kind === 'currency' && s1.num.dp === 0 && s1.b === true && s1.fill === '#FFC000' && s1.ha === 'center' && s1.va === 'middle' && s1.wrap === true, 'currency, 0 decimals, bold, fill, centre, middle, wrap: all from the strip', JSON.stringify(s1))
    ok((await cellOf(page, 0, 1).innerText()).replace(/\s+/g, ' ').trim() === 'EGP 1,250', 'the cell shows EGP 1,250', await cellOf(page, 0, 1).innerText())
    ok(await page.locator('[data-fmt="align"] svg path').getAttribute('d') === 'M4 6h16M7 10h10M4 14h16M7 18h10', 'the align button shows centre')
    for (let i = 0; i < 8; i++) { await page.click('[data-undo]'); await page.waitForTimeout(150) }
    await saved(page)
    ok(JSON.stringify(styleAt(ids.sheet, 1, 2)) === '{}', 'each step undoes; eight undos clear it all', JSON.stringify(styleAt(ids.sheet, 1, 2)))
    await page.click('[data-fmt="sizeUp"]'); await saved(page)
    ok(styleAt(ids.sheet, 1, 2).size === 11, 'size + makes 11')
    await page.fill('[data-fmt="size"]', '14'); await page.press('[data-fmt="size"]', 'Enter'); await saved(page)
    ok(styleAt(ids.sheet, 1, 2).size === 14, 'typing 14 in the size box makes 14')
    await page.click('[data-fmt="sizeDn"]'); await saved(page)
    ok(styleAt(ids.sheet, 1, 2).size === 13, 'size − makes 13')
    await tool(page, 'fmt'); await page.keyboard.press('Escape')

    console.log('3. The menu bar (US2)')
    await cellOf(page, 0, 0).click()
    await page.click('[data-mb="view"]'); await pick(page, 'data-mb-view', 'freeze'); await pick(page, 'data-freeze-menu', 'freezeTop'); await saved(page)
    ok(sql(`select frozen_rows from sheets where id='${ids.sheet}'`) === '1', 'View › Freeze › 1 row')
    await page.click('[data-undo]'); await saved(page)
    const rows0 = Number(sql(`select count(*) from sheet_rows where sheet_id='${ids.sheet}'`))
    await cellOf(page, 2, 0).click()
    await page.click('[data-mb="insert"]'); await pick(page, 'data-mb-insert', 'rowAbove'); await saved(page)
    ok(Number(sql(`select count(*) from sheet_rows where sheet_id='${ids.sheet}'`)) === rows0 + 1 && (await cellOf(page, 3, 0).innerText()).trim() === 'r3c1' && (await cellOf(page, 2, 0).innerText()).trim() === '', 'Insert › Row above')
    await page.click('[data-undo]'); await saved(page)
    await cellOf(page, 0, 2).click(); await cellOf(page, 2, 2).click({ modifiers: ['Shift'] })
    await page.click('[data-mb="edit"]'); await pick(page, 'data-mb-edit', 'fillDown'); await saved(page)
    ok(valueAt(ids.sheet, 3, 3) === 'r1c3', 'Edit › Fill down')
    await page.click('[data-undo]'); await saved(page)
    await page.click('[data-mb="format"]'); await pick(page, 'data-mb-format', 'cond'); await page.waitForSelector('[data-cond-menu]')
    ok(true, 'Format › Conditional formatting ▸ opens its menu'); await page.keyboard.press('Escape')
    await page.click('[data-mb="data"]'); await pick(page, 'data-mb-data', 'filter'); await saved(page)
    ok(!!sql(`select view->'filterArea' from sheets where id='${ids.sheet}'`) && sql(`select view->>'filterArea' from sheets where id='${ids.sheet}'`) !== '', 'Data › Create a filter')
    await page.click('[data-undo]'); await saved(page)
    await page.click('[data-mb="file"]'); ok(await page.locator('[data-tab-menu]').count() === 1, 'File holds the sheet\'s commands'); await page.keyboard.press('Escape')
    await page.click('[data-mb="data"]'); await pick(page, 'data-mb-data', 'board'); ok(await page.locator('[data-board-items]').count() === 1, 'Data › Board ▸ opens the Board menu'); await page.keyboard.press('Escape')
    await cellOf(page, 0, 0).click(); await page.waitForTimeout(150)
    await page.locator('[data-mb="edit"]').focus(); await page.keyboard.press('ArrowRight')
    ok(await page.evaluate(() => document.activeElement?.dataset.mb) === 'view', 'arrow keys move along the menu bar')
    await page.keyboard.press('ArrowDown'); await page.waitForSelector('[data-mb-view]')
    ok(await page.evaluate(() => document.activeElement?.getAttribute('role')) === 'menuitem', 'Arrow down opens the menu and focuses its first item')
    await page.keyboard.press('Escape')

    console.log('4. Name box and cell bar (US3)')
    await cellOf(page, 7, 1).click(); await cellOf(page, 8, 3).click({ modifiers: ['Shift'] })
    await page.waitForFunction(() => document.querySelector('[data-namebox]')?.value === 'B8:D9' && /6 cells/.test(document.querySelector('[data-selection]')?.textContent ?? ''), null, { timeout: 3000 }).catch(() => {})
    ok(await nameBox(page) === 'B8:D9' && /6 cells/.test(await page.locator('[data-selection]').innerText()), 'the name box reads B8:D9; the count, 6 cells')
    await page.click('[data-namebox]'); await page.keyboard.type('D20'); await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('[data-namebox]')?.value === 'D20', null, { timeout: 3000 }).catch(() => {})
    ok(await nameBox(page) === 'D20' && await page.locator('[data-blank-sheet] .fx-sheet-td.is-active').getAttribute('data-col') === await cellOf(page, 19, 3).getAttribute('data-col'), 'typing D20 jumps there')
    await page.click('[data-namebox]'); await page.keyboard.type('B2:C5'); await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('[data-namebox]')?.value === 'B2:C5', null, { timeout: 3000 }).catch(() => {})
    ok(await nameBox(page) === 'B2:C5', 'a range works too')
    await page.click('[data-namebox]'); await page.keyboard.type('hello'); await page.keyboard.press('Enter')
    ok(await toastHas(page, /isn.t a cell or range/), 'text that isn\'t a cell says so')
    await cellOf(page, 2, 0).click()
    await page.waitForFunction(() => document.querySelector('[data-cellbar]')?.value === 'r3c1', null, { timeout: 3000 }).catch(() => {})
    ok(await page.locator('[data-cellbar]').inputValue() === 'r3c1', 'the cell bar shows the active cell')
    await page.click('[data-cellbar]'); await page.fill('[data-cellbar]', 'From the bar'); await page.keyboard.press('Enter'); await saved(page)
    ok(valueAt(ids.sheet, 3, 1) === 'From the bar', 'editing the cell bar saves the cell')
    ok(await page.evaluate(() => document.activeElement?.classList.contains('is-active')), 'and focus goes back to the grid')
    await page.click('[data-undo]'); await saved(page)
    ok(valueAt(ids.sheet, 3, 1) === 'r3c1', 'one undo puts it back')
    await page.click('[data-cellbar]'); await page.fill('[data-cellbar]', 'nope'); await page.keyboard.press('Escape')
    ok(valueAt(ids.sheet, 3, 1) === 'r3c1' && await page.locator('[data-cellbar]').inputValue() === 'r3c1', 'Escape cancels a cell-bar edit')

    console.log('5. Alt+/ and Ctrl+/')
    await page.keyboard.press('Alt+/'); await page.waitForSelector('[data-menu-search] input')
    await page.keyboard.type('freeze')
    const hits = await page.locator('[data-search-hit]').evaluateAll(bs => bs.map(b => b.dataset.searchHit))
    ok(hits.some(x => /View › Freeze/.test(x)), 'Alt+/ finds "View › Freeze › …"', hits.slice(0, 2).join(' | '))
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+/'); await page.waitForSelector('[data-shortcuts]')
    ok(/Shift\+F8/.test(await page.locator('[data-shortcuts]').innerText()), 'Ctrl+/ lists the keyboard shortcuts')
    await page.keyboard.press('Escape')

    console.log('6. Every old toolbar control can still be reached (SC-002)')
    const old = { paste: 'data-paste-menu', clear: 'data-clear-menu', freeze: 'data-freeze-menu', fmt: 'data-mb-view', fillDn: 'data-mb-edit', cellStyles: 'data-cell-styles', table: 'data-table-menu', cond: 'data-cond-menu', sort: 'data-mb-data', fmtCells: 'data-format-dialog', num: 'data-num-menu', font: 'data-font-menu', merge: 'data-merge-menu', borders: 'data-border-picker', fill: 'data-color-picker', color: 'data-color-picker', rotate: 'data-rotate-menu', cur: 'data-cur-menu' }
    const missing = []
    await cellOf(page, 5, 5).click()
    for (const [k, attr] of Object.entries(old)) {
      // One retry: a dialog closing from the step before can still cover the strip for a moment.
      let found = false
      for (let n = 0; n < 2 && !found; n++) {
        try { await tool(page, k); await page.waitForSelector(`[${attr}]`, { timeout: 3000 }); found = true } catch (err) { if (process.env.LAB_DEBUG) console.log(k, String(err).split('\n').slice(0, 6).join(' / ')); await page.keyboard.press('Escape'); await page.waitForTimeout(600) }
      }
      if (!found) missing.push(k)
      await page.keyboard.press('Escape'); await page.waitForTimeout(150)
      await page.waitForFunction(() => !document.querySelector('[data-format-dialog], .fx-sh-menu, [data-color-picker], [data-border-picker], [data-cell-styles], [data-table-menu]'), null, { timeout: 3000 }).catch(() => {})
    }
    for (const k of ['b', 'i', 's', 'painter', 'pct', 'decUp', 'decDn', 'comment', 'find', 'undo', 'redo', 'align', 'valign', 'wrap']) if (!(await page.locator(`[data-format-bar] [data-fmt="${k}"]`).count())) missing.push(k)
    await page.click('[data-mb="format"]'); await pick(page, 'data-mb-format', 'text'); const tx = await page.locator('[data-text-menu]').innerText(); await page.keyboard.press('Escape')
    if (!/Underline/.test(tx)) missing.push('u')
    await page.click('[data-fmt="align"]'); const al = await page.locator('[data-align-menu]').innerText(); await page.keyboard.press('Escape')
    if (!/indent/i.test(al)) missing.push('indent')
    ok(!missing.length, 'all of them', missing.join(', '))

    console.log('7. A narrow window (FR-003)')
    await page.setViewportSize({ width: 860, height: 760 }); await page.waitForTimeout(400)
    const nh = (await page.locator('[data-format-bar]').boundingBox()).height
    ok(await page.locator('[data-fmt="more"]').isVisible() && nh <= 46, 'groups move under ⋮; the strip stays one row', `${nh}px, hidden: ${await page.locator('[data-format-bar] .fx-fmt-g[hidden]').count()}`)
    await page.click('[data-fmt="more"]')
    ok(await page.locator('[data-more-menu] [role^="menuitem"]').count() >= 2, '⋮ lists the hidden tools')
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1360, height: 860 }); await page.waitForTimeout(400)
    ok(!(await page.locator('[data-fmt="more"]').count()), 'and come back when there is room')

    console.log('8. The Content sheet, Arabic, axe')
    await axe(page, 'header')
    await page.click('[data-mb="format"]'); await axe(page, 'Format menu'); await page.keyboard.press('Escape')
    const content = sql(`select id from sheet_folders where linked_key='content'`)
    await page.goto(`${BASE}/sheets/${content}`); await page.waitForSelector('[data-linked-pane] .fx-sheet-tr[data-task]')
    await page.locator('[data-linked-pane] .fx-sheet-tr[data-task]').first().locator('.fx-sheet-td').nth(1).click()
    ok(await page.locator('[data-format-bar]').count() === 1 && await page.locator('[data-menubar]').count() === 1, 'the Content sheet has the same header')
    ok(await page.locator('[data-namebox]').getAttribute('readonly') !== null && (await nameBox(page)).length > 0, 'its name box names the cell and is read-only')
    await page.click('[data-mb="insert"]'); await pick(page, 'data-mb-insert', 'rowAbove')
    ok(await page.getByText(/right-click/).first().isVisible({ timeout: 3000 }).catch(() => false), 'Insert explains where rows are added here')
    const AR = await login(browser, admin)
    await AR.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await AR.page.goto(url); await AR.page.waitForSelector('[data-blank-sheet]')
    ok(await AR.page.locator('[data-mb="file"]').innerText() === 'ملف', 'Arabic menu names')
    await axe(AR.page, 'header in Arabic')
    await AR.page.click('[data-mb="edit"]'); await axe(AR.page, 'Edit menu in Arabic'); await AR.page.keyboard.press('Escape')

    ok(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
    sql(`delete from sheet_folders where id='${ids.folder}'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
