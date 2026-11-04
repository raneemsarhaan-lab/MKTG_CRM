// Drives the sheet lab (out/) in Chromium: the pure checks first, then one
// acceptance scenario per entry. PASS/FAIL per scenario; exits non-zero on any
// failure. Run all:  npm run lab:sheet   Run some:  npm run lab:sheet -- us3 rtl
// Scenario ids map to specs/008-video-sheet-view/quickstart.md §2.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { runPure } from './pure.mjs'
import { SCENARIOS } from './scenarios/index.mjs'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(LAB, 'out')
const ROOT = path.resolve(LAB, '../..')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const filters = process.argv.slice(2)
let failed = 0, ran = 0

if (!filters.length || filters.some(f => 'pure'.includes(f))) {
  const results = await runPure(path.join(OUT, 'pure.mjs'), ROOT)
  for (const r of results) {
    ran++
    if (r.ok) console.log(`PASS ${r.id}`)
    else { failed++; console.log(`FAIL ${r.id}: ${r.error}`) }
  }
}

const server = http.createServer((req, res) => {
  const file = path.join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'))
  if (!file.startsWith(OUT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const chosen = SCENARIOS.filter(s => !filters.length || filters.some(f => s.id.includes(f)))
const exe = process.env.LAB_CHROMIUM ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--headless', '--no-sandbox'] } : {})

for (const sc of chosen) {
  ran++
  const context = await browser.newContext({
    viewport: sc.viewport ?? { width: 1366, height: 657 },
    hasTouch: !!sc.touch, isMobile: !!sc.touch,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && /Maximum update depth|Too many re-renders|Encountered two children|unique "key"/.test(m.text())) errors.push(m.text().slice(0, 160)) })
  const t = makeHelpers(page, base)
  try {
    await t.open(sc.hash ?? '')
    await sc.run(t)
    if (errors.length) throw new Error(`page error: ${errors[0]}`)
    console.log(`PASS ${sc.id}`)
  } catch (e) {
    failed++
    console.log(`FAIL ${sc.id}: ${String(e.message ?? e).split('\n').slice(0, 4).join(' | ')}`)
    await page.screenshot({ path: path.join(OUT, `fail-${sc.id}.png`) }).catch(() => {})
  }
  await context.close()
}
await browser.close()
server.close()
console.log(`\n${ran - failed}/${ran} passed`)
process.exit(failed ? 1 : 0)

function makeHelpers(page, base) {
  const t = {
    page,
    async open(hash) {
      await page.goto('about:blank')
      await page.goto(base + (hash ? `#${hash}` : ''))
      await page.waitForSelector('[data-video-sheet], [data-content-sheet]', { timeout: 10_000 })
      await page.waitForTimeout(80)
    },
    lab: () => page.evaluate(() => ({
      calls: window.__sheet.calls.map(c => ({ fn: c.fn, args: c.args })),
      celebrations: window.__sheet.celebrations, opened: window.__sheet.opened, views: window.__sheet.views,
      uploads: window.__sheet.uploads, bytesRead: window.__sheet.bytesRead,
    })),
    task: id => page.evaluate(id => window.__sheet.tasks.find(x => x.id === id), id),
    tasks: () => page.evaluate(() => window.__sheet.tasks),
    /** Row keys in order (data-row), e.g. "v:v1", "c:c01". */
    rows: () => page.$$eval('[data-row]', rs => rs.map(r => r.getAttribute('data-row'))),
    cell: (row, col) => page.locator(`[data-cell="${row}|${col}"]`),
    text: (row, col) => page.locator(`[data-cell="${row}|${col}"]`).innerText(),
    async focusCell(row, col) {
      await page.locator(`[data-cell="${row}|${col}"]`).click()
      await page.waitForTimeout(40)
    },
    active: () => page.evaluate(() => document.activeElement?.getAttribute('data-cell') ?? document.activeElement?.tagName),
    menuItems: () => page.$$eval('[data-sheet-menu] [role="menuitem"]', els => els.map(e => e.getAttribute('data-menu-item'))),
    menuOpen: () => page.$('[data-sheet-menu]').then(Boolean),
    toast: () => page.locator('[data-sheet-toast]').innerText(),
    async idle(ms = 200) { await page.waitForTimeout(ms) },
    /** Fire a paste event with this clipboard data at the focused element. */
    async paste({ html = '', text = '' }) {
      await page.evaluate(([html, text]) => {
        const dt = new DataTransfer()
        if (html) dt.setData('text/html', html)
        dt.setData('text/plain', text)
        document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      }, [html, text])
      await page.waitForTimeout(80)
    },
    async axe(selector) {
      await page.addScriptTag({ path: path.join(OUT, 'axe.min.js') })
      const res = await page.evaluate(sel => window.axe.run(sel, { resultTypes: ['violations'] }), selector)
      return res.violations.filter(v => v.impact === 'critical' || v.impact === 'serious').map(v => `${v.id}: ${v.nodes[0]?.target}`)
    },
    assert(cond, msg) { if (!cond) throw new Error(msg) },
    eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) },
  }
  return t
}
