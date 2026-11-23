/**
 * Accessibility on the spec 023 screens (T089): axe (serious and critical) on
 * Task types (Types, Fields, Tags, Templates), My tasks, the Workload week,
 * the task panel with the Repeat editor, workspace search and the calendar's
 * From template box — in English, Arabic and on a phone.
 *
 *   LAB_EMAIL=… LAB_PASSWORDS=… node scripts/spaces-lab/realapp/axe-023.cjs [base]
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

async function axe(page, name, only) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const res = await page.evaluate(async only => {
    // The app's shell (sidebar, phone bar) is checked by the spreadsheet lab.
    // `only` limits a check to what spec 023 added inside an older screen.
    const ctx = only ? { include: [[only]] } : { exclude: [['aside'], ['.fx-tabbar']] }
    // eslint-disable-next-line no-undef
    const r = await axe.run(ctx, { resultTypes: ['violations'] })
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.id} (${v.nodes.length}): ${v.nodes.map(n => n.target.join(' ')).slice(0, 2).join(' ; ')}`)
  }, only ?? null)
  if (res.length) { failed++; console.log(`FAIL axe: ${name}\n  ${res.slice(0, 4).join('\n  ')}`) } else console.log(`PASS axe: ${name}`)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.LAB_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--headless', '--no-sandbox'] })
  const [task, taskSpace] = q(`select t.id || '|' || sp.key from tasks t join task_spaces s on s.task_id=t.id join team_spaces sp on sp.id=s.space_id where sp.media_board is null and t.parent_task_id is null and t.dropped_at is null order by t.created_at desc limit 1`).split('|')
  const day = q(`select to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD')`)
  const hasTemplates = q('select count(*) from task_templates') !== '0'
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
    await go(p, '/task-types')
    for (const tab of ['types', 'fields', 'tags', 'templates']) {
      await p.click(`[data-types-tab="${tab}"]`); await p.waitForTimeout(400)
      await axe(p, `Task types › ${tab} (${label})`)
    }
    await go(p, '/my-tasks'); await axe(p, `My tasks (${label})`)
    await go(p, '/spaces/planning?view=workload'); await axe(p, `Workload week (${label})`)
    await go(p, `/spaces/${taskSpace}?view=list&task=${task}`); await p.waitForSelector('[data-repeat-open]')
    await p.click('[data-repeat-open]'); await p.waitForSelector('[data-repeat-dialog]')
    await axe(p, `Repeat row and box in the task panel (${label})`, '[data-repeat]')
    if (label !== 'phone') {
      await go(p, '/spaces/planning?view=list'); await p.keyboard.press('Control+k'); await p.waitForTimeout(400)
      await p.keyboard.type('post'); await p.waitForTimeout(800)
      await axe(p, `Search (${label})`)
      if (hasTemplates) {
        await go(p, '/spaces/planning?view=calendar'); await p.click(`[data-cal-template="${day}"]`); await p.waitForSelector('[data-template-form]')
        await axe(p, `From template box (${label})`)
      }
    }
    await p.context().close()
  }
  await browser.close()
  console.log(failed ? `${failed} failed` : 'all passed')
  process.exitCode = failed ? 1 : 0
})()
