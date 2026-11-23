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
  ...require(path.join(__dirname, 'scenarios-us5.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-sheet.cjs')).workbook(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-us3.cjs'))(EMAIL, psql, ok),
  ...require(path.join(__dirname, 'scenarios-us4.cjs'))(EMAIL, psql, ok),
]

;(async () => {
  const fs = require('node:fs')
  const exe = process.env.LAB_CHROMIUM ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--headless', '--no-sandbox'] } : {})
  let failed = 0
  for (const sc of SCENARIOS.filter(s => !filters.length || filters.some(f => s.id.includes(f)))) {
    const s = await signIn(browser, sc.as)
    try {
      await sc.run({ ...s, BASE, go: async p => { const r = await s.page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 120000 }); await s.page.waitForTimeout(300); return r } })
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
