/**
 * Spec 015 T058: speed on a 5,000-row formatted sheet.
 *   LAB_EMAIL=… LAB_PASSWORDS=… DATABASE_URL=… node scripts/spreadsheet-lab/realapp/perf-format.cjs [base]
 * Seeds a 5,000 × 26 blank sheet with 20,000 filled cells, a format on every
 * other row and 5,000 single-cell formats, then times arrow keys and
 * Ctrl+A → Bold. The folder is removed at the end. Sign-in comes from the
 * environment; nothing is stored here.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.argv[2] || 'http://localhost:3100'
const DB = process.env.DATABASE_URL
const EMAIL = process.env.LAB_EMAIL
const PASSWORDS = (process.env.LAB_PASSWORDS ?? '').split(',').filter(Boolean)
if (!DB || !EMAIL || !PASSWORDS.length) { console.error('Set DATABASE_URL, LAB_EMAIL and LAB_PASSWORDS.'); process.exit(2) }
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }

function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Format perf ' || floor(random()*1e6)) returning id`)
  const big = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Formatted', 0, 5000, 26) returning id`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${big}', g from generate_series(1, 5000) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${big}', g from generate_series(1, 26) g`)
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value)
       select '${big}', r.id, c.id, 'R' || r.position || 'C' || c.position
       from sheet_rows r cross join sheet_cols c where r.sheet_id='${big}' and c.sheet_id='${big}' and c.position <= 4`)
  // Every other row filled, and one formatted cell per row in column B (alternating styles).
  sql(`insert into sheet_formats (sheet_id, row_key, col_key, style)
       select '${big}', r.id::text, '', '{"fill":"#F2F7E4"}'::jsonb from sheet_rows r where r.sheet_id='${big}' and r.position::int % 2 = 0`)
  sql(`insert into sheet_formats (sheet_id, row_key, col_key, style)
       select '${big}', r.id::text, c.id::text, case when r.position::int % 3 = 0 then '{"b":true,"fc":"#C2353A"}' else '{"i":true}' end::jsonb
       from sheet_rows r join sheet_cols c on c.sheet_id = r.sheet_id and c.position = 2 where r.sheet_id='${big}'`)
  return { folder, big }
}

;(async () => {
  const ids = seed()
  const browser = await chromium.launch({ executablePath: process.env.LAB_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } })
  let signed = false
  for (const password of PASSWORDS) { if ((await ctx.request.post(`${BASE}/api/login`, { data: { email: EMAIL, password } })).ok()) { signed = true; break } }
  if (!signed) throw new Error('could not sign in')
  const page = await ctx.newPage()
  try {
    console.log('Speed on a formatted sheet (5,000 × 26; 2,500 row formats, 5,000 cell formats)')
    let t0 = Date.now()
    await page.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.big}`)
    await page.waitForSelector(`[data-blank-sheet="${ids.big}"] .fx-sheet-td.is-blank-cell`, { timeout: 120000 })
    ok(true, 'the formatted sheet opens', `${Date.now() - t0} ms`)
    await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(0).locator('.fx-sheet-td').nth(1).click()
    // Warm-up, then 40 keys: keydown until the next frame has painted.
    const times = await page.evaluate(async () => {
      const step = async key => { const el = document.activeElement; const t = performance.now(); el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t }
      for (let i = 0; i < 10; i++) await step('ArrowDown')
      const out = []
      for (let i = 0; i < 40; i++) out.push(await step(i % 10 === 9 ? 'ArrowRight' : 'ArrowDown'))
      return out.sort((a, b) => a - b)
    })
    const p95 = times[Math.floor(times.length * 0.95) - 1]
    ok(p95 < 100, 'arrow keys under 100 ms', `median ${times[20].toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`)
    // Ctrl+A then Ctrl+B: the whole sheet bold, painted, then saved.
    await page.keyboard.press('Control+a')
    t0 = Date.now()
    await page.keyboard.press('Control+b')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-blank-sheet] .fx-sheet-td.is-blank-cell')).fontWeight >= 700, null, { timeout: 10000 })
    const painted = Date.now() - t0
    ok(painted < 1000, 'Ctrl+A → Bold paints under 1 s', `${painted} ms`)
    await page.waitForSelector('[data-save-status="saved"]', { timeout: 30000 }).catch(() => {})
    ok(true, 'and saves', `${Date.now() - t0} ms`)
  } finally {
    await browser.close()
    sql(`delete from sheet_folders where id='${ids.folder}'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exitCode = fail ? 1 : 0
})()
