// Drives the attachments lab (out/) in Chromium: the pure checks first, then
// one acceptance scenario per entry. PASS/FAIL per scenario; exits non-zero on
// any failure. Run all:  npm run lab:attachments   Run some:  npm run lab:attachments -- us3 preview
// Scenario ids map to specs/007-task-attachments/quickstart.md §2.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { runPure } from './pure.mjs'
import { SCENARIOS } from './scenarios/index.mjs'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(LAB, 'out')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const filters = process.argv.slice(2)
let failed = 0, ran = 0

if (!filters.length || filters.some(f => 'pure'.includes(f))) {
  const results = await runPure(path.join(OUT, 'pure.mjs'))
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
    viewport: sc.viewport ?? { width: 1100, height: 900 },
    hasTouch: !!sc.touch, isMobile: !!sc.touch,
    reducedMotion: sc.reducedMotion ?? 'no-preference',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  // React's render-loop warning is a console error, not an exception: fail on it too.
  page.on('console', m => { if (m.type() === 'error' && /Maximum update depth|Too many re-renders/.test(m.text())) errors.push(m.text().slice(0, 140)) })
  const t = makeHelpers(page, context, base)
  try {
    await t.open(sc.hash ?? '', { raw: sc.raw })
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

function makeHelpers(page, context, base) {
  const t = {
    page, context,
    async open(hash, { raw = false } = {}) {
      // about:blank first: a change of hash alone would not reload the lab.
      await page.goto('about:blank')
      await page.goto(base + (hash ? `#${hash}` : ''))
      await page.waitForSelector('[data-att-section]', { timeout: 10_000 })
      if (!raw) await t.loaded()
    },
    /** Wait until the placeholders have gone. */
    async loaded() {
      await page.waitForFunction(() => !document.querySelector('[data-att-loading]'), null, { timeout: 10_000 })
      await page.waitForTimeout(60)
    },
    lab: () => page.evaluate(() => {
      const l = window.__lab
      return { server: l.server.map(f => ({ id: f.id, filename: f.filename })), uploads: l.uploads.map(u => ({ name: u.name, size: u.size })),
        removes: l.removes, renames: l.renames, loads: l.loads, comments: l.comments }
    }),
    /** Tile names in grid order (stored files only). */
    names: () => page.$$eval('[data-att-tile]', ts => ts.map(t => t.querySelector('.fx-att-name')?.textContent ?? '')),
    tile: name => page.locator('[data-att-tile]', { hasText: name }).first(),
    /** Add files through the section's handle, as a paste/drop/pick would. `make` runs in the page. */
    async add(make, opts = {}) {
      await page.evaluate(([src, o]) => {
        const files = new Function('lab', `return (${src})(lab)`)(window.__lab)
        window.__lab.added.push(...files)
        window.__lab.handle.addFiles(files, o)
      }, [make.toString(), opts])
    },
    async waitUploads(n) {
      await page.waitForFunction(n => window.__lab.server.length >= n && !document.querySelector('[data-att-job-status="uploading"], [data-att-job-status="queued"]'), n, { timeout: 15_000 })
      await page.waitForTimeout(80)
    },
    assert(cond, msg) { if (!cond) throw new Error(msg) },
    eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) },
  }
  return t
}
