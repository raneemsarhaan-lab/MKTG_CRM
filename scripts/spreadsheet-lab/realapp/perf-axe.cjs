/**
 * Spec 013 speed and accessibility on the running app (SC-001, SC-005, T046, T047).
 *   node scripts/spreadsheet-lab/realapp/perf-axe.cjs [base]
 * Seeds a folder with a 5,000 × 26 sheet holding 20,000 filled cells (plus a
 * small second sheet), then times key moves, a tab switch and a 1,000 × 20
 * paste, and runs axe on the Sheets screens. The folder is removed at the end.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, " ") }).toString().trim()
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }

function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Perf lab ' || floor(random()*1e6)) returning id`)
  const big = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Big', 0, 5000, 26) returning id`)
  const small = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Small', 1, 0, 0) returning id`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${big}', g from generate_series(1, 5000) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${big}', g from generate_series(1, 26) g`)
  // 20,000 cells: the first 5,000 rows × columns A–D.
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value)
       select '${big}', r.id, c.id, 'R' || r.position || 'C' || c.position
       from sheet_rows r cross join sheet_cols c where r.sheet_id='${big}' and c.sheet_id='${big}' and c.position <= 4`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${small}', g from generate_series(1, 100) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${small}', g from generate_series(1, 26) g`)
  sql(`update sheets set row_count=100, col_count=26 where id='${small}'`)
  return { folder, big, small }
}

async function axe(page, name) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    // The app's shell (sidebar, phone bar) isn't part of this spec: checked separately below.
    const r = await axe.run({ exclude: [['aside'], ['.fx-tabbar']] }, { resultTypes: ['violations'] })
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.id} (${v.nodes.length}): ${v.nodes.map(n => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '')).slice(0, 2).join(' ; ')}`)
  })
  ok(res.length === 0, `axe: ${name}`, res.slice(0, 4).join(' | '))
}

;(async () => {
  const ids = seed()
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.request.post(`${BASE}/api/login`, { data: { email: 'raneem.sarhaan@forefront.consulting', password: 'lab-pass-1' } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  try {
    console.log('Speed (5,000 × 26, 20,000 filled cells)')
    let t0 = Date.now()
    await page.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.big}`)
    await page.waitForSelector(`[data-blank-sheet="${ids.big}"] .fx-sheet-td.is-blank-cell`)
    ok(true, 'the big sheet opens', `${Date.now() - t0} ms`)
    ok(await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').count() < 200, 'rows are windowed', `${await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').count()} in the page`)
    const first = page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(0).locator('.fx-sheet-td').nth(1)
    await first.click()
    // A key's time: from keydown until the next frame has painted the new active cell.
    const times = await page.evaluate(async () => {
      const out = []
      for (let i = 0; i < 30; i++) {
        const el = document.activeElement
        const t = performance.now()
        el.dispatchEvent(new KeyboardEvent('keydown', { key: i % 10 === 9 ? 'ArrowRight' : 'ArrowDown', bubbles: true, cancelable: true }))
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        out.push(performance.now() - t)
      }
      return out.sort((a, b) => a - b)
    })
    const p95 = times[Math.floor(times.length * 0.95) - 1]
    ok(p95 < 100, 'arrow keys under 100 ms (SC-005)', `median ${times[15].toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`)
    t0 = Date.now()
    await page.keyboard.press('Control+End')
    await page.waitForFunction(() => document.activeElement?.closest('[data-row]') && [...document.querySelectorAll('[data-blank-sheet] .fx-sheet-tr[data-row]')].pop()?.contains(document.activeElement))
    ok(Date.now() - t0 < 1000, 'Ctrl+End reaches row 5,000', `${Date.now() - t0} ms`)
    const last = await page.evaluate(() => document.activeElement.closest('[data-row]').querySelector('.is-frozen-no').innerText)
    ok(last.trim() === '5000', 'the last row is 5000', last)
    await page.keyboard.press('Control+Home')

    // Tab switch, both ways (the second visit is from the cache).
    await page.click(`[data-sheet-tab="${ids.small}"]`)
    await page.waitForSelector(`[data-blank-sheet="${ids.small}"]`)
    t0 = Date.now()
    await page.click(`[data-sheet-tab="${ids.big}"]`)
    await page.waitForSelector(`[data-blank-sheet="${ids.big}"]`)
    const back = Date.now() - t0
    ok(back < 300, 'switching back to the big sheet', `${back} ms (includes Playwright's round trip)`)

    // 1,000 × 20 paste into the small sheet: it grows to 1,000 rows (SC-001).
    await page.click(`[data-sheet-tab="${ids.small}"]`)
    await page.waitForSelector(`[data-blank-sheet="${ids.small}"]`)
    await page.locator(`[data-blank-sheet="${ids.small}"] .fx-sheet-tr[data-row]`).nth(0).locator('.fx-sheet-td').nth(1).click()
    const tsv = Array.from({ length: 1000 }, (_, r) => Array.from({ length: 20 }, (_, c) => `p${r}-${c}`).join('\t')).join('\n')
    t0 = Date.now()
    await page.evaluate(text => {
      const dt = new DataTransfer(); dt.setData('text/plain', text)
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, tsv)
    await page.waitForFunction(() => /1,?000 rows|20000|20,000/.test(document.querySelector('[data-selection]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {})
    const shown = Date.now() - t0
    ok(shown < 3000, 'a 1,000 × 20 paste shows under 3 s (SC-001)', `${shown} ms`)
    await page.waitForSelector('[data-save-status="saved"]', { timeout: 30000 })
    const saved = Date.now() - t0
    const n = Number(sql(`select count(*) from sheet_cells where sheet_id='${ids.small}'`))
    ok(n === 20000, 'all 20,000 pasted cells saved', `${n} in ${saved} ms`)

    console.log('Accessibility (axe, serious and critical)')
    await page.goto(`${BASE}/sheets`); await page.waitForSelector('[data-sheets-home]')
    await axe(page, 'Sheets home')
    await page.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.small}`); await page.waitForSelector('[data-blank-sheet]')
    await axe(page, 'workbook')
    await page.locator(`[data-sheet-tab="${ids.small}"]`).click({ button: 'right' }); await page.waitForSelector('[data-tab-menu]')
    await axe(page, 'tab menu')
    await page.click('[data-tab-menu] [data-item="moveCopy"]'); await page.waitForSelector('[data-move-copy]')
    await axe(page, 'Move or Copy')
    await page.keyboard.press('Escape')
    await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(2).locator('.fx-sheet-td').nth(2).click({ button: 'right' })
    await page.waitForSelector('[data-cell-menu]')
    await axe(page, 'cell menu')
    await page.keyboard.press('Escape')
    await page.goto(`${BASE}/sheets`); await page.locator('[data-folder] a').first().click()
    await page.waitForSelector('[data-linked-pane] [data-sheet-grid]')
    await axe(page, 'linked Content sheet')
    const fs2 = await browser.newContext({ viewport: { width: 1360, height: 860 } })
    await fs2.request.post(`${BASE}/api/login`, { data: { email: 'raneem.sarhaan@forefront.consulting', password: 'lab-pass-1' } })
    await fs2.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    const ar = await fs2.newPage()
    await ar.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.small}`); await ar.waitForSelector('[data-blank-sheet]')
    await axe(ar, 'workbook in Arabic')
    const ph = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    await ph.context().request.post(`${BASE}/api/login`, { data: { email: 'raneem.sarhaan@forefront.consulting', password: 'lab-pass-1' } })
    await ph.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.small}`); await ph.waitForSelector('[data-blank-sheet]')
    const tb = await ph.locator('[data-new-sheet]').boundingBox()
    ok(tb.width >= 44 && tb.height >= 44, 'phone: 44 px tab-bar targets', `${tb.width}×${tb.height}`)
    await axe(ph, 'workbook on a phone')
    ok(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '))
  } finally {
    await browser.close()
    sql(`delete from sheet_folders where id='${ids.folder}'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
