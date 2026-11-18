/**
 * Spec 020 stage C (US7–US8, power tips) on the running app, against `next start`.
 *   node scripts/spreadsheet-lab/realapp/tips-c.cjs [base]
 * Seeds a team folder with three sheets, then checks quickstart.md Stage C:
 * a border drag (cells, formats and comments move as one undo), Ctrl copies,
 * Shift inserts, the right-drag menu with Excel's keys (V values only), a move
 * that would split a merge, Alt+drag onto another sheet's tab, the Content
 * sheet's Stop alert, unlocked input cells on a protected sheet (as a member),
 * Print with the header row repeated, and Paste Special's keys (Ctrl+Alt+V).
 * The folder is removed at the end.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
const ADMIN = sql(`select email from members where access='admin' and password_hash is not null order by created_at limit 1`)
const MEMBER = sql(`select email from members where access<>'admin' and password_hash is not null order by created_at limit 1`)
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }
const errors = []

function sheet(folder, name, pos, rows, cols) {
  const id = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', '${name}', ${pos}, ${rows}, ${cols}) returning id`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${id}', g from generate_series(1, ${rows}) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${id}', g from generate_series(1, ${cols}) g`)
  return id
}
const rid = (s, r) => sql(`select id from sheet_rows where sheet_id='${s}' order by position offset ${r} limit 1`)
const cid = (s, c) => sql(`select id from sheet_cols where sheet_id='${s}' order by position offset ${c} limit 1`)
function put(s, cells) {
  const vals = cells.map(([r, c, v]) => `(${r + 1}, ${c + 1}, '${String(v).replace(/'/g, "''")}')`)
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value)
       select '${s}', r.id, k.id, v.val from (values ${vals.join(',')}) as v(rp, cp, val)
       join sheet_rows r on r.sheet_id='${s}' and r.position=v.rp join sheet_cols k on k.sheet_id='${s}' and k.position=v.cp`)
}
function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Tips C lab ' || floor(random()*1e6)) returning id`)
  const plan = sheet(folder, 'Plan', 0, 60, 14), archive = sheet(folder, 'Archive', 1, 40, 10), printS = sheet(folder, 'Print', 2, 130, 6)
  const cells = []
  ;[['Campaign', 'Owner', 'Channel', 'Spend', 'Status'], ['Ramadan', 'Samaa', 'Meta', '1800', 'Live'], ['Eid', 'Hisham', 'TikTok', '650', 'Draft'],
    ['Back to school', 'Islam', 'Google', '2400', 'Live'], ['Launch teaser', 'Raneem', 'Meta', '300', 'Done'], ['Black Friday', 'Roaa', 'Meta', '3100', 'Planned']]
    .forEach((row, r) => row.forEach((v, c) => cells.push([r, c, v])))
  cells.push([1, 8, 'x'])
  put(plan, cells)
  // B2 is bold and has a comment; D2 has a fill; G2:H3 is merged.
  const admin = sql(`select id from members where email='${ADMIN}'`)
  sql(`insert into sheet_formats (sheet_id, row_key, col_key, style) values ('${plan}', '${rid(plan, 1)}', '${cid(plan, 1)}', '{"b":true}'::jsonb), ('${plan}', '${rid(plan, 1)}', '${cid(plan, 3)}', '{"fill":"#FFC000"}'::jsonb)`)
  sql(`insert into sheet_comments (id, sheet_id, row_key, col_key, author_id, body) values (gen_random_uuid(), '${plan}', '${rid(plan, 1)}', '${cid(plan, 1)}', '${admin}', 'Check the budget')`)
  sql(`insert into sheet_merges (id, sheet_id, top_row, left_col, bottom_row, right_col) values (gen_random_uuid(), '${plan}', '${rid(plan, 1)}', '${cid(plan, 6)}', '${rid(plan, 2)}', '${cid(plan, 7)}')`)
  const pc = [[0, 0, 'Week'], [0, 1, 'Owner'], [0, 2, 'Spend']]
  for (let i = 1; i <= 120; i++) pc.push([i, 0, `W${i}`], [i, 1, ['Samaa', 'Hisham', 'Islam', 'Raneem'][i % 4]], [i, 2, String(100 * i)])
  put(printS, pc)
  return { folder, plan, archive, printS }
}
const dbCell = (s, r, c) => sql(`select coalesce((select value from sheet_cells where sheet_id='${s}' and row_id='${rid(s, r)}' and col_id='${cid(s, c)}'), '')`)
const dbFmt = (s, r, c) => sql(`select coalesce((select style::text from sheet_formats where sheet_id='${s}' and row_key='${rid(s, r)}' and col_key='${cid(s, c)}'), '')`)

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
const letters = c => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const at = async (page, r, c) => { await cellOf(page, r, c).click() }
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 15000 })
const select = async (page, a, b) => { await page.fill('[data-namebox]', `${letters(a[1])}${a[0] + 1}:${letters(b[1])}${b[0] + 1}`); await page.keyboard.press('Enter'); await page.waitForTimeout(150) }
const toast = async page => (await page.locator('[data-sheets-toast]').innerText().catch(() => '')).replace(/\s+/g, ' ')
/** Drag the selection's top border from cell `from` to cell `to` (both in the same spot on the cell). */
async function dragBorder(page, from, to, { button = 'left', keys = [], before } = {}) {
  const a = await cellOf(page, from[0], from[1]).boundingBox(), b = await cellOf(page, to[0], to[1]).boundingBox()
  for (const k of keys) await page.keyboard.down(k)
  await page.mouse.move(a.x + a.width / 2, a.y + 2)
  await page.mouse.down({ button })
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + 8, { steps: 3 })
  if (before) await before()
  await page.mouse.move(b.x + b.width / 2, b.y + 2, { steps: 8 })
  await page.mouse.up({ button })
  for (const k of keys.reverse()) await page.keyboard.up(k)
  await page.waitForTimeout(250)
}

