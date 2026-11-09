/**
 * axe and load timing for the Sheets screens (spec 013, quickstart §3 row 21),
 * against a production build: `npx next build && npx next start`.
 *   node scripts/spreadsheet-lab/realapp/perf-axe.cjs [base]
 *
 * Checks the whole page, the shared shell included (sidebar on desktop, the
 * phone tab bar at 390 px). Fails on any serious or critical violation.
 * `label-content-name-mismatch` (WCAG 2.5.3) is experimental in axe and off
 * by default, so it is switched on here.
 */
const path = require('path')
const { chromium } = require('playwright')
const BASE  = process.argv[2] || 'http://localhost:3000'
const ADMIN = 'raneem.sarhaan@forefront.consulting'
const PASS  = 'lab-pass-1'
const AXE   = require.resolve('axe-core/axe.min.js', { paths: [path.resolve(__dirname, '../../..')] })

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1360, height: 860 } },
  { name: 'phone',   viewport: { width: 390,  height: 844 }, isMobile: true, hasTouch: true },
]

async function audit(page, label) {
  await page.addScriptTag({ path: AXE })
  const res = await page.evaluate(() => window.axe.run(document, {
    rules: { 'label-content-name-mismatch': { enabled: true } },
  }))
  const bad = res.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  if (!bad.length) { console.log(`  ✓ ${label}: no serious or critical violations`); return 0 }
  console.log(`  ✗ ${label}: ${bad.length} serious/critical rule(s)`)
  for (const v of bad) {
    console.log(`     - [${v.impact}] ${v.id}: ${v.help}`)
    for (const n of v.nodes.slice(0, 5)) console.log(`         ${n.target.join(' ')}  ${n.failureSummary.split('\n').slice(1).join(' ').trim()}`)
  }
  return bad.length
}

;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  let failures = 0
  for (const vp of VIEWPORTS) {
    console.log(`${vp.name} (${vp.viewport.width}×${vp.viewport.height})`)
    const { name, ...opts } = vp
    const ctx = await browser.newContext(opts)
    const r = await ctx.request.post(`${BASE}/api/login`, { data: { email: ADMIN, password: PASS } })
    if (!r.ok()) throw new Error(`login: ${r.status()}`)
    const page = await ctx.newPage()

    let t = Date.now()
    await page.goto(`${BASE}/sheets`)
    await page.waitForSelector('[data-sheets-home]')
    console.log(`  · home ready in ${Date.now() - t} ms`)
    failures += await audit(page, 'Sheets home')

    const href = await page.locator('a[href^="/sheets/"]').first().getAttribute('href')
    t = Date.now()
    await page.goto(`${BASE}${href}`)
    await page.waitForSelector('[data-sheet-tab], [data-blank-sheet]')
    console.log(`  · workbook ready in ${Date.now() - t} ms`)
    failures += await audit(page, 'workbook')
    await ctx.close()
  }
  await browser.close()
  console.log(failures ? `\n${failures} serious/critical rule(s) failing` : '\nall clear')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
