// Drives the Inbox lab (out/) in Chromium: the Node checks first, then one
// acceptance scenario per entry. PASS/FAIL per scenario; exits non-zero on any
// failure. Run all:  npm run lab:inbox   Run some:  npm run lab:inbox -- us3 rtl
// Scenario ids map to specs/006-board-inbox/quickstart.md §1.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { SCENARIOS } from './scenarios/inbox.mjs'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(LAB, 'out')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const filters = process.argv.slice(2)
let failed = 0, ran = 0

if (!filters.length || filters.some(f => 'pure'.includes(f))) {
  try { process.stdout.write(execFileSync('node', [path.join(LAB, 'pure.mjs')], { encoding: 'utf8' })) }
  catch (e) { process.stdout.write(e.stdout ?? ''); failed++ }
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
    viewport: sc.viewport ?? { width: 1366, height: 768 },
    hasTouch: !!sc.touch, isMobile: !!sc.touch, reducedMotion: sc.reducedMotion ?? 'no-preference',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && /Maximum update depth|Too many re-renders|Encountered two children|unique "key"|MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(m.text())) errors.push(m.text().slice(0, 200)) })
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
console.log(`\n${chosen.length} scenarios run, ${failed} failed`)
process.exit(failed ? 1 : 0)

function makeHelpers(page, base) {
  const t = {
    page,
    async open(hash) {
      await page.goto('about:blank')
      await page.goto(base + (hash ? `#${hash}` : ''))
      await page.waitForSelector('[data-lab-ready]', { timeout: 10_000 })
      await page.waitForTimeout(60)
    },
    lab: () => page.evaluate(() => ({
      calls: window.__inbox.calls.map(c => ({ fn: c.fn, args: c.args })), state: window.__inbox.state,
      celebrations: window.__inbox.celebrations, opened: window.__inbox.opened, upstream: window.__inbox.upstream,
    })),
    calls: async fn => (await t.lab()).calls.filter(c => c.fn === fn).map(c => c.args),
    failNext: (fn, code) => page.evaluate(([fn, code]) => { window.__inbox.failNext[fn] = code }, [fn, code]),
    button: () => page.locator('[data-inbox-button]'),
    count: () => page.locator('[data-inbox-button]').getAttribute('data-count').then(Number),
    summary: () => page.locator('[data-inbox-summary]').innerText(),
    async openInbox() { await page.locator('[data-inbox-button]').click(); await page.waitForSelector('[data-inbox-panel]'); await page.waitForTimeout(60) },
    panelOpen: () => page.$('[data-inbox-panel]').then(Boolean),
    async tab(name) { await page.locator(`[data-tab="${name}"]`).click(); await page.waitForTimeout(40) },
    selectedTab: () => page.locator('[role="tab"][aria-selected="true"]').getAttribute('data-tab'),
    rows: kind => page.$$eval(`[data-inbox-panel] [data-row^="${kind}:"]`, rs => rs.map(r => r.getAttribute('data-row').split(':').slice(1).join(':'))),
    row: key => page.locator(`[data-row="${key}"]`),
    act: (key, act) => page.locator(`[data-row="${key}"] [data-act="${act}"]`),
    focused: () => page.evaluate(() => {
      const el = document.activeElement
      return el?.getAttribute('data-tab') ? `tab:${el.getAttribute('data-tab')}` : el?.hasAttribute('data-inbox-button') ? 'button' : el?.tagName
    }),
    async idle(ms = 150) { await page.waitForTimeout(ms) },
    async axe(selector) {
      await page.addScriptTag({ path: path.join(OUT, 'axe.min.js') })
      const res = await page.evaluate(sel => window.axe.run(sel, { resultTypes: ['violations'] }), selector)
      return res.violations.filter(v => v.impact === 'critical' || v.impact === 'serious').map(v => `${v.id}: ${v.nodes[0]?.target} ${v.nodes[0]?.failureSummary?.slice(0, 160) ?? ''}`)
    },
    assert(cond, msg) { if (!cond) throw new Error(msg) },
    eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) },
  }
  return t
}
