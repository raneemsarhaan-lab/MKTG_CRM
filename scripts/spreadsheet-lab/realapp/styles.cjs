/**
 * Spec 015 stage 3 (US5: styles, tables, sort, filter, conditional formatting) on the running app.
 *   node scripts/spreadsheet-lab/realapp/styles.cjs [base]
 * Seeds a folder with a small plan, then uses Cell Styles, Format as Table,
 * Sort, Filter and conditional formatting, each with its undo; then the
 * Content sheet (sort and filter inside groups, never on the board), Arabic,
 * a phone and axe. Everything it changes is put back, and the folder is
 * removed at the end.
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

// A plan with a heading row: Task · Status · Due · Budget.
const PLAN = [
  ['Task', 'Status', 'Due', 'Budget'],
  ['Teaser', 'Late', '2026-01-10', '12500'],
  ['Launch post', 'On track', '2099-03-01', '4000'],
  ['Recap video', 'At risk', '2026-02-02', '30000'],
  ['Carousel', 'Late', '2099-01-20', '900'],
  ['Newsletter', 'On track', '2026-03-15', '7000'],
]
function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Styles lab ' || floor(random()*1e6)) returning id`)
  const sheet = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Plan', 0, 60, 26) returning id`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 60) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 26) g`)
  const values = PLAN.flatMap((row, r) => row.map((v, c) => `(${r + 1}, ${c + 1}, '${v}')`)).join(',')
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value) select '${sheet}', r.id, c.id, v.val
       from (values ${values}) as v(rp, cp, val) join sheet_rows r on r.sheet_id='${sheet}' and r.position=v.rp join sheet_cols c on c.sheet_id='${sheet}' and c.position=v.cp`)
  return { folder, sheet }
}
async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, ...opts })
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
const rowsOf = page => page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]')
const cellOf = (page, r, c) => rowsOf(page).nth(r).locator('.fx-sheet-td').nth(c + 1)
const text = async (page, r, c) => (await cellOf(page, r, c).locator('.fx-sheet-cell-text').innerText().catch(() => '')).trim()
const col = async (page, c, n) => { const out = []; for (let r = 0; r < n; r++) out.push(await text(page, r, c)); return out }
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 15000 })
const css = (loc, prop) => loc.evaluate((e, p) => getComputedStyle(e)[p], prop)
const select = async (page, a, b) => { await cellOf(page, a[0], a[1]).click(); await cellOf(page, b[0], b[1]).click({ modifiers: ['Shift'] }) }
const undo = async page => { await page.click('[data-undo]'); await page.waitForTimeout(250) }
const away = page => cellOf(page, 30, 8).click()

;(async () => {
  const ids = seed()
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  const lc = sql(`select id from sheets where linked_key='linked_content'`)
  const lcView = sql(`select view::text from sheets where id='${lc}'`)
  const tasksBefore = sql(`select md5(string_agg(id || name || status || updated_at::text, '|' order by id)) from tasks`)
  try {
    const A = await login(browser, ADMIN), page = A.page
    const url = `${BASE}/sheets/${ids.folder}?sheet=${ids.sheet}`
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]'); await page.waitForSelector('[data-format-bar]')

    console.log('1. Cell styles (FR-030)')
    await select(page, [1, 1], [2, 1])
    await page.click('[data-fmt="cellStyles"]'); await page.waitForSelector('[data-cell-styles]')
    await axe(page, 'Cell Styles gallery')
    await page.click('[data-cell-style="good"]'); await away(page)
    ok(await css(cellOf(page, 1, 1), 'backgroundColor') === 'rgb(198, 239, 206)' && await css(cellOf(page, 2, 1), 'color') === 'rgb(0, 97, 0)', 'Good: green fill, dark green text')
    await select(page, [1, 1], [1, 1]); await page.click('[data-fmt="cellStyles"]'); await page.click('[data-cell-style="normal"]'); await away(page)
    ok(await css(cellOf(page, 1, 1), 'backgroundColor') !== 'rgb(198, 239, 206)', 'Normal clears the look')
    await undo(page); await undo(page)
    ok(await css(cellOf(page, 2, 1), 'backgroundColor') !== 'rgb(198, 239, 206)', 'each one undoes in one step')

    console.log('2. Format as Table (FR-031)')
    await cellOf(page, 2, 1).click()
    await page.click('[data-fmt="table"]'); await page.waitForSelector('[data-table-menu]')
    await axe(page, 'Format as Table gallery')
    await page.click('[data-table-style="medium-0"]'); await away(page)
    ok(await css(cellOf(page, 0, 0), 'backgroundColor') === 'rgb(68, 114, 196)' && await css(cellOf(page, 0, 3), 'color') === 'rgb(255, 255, 255)', 'the block around the cell becomes a table: a blue header row')
    const band1 = await css(cellOf(page, 1, 0), 'backgroundColor'), band2 = await css(cellOf(page, 2, 0), 'backgroundColor')
    ok(band1 !== band2 && band1 !== 'rgba(0, 0, 0, 0)', 'banded rows', `${band1} / ${band2}`)
    ok(await page.locator('[data-filter-btn]').count() === 4, 'filter buttons on the four headings')
    ok(await css(cellOf(page, 5, 0), 'backgroundColor') === band1 && await css(cellOf(page, 6, 0), 'backgroundColor') !== band1, 'it stops at the end of the data')
    await saved(page); await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    ok(await css(cellOf(page, 0, 0), 'backgroundColor') === 'rgb(68, 114, 196)' && await page.locator('[data-filter-btn]').count() === 4, 'still a table after a reload')
    await cellOf(page, 3, 2).click(); await page.click('[data-fmt="table"]'); await page.click('[data-table-style="dark-3"]'); await away(page)
    ok(await css(cellOf(page, 0, 0), 'backgroundColor') !== 'rgb(68, 114, 196)', 'another style changes the table, not a second one')
    await undo(page)

    console.log('3. Sort (FR-045)')
    // A look and a comment on Recap video's budget, to see them move with the row.
    await cellOf(page, 3, 3).click(); await page.click('[data-fmt="b"]'); await saved(page)
    await page.click('[data-fmt="sort"]'); await page.waitForSelector('[data-sort-menu]'); await axe(page, 'Sort & Filter menu')
    await page.click('[data-sort-menu] [role^="menuitem"] >> nth=0'); await page.waitForTimeout(300)
    ok(JSON.stringify(await col(page, 3, 6)) === JSON.stringify(['Budget', '900', '4000', '7000', '12500', '30000']), 'A to Z on Budget: the heading stays, numbers in order')
    ok(await text(page, 5, 0) === 'Recap video' && await css(cellOf(page, 5, 3), 'fontWeight') === '700', 'whole rows move, with their formatting')
    await page.click('[data-fmt="sort"]'); await page.click('[data-sort-menu] [role^="menuitem"] >> nth=2'); await page.waitForSelector('[data-sort-dialog]')
    await axe(page, 'Sort dialog')
    await page.selectOption('[data-sort-col="0"]', { label: 'Status' }); await page.selectOption('[data-sort-dir="0"]', 'desc')
    await page.click('[data-sort-add]'); await page.selectOption('[data-sort-col="1"]', { label: 'Task' })
    await page.click('[data-sort-dialog] [data-ok]'); await page.waitForTimeout(300)
    ok(JSON.stringify(await col(page, 0, 6)) === JSON.stringify(['Task', 'Launch post', 'Newsletter', 'Carousel', 'Teaser', 'Recap video']), 'Custom sort: Status Z to A, then Task', JSON.stringify(await col(page, 0, 6)))
    await undo(page); await undo(page)
    ok(JSON.stringify(await col(page, 0, 6)) === JSON.stringify(PLAN.map(r => r[0])), 'undo puts the rows back', JSON.stringify(await col(page, 0, 6)))
    await saved(page); await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    ok(JSON.stringify(await col(page, 0, 6)) === JSON.stringify(PLAN.map(r => r[0])), 'the order is saved')

    console.log('4. Filter (FR-046)')
    await page.click('[data-filter-btn="' + (await cellOf(page, 0, 1).getAttribute('data-col')) + '"]'); await page.waitForSelector('[data-filter-menu]')
    await axe(page, 'filter menu')
    await page.click('[data-flt-all]'); await page.click('[data-flt-value="Late"]'); await page.click('[data-flt-ok]'); await page.waitForTimeout(300)
    ok(JSON.stringify(await col(page, 0, 3)) === JSON.stringify(['Task', 'Teaser', 'Carousel']), 'only the Late rows show', JSON.stringify(await col(page, 0, 3)))
    ok((await rowsOf(page).nth(2).locator('.fx-sheet-td').first().innerText()).trim() === '5', 'rows keep their own numbers')
    ok(await page.locator('[data-filter-btn].is-on').count() === 1, 'the filtered heading shows it')
    await saved(page); await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    ok(await text(page, 2, 0) === 'Carousel', 'still filtered after a reload')
    const budget = await cellOf(page, 0, 3).getAttribute('data-col')
    await page.click(`[data-filter-btn="${budget}"]`); await page.waitForSelector('[data-filter-menu]')
    await page.selectOption('[data-flt-op]', 'gt'); await page.fill('[data-flt-a]', '1000'); await page.click('[data-flt-ok]'); await page.waitForTimeout(300)
    ok(JSON.stringify(await col(page, 0, 2)) === JSON.stringify(['Task', 'Teaser']), 'and Budget greater than 1,000')
    await page.click('[data-fmt="sort"]'); await page.click('[data-sort-menu] [role^="menuitem"] >> nth=4'); await page.waitForTimeout(300)
    ok(await text(page, 5, 0) === 'Newsletter' && await page.locator('[data-filter-btn]').count() === 4, 'Clear filter brings every row back; the buttons stay')
    await cellOf(page, 0, 0).click(); await page.keyboard.press('Control+Shift+L'); await page.waitForTimeout(300)
    ok(await page.locator('[data-filter-btn]').count() === 0, 'Ctrl+Shift+L turns the filter buttons off')
    await undo(page); await undo(page)
    ok(await page.locator('[data-filter-btn].is-on').count() >= 1 && await text(page, 1, 0) === 'Teaser', 'undo brings the filter back')
    await page.click('[data-fmt="sort"]'); await page.click('[data-sort-menu] [role^="menuitem"] >> nth=4'); await page.waitForTimeout(200)
    // Back to a plain range for the rules.
    await cellOf(page, 1, 0).click(); await page.click('[data-fmt="table"]'); await page.click('[data-table-off]'); await page.waitForTimeout(200)
    ok(await page.locator('[data-filter-btn]').count() === 0 && await css(cellOf(page, 0, 0), 'backgroundColor') !== 'rgb(68, 114, 196)', 'Convert to range removes the table and its buttons')

    console.log('5. Conditional formatting (FR-032)')
    await select(page, [1, 2], [5, 2])
    await page.click('[data-fmt="cond"]'); await page.waitForSelector('[data-cond-menu]'); await axe(page, 'Conditional Formatting menu')
    await page.click('[data-cond-menu] [role^="menuitem"]:has-text("A date occurring")'); await page.waitForSelector('[data-rule-dialog]')
    await axe(page, 'New rule dialog')
    await page.click('[data-rule-dialog] [data-ok]'); await away(page); await page.waitForTimeout(200)
    const red = 'rgb(255, 199, 206)'
    const reds = async () => { const o = []; for (let r = 1; r <= 5; r++) o.push(await css(cellOf(page, r, 2), 'backgroundColor') === red); return o }
    ok(JSON.stringify(await reds()) === JSON.stringify([true, false, true, false, true]), 'past dates turn red', JSON.stringify(await reds()))
    await cellOf(page, 1, 2).click(); await page.keyboard.type('2099-12-31'); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
    ok((await reds())[0] === false, 'the rule follows an edit')
    await undo(page)
    await select(page, [1, 3], [5, 3]); await page.click('[data-fmt="cond"]'); await page.click('[data-cond-menu] [role^="menuitem"]:has-text("Data bars")'); await away(page); await page.waitForTimeout(200)
    const bar = await css(cellOf(page, 3, 3), 'backgroundImage'), small = await css(cellOf(page, 4, 3), 'backgroundImage')
    ok(/linear-gradient/.test(bar) && /100%/.test(bar) && /3%|2%/.test(small), 'data bars: the largest is full, the smallest short')
    await saved(page); await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    ok((await reds())[0] && /linear-gradient/.test(await css(cellOf(page, 3, 3), 'backgroundImage')), 'rules are kept after a reload')
    await cellOf(page, 1, 2).click(); await page.click('[data-fmt="cond"]'); await page.click('[data-cond-menu] [role^="menuitem"]:has-text("Manage rules")'); await page.waitForSelector('[data-rules-dialog]')
    await axe(page, 'Manage rules dialog')
    ok(await page.locator('[data-rule-row]').count() === 2 && /D2:D6/.test(await page.locator('[data-rule-row="0"]').innerText()), 'Manage rules lists both, newest first, with where they apply')
    await page.click('[data-rule-row="0"]'); await page.click('[data-rules-down]'); await page.click('[data-rule-row="0"]'); await page.click('[data-rules-del]'); await page.click('[data-rules-dialog] [data-ok]'); await page.waitForTimeout(200)
    ok(!(await reds())[2] && /linear-gradient/.test(await css(cellOf(page, 3, 3), 'backgroundImage')), 'reorder and delete: the date rule is gone, the bars stay')
    await undo(page)
    ok((await reds())[2], 'undo brings the deleted rule back')
    await page.click('[data-fmt="cond"]'); await page.click('[data-cond-menu] [role^="menuitem"]:has-text("entire sheet")'); await page.waitForTimeout(200)
    ok(!(await reds())[2] && !/linear-gradient/.test(await css(cellOf(page, 3, 3), 'backgroundImage')), 'Clear rules from the entire sheet')

    console.log('6. The Content sheet (FR-075)')
    const content = sql(`select id from sheet_folders where linked_key='content'`)
    const M = await login(browser, MEMBER), mp = M.page
    await mp.goto(`${BASE}/sheets/${content}`); await mp.waitForSelector('[data-linked-pane] .fx-sheet-tr[data-task]')
    const titles = () => mp.evaluate(() => {
      const out = []; let group = []
      for (const tr of document.querySelectorAll('[data-linked-pane] .fx-sheet-tr')) {
        if (tr.matches('[data-task]:not(.fx-content-clip-row)')) group.push(tr.querySelector('[data-col="title"]')?.textContent?.trim() ?? '')
        else if (tr.matches('.fx-content-theme-row, .fx-content-pillar-row, .is-add')) { if (group.length) out.push(group); group = [] }
      }
      if (group.length) out.push(group)
      return out
    })
    const before = await titles()
    await mp.locator('[data-linked-pane] .fx-sheet-tr[data-task]').first().locator('[data-col="title"]').click()
    await mp.click('[data-fmt="sort"]'); await mp.click('[data-sort-menu] [role^="menuitem"] >> nth=1'); await mp.waitForTimeout(500)
    const sorted = await titles()
    const za = g => g.every((x, i) => i === 0 || g[i - 1].localeCompare(x, undefined, { numeric: true, sensitivity: 'base' }) >= 0)
    ok(sorted.length === before.length && sorted.every(za) && sorted.some((g, i) => JSON.stringify(g) !== JSON.stringify(before[i])), 'Z to A sorts the pieces inside each group', `${sorted.length} groups`)
    ok(sql(`select md5(string_agg(id || name || status || updated_at::text, '|' order by id)) from tasks`) === tasksBefore, 'no task changed: the board keeps its order')
    await mp.click('[data-fmt="table"]'); ok(await mp.locator('[data-table-menu] .fx-st-why').count() === 1, 'tables are off here, and say why'); await mp.keyboard.press('Escape')
    await mp.locator('[data-linked-pane] .fx-sheet-tr[data-task]').first().locator('[data-col="title"]').click()
    await mp.keyboard.press('Control+Shift+L'); await mp.waitForTimeout(500)
    ok(await mp.locator('[data-linked-pane] .fx-sheet-th [data-filter-btn]').count() > 3, 'filter buttons on the headings')
    await mp.click('[data-linked-pane] .fx-sheet-th [data-filter-btn="status"]'); await mp.waitForSelector('[data-filter-menu]')
    await axe(mp, 'filter menu on the Content sheet')
    const firstValue = await mp.locator('[data-filter-menu] [data-flt-value]').first().getAttribute('data-flt-value')
    await mp.click('[data-flt-all]'); await mp.click(`[data-flt-value="${firstValue}"]`); await mp.click('[data-flt-ok]'); await mp.waitForTimeout(500)
    const shown = (await titles()).flat().length
    ok(shown > 0 && shown < sorted.flat().length, 'filtered inside groups', `${shown} of ${sorted.flat().length}`)
    await mp.reload(); await mp.waitForSelector('[data-linked-pane] .fx-sheet-tr[data-task]'); await mp.waitForTimeout(800)
    ok((await titles()).flat().length === shown, 'the sort and filter are kept with the sheet')
    ok(sql(`select md5(string_agg(id || name || status || updated_at::text, '|' order by id)) from tasks`) === tasksBefore, 'still no task changed')
    await mp.locator('[data-linked-pane] .fx-sheet-tr[data-task]').first().locator('[data-col="title"]').click()
    await mp.click('[data-fmt="cellStyles"]'); await mp.click('[data-cell-style="bad"]'); await mp.waitForTimeout(400)
    ok(await css(mp.locator('[data-linked-pane] .fx-sheet-tr[data-task]').first().locator('[data-col="title"]'), 'color') === 'rgb(156, 0, 6)', 'cell styles work on a task cell')
    await mp.click('[data-undo]'); await mp.waitForTimeout(500)

    console.log('7. Arabic and a phone')
    const AR = await login(browser, ADMIN)
    await AR.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await AR.page.goto(url); await AR.page.waitForSelector('[data-blank-sheet]')
    await cellOf(AR.page, 1, 3).click(); await AR.page.click('[data-fmt="cond"]'); await AR.page.click('[data-cond-menu] [role^="menuitem"] >> nth=0'); await AR.page.waitForSelector('[data-rule-dialog]')
    await axe(AR.page, 'New rule in Arabic'); await AR.page.keyboard.press('Escape')
    await AR.page.click('[data-fmt="sort"]'); await AR.page.click('[data-sort-menu] [role^="menuitem"] >> nth=2'); await AR.page.waitForSelector('[data-sort-dialog]')
    await axe(AR.page, 'Sort in Arabic'); await AR.page.keyboard.press('Escape')
    const P = await login(browser, ADMIN, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await P.page.goto(url); await P.page.waitForSelector('[data-blank-sheet]')
    await cellOf(P.page, 1, 1).click(); await P.page.click('[data-format-open]'); await P.page.waitForSelector('[data-format-sheet]')
    await P.page.click('[data-phone-tab="styles"]')
    const sb = await P.page.locator('[data-format-sheet] [data-fmt="cs-good"]').boundingBox()
    ok(sb && sb.height >= 44, 'phone: the Styles tab, 44 px targets')
    await axe(P.page, 'Styles tab on a phone')
    await P.page.click('[data-format-sheet] [data-fmt="cs-good"]'); await P.page.waitForTimeout(300)
    ok(await css(cellOf(P.page, 1, 1), 'backgroundColor') === 'rgb(198, 239, 206)', 'phone: a cell style applies')
    await P.page.click('[data-undo]').catch(() => {})

    ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
    sql(`update sheets set view = '${lcView.replace(/'/g, "''")}'::jsonb where id='${lc}'`)
    sql(`delete from sheet_rules where sheet_id='${lc}'`)
    sql(`delete from sheet_folders where id='${ids.folder}'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
