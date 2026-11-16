/**
 * Spec 017 (select separate cells with Ctrl+click) on the running app, against `next start`.
 *   node scripts/spreadsheet-lab/realapp/areas.cjs [base]
 * Seeds a folder with a small sheet and a 2,000-row sheet, then checks the
 * gestures, formats, clears, Ctrl+Enter, copy/cut/paste rules, the one-area
 * tools, the row menu, Shift+F8, the Content sheet and the 100-area timing.
 * Signs in as the workspace admin (read from the database). Everything it
 * makes is removed at the end.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const path = require('path'), os = require('os')
// The pure helpers, compiled from src on the fly.
const selOut = path.join(os.tmpdir(), `sheet-selection-${process.pid}.cjs`)
require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../../../src/lib/sheet-selection.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: selOut, logLevel: 'silent' })
const sel = require(selOut)
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }
const errors = []
const mod = 'Control'

function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Areas lab ' || floor(random()*1e6)) returning id`)
  const small = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Plan', 0, 40, 10) returning id`)
  const big = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Big', 1, 2000, 10) returning id`)
  for (const [s, n] of [[small, 40], [big, 2000]]) {
    sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${s}', g from generate_series(1, ${n}) g`)
    sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${s}', g from generate_series(1, 10) g`)
  }
  // r1c1 … r10c6 (1-based) in the small sheet.
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value) select '${small}', r.id, c.id, 'r' || r.position || 'c' || c.position
       from sheet_rows r cross join sheet_cols c where r.sheet_id='${small}' and c.sheet_id='${small}' and r.position <= 10 and c.position <= 6`)
  return { folder, small, big }
}
async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: 'lab-pass-1' } })
  if (!r.ok()) throw new Error(`login: ${r.status()}`)
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return { ctx, page }
}
const cellOf = (page, r, c) => page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(r).locator('.fx-sheet-td').nth(c + 1)
const rowNo = (page, r) => page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(r).locator('.fx-sheet-td').first()
const letter = (page, c) => page.locator('[data-blank-sheet] .fx-sheet-th.is-letter').nth(c)
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 15000 })
const status = async page => (await page.locator('[data-selection]').innerText()).replace(/\s+/g, ' ').trim()
/** The status line settles a frame after the click: wait (up to 3 s) for it to match. */
const statusIs = async (page, re) => { try { await page.waitForFunction(src => new RegExp(src).test((document.querySelector('[data-selection]')?.textContent ?? '').replace(/\s+/g, ' ')), re.source, { timeout: 3000 }) } catch {} return re.test(await status(page)) }
const statusNot = async (page, re) => { try { await page.waitForFunction(src => !new RegExp(src).test(document.querySelector('[data-selection]')?.textContent ?? ''), re.source, { timeout: 3000 }) } catch {} return !re.test(await status(page)) }
const nSel = page => page.locator('[data-blank-sheet] .fx-sheet-td.is-selected, [data-blank-sheet] .fx-sheet-td.is-anchor').count()
/** True once the workbook's toast says this. */
const toastHas = async (page, re) => { try { await page.waitForFunction(src => new RegExp(src).test(document.querySelector('[data-sheets-toast]')?.textContent ?? ''), re.source, { timeout: 5000 }); return true } catch { return false } }
const cellsWith = (sheet, v) => Number(sql(`select count(*) from sheet_cells where sheet_id='${sheet}' and value='${v}'`))
const valueAt = (sheet, r, c) => sql(`select coalesce((select value from sheet_cells x join sheet_rows rr on rr.id=x.row_id join sheet_cols cc on cc.id=x.col_id where x.sheet_id='${sheet}' and rr.position=${r} and cc.position=${c}), '')`)
const bolds = sheet => Number(sql(`select count(*) from sheet_formats where sheet_id='${sheet}' and style->>'b'='true'`))
async function ctrlDrag(page, a, b) {
  await page.keyboard.down(mod)
  await cellOf(page, a[0], a[1]).hover(); await page.mouse.down()
  await cellOf(page, b[0], b[1]).hover(); await page.mouse.up()
  await page.keyboard.up(mod)
}
/** B2, E5 and B8:D9 (0-based rows and columns). */
async function threeAreas(page) {
  await cellOf(page, 1, 1).click()
  await cellOf(page, 4, 4).click({ modifiers: [mod] })
  await ctrlDrag(page, [7, 1], [8, 3])
}

