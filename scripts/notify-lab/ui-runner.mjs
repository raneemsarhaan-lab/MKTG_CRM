// Drives the notifications lab page (out/) in Chromium, one scenario per
// entry in scenarios/index.mjs. Fails a scenario on any page error or a
// next-intl MISSING_MESSAGE / FORMATTING_ERROR in the console.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { SCENARIOS } from './scenarios/index.mjs'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(LAB, 'out')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

export async function runUi(filters) {
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
  let failed = 0

  for (const sc of chosen) {
    const context = await browser.newContext({
      viewport: sc.viewport ?? { width: 1366, height: 768 },
      hasTouch: !!sc.touch, isMobile: !!sc.touch, reducedMotion: 'no-preference',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => {
      if (m.type() === 'error' && /Maximum update depth|Too many re-renders|unique "key"|MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INSUFFICIENT_PATH/.test(m.text())) errors.push(m.text().slice(0, 240))
    })
    const t = helpers(page, base)
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
  return { failed, total: chosen.length }
}

function helpers(page, base) {
  const t = {
    page,
    async open(hash) {
      await page.goto('about:blank')
      await page.goto(base + (hash ? `#${hash}` : ''))
      await page.waitForSelector('body[data-lab-ready]', { timeout: 10_000 })
      await page.waitForTimeout(150)
    },
    lab: () => page.evaluate(() => ({
      calls: window.__nt.calls.map(c => ({ fn: c.fn, args: c.args })), opened: window.__nt.opened, muted: window.__nt.muted,
      settings: window.__nt.settings, dnd: window.__nt.dnd, pushed: window.__nav?.pushed ?? [], push: window.__nt.push,
      unread: window.__nt.items.filter(i => !i.read).length,
    })),
    calls: async fn => (await t.lab()).calls.filter(c => c.fn === fn).map(c => c.args),
    bell: () => page.locator('[data-bell]'),
    badge: () => page.locator('[data-bell-badge]'),
    async openPanel() { await page.locator('[data-bell]').click(); await page.waitForSelector('[data-notification-panel] [data-nt-list], [data-notification-panel] [data-nt-empty]'); await page.waitForTimeout(80) },
    panelOpen: () => page.$('[data-notification-panel]').then(Boolean),
    rows: (scope = '') => page.$$eval(`${scope} [data-notification]`, rs => rs.map(r => r.getAttribute('data-notification'))),
    row: id => page.locator(`[data-notification="${id}"]`),
    text: id => page.locator(`[data-notification="${id}"] .fx-nt-sentence`).innerText(),
    async poll() { await page.evaluate(() => window.__nt.poll()); await page.waitForTimeout(250) },
    arrive: n => page.evaluate(n => window.__nt.arrive(n), n),
    focused: () => page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      if (el.hasAttribute('data-bell')) return 'bell'
      if (el.getAttribute('data-nt-tab')) return `tab:${el.getAttribute('data-nt-tab')}`
      const row = el.closest('[data-notification]')
      if (row) return `row:${row.getAttribute('data-notification')}${el.hasAttribute('data-nt-open') ? '' : ':' + (el.getAttribute('role') ?? el.tagName)}`
      return el.tagName
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
