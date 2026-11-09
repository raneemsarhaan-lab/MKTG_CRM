/**
 * Running-app checks for spec 014 (quickstart.md), against `next start`.
 *   node scripts/hours-lab/realapp/run.cjs [base]
 * Two members: the content creator logs and gets the reminder; the admin reads
 * the report. Their recent days are cleared first and at the end.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
const ADMIN = 'raneem.sarhaan@forefront.consulting', MEMBER = 'content@forefront.consulting'
let pass = 0, fail = 0
const ok = (c, name, extra = '') => { if (c) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }

const iso = d => d.toISOString().slice(0, 10)
const add = (s, n) => iso(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5))
const dow = s => new Date(s + 'T00:00:00Z').getUTCDay()
const today = iso(new Date())
const lastWork = (() => { for (let i = 1; i <= 7; i++) { const d = add(today, -i); if (dow(d) <= 4) return d } })()
const memberId = sql(`select id from members where email='${MEMBER}'`)
const reset = () => {
  sql(`delete from work_days where member_id in (select id from members where email in ('${MEMBER}','${ADMIN}')) and date >= '${add(today, -40)}'`)
  sql(`update members set hours_prompted_on=null, created_at=least(created_at, now() - interval '60 days') where email in ('${MEMBER}','${ADMIN}')`)
}
const day = (who, d) => sql(`select coalesce(hours::text, case when off then 'off' end) from work_days where member_id='${who}' and date='${d}'`)

async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...opts })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: 'lab-pass-1' } })
  if (!r.ok()) throw new Error(`login ${email}`)
  if (opts.ar) await ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return { ctx, page, errors }
}
async function axe(page, name) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const v = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run({ include: [['[data-today-hours]'], ['[data-hours-reminder]'], ['[data-hours-report]'], ['[data-hours-dialog]']].filter(s => document.querySelector(s[0])) }, { resultTypes: ['violations'] })
    return r.violations.filter(x => x.impact === 'serious' || x.impact === 'critical').map(x => `${x.id}: ${x.nodes[0]?.target?.join(' ')}`)
  })
  ok(v.length === 0, `axe: ${name}`, v.slice(0, 3).join(' | '))
}

;(async () => {
  reset()
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    console.log(`Reminder (today ${today}, last working day ${lastWork})`)
    const m = await login(browser, MEMBER)
    await m.page.goto(`${BASE}/board`)
    await m.page.waitForSelector('[data-hours-reminder]', { timeout: 15000 })
    ok(true, 'opens on the first page of the day, even off My Day')
    ok((await m.page.locator('[data-hours-reminder] h2').innerText()).length > 10, 'names the day', await m.page.locator('[data-hours-reminder] h2').innerText())
    ok(sql(`select hours_prompted_on from members where id='${memberId}'`) === today, 'opening counts as asked today')
    await axe(m.page, 'reminder')
    const firstFocus = await m.page.evaluate(() => document.activeElement?.closest('[data-day-line]') !== null)
    ok(firstFocus, 'focus starts in the first field')
    await m.page.click('[data-add-day]')
    await m.page.click('[data-add-day]')
    const lines = await m.page.locator('[data-hours-reminder] [data-day-line]').count()
    ok(lines === 3, 'Add another day twice gives three lines', String(lines))
    await m.page.locator('[data-hours-reminder] [data-day-line] input').nth(1).fill('30')
    await m.page.locator('[data-hours-reminder] [data-day-line] input').first().fill('8')
    await m.page.click('[data-days-save]')
    await m.page.waitForSelector('[data-hours-reminder] .fx-hr-lerr')
    ok(day(memberId, lastWork) === '', 'one bad line: nothing saved')
    ok(await m.page.locator('[data-hours-reminder] [data-day-line] input').first().inputValue() === '8', 'every value stays')
    await m.page.locator('[data-hours-reminder] [data-day-line] input').nth(1).fill('')
    await m.page.click('[data-same-all]')
    await m.page.click('[data-days-save]')
    await m.page.waitForSelector('[data-hours-reminder]', { state: 'detached' })
    const dates = await m.page.evaluate(() => 0)
    const saved = Number(sql(`select count(*) from work_days where member_id='${memberId}' and hours=8`))
    ok(saved === 3, 'Same for all, then one Save: three days', String(saved))
    await m.page.reload()
    await m.page.waitForTimeout(2500)
    ok(await m.page.locator('[data-hours-reminder]').count() === 0, 'not again today')

    console.log('Later, and a second browser')
    sql(`delete from work_days where member_id='${memberId}' and date >= '${add(today, -40)}'`)
    sql(`update members set hours_prompted_on=null where id='${memberId}'`)
    await m.page.goto(`${BASE}/projects`)
    await m.page.waitForSelector('[data-hours-reminder]', { timeout: 15000 })
    await m.page.keyboard.press('Escape')
    ok(await m.page.locator('[data-hours-reminder]').count() === 0, 'Esc means Later')
    const m2 = await login(browser, MEMBER)
    await m2.page.goto(`${BASE}/board`)
    await m2.page.waitForTimeout(3000)
    ok(await m2.page.locator('[data-hours-reminder]').count() === 0, 'another browser the same day: not asked again')
    await m2.ctx.close()

    console.log("Today's hours on My Day")
    await m.page.goto(`${BASE}/overview`)
    await m.page.waitForSelector('[data-today-hours]')
    await m.page.fill('[data-hours-input]', '7,5')
    await m.page.keyboard.press('Enter')
    await m.page.waitForFunction(() => /Saved/.test(document.querySelector('#fx-hr-status')?.textContent ?? ''))
    ok(day(memberId, today) === '7.50', 'type 7,5 and Enter: saved as 7.5')
    await m.page.reload(); await m.page.waitForSelector('[data-today-hours]')
    ok(await m.page.inputValue('[data-hours-input]') === '7.5', 'after a reload, 7.5')
    await m.page.click('[data-hours-quick="8"]')
    await m.page.waitForTimeout(800)
    ok(day(memberId, today) === '8.00' && Number(sql(`select count(*) from work_days where member_id='${memberId}' and date='${today}'`)) === 1, 'a quick choice replaces it: one entry, 8')
    for (const bad of ['30', 'abc', '7.1']) {
      await m.page.fill('[data-hours-input]', bad); await m.page.keyboard.press('Enter')
      await m.page.waitForSelector('.fx-hr-status.is-bad')
      ok(day(memberId, today) === '8.00', `${bad} refused with a reason`, await m.page.locator('#fx-hr-status').innerText())
    }
    const week = await m.page.locator('[data-hours-week]').innerText()
    ok(/of 40/.test(week), 'the week total against capacity', week)
    const missDay = await m.page.locator('.fx-hr-day.is-miss').first().getAttribute('data-hours-day').catch(() => null)
    if (missDay) {
      await m.page.click(`[data-hours-day="${missDay}"]`)
      await m.page.waitForSelector('[data-hours-dialog]')
      await m.page.locator('[data-hours-dialog] [data-day-line] input').first().fill('6.25')
      await m.page.click('[data-hours-dialog] [data-days-save]')
      await m.page.waitForSelector('[data-hours-dialog]', { state: 'detached' })
      ok(day(memberId, missDay) === '6.25', 'a Missing day in the strip can be filled', missDay)
    }
    const fridays = await m.page.locator('.fx-hr-day').evaluateAll(els => els.filter(e => new Date(e.dataset.hoursDay + 'T12:00').getDay() >= 5).map(e => e.className))
    ok(fridays.every(c => !c.includes('is-miss')), 'Friday and Saturday are never Missing')
    await axe(m.page, "Today's hours")
    ok(m.errors.length === 0, 'no console errors (member)', m.errors.slice(0, 2).join(' | '))

    console.log('Access')
    const r1 = await m.page.goto(`${BASE}/hours`)
    ok(m.page.url().endsWith('/overview'), 'a member is sent away from /hours')
    const r2 = await m.ctx.request.get(`${BASE}/hours/export`)
    ok(r2.status() === 403, 'a member gets 403 on the download')

    console.log('Report (admin)')
    const a = await login(browser, ADMIN)
    await a.page.goto(`${BASE}/hours`)
    await a.page.waitForSelector('[data-hours-report]')
    const row = a.page.locator(`[data-hours-row="${memberId}"]`)
    ok(await row.count() === 1, 'the member has a row')
    ok((await row.innerText()).includes('8'), "today's 8 shows")
    ok(await a.page.locator('nav a[href="/hours"]').count() >= 1, 'Hours is in the admin nav')
    const dl = await a.ctx.request.get(`${BASE}/hours/export`)
    const body = await dl.text()
    ok(dl.status() === 200 && (dl.headers()['content-type'] ?? '').includes('text/csv') && body.charCodeAt(0) === 0xFEFF, 'download: CSV with a BOM')
    ok(body.includes('Day total') && body.split('\r\n').length > 3, 'the CSV has rows and totals')
    await a.page.click('[data-week-prev]')
    await a.page.waitForURL(/week=/)
    ok(true, 'previous week')
    await axe(a.page, 'report')
    const ar = await login(browser, ADMIN, { ar: true })
    await ar.page.goto(`${BASE}/hours`); await ar.page.waitForSelector('[data-hours-report]')
    ok(await ar.page.evaluate(() => getComputedStyle(document.querySelector('[data-hours-report]')).direction) === 'rtl', 'Arabic report mirrors')
    await axe(ar.page, 'report in Arabic')
    ok(a.errors.length === 0, 'no console errors (admin)', a.errors.slice(0, 2).join(' | '))

    console.log('Phone')
    const ph = await login(browser, MEMBER, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    sql(`update members set hours_prompted_on=null where id='${memberId}'`)
    sql(`delete from work_days where member_id='${memberId}' and date='${lastWork}'`)
    await ph.page.goto(`${BASE}/overview`)
    await ph.page.waitForSelector('[data-hours-reminder]', { timeout: 15000 })
    const box = await ph.page.locator('[data-hours-reminder]').boundingBox()
    ok(box && box.y + box.height >= 800, 'the reminder is a bottom sheet', JSON.stringify(box))
    const save = await ph.page.locator('[data-hours-reminder] [data-days-save]').boundingBox()
    ok(save && save.height >= 44, '44 px targets', String(save?.height))
    ok(await ph.page.locator('[data-hours-reminder] input').first().getAttribute('inputmode') === 'decimal', 'the number keyboard')
    await axe(ph.page, 'reminder on a phone')
  } finally {
    await browser.close()
    reset()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); reset(); process.exit(1) })
