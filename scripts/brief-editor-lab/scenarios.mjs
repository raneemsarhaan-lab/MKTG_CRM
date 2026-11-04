// Drives the brief-editor lab (out/) in Chromium and checks one acceptance
// scenario per entry. Prints PASS/FAIL per scenario and exits non-zero on any
// failure. Run all:  npm run lab:brief      Run some:  npm run lab:brief -- save link
// Scenario ids map to specs/005-brief-editor-ux/quickstart.md §2.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { SCENARIOS } from './scenarios/index.mjs'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(LAB, 'out')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }

const server = http.createServer((req, res) => {
  const file = path.join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'))
  if (!file.startsWith(OUT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const filters = process.argv.slice(2)
const chosen = SCENARIOS.filter(s => !filters.length || filters.some(f => s.id.includes(f)))

// The project's own Playwright may not have its browser downloaded; a
// preinstalled Chromium can be named with LAB_CHROMIUM (or is found at the
// usual cloud-session path) instead.
const exe = process.env.LAB_CHROMIUM ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--headless', '--no-sandbox'] } : {})
let failed = 0
for (const sc of chosen) {
  const context = await browser.newContext({
    viewport: sc.viewport ?? { width: 1100, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  // React's render-loop warning is a console error, not an exception: fail on it too.
  page.on('console', m => { if (m.type() === 'error' && /Maximum update depth|Too many re-renders/.test(m.text())) errors.push(m.text().slice(0, 120)) })
  const t = makeHelpers(page, context, base)
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

function makeHelpers(page, context, base) {
  const t = {
    page, context,
    async open(hash) {
      // about:blank first: a change of hash alone would not reload the lab.
      await page.goto('about:blank')
      await page.goto(base + (hash ? `#${hash}` : ''))
      await page.waitForSelector('.ProseMirror, #read, .fx-brief-read', { timeout: 10_000 })
      await page.waitForTimeout(150)
    },
    lab: () => page.evaluate(() => window.__lab),
    /** The last Markdown the stub host stored, after any save in flight lands. */
    async md(settle = 300) {
      await page.waitForTimeout(settle)
      await page.waitForFunction(() => !document.querySelector('[data-save-status="saving"]'), null, { timeout: 25_000 }).catch(() => {})
      await page.waitForTimeout(50)
      return (await t.lab()).md
    },
    editor: () => page.locator('.ProseMirror').first(),
    // The bottom corner (padding), not the middle: a table's resize handle or a
    // checkbox can sit elsewhere.
    async focusEnd() {
      const b = await t.editor().boundingBox()
      await t.editor().click({ position: { x: 6, y: b.height - 6 } })
      await page.keyboard.press('Control+End')
    },
    btn: title => page.locator(`button[title^="${title}"]`).first(),
    assert(cond, msg) { if (!cond) throw new Error(msg) },
    eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) },
    norm: s => s.replace(/\r/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
  }
  return t
}
