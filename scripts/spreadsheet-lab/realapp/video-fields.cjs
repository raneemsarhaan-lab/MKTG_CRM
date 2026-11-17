/**
 * Spec 019 stage 3 (the Video sheet on the fields model) on the running app.
 *   node scripts/spreadsheet-lab/realapp/video-fields.cjs [base]
 * Field icons and ＋ in the headings; ⚙ Fields and Columns open the same
 * drawer (Rows: videos and their clips, Group by, switches for the set on
 * show); hiding and showing a column; Group by Stage and back to Video; the
 * Values table (prefilled with the Video sheet's words) and typing a word into
 * a clip's Status, with undo; Arabic, a phone and axe. The sheet's view, its
 * column layout and every clip it moves are put back.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
const ADMIN_ID = sql(`select id from members where access='admin' and password_hash is not null order by created_at limit 1`)
const SHOTS = process.env.LAB_SHOTS || ''
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }
const errors = []

async function login(browser, opts = {}) {
  const email = sql(`select email from members where id='${ADMIN_ID}'`)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: 'lab-pass-1' } })
  if (!r.ok()) throw new Error(`login: ${r.status()}`)
  const page = await ctx.newPage()
  await page.addLocatorHandler(page.locator('[data-hours-later]'), b => b.click())
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return { ctx, page }
}
async function axe(page, name) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run({ exclude: [['aside.fx-sidebar'], ['.fx-tabbar']] }, { resultTypes: ['violations'] })
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id} (${v.nodes.length}): ${v.nodes.map(n => n.target.join(' ')).slice(0, 2).join(' ; ')}`)
  })
  ok(res.length === 0, `axe: ${name}`, res.slice(0, 3).join(' | '))
}
const status = id => sql(`select status from tasks where id='${id}'`)
const viewOf = () => sql(`select coalesce(view::text,'{}') from sheets where linked_key='linked_video'`)
const drawer = async page => { if (!(await page.locator('[data-fields-drawer]').count())) await page.click('[data-fields-btn]'); await page.waitForSelector('[data-fields-drawer]') }
const close = async page => { if (await page.locator('[data-fields-drawer]').count()) await page.click('[data-fields-close]') }
const head = (page, key) => page.locator(`[data-video-sheet] [data-col-head="${key}"]`)


;(async () => {
  const folder = sql(`select id from sheet_folders where kind='video' limit 1`)
  const viewBefore = viewOf()
  const srcBefore = sql(`select coalesce(json_agg(row_to_json(c))::text,'[]') from sheet_columns c where sheet='video' and key='source'`)
  const clip = sql(`select c.id || '|' || c.status from tasks c join tasks v on v.id=c.parent_task_id where v.content_type_label='Video' and v.parent_task_id is null
      and c.dropped_at is null and c.status in ('todo','c-prog','r-design') order by c.name limit 1`).split('|')
  const T = { id: clip[0], status: clip[1] }
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const A = await login(browser), page = A.page
    const url = `${BASE}/sheets/${folder}`
    await page.goto(url); await page.waitForSelector('[data-video-sheet] [data-cell]')
    await page.waitForTimeout(1200)

    console.log('1. Headings: field icons and ＋')
    ok(await head(page, 'status').locator('.fx-fd-ic').count() === 1 && await head(page, 'editor').locator('.fx-fd-ic').count() === 1, 'task fields carry their icon (Status, Editor)')
    ok(await page.locator('[data-video-sheet] [data-tail-head] [data-add-field]').count() === 1, 'the last heading is ＋')
    ok(await page.locator('[data-video-sheet] .fx-sheet-tr.is-video').count() >= 1, 'videos with their clips, as before')

    console.log('2. ⚙ Fields and Columns open the drawer')
    await drawer(page)
    ok(/Videos and their clips/.test(await page.locator('[data-rows-source]').innerText()), 'Rows: videos and their clips')
    ok(await page.locator('[data-group-by]').inputValue() === 'video', 'Group by reads Video')
    ok(await page.locator('[data-fields-drawer] [data-field-values="stage"]').count() === 1, 'Status has Values')
    await axe(page, 'Video Fields drawer')
    await close(page)
    await page.click('[data-video-sheet] [data-columns-button]')
    ok(await page.locator('[data-fields-drawer]').count() === 1, 'Columns opens the same drawer')

    console.log('3. Hide a column, add it back from ＋')
    await page.click('[data-field-switch="source"]')
    await page.waitForFunction(() => !document.querySelector('[data-video-sheet] [data-col-head="source"]'), null, { timeout: 15000 }).catch(() => {})
    ok(await head(page, 'source').count() === 0, 'switching Source off hides it')
    await close(page)
    await page.click('[data-video-sheet] [data-add-field]'); await page.waitForSelector('[data-sheet-menu] [data-menu-item="source"]')
    await page.click('[data-sheet-menu] [data-menu-item="source"]')
    await page.waitForSelector('[data-video-sheet] [data-col-head="source"]', { timeout: 15000 }).catch(() => {})
    ok(await head(page, 'source').count() === 1 && await page.locator('[data-sheet-menu]').count() === 0, '＋ → Source shows it again, and the menu closes')

    console.log('4. Group by')
    await drawer(page)
    await page.selectOption('[data-group-by]', 'stage')
    await page.waitForSelector('[data-video-sheet] [data-group-row]', { timeout: 15000 }).catch(() => {})
    ok(await page.locator('[data-video-sheet] [data-group-row]').count() >= 1, 'Stage groups the videos (each with its clips)')
    await page.waitForTimeout(800)
    ok(JSON.parse(viewOf()).groupBy?.by === 'stage', 'the choice is kept with the sheet')
    await page.reload(); await page.waitForSelector('[data-video-sheet] [data-cell]')
    await page.waitForSelector('[data-video-sheet] [data-group-row]', { timeout: 15000 }).catch(() => {})
    ok(await page.locator('[data-video-sheet] [data-group-row]').count() >= 1, 'and after a reload')
    await axe(page, 'Video sheet grouped by stage')
    await drawer(page)
    await page.selectOption('[data-group-by]', 'video')
    await page.waitForFunction(() => !document.querySelector('[data-video-sheet] [data-group-row]'), null, { timeout: 15000 }).catch(() => {})
    ok(await page.locator('[data-video-sheet] [data-group-row]').count() === 0, 'Video brings the sheet’s own order back')

    console.log('5. Values: the sheet’s own words')
    await page.click('[data-fields-drawer] [data-field-values="stage"]'); await page.waitForSelector('[data-values-dialog="stage"]')
    ok((await page.locator('[data-word-for="d-prog"]').inputValue()).length > 0, 'the Video sheet’s own words are prefilled', await page.locator('[data-word-for="d-prog"]').inputValue())
    await axe(page, 'Video Values dialog')
    await page.fill('[data-word-for="d-prog"]', 'cutting')
    await page.click('[data-values-save]'); await page.waitForSelector('[data-values-dialog]', { state: 'detached' })
    await page.waitForTimeout(800)
    ok(JSON.stringify(JSON.parse(viewOf()).words?.stage?.['d-prog']) === '["cutting"]', 'saved with the sheet')
    await close(page)

    console.log('6. Typing a word into a clip’s Status, with undo')
    const cell = page.locator(`[data-video-sheet] [data-cell="c:${T.id}|status"]`)
    await cell.scrollIntoViewIfNeeded(); await cell.click()
    await page.waitForSelector('[data-sheet-menu]').catch(() => {})
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    await page.keyboard.type('Cutting'); await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
    ok(status(T.id) === 'd-prog', 'the clip moves to D-In Progress', status(T.id))
    ok(/cutting/.test(await cell.innerText()), 'the pill shows the sheet’s word')
    await page.click('[data-undo]'); await page.waitForTimeout(2000)
    ok(status(T.id) === T.status, 'undo moves it back', status(T.id))

    console.log('7. Arabic and a phone')
    const AR = await login(browser)
    await AR.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await AR.page.goto(url); await AR.page.waitForSelector('[data-video-sheet] [data-cell]')
    await drawer(AR.page)
    await axe(AR.page, 'Video Fields drawer in Arabic')
    const P = await login(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await P.page.goto(url); await P.page.waitForSelector('[data-video-sheet] [data-cell]')
    await P.page.click('[data-video-sheet] [data-columns-button]'); await P.page.waitForSelector('[data-fields-drawer]')
    const box = await P.page.locator('[data-fields-drawer]').boundingBox()
    ok(box && box.width <= 390 && box.y > 100, 'phone: the drawer is a bottom sheet')
    if (SHOTS) { await page.reload(); await page.waitForSelector('[data-video-sheet] [data-cell]'); await page.waitForTimeout(1000); await page.screenshot({ path: `${SHOTS}/video-fields.png` }) }

    ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
    sql(`update tasks set status='${T.status}' where id='${T.id}'`)
    sql(`update sheets set view='${viewBefore.replace(/'/g, "''")}'::jsonb where linked_key='linked_video'`)
    if (!JSON.parse(srcBefore).length) sql(`delete from sheet_columns where sheet='video' and key='source'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