;(async () => {
  const ids = seed()
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const A = await login(browser, ADMIN), page = A.page
    const url = `${BASE}/sheets/${ids.folder}?sheet=${ids.plan}`
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]'); await page.waitForSelector('[data-format-bar]')

    console.log('1. Drag the border (US7)')
    await select(page, [1, 1], [4, 2])
    const b2 = await cellOf(page, 1, 1).boundingBox()
    await page.mouse.move(b2.x + b2.width / 2, b2.y + 2)
    ok(await page.locator('[data-sheet-grid].is-move-edge').count() === 1, 'the pointer turns into the move arrows on the outline')
    let tip = ''
    await dragBorder(page, [1, 1], [8, 1], { before: async () => {
      const e2 = await cellOf(page, 8, 1).boundingBox(); await page.mouse.move(e2.x + e2.width / 2, e2.y + 2, { steps: 4 })
      tip = (await page.locator('[data-fill-tip]').innerText().catch(() => '')).trim()
    } })
    await saved(page)
    ok(tip === 'B9:C12', 'the tip says where it lands', `(${tip})`)
    ok(dbCell(ids.plan, 8, 1) === 'Samaa' && dbCell(ids.plan, 11, 2) === 'Meta' && dbCell(ids.plan, 1, 1) === '', 'B2:C5 moved to B9:C12')
    ok(/"b": ?true/.test(dbFmt(ids.plan, 8, 1)) && dbFmt(ids.plan, 1, 1) === '', 'the bold format went with it')
    ok(+sql(`select count(*) from sheet_comments where sheet_id='${ids.plan}' and row_key='${rid(ids.plan, 8)}' and col_key='${cid(ids.plan, 1)}'`) === 1, 'and so did the comment')
    await page.keyboard.press('Control+z'); await saved(page)
    ok(dbCell(ids.plan, 1, 1) === 'Samaa' && dbCell(ids.plan, 8, 1) === '' && +sql(`select count(*) from sheet_comments where sheet_id='${ids.plan}' and col_key='${cid(ids.plan, 1)}'`) === 1, 'one undo puts it all back')
    // Ctrl copies.
    await select(page, [1, 1], [4, 2])
    await dragBorder(page, [1, 1], [8, 1], { keys: ['Control'] }); await saved(page)
    ok(dbCell(ids.plan, 8, 1) === 'Samaa' && dbCell(ids.plan, 1, 1) === 'Samaa', 'Ctrl+drag copies')
    // Shift inserts: Eid's row (A3:E3) moves in above Black Friday.
    await select(page, [2, 0], [2, 4])
    await dragBorder(page, [2, 0], [5, 0], { keys: ['Shift'] }); await saved(page)
    const colA = [1, 2, 3, 4, 5].map(r => dbCell(ids.plan, r, 0))
    ok(JSON.stringify(colA) === JSON.stringify(['Ramadan', 'Back to school', 'Launch teaser', 'Eid', 'Black Friday']), 'Shift+drag inserts the row between others', JSON.stringify(colA))
    await page.keyboard.press('Control+z'); await saved(page)
    // Right-drag: Excel's menu; V copies the values only.
    await select(page, [1, 3], [5, 3])
    await dragBorder(page, [1, 3], [1, 5], { button: 'right' })
    await page.waitForSelector('[data-cell-menu]')
    ok(await page.locator('[data-cell-menu] [data-item="values"] .fx-ak').innerText() === 'V' && await page.locator('[data-cell-menu] [data-item="link"]').getAttribute('aria-disabled') === 'true', 'the right-drag menu: V underlined, Link Here greyed')
    await axe(page, 'right-drag menu')
    await page.keyboard.press('v'); await saved(page)
    ok(dbCell(ids.plan, 1, 5) === '1800' && dbFmt(ids.plan, 1, 5) === '' && dbCell(ids.plan, 1, 3) === '1800', 'V: Copy Here as Values Only (no fill, the source stays)')
    // A drop onto part of a merge is refused.
    await at(page, 1, 8)
    await dragBorder(page, [1, 8], [2, 7]); await page.waitForTimeout(300)
    ok(/split a merged cell/.test(await toast(page)) && dbCell(ids.plan, 1, 8) === 'x', 'a move that would split a merge is refused', await toast(page))
    // Over data: Excel's question first.
    await select(page, [1, 0], [1, 0])
    await dragBorder(page, [1, 0], [2, 0])
    await page.waitForSelector('[data-move-replace]')
    ok(true, '"There\'s already data here. Do you want to replace it?"')
    await page.click('[data-move-replace] button:not(.is-go)'); await page.waitForTimeout(200)
    ok(dbCell(ids.plan, 2, 0) === 'Eid', 'Cancel leaves it')

    console.log('2. Alt+drag onto another sheet')
    await select(page, [1, 0], [2, 2])
    const a2 = await cellOf(page, 1, 0).boundingBox()
    await page.keyboard.down('Alt')
    await page.mouse.move(a2.x + a2.width / 2, a2.y + 2); await page.mouse.down()
    await page.mouse.move(a2.x + a2.width / 2 + 10, a2.y + 10, { steps: 3 })
    const tab = await page.locator(`[data-sheet-tab="${ids.archive}"]`).boundingBox()
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2, { steps: 8 })
    await page.waitForSelector(`[data-blank-sheet="${ids.archive}"]`)
    await page.waitForTimeout(400)
    const t2 = await cellOf(page, 3, 1).boundingBox()
    await page.mouse.move(t2.x + t2.width / 2, t2.y + 4, { steps: 8 })
    await page.mouse.up(); await page.keyboard.up('Alt')
    await saved(page); await page.waitForTimeout(500); await saved(page)
    ok(dbCell(ids.archive, 3, 1) === 'Ramadan' && dbCell(ids.archive, 4, 3) === 'TikTok', 'the block lands on the Archive sheet where it was dropped', `${dbCell(ids.archive, 3, 1)} / ${dbCell(ids.archive, 4, 3)}`)
    ok(dbCell(ids.plan, 1, 0) === '' && dbCell(ids.plan, 2, 2) === '', 'and leaves Plan')
    await page.keyboard.press('Escape')

    console.log('3. The Content sheet: a value that doesn\'t fit stops the move')
    const contentFolder = sql(`select id from sheet_folders where kind='content' limit 1`)
    if (contentFolder) {
      await page.goto(`${BASE}/sheets/${contentFolder}`); await page.waitForSelector('[data-content-sheet] [data-cell]')
      const titleCell = page.locator('[data-content-sheet] .fx-sheet-tr[data-task]:not(.is-video):not(.fx-content-pillar-row):not(.is-add):not(.is-dropped) .fx-sheet-td[data-col="title"]').first()
      const key = await titleCell.getAttribute('data-row-key')
      const tid = key.replace(/^k:/, ''); const title0 = sql(`select name from tasks where id='${tid}'`)
      await titleCell.click()
      const tb = await titleCell.boundingBox()
      const st = await page.locator(`[data-content-sheet] .fx-sheet-td[data-row-key="${key}"][data-col="status"]`).boundingBox()
      await page.mouse.move(tb.x + tb.width / 2, tb.y + 2); await page.mouse.down()
      await page.mouse.move(tb.x + tb.width / 2 + 10, tb.y + 8, { steps: 3 })
      await page.mouse.move(st.x + st.width / 2, st.y + 2, { steps: 8 }); await page.mouse.up()
      await page.waitForSelector('[data-move-alert]', { timeout: 15000 })
      ok(/Nothing was moved/.test(await page.locator('[data-move-alert]').innerText()), 'Excel\'s Stop alert: the title isn\'t a status', (await page.locator('[data-move-alert] p').innerText()).replace(/\s+/g, ' '))
      await axe(page, 'Stop alert')
      await page.click('[data-move-alert] [data-ok]'); await page.waitForTimeout(800)
      ok(sql(`select name from tasks where id='${tid}'`) === title0, 'and the task keeps its title')
    } else ok(true, 'no Content sheet here (skipped)')

    console.log('4. Locked and unlocked cells (US8)')
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]')
    await select(page, [1, 1], [19, 1]); await page.keyboard.press('Control+1'); await page.waitForSelector('[data-format-dialog]')
    await page.click('[data-fc-tab="protection"]')
    ok(await page.locator('[data-fc-locked]').isChecked(), 'every cell starts Locked')
    await axe(page, 'Format Cells › Protection')
    await page.uncheck('[data-fc-locked]'); await page.click('[data-format-dialog] [data-ok]'); await saved(page)
    ok(/unlocked/.test(dbFmt(ids.plan, 5, 1)), 'B2:B20 unlocked')
    sql(`update sheets set protected_by='${sql(`select id from members where email='${ADMIN}'`)}' where id='${ids.plan}'`)
    const M = await login(browser, MEMBER)
    await M.page.goto(url); await M.page.waitForSelector('[data-blank-sheet]')
    ok(/unlocked cells/.test(await M.page.locator('[data-readonly]').innerText()), 'the lock note says the unlocked cells can be filled in')
    await cellOf(M.page, 3, 1).click(); await M.page.keyboard.type('Z1'); await M.page.keyboard.press('Enter'); await saved(M.page)
    ok(dbCell(ids.plan, 3, 1) === 'Z1', 'a member types in an unlocked cell: saved')
    await cellOf(M.page, 3, 0).click(); await M.page.keyboard.type('Nope'); await M.page.waitForTimeout(400)
    const notes = (await M.page.locator('.fx-sheet-cellnote').allInnerTexts()).join(' | ')
    ok(/protected sheet/.test(notes) && dbCell(ids.plan, 3, 0) === 'Back to school', 'and in a locked one: refused with Excel\'s note', `${notes} / ${dbCell(ids.plan, 3, 0)}`)
    await M.ctx.close()
    sql(`update sheets set protected_by=null where id='${ids.plan}'`)

    console.log('5. Print (Ctrl+P)')
    await page.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.printS}`); await page.waitForSelector('[data-blank-sheet]')
    await at(page, 0, 0); await page.keyboard.press('Control+p'); await page.waitForSelector('[data-print-dialog]')
    ok(/121 rows · 4 pages/.test(await page.locator('[data-print-dialog]').innerText()), 'the dialog counts the pages', (await page.locator('[data-print-dialog] [id$="-b"]').innerText().catch(() => '')))
    ok(await page.locator('[data-print-page="2"] [data-print-repeat]').count() === 1, 'page 2 of the preview repeats the header row')
    await axe(page, 'Print')
    await page.evaluate(() => { window.print = () => { window.__printed = true } })
    await page.click('[data-print-dialog] [data-ok]'); await page.waitForTimeout(400)
    const pr = await page.evaluate(() => ({ printed: !!window.__printed, head: document.querySelectorAll('#fx-print-root thead [data-print-repeat]').length, body: document.querySelectorAll('#fx-print-root tbody tr').length, page: document.querySelector('#fx-print-root style')?.textContent ?? '' }))
    ok(pr.printed && pr.head === 1 && pr.body === 120 && /portrait/.test(pr.page), 'Print: the header row in <thead> (repeated on each page), 120 rows, portrait', JSON.stringify(pr))
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await page.waitForTimeout(200)
    ok(await page.locator('[data-print-dialog]').count() === 0, 'and the dialog closes after printing')

    console.log('6. Paste Special keys (Ctrl+Alt+V)')
    await at(page, 1, 2); await page.keyboard.press('Control+c')
    await at(page, 1, 4); await page.keyboard.press('Control+Alt+v'); await page.waitForSelector('[data-paste-special]')
    await page.keyboard.press('t')
    ok(await page.locator('[data-ps="formats"]').isChecked(), 'Ctrl+Alt+V, then T: Formats')
    await page.keyboard.press('v')
    ok(await page.locator('[data-ps="values"]').isChecked(), 'V: Values')
    await page.keyboard.press('Enter'); await saved(page); await page.waitForTimeout(300); await saved(page)
    ok(dbCell(ids.printS, 1, 4) === '100', 'Enter pastes the values')

    console.log('7. Arabic')
    await A.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]')
    await select(page, [3, 3], [4, 3])
    await dragBorder(page, [3, 3], [3, 5], { button: 'right' }); await page.waitForSelector('[data-cell-menu]')
    ok((await page.locator('[data-cell-menu] [data-item="values"]').innerText()).includes('V'), 'the right-drag menu shows its keys in Arabic too')
    await axe(page, 'Arabic')
    await page.keyboard.press('Escape')
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
