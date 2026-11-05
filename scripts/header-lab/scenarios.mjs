// Drives the header lab (out/) in Chromium: one or more scenarios per
// acceptance scenario of spec 011. PASS/FAIL per scenario; exits non-zero on
// any failure. Run all:  npm run lab:header   Run some:  npm run lab:header -- h2 h5
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { SCENARIOS } from './scenarios/index.mjs'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(LAB, '../..')
const OUT = path.join(LAB, 'out')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const filters = process.argv.slice(2)
let failed = 0

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
  const context = await browser.newContext({ viewport: sc.viewport ?? { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && /Maximum update depth|Too many re-renders|unique "key"|MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  const t = helpers(page)
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
console.log(`\n${chosen.length - failed}/${chosen.length} passed`)
process.exit(failed ? 1 : 0)

function helpers(page) {
  const t = {
    page, root: ROOT,
    async open(hash) {
      await page.goto('about:blank')
      await page.goto(base + (hash ? `#${hash}` : ''))
      await page.waitForSelector('[data-lab-ready]', { timeout: 10_000 })
      await page.waitForTimeout(60)
    },
    host: () => page.evaluate(() => ({ ...window.__header })),
    box: sel => page.locator(sel).first().boundingBox(),
    text: sel => page.locator(sel).first().innerText().then(s => s.replace(/\s+/g, ' ').trim()),
    idle: (ms = 120) => page.waitForTimeout(ms),
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
