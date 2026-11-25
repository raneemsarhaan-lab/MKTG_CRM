// Spaces lab, real app (spec 021): drives a running Momentum (next dev or
// start) against a database seeded by scripts/migrate.sh, signing in as each
// seeded role. Usage:
//   BASE=http://localhost:3100 DATABASE_URL=… node scripts/spaces-lab/realapp/run.cjs [us1 us6 …]
// Each scenario prints PASS/FAIL; exits non-zero on any failure.
const { chromium } = require('playwright')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const BASE = process.env.BASE ?? 'http://localhost:3100'
const PASSWORDS = (process.env.LAB_PASSWORDS ?? 'Fluxo-rSpNJNGb9c7prM,FluxoAdmin2026!').split(',')
const filters = process.argv.slice(2)
const psql = sql => execFileSync('psql', [process.env.DATABASE_URL, '-Atc', sql], { encoding: 'utf8' }).trim()

const EMAIL = {
  admin: 'raneem.sarhaan@forefront.consulting', md: 'islam@forefront.consulting', dms: 'dms@forefront.consulting',
  content: 'content@forefront.consulting', design: 'design@forefront.consulting', video: 'video@forefront.consulting',
}

async function signIn(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  // Sheets render only the rows near the viewport. A wait for a sheet cell or row scrolls the sheet down
  // until it appears, so a check doesn't depend on how many other rows the lab database holds.
  const wait = page.waitForSelector.bind(page)
  page.waitForSelector = async (sel, opts = {}) => {
    if (typeof sel !== 'string' || !/data-cell|data-row|data-col-menu|data-col-head/.test(sel) || opts.state === 'detached' || opts.state === 'hidden') return wait(sel, opts)
    const end = Date.now() + (opts.timeout ?? 30000)
    let top = false
    while (true) {
      const left = end - Date.now()
      // A good wait where the sheet opens, then a short look after each scroll.
      const step = top ? 450 : 1500
      try { return await wait(sel, { ...opts, timeout: Math.max(1, Math.min(left, step)) }) } catch (e) { if (left <= step) throw e }
      // Sweep sideways first (columns are drawn near the viewport too), then down a screen.
      await page.evaluate(first => {
        for (const s of document.querySelectorAll('.fx-sheet-scroll')) {
          if (first) { s.scrollTop = 0; s.scrollLeft = 0; continue }
          const wide = s.scrollWidth - s.clientWidth > 2, rtl = getComputedStyle(s).direction === 'rtl'
          const left = Math.abs(s.scrollLeft)
          if (wide && left < s.scrollWidth - s.clientWidth - 2) { const next = left + s.clientWidth * 0.8; s.scrollLeft = rtl ? -next : next; continue }
          s.scrollLeft = 0
          s.scrollTop = s.scrollTop + s.clientHeight * 0.8 >= s.scrollHeight - s.clientHeight ? (s.scrollTop >= s.scrollHeight - s.clientHeight - 2 ? 0 : s.scrollHeight) : s.scrollTop + s.clientHeight * 0.8
        }
      }, !top).catch(() => {})
      top = true
    }
  }
  // The simple sheet header (25 Nov 2026): + Theme, + Column and + Add existing task moved into the
  // "+ Post ▾" menu. A click on the old button opens that menu and picks the item instead.
  const MOVED = { '[data-add-theme]': 'theme', '[data-add-column]': 'column', '[data-add-existing-task]': 'existing' }
  const click = page.click.bind(page)
  page.click = async (sel, opts) => {
    if (typeof sel === 'string' && MOVED[sel] && !(await page.$(sel)) && (await page.$('[data-sheet-add-more]'))) {
      await click('[data-sheet-add-more]')
      return click(`[data-menu-item="${MOVED[sel]}"]`, opts)
    }
    return click(sel, opts)
  }
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && /MISSING_MESSAGE|FORMATTING_ERROR|Maximum update depth|unique "key"/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  for (const password of PASSWORDS) {
    const r = await page.request.post(`${BASE}/api/login`, { data: { email: EMAIL[who], password } })
    if (r.ok()) return { ctx, page, errors }
  }
  throw new Error(`could not sign in as ${who}`)
}
const ok = (c, msg) => { if (!c) throw new Error(msg) }

const SCENARIOS = [
  ...require(path.join(__dirname, 'scenarios.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-us2.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-sheet.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-sheet.cjs')).views(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-sheet.cjs')).workbook(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-us4.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-tasklink.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-022-us1.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-022-us2.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-022-us3.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-022-us4.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-022-us5.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-015-followups.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-022-linked-rows.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-dates.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-023-a.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-search.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-mytasks.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-023-b.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-023-c.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-023-d.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-2b.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-024.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-025.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-026.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-fields.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-password-reset.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-027-views.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-027-board-tab.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-027-tabs.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-027-structure.cjs'))(EMAIL, psql, ok),
]

;(async () => {
  const fs = require('node:fs')
  const exe = process.env.LAB_CHROMIUM ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--headless', '--no-sandbox'] } : {})
  let failed = 0
  // LAB_FROM=<id>: start at that scenario (to finish a run that was stopped part way).
  const from = process.env.LAB_FROM ? SCENARIOS.findIndex(s => s.id === process.env.LAB_FROM) : 0
  for (const sc of SCENARIOS.slice(Math.max(0, from)).filter(s => !filters.length || filters.some(f => s.id.includes(f)))) {
    const s = await signIn(browser, sc.as)
    try {
      // signInAs: a second member's page, for checks across people (e.g. private to-dos).
      await sc.run({ ...s, BASE, signInAs: who => signIn(browser, who), go: async p => { const r = await s.page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 120000 }); await s.page.waitForTimeout(300); return r } })
      if (s.errors.length) throw new Error(`page error: ${s.errors[0]}`)
      console.log(`PASS ${sc.id}`)
    } catch (e) {
      failed++
      console.log(`FAIL ${sc.id}: ${process.env.LAB_VERBOSE ? String(e.message ?? e) : String(e.message ?? e).split("\n")[0]}`)
      await s.page.screenshot({ path: path.join(__dirname, `fail-${sc.id}.png`) }).catch(() => {})
    }
    await s.ctx.close()
  }
  await browser.close()
  process.exit(failed ? 1 : 0)
})()
