/**
 * Spec 019 stage 2 (the Content sheet on the fields model) on the running app.
 *   node scripts/spreadsheet-lab/realapp/content-fields.cjs [base]
 * Field icons and ＋ in the headings; ⚙ Fields and Columns open the same
 * drawer (Rows: Content tasks, Group by, field switches, regular columns);
 * hiding and showing a field; Group by Stage, None and back to Theme › Pillar;
 * the Values table (prefilled with the sheet's own words) and typing a word
 * into Status, with undo; Arabic, a phone and axe. The sheet's view, its
 * column layout and every task it moves are put back.
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
const viewOf = () => sql(`select coalesce(view::text,'{}') from sheets where linked_key='linked_content'`)
const drawer = async page => { if (!(await page.locator('[data-fields-drawer]').count())) await page.click('[data-fields-btn]'); await page.waitForSelector('[data-fields-drawer]') }
const close = async page => { if (await page.locator('[data-fields-drawer]').count()) await page.click('[data-fields-close]') }
const head = (page, key) => page.locator(`[data-content-sheet] [data-col-head="${key}"]`)

;(async () => {
  const folder = sql(`select id from sheet_folders where kind='content' limit 1`)
  const viewBefore = viewOf()
  const colsBefore = sql(`select coalesce(json_agg(row_to_json(c))::text,'[]') from sheet_columns c where sheet='content' and key='doc'`)
  // Two live pieces the admin can move, in an early stage.
  const pieces = sql(`select t.id || '|' || t.status from tasks t join projects p on p.id=t.project_id
    where p.is_theme and coalesce(t.content_type_label,'')<>'Video' and t.parent_task_id is null and t.dropped_at is null
      and t.status in ('todo','c-prog','c-final','r-design') and coalesce(t.nine_stage,false)=false order by t.name limit 2`).split('\n').map(l => { const [id, st] = l.split('|'); return { id, status: st } })
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const A = await login(browser), page = A.page
    const url = `${BASE}/sheets/${folder}`
    await page.goto(url); await page.waitForSelector('[data-content-sheet] [data-cell]')
    await page.waitForTimeout(1200)

    console.log('1. Headings: field icons and ＋')
    ok(await head(page, 'status').locator('.fx-fd-ic').count() === 1 && await head(page, 'date').locator('.fx-fd-ic').count() === 1, 'built-in columns carry their field icon')
    ok(await page.locator('[data-content-sheet] [data-tail-head] [data-add-field]').count() === 1, 'the last heading is ＋')
    ok(await page.locator('[data-content-sheet] .fx-content-theme-row').count() >= 1, 'rows are grouped by Theme › Pillar by default')

    console.log('2. ⚙ Fields and Columns open the drawer (US5)')
    await drawer(page)
    ok(/Content tasks from the board/.test(await page.locator('[data-rows-source]').innerText()), 'Rows: Content tasks from the board')
    ok(await page.locator('[data-group-by]').inputValue() === 'theme', 'Group by reads Theme › Pillar')
    ok(await page.locator('[data-fields-drawer] [data-field-values="stage"]').count() === 1 && await page.locator('[data-fields-drawer] [data-field-values="type"]').count() === 1, 'Stage and Type have Values')
    await axe(page, 'Content Fields drawer')
    await close(page)
    await page.click('[data-content-sheet] [data-columns-button]')
    ok(await page.locator('[data-fields-drawer]').count() === 1, 'Columns opens the same drawer')

    console.log('3. Hide a field, add it back from ＋')
    await page.click('[data-field-switch="doc"]')
    await page.waitForFunction(() => !document.querySelector('[data-content-sheet] [data-col-head="doc"]'), null, { timeout: 15000 }).catch(() => {})
    ok(await head(page, 'doc').count() === 0, 'switching Working doc off hides its column')
    ok(await page.locator('[data-field-switch="doc"]').getAttribute('aria-checked') === 'false', 'its switch reads off')
    await close(page)
    await page.click('[data-content-sheet] [data-add-field]'); await page.waitForSelector('[data-sheet-menu] [data-menu-item="doc"]')
    ok(await page.locator('[data-sheet-menu] [data-menu-item="regular"]').count() === 1, '＋ also offers a spreadsheet column')
    await page.click('[data-sheet-menu] [data-menu-item="doc"]')
    await page.waitForSelector('[data-content-sheet] [data-col-head="doc"]', { timeout: 15000 }).catch(() => {})
    ok(await head(page, 'doc').count() === 1, '＋ → Working doc shows it again')
    ok(await page.locator('[data-sheet-menu]').count() === 0, 'and the menu closes')

    console.log('4. Group by (US5)')
    await drawer(page)
    await page.selectOption('[data-group-by]', 'stage')
    await page.waitForSelector('[data-content-sheet] [data-group-row]', { timeout: 15000 }).catch(() => {})
    ok(await page.locator('[data-content-sheet] [data-group-row]').count() >= 1 && await page.locator('[data-content-sheet] .fx-content-theme-row').count() === 0, 'Stage groups the pieces under their stages')
    await page.waitForTimeout(800)
    ok(JSON.parse(viewOf()).groupBy?.by === 'stage', 'the choice is kept with the sheet')
    await page.reload(); await page.waitForSelector('[data-content-sheet] [data-cell]')
    await page.waitForSelector('[data-content-sheet] [data-group-row]', { timeout: 15000 }).catch(() => {})
    ok(await page.locator('[data-content-sheet] [data-group-row]').count() >= 1, 'and after a reload')
    await axe(page, 'Content sheet grouped by stage')
    await drawer(page)
    await page.selectOption('[data-group-by]', 'none')
    await page.waitForFunction(() => !document.querySelector('[data-content-sheet] [data-group-row]'), null, { timeout: 15000 }).catch(() => {})
    ok(await page.locator('[data-content-sheet] [data-group-row], [data-content-sheet] .fx-content-theme-row').count() === 0, 'None lists the pieces with no headings')
    await page.selectOption('[data-group-by]', 'theme')
    await page.waitForSelector('[data-content-sheet] .fx-content-theme-row', { timeout: 15000 }).catch(() => {})
    ok(await page.locator('[data-content-sheet] .fx-content-theme-row').count() >= 1, 'Theme › Pillar comes back')

    console.log('5. Values: the sheet’s own words (US6, FR-008)')
    await page.click('[data-fields-drawer] [data-field-values="stage"]'); await page.waitForSelector('[data-values-dialog="stage"]')
    const prefilled = await page.locator('[data-word-for="c-prog"]').inputValue()
    ok(prefilled.length > 0, 'the Content sheet’s own words are prefilled', prefilled)
    await axe(page, 'Content Values dialog')
    await page.fill('[data-word-for="d-prog"]', 'editing in progress')
    await page.click('[data-values-save]'); await page.waitForSelector('[data-values-dialog]', { state: 'detached' })
    await page.waitForTimeout(800)
    ok(JSON.stringify(JSON.parse(viewOf()).words?.stage?.['d-prog']) === '["editing in progress"]', 'saved with the sheet')
    await close(page)

    console.log('6. Typing a word into Status, with undo (FR-005)')
    const T = pieces[0]
    const cell = page.locator(`[data-content-sheet] [data-cell="k:${T.id}|status"]`)
    await cell.scrollIntoViewIfNeeded(); await cell.click()
    await page.waitForSelector('[data-sheet-menu]').catch(() => {})
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    await page.keyboard.type('Editing in  progress'); await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
    ok(status(T.id) === 'd-prog', 'the task moves to D-In Progress', status(T.id))
    ok(/editing in progress/.test(await cell.innerText()), 'the pill shows the sheet’s word')
    await page.click('[data-undo]'); await page.waitForTimeout(2000)
    ok(status(T.id) === T.status, 'undo moves it back', status(T.id))
    await cell.click(); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(150)
    await page.keyboard.type('not a stage'); await page.keyboard.press('Enter'); await page.waitForTimeout(800)
    ok(status(T.id) === T.status && /isn’t a stage/.test(await page.locator('[data-content-sheet]').innerText()), 'an unknown word is refused with a note')

    console.log('7. Arabic and a phone')
    const AR = await login(browser)
    await AR.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await AR.page.goto(url); await AR.page.waitForSelector('[data-content-sheet] [data-cell]')
    await drawer(AR.page)
    await axe(AR.page, 'Content Fields drawer in Arabic')
    const P = await login(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await P.page.goto(url); await P.page.waitForSelector('[data-content-sheet] [data-cell]')
    await P.page.click('[data-content-sheet] [data-columns-button]'); await P.page.waitForSelector('[data-fields-drawer]')
    const box = await P.page.locator('[data-fields-drawer]').boundingBox()
    ok(box && box.width <= 390 && box.y > 100, 'phone: the drawer is a bottom sheet')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/content-fields.png` })

    ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
    for (const t of pieces) sql(`update tasks set status='${t.status}' where id='${t.id}'`)
    sql(`update sheets set view='${viewBefore.replace(/'/g, "''")}'::jsonb where linked_key='linked_content'`)
    const before = JSON.parse(colsBefore)
    if (!before.length) sql(`delete from sheet_columns where sheet='content' and key='doc'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
