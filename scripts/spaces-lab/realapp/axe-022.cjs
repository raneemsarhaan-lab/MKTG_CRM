/**
 * Accessibility on the spec 021–022 pages (spec 021 T073, spec 022 T061):
 * axe (serious and critical) on Space, brand and My tasks views, the Space
 * stages panel and the Link task list — in English, Arabic and on a phone.
 *
 *   LAB_EMAIL=… LAB_PASSWORDS=… node scripts/spaces-lab/realapp/axe-022.cjs [base]
 *
 * The sign-in comes from the environment; nothing is stored here.
 */
const { chromium } = require('playwright')
const { execFileSync } = require('node:child_process')
const BASE = process.argv[2] ?? 'http://localhost:3100'
const DB = process.env.DATABASE_URL
const EMAIL = process.env.LAB_EMAIL
const PASSWORDS = (process.env.LAB_PASSWORDS ?? '').split(',').filter(Boolean)
if (!DB || !EMAIL || !PASSWORDS.length) { console.error('Set DATABASE_URL, LAB_EMAIL and LAB_PASSWORDS.'); process.exit(2) }
const q = sql => execFileSync('psql', [DB, '-Atc', sql], { encoding: 'utf8' }).trim().split('\n')[0]
let failed = 0

async function axe(page, name) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const res = await page.evaluate(async () => {
    // The app's shell (sidebar, phone bar) is checked by the spreadsheet lab.
    // eslint-disable-next-line no-undef
    const r = await axe.run({ exclude: [['aside'], ['.fx-tabbar']] }, { resultTypes: ['violations'] })
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.id} (${v.nodes.length}): ${v.nodes.map(n => n.target.join(' ')).slice(0, 2).join(' ; ')}`)
  })
  if (res.length) { failed++; console.log(`FAIL axe: ${name}\n  ${res.slice(0, 4).join('\n  ')}`) } else console.log(`PASS axe: ${name}`)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.LAB_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--headless', '--no-sandbox'] })
  const brand = q('select id from brands order by name limit 1')
  const day = q(`select to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD')`)
  async function open(opts, locale) {
    const ctx = await browser.newContext(opts)
    if (locale) await ctx.addCookies([{ name: 'fluxo-locale', value: locale, url: BASE }])
    const p = await ctx.newPage()
    for (const password of PASSWORDS) {
      const r = await p.request.post(`${BASE}/api/login`, { data: { email: EMAIL, password } })
      if (r.ok()) return p
    }
    throw new Error('could not sign in')
  }
  const go = async (p, path) => { await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 120000 }); await p.waitForTimeout(600) }
  const runs = [
    ['desktop', { viewport: { width: 1360, height: 860 } }, null],
    ['Arabic', { viewport: { width: 1360, height: 860 } }, 'ar'],
    ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, null],
  ]
  for (const [label, opts, locale] of runs) {
    const p = await open(opts, locale)
    for (const path of ['/spaces/content?view=board', '/spaces/design?view=board', '/spaces/content?view=calendar', `/brands/${brand}`, '/me']) {
      await go(p, path); await axe(p, `${path} (${label})`)
    }
    if (label !== 'phone') {
      await go(p, '/spaces/design?view=board'); await p.click('[data-space-settings-open]'); await p.click('[data-space-settings-tab="flow"]'); await p.click('[data-space-stages-open]'); await p.waitForSelector('[data-space-stages]')
      await axe(p, `Space stages panel (${label})`)
      await go(p, '/spaces/content?view=calendar'); await p.click(`[data-cal-link="${day}"]`); await p.waitForSelector('[data-media-pick]')
      await axe(p, `Link task list (${label})`)
    }
    await p.context().close()
  }
  await browser.close()
  console.log(failed ? `${failed} failed` : 'all passed')
  process.exitCode = failed ? 1 : 0
})()