;(async () => {
  console.log('0. Pure helpers')
  const A3 = [{ r0: 1, c0: 1, r1: 1, c1: 1 }, { r0: 4, c0: 4, r1: 4, c1: 4 }, { r0: 7, c0: 1, r1: 8, c1: 3 }]
  ok(sel.unionSize(A3) === 8, 'unionSize counts 8 cells')
  ok(sel.unionSize([...A3, { r0: 7, c0: 1, r1: 7, c1: 1 }]) === 8, 'overlaps count once')
  ok(sel.subtract([{ r0: 0, c0: 0, r1: 2, c1: 2 }], { r0: 1, c0: 1, r1: 1, c1: 1 }).length === 4 && sel.unionSize(sel.subtract([{ r0: 0, c0: 0, r1: 2, c1: 2 }], { r0: 1, c0: 1, r1: 1, c1: 1 })) === 8, 'taking the middle out leaves 4 pieces, 8 cells')
  ok(sel.copyLayout([{ r0: 1, c0: 3, r1: 3, c1: 3 }, { r0: 1, c0: 1, r1: 3, c1: 1 }])?.kind === 'rows', 'same rows copy side by side')
  ok(sel.copyLayout([{ r0: 5, c0: 1, r1: 6, c1: 2 }, { r0: 1, c0: 1, r1: 2, c1: 2 }])?.kind === 'cols', 'same columns stack')
  ok(sel.copyLayout(A3) === null, 'areas that don\'t line up can\'t copy')
  ok(sel.areaLabel({ r0: 0, c0: 2, r1: 39, c1: 2 }, 40, 10) === 'C:C' && sel.areaLabel({ r0: 2, c0: 0, r1: 4, c1: 9 }, 40, 10) === '3:5', 'whole columns and rows are named C:C and 3:5')

  const ids = seed()
  const admin = sql(`select email from members where access='admin' order by created_at limit 1`)
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const { page } = await login(browser, admin)
    await page.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.small}`)
    await page.waitForSelector('[data-blank-sheet]'); await page.waitForSelector('[data-format-bar]')

    console.log('1. Pick separate cells and blocks (US1)')
    await threeAreas(page)
    ok(await nSel(page) === 8, 'Ctrl+click and Ctrl+drag: 8 cells in 3 areas show as selected', String(await nSel(page)))
    ok(await statusIs(page, /B2, E5, B8:D9 · 3 areas, 8 cells/), 'the status names the areas and counts the cells', await status(page))
    ok(await page.locator('[data-blank-sheet] .fx-sheet-th.is-letter.is-sel-head').count() === 4, 'letters B, C, D, E light up')
    await cellOf(page, 7, 2).click({ modifiers: [mod] })
    ok(await nSel(page) === 7, 'Ctrl+click on a selected cell takes just that cell out', String(await nSel(page)))
    await ctrlDrag(page, [8, 1], [8, 3])
    ok(await statusIs(page, /B2, E5, B8, D8 \+1 more · 4 areas, 4 cells|4 areas, 4 cells/), 'Ctrl+drag over selected cells takes the block out', await status(page))
    await cellOf(page, 5, 5).click({ modifiers: ['Shift'] })
    ok(await statusIs(page, /^B2, E5, B8 \+1 more · 4 areas/), 'Shift+click resizes only the newest area', await status(page))
    await cellOf(page, 0, 0).click()
    ok(await statusIs(page, /^A1$/) && await nSel(page) === 0, 'a plain click goes back to one cell', await status(page))
    await letter(page, 6).click({ modifiers: [mod] })
    ok(await statusIs(page, /A1, G:G · 2 areas, 41 cells/), 'Ctrl+click on a letter adds the whole column', await status(page))
    await page.keyboard.press('Control+a')
    ok(await statusNot(page, /areas/), 'Ctrl+A makes one area', await status(page))

    console.log('2. Change every area at once (US2)')
    const b0 = bolds(ids.small)
    await threeAreas(page)
    await page.click('[data-fmt="b"]'); await saved(page)
    ok(bolds(ids.small) - b0 === 8, 'Bold changes the 8 selected cells, and only them', String(bolds(ids.small) - b0))
    await page.keyboard.press('Control+z'); await saved(page)
    ok(bolds(ids.small) === b0, 'one undo reverts all 8')
    await threeAreas(page)
    await page.keyboard.press('Delete'); await saved(page)
    ok(valueAt(ids.small, 2, 2) === '' && valueAt(ids.small, 5, 5) === '' && valueAt(ids.small, 9, 4) === '' && valueAt(ids.small, 2, 3) === 'r2c3', 'Delete clears every area, nothing else')
    await page.keyboard.press('Control+z'); await saved(page)
    ok(valueAt(ids.small, 2, 2) === 'r2c2' && valueAt(ids.small, 9, 4) === 'r9c4', 'one undo brings every cell back')
    await cellOf(page, 11, 0).click(); await cellOf(page, 11, 2).click({ modifiers: [mod] }); await cellOf(page, 13, 4).click({ modifiers: [mod] })
    await page.keyboard.type('done'); await page.keyboard.press('Control+Enter'); await saved(page)
    ok(cellsWith(ids.small, 'done') === 3, 'type, then Ctrl+Enter fills every selected cell', String(cellsWith(ids.small, 'done')))
    await page.keyboard.press('Control+z'); await saved(page)
    ok(cellsWith(ids.small, 'done') === 0, 'one undo empties them again')

    console.log('3. Copy and paste (US3)')
    await cellOf(page, 1, 1).click(); await cellOf(page, 3, 1).click({ modifiers: ['Shift'] })
    await ctrlDrag(page, [1, 3], [3, 3])
    await page.keyboard.press('Control+c')
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    ok(clip.trim().split(/\r?\n/).length === 3 && clip.split(/\r?\n/)[0].split('\t').join(',') === 'r2c2,r2c4', 'areas over the same rows copy side by side', JSON.stringify(clip.slice(0, 40)))
    await threeAreas(page)
    await page.keyboard.press('Control+c')
    ok(await toastHas(page, /can.t be copied together/), 'areas that don\'t line up say why they can\'t copy')
    await page.keyboard.press('Control+x')
    ok(await toastHas(page, /Cut works on one area/), 'Cut with several areas says it needs one')
    await page.evaluate(() => navigator.clipboard.writeText('Z'))
    await cellOf(page, 19, 0).click(); await cellOf(page, 21, 2).click({ modifiers: [mod] })
    await page.keyboard.press('Control+v'); await saved(page)
    ok(cellsWith(ids.small, 'Z') === 2, 'one copied cell pastes into every area', String(cellsWith(ids.small, 'Z')))
    await page.evaluate(() => navigator.clipboard.writeText('a\tb\nc\td'))
    await page.keyboard.press('Control+v')
    ok(await toastHas(page, /pastes into one area/), 'a copied block onto several areas says why not')

    console.log('4. Tools that need one area (US4)')
    await threeAreas(page)
    await page.click('[data-fmt="sort"]')
    ok(await page.locator('[data-sort-menu] [role^="menuitem"]').first().getAttribute('aria-disabled') === 'true' || await page.locator('[data-sort-menu] [role^="menuitem"]').first().isDisabled(), 'Sort is off')
    ok(/Works on one area/.test(await page.locator('[data-sort-menu]').innerText()), 'and says why')
    await page.keyboard.press('Escape')
    await page.locator('[data-blank-sheet] .fx-sheet-td.is-active').focus()
    await page.waitForFunction(() => document.activeElement?.matches('.fx-sheet-td.is-active'))
    await page.keyboard.press('Control+d')
    ok(await toastHas(page, /Works on one area/), 'Ctrl+D says it needs one area')
    await cellOf(page, 4, 4).click({ button: 'right' })
    const cm = page.locator('[data-cell-menu]')
    await cm.waitFor()
    ok(/Works on one area/.test(await cm.innerText()) && /Select whole rows/.test(await cm.innerText()), 'the cell menu explains Cut, Insert and Delete rows')
    await page.keyboard.press('Escape')

    console.log('5. Whole rows across areas')
    const rows0 = Number(sql(`select count(*) from sheet_rows where sheet_id='${ids.small}'`))
    await rowNo(page, 14).click(); await rowNo(page, 16).click({ modifiers: [mod] })
    await rowNo(page, 16).click({ button: 'right' })
    await page.locator('[data-cell-menu] [role^="menuitem"]', { hasText: 'Delete 2 rows' }).click(); await saved(page)
    ok(Number(sql(`select count(*) from sheet_rows where sheet_id='${ids.small}'`)) === rows0 - 2, 'Delete 2 rows removes both selected rows')
    await page.keyboard.press('Control+z'); await saved(page)
    ok(Number(sql(`select count(*) from sheet_rows where sheet_id='${ids.small}'`)) === rows0, 'one undo brings both back')

    console.log('6. Keyboard: Shift+F8 (US5)')
    await cellOf(page, 24, 0).click()
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+F8')
    ok(await statusIs(page, /Add to selection/), 'Shift+F8 says Add to selection')
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Escape')
    ok(await statusIs(page, /^A25:B25, D25:D26 · 2 areas, 4 cells$/), 'arrows keep the first area, Shift+arrows add a second; Esc ends it', await status(page))
    await page.click('[data-fmt="b"]'); await saved(page)
    ok(bolds(ids.small) - b0 === 4, 'and the keyboard-made areas take Bold')
    await page.keyboard.press('Control+z'); await saved(page)

    console.log('7. The Content sheet')
    const content = sql(`select id from sheet_folders where linked_key='content'`)
    await page.goto(`${BASE}/sheets/${content}`); await page.waitForSelector('[data-linked-pane] .fx-sheet-tr[data-task]')
    const rows = page.locator('[data-linked-pane] .fx-sheet-tr[data-task]')
    await rows.nth(0).locator('.fx-sheet-td').nth(1).click()
    await rows.nth(2).locator('.fx-sheet-td').nth(1).click({ modifiers: [mod] })
    ok(await page.locator('[data-linked-pane] .fx-sheet-td.is-selected, [data-linked-pane] .fx-sheet-td.is-anchor').count() === 2, 'Ctrl+click works on the Content sheet too')
    await page.click('[data-fmt="sort"]')
    ok(/Works on one area/.test(await page.locator('[data-sort-menu]').innerText()), 'and its one-area tools say why')
    await page.keyboard.press('Escape')

    console.log('8. 100 areas on 2,000 rows (SC-003)')
    await page.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.big}`); await page.waitForSelector('[data-blank-sheet]')
    await cellOf(page, 0, 0).click()
    for (let i = 1; i < 100; i++) await cellOf(page, i % 20, 1 + Math.floor(i / 20)).click({ modifiers: [mod] })
    ok(await statusIs(page, /100 areas/), '100 areas', await status(page))
    const ms = await page.evaluate(() => new Promise(res => {
      const el = document.querySelectorAll('[data-blank-sheet] .fx-sheet-tr[data-row]')[21].querySelectorAll('.fx-sheet-td')[8]
      const t0 = performance.now()
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }))
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0)))
    }))
    ok(await toastHas(page, /up to 100 areas/), 'the 101st says the limit')
    await cellOf(page, 0, 0).click()
    for (let i = 1; i < 99; i++) await cellOf(page, i % 20, 1 + Math.floor(i / 20)).click({ modifiers: [mod] })
    const ms2 = await page.evaluate(() => new Promise(res => {
      const el = document.querySelectorAll('[data-blank-sheet] .fx-sheet-tr[data-row]')[22].querySelectorAll('.fx-sheet-td')[8]
      const t0 = performance.now()
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }))
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0)))
    }))
    ok(ms2 < 50 + 34, `the 100th area shows quickly`, `${Math.round(ms2)} ms incl. two frames; cap ${Math.round(ms)} ms`)

    ok(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
    sql(`delete from sheet_folders where id='${ids.folder}'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
