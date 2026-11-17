/**
 * Spec 019 stage 1 (task fields in a team sheet) on the running app.
 *   node scripts/spreadsheet-lab/realapp/fields.cjs [base]
 * Seeds a team folder whose Task column holds three task links and whose
 * "Status (our words)" column uses the team's own words, then:
 * links it from ⚙ Fields, matches the words to stages, adds fields from ＋,
 * edits each control (stage, assignee, due date, design link) with undo,
 * hides a field, types a sheet word, drags a column, groups rows, and checks
 * Arabic, a phone and axe. Every task it touches is put back; the folder is removed.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
// The lab admin: the first admin-access member (the address isn't written here).
const ADMIN_ID = sql(`select id from members where access='admin' and password_hash is not null order by created_at limit 1`)
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }
const errors = []
const q = s => s.replace(/'/g, "''")

function seed() {
  const pieces = sql(`select t.id || '|' || t.name || '|' || t.status || '|' || coalesce(t.assignee_id::text,'') || '|' || coalesce(t.due_date::text,'') from tasks t join projects p on p.id=t.project_id
    where p.is_theme and coalesce(t.content_type_label,'')<>'Video' and t.parent_task_id is null and t.dropped_at is null
      and t.status in ('todo','c-prog','c-final','c-check','r-design') and coalesce(t.nine_stage,false)=false
      and (select count(*) from tasks x where lower(x.name)=lower(t.name))=1 order by t.name limit 3`)
    .split('\n').map(l => { const [id, name, status, assignee, due] = l.split('|'); return { id, name, status, assignee, due } })
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Fields lab ' || floor(random()*1e6)) returning id`)
  const sheet = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'TSC Calendar', 0, 20, 6) returning id`)
  sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 20) g`)
  sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 6) g`)
  const link = id => `${BASE}/board?task=${id}`
  const rows = [
    ['Task', 'Status (our words)', 'Notes', 'Owner group'],
    [link(pieces[0].id), 'editing in progress', 'first', 'North'],
    [link(pieces[1].id), 'live', 'second', 'South'],
    [link(pieces[2].id), 'editing in progress', 'third', 'North'],
    ['Just a note', 'idea', 'fourth', 'South'],
  ]
  const values = rows.flatMap((row, r) => row.map((v, c) => (v ? `(${r + 1}, ${c + 1}, '${q(v)}')` : null)).filter(Boolean)).join(',')
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value) select '${sheet}', r.id, c.id, v.val
       from (values ${values}) as v(rp, cp, val) join sheet_rows r on r.sheet_id='${sheet}' and r.position=v.rp join sheet_cols c on c.sheet_id='${sheet}' and c.position=v.cp`)
  const cols = sql(`select id from sheet_cols where sheet_id='${sheet}' order by position`).split('\n')
  return { folder, sheet, pieces, cols }
}
async function login(browser, opts = {}) {
  const email = sql(`select email from members where id='${ADMIN_ID}'`)
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, ...opts })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: 'lab-pass-1' } })
  if (!r.ok()) throw new Error(`login: ${r.status()}`)
  const page = await ctx.newPage()
  // The day's hours reminder (spec 014) may open over the sheet: Later.
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
const rowsOf = page => page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]')
const cellOf = (page, r, c) => rowsOf(page).nth(r).locator('.fx-sheet-td').nth(c + 1)
const cellAt = (page, rowId, colId) => page.locator(`[data-blank-sheet] [data-cell="${rowId}|${colId}"]`)
const text = async (page, r, c) => (await cellOf(page, r, c).innerText()).trim()
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 20000 })
const undo = async page => { await page.click('[data-undo]'); await page.waitForTimeout(1500) }
const status = id => sql(`select status from tasks where id='${id}'`)
const taskMap = sheet => JSON.parse(sql(`select coalesce(task_map::text, 'null') from sheets where id='${sheet}'`))
const headCount = (page, f) => page.locator(`[data-blank-sheet] [data-field-badge="${f}"]`).count()
const colOfField = (sheet, f) => Object.entries(taskMap(sheet)?.fields ?? {}).find(([, x]) => x === f)?.[0]
const rowIds = sheet => sql(`select id from sheet_rows where sheet_id='${sheet}' order by position`).split('\n')
const drawer = async page => { if (!(await page.locator('[data-fields-drawer]').count())) await page.click('[data-fields-btn]'); await page.waitForSelector('[data-fields-drawer]') }

;(async () => {
  const ids = seed()
  const T = ids.pieces
  const rid = rowIds(ids.sheet)
  const before = Object.fromEntries(T.map(t => [t.id, t]))
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const A = await login(browser), page = A.page
    const url = `${BASE}/sheets/${ids.folder}?sheet=${ids.sheet}`
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]')

    console.log('1. ⚙ Fields: the drawer and linking (US4)')
    ok(await page.locator('[data-blank-sheet] [data-tail-head] [data-add-field]').count() === 1, 'the last heading is ＋')
    await drawer(page)
    await axe(page, 'Fields drawer, not linked')
    ok(/Not linked yet/.test(await page.locator('[data-fields-drawer]').innerText()), 'the drawer says the sheet is not linked yet')
    await page.click('[data-fields-link]'); await page.waitForSelector('[data-link-board]')
    await page.click('[data-task-col="A"]'); await page.click('[data-link-board] [data-next]')
    await page.click('[data-save-fields]'); await page.waitForSelector('[data-link-result]', { timeout: 20000 })
    await page.click('[data-link-board] [data-ok]')
    await page.waitForFunction(() => document.querySelectorAll('[data-task-marker]').length === 3, null, { timeout: 15000 }).catch(() => {})
    ok(await page.locator('[data-task-marker]').count() === 3, 'three rows are linked to their tasks')
    ok(/Task column: A/.test(await page.locator('[data-fields-drawer]').innerText()), 'the drawer names the task column')
    await page.click('[data-fields-close]')
    await saved(page)

    console.log('2. Use a column for Stage: Match the values (US6)')
    await page.locator(`[data-col-head="${ids.cols[1]}"]`).click({ button: 'right' })
    await page.click('[data-cell-menu] [role="menuitem"]:has-text("Use this column for a task field")')
    await page.waitForSelector('[data-cell-menu] [role="menuitem"]:has-text("Stage")')
    await page.click('[data-cell-menu] [role="menuitem"]:has-text("Stage")')
    await page.waitForSelector('[data-match-dialog="stage"]')
    await axe(page, 'Match the values')
    ok(await page.locator('[data-match-dialog] [data-match-for]').count() === 3, 'each distinct value is listed once', String(await page.locator('[data-match-dialog] [data-match-for]').count()))
    ok(/2 rows/.test(await page.locator('[data-match-dialog]').innerText()), 'with its row count')
    await page.selectOption('[data-match-for="editing in progress"]', 'd-prog')
    await page.selectOption('[data-match-for="live"]', 'publish')
    ok(await page.locator('[data-match-for="idea"]').inputValue() === '', '“idea” is left as text')
    ok(await page.locator('[data-win="board"]').isChecked(), 'keep the board’s stage is the default')
    await page.click('[data-match-save]')
    await page.waitForFunction(() => document.querySelectorAll('[data-field-badge="stage"]').length === 1, null, { timeout: 15000 }).catch(() => {})
    await saved(page)
    const m1 = taskMap(ids.sheet)
    ok(m1?.fields?.[ids.cols[1]] === 'stage', 'column B is now the Stage field')
    ok(JSON.stringify(m1?.words?.stage?.['d-prog']) === '["editing in progress"]' && JSON.stringify(m1?.words?.stage?.publish) === '["live"]', 'the words are saved with the sheet', JSON.stringify(m1?.words))
    ok(T.every(t => status(t.id) === t.status), 'no task moved (the board’s stage was kept)')
    ok(await cellAt(page, rid[1], ids.cols[1]).locator('.fx-sheet-status').count() === 1, 'a linked row shows the stage pill')
    ok((await cellAt(page, rid[4], ids.cols[1]).innerText()).trim() === 'idea', 'an unlinked row keeps its text')
    ok(await page.locator(`[data-col-head="${ids.cols[1]}"].is-field`).count() === 1, 'the heading is a field heading')

    console.log('3. ＋ adds task fields (US1)')
    for (const f of ['assignee', 'due', 'link:design']) {
      await page.click('[data-add-field]'); await page.waitForSelector('[data-sheet-menu]')
      await page.click(`[data-sheet-menu] [data-menu-item="${f}"]`)
      await page.waitForFunction(f => document.querySelectorAll(`[data-field-badge="${f}"]`).length === 1, f, { timeout: 15000 }).catch(() => {})
    }
    await saved(page)
    ok(await headCount(page, 'assignee') === 1 && await headCount(page, 'due') === 1 && await headCount(page, 'link:design') === 1, 'Assignee, Due date and Design link are field columns')
    const dueCol = colOfField(ids.sheet, 'due'), asgCol = colOfField(ids.sheet, 'assignee'), dzCol = colOfField(ids.sheet, 'link:design')
    ok(!!dueCol && sql(`select value from sheet_cells where sheet_id='${ids.sheet}' and row_id='${rid[0]}' and col_id='${dueCol}'`) === 'Due date', 'the new column is named in the headings row')
    ok(sql(`select count(*) from sheet_cols where sheet_id='${ids.sheet}'`) === '9', 'each is a new column at the end')
    ok((await cellAt(page, rid[4], dzCol).innerText()).trim() === '', 'an unlinked row’s field cell is empty')
    ok(/\+ link/.test(await cellAt(page, rid[1], dzCol).innerText()), 'an empty link field offers “+ link”')

    console.log('4. Controls save to the task, with undo (US2)')
    await cellAt(page, rid[1], ids.cols[1]).click()
    await page.waitForSelector('[data-sheet-menu]')
    await axe(page, 'stage menu')
    const target = await page.locator('[data-sheet-menu] [role="menuitem"]').nth(1).getAttribute('data-menu-item')
    await page.locator('[data-sheet-menu] [role="menuitem"]').nth(1).click()
    await page.waitForTimeout(1500)
    ok(status(T[0].id) === target, 'picking a stage moves the task on the board', `${status(T[0].id)} vs ${target}`)
    await undo(page)
    ok(status(T[0].id) === T[0].status, 'one undo moves it back')

    await cellAt(page, rid[2], asgCol).click()
    await page.waitForSelector('[data-sheet-menu]')
    const pick = page.locator('[data-sheet-menu] [role="menuitem"]').first()
    const pickedName = (await pick.innerText()).trim()
    await pick.click(); await page.waitForTimeout(1500)
    const nowAsg = sql(`select coalesce(m.name,'') from tasks t left join members m on m.id=t.assignee_id where t.id='${T[1].id}'`)
    ok(nowAsg === pickedName, 'the people picker sets the assignee', `${nowAsg} vs ${pickedName}`)
    await undo(page)
    ok(sql(`select coalesce(assignee_id::text,'') from tasks where id='${T[1].id}'`) === T[1].assignee, 'undo puts the assignee back')

    const newDue = `2027-0${1 + Math.floor(Math.random() * 8)}-1${Math.floor(Math.random() * 9)}`
    await cellAt(page, rid[3], dueCol).click()
    await page.waitForSelector('[data-field-pop="due"]')
    await page.fill('[data-field-pop="due"] input', newDue); await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)
    ok(sql(`select coalesce(due_date::text,'') from tasks where id='${T[2].id}'`).startsWith(newDue), 'the date picker sets the due date')
    await undo(page)
    ok(sql(`select coalesce(due_date::text,'') from tasks where id='${T[2].id}'`) === T[2].due, 'undo puts the date back')

    await cellAt(page, rid[1], dzCol).click()
    await page.waitForSelector('[data-field-pop="link:design"]')
    await page.fill('[data-field-pop="link:design"] input', 'https://www.canva.com/design/lab-fields'); await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)
    ok((await cellAt(page, rid[1], dzCol).innerText()).trim() === 'Canva', 'a design link shows the site’s name')
    await undo(page)
    ok(/\+ link/.test(await cellAt(page, rid[1], dzCol).innerText()), 'undo clears it again')
    await saved(page)

    console.log('5. Typing a sheet word (US6)')
    await cellAt(page, rid[3], ids.cols[1]).click()
    await page.keyboard.press('Escape').catch(() => {})
    await page.keyboard.type('Editing  in progress'); await page.keyboard.press('Enter')
    await page.waitForTimeout(1800)
    ok(status(T[2].id) === 'd-prog', 'typing the sheet’s word moves the task to D-In Progress (case and spaces ignored)', status(T[2].id))
    ok(/editing in progress/.test(await cellAt(page, rid[3], ids.cols[1]).innerText()), 'and the cell shows the sheet’s word')
    await undo(page)
    ok(status(T[2].id) === T[2].status, 'undo moves it back')

    console.log('6. Values (US6)')
    await drawer(page)
    await page.click('[data-field-values="stage"]'); await page.waitForSelector('[data-values-dialog="stage"]')
    await axe(page, 'Values dialog')
    ok(await page.locator('[data-word-for="d-prog"]').inputValue() === 'editing in progress', 'the matched words are in the table')
    await page.fill('[data-word-for="todo"]', 'live')
    await page.click('[data-values-save]')
    ok(await page.locator('[data-values-dialog] [role="alert"]').count() === 1, 'a word given to two values is refused')
    await page.fill('[data-word-for="todo"]', 'not started, backlog')
    await page.click('[data-values-save]'); await page.waitForSelector('[data-values-dialog]', { state: 'detached' })
    await saved(page)
    ok(JSON.stringify(taskMap(ids.sheet)?.words?.stage?.todo) === '["not started","backlog"]', 'new words are saved', JSON.stringify(taskMap(ids.sheet)?.words?.stage))

    console.log('7. Switching a field off (US1)')
    const asgBefore = sql(`select coalesce(assignee_id::text,'') from tasks where id='${T[0].id}'`)
    await page.click('[data-field-switch="assignee"]')
    await page.waitForFunction(() => !document.querySelector('[data-field-badge="assignee"]'), null, { timeout: 15000 }).catch(() => {})
    ok(await headCount(page, 'assignee') === 0, 'switching Assignee off removes its column')
    ok(sql(`select coalesce(assignee_id::text,'') from tasks where id='${T[0].id}'`) === asgBefore, 'the task keeps its assignee')
    ok(await page.locator('[data-field-switch="assignee"]').getAttribute('aria-checked') === 'false', 'its switch reads off')
    await page.click('[data-fields-close]')
    await undo(page)
    ok(await headCount(page, 'assignee') === 1, 'undo brings the column back')
    await saved(page)

    console.log('8. Drag a column by its heading')
    const notes = ids.cols[2]
    await page.locator(`[data-col-head="${notes}"]`).dragTo(page.locator(`[data-col-head="${ids.cols[0]}"]`))
    await page.waitForTimeout(800); await saved(page)
    const order = sql(`select id from sheet_cols where sheet_id='${ids.sheet}' order by position`).split('\n')
    ok(order[0] === notes, 'Notes moved to the first column (saved)')
    ok((await page.locator('[data-blank-sheet] .fx-sheet-th.is-letter').first().innerText()).trim().startsWith('A') && (await text(page, 0, 0)) === 'Notes', 'it is now column A')
    await undo(page); await saved(page)
    ok(sql(`select id from sheet_cols where sheet_id='${ids.sheet}' order by position`).split('\n')[2] === notes, 'undo moves it back')
    await page.locator(`[data-col-head="${notes}"]`).dragTo(page.locator('[data-tail-head]'))
    await page.waitForTimeout(800); await saved(page)
    ok(sql(`select id from sheet_cols where sheet_id='${ids.sheet}' order by position desc limit 1`) === notes, 'dropping on ＋ moves it to the end')
    await undo(page); await saved(page)

    console.log('9. Group rows by (theme, stage, a column)')
    await drawer(page)
    await page.selectOption('[data-group-by]', 'theme')
    await page.waitForSelector('[data-blank-sheet] [data-band]')
    ok(await page.locator('[data-blank-sheet] [data-band]').count() >= 2, 'Theme › Pillar bands', String(await page.locator('[data-blank-sheet] [data-band]').count()))
    ok(await rowsOf(page).first().getAttribute('data-row') === rid[0], 'the headings row stays on top')
    ok(/Not linked to a task/.test(await page.locator('[data-blank-sheet]').innerText()), 'rows with no task are grouped last')
    await page.selectOption('[data-group-by]', `col:${ids.cols[3]}`)
    await page.waitForFunction(() => [...document.querySelectorAll('[data-band-name]')].map(b => b.getAttribute('data-band-name')).join('|').includes('North'), null, { timeout: 8000 }).catch(() => {})
    const names = await page.locator('[data-blank-sheet] [data-band-name]').evaluateAll(els => els.map(e => e.getAttribute('data-band-name')))
    ok(names.slice(0, 2).join('|') === 'North|South', 'grouping by a regular column works too', names.join('|'))
    await saved(page)
    await page.reload(); await page.waitForSelector('[data-blank-sheet] [data-band]')
    ok(await page.locator('[data-blank-sheet] [data-band]').count() >= 2, 'the grouping is kept after a reload')
    await axe(page, 'grouped sheet')
    await drawer(page)
    await page.selectOption('[data-group-by]', '')
    await page.waitForFunction(() => !document.querySelector('[data-blank-sheet] [data-band]'), null, { timeout: 8000 }).catch(() => {})
    ok(await page.locator('[data-blank-sheet] [data-band]').count() === 0, 'No grouping removes the bands')
    await page.click('[data-fields-close]')

    console.log('10. Data › Task fields, Arabic and a phone')
    await page.click('[data-mb="data"]'); await page.click('[data-mb-data] [role="menuitem"]:has-text("Task fields")')
    ok(await page.locator('[data-fields-drawer]').count() === 1, 'Data › Task fields opens the drawer')
    await page.keyboard.press('Escape')
    const AR = await login(browser)
    await AR.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await AR.page.goto(url); await AR.page.waitForSelector('[data-blank-sheet] [data-task-marker]')
    await drawer(AR.page)
    await axe(AR.page, 'Fields drawer in Arabic')
    const arBox = await AR.page.locator('[data-fields-drawer]').boundingBox()
    ok(arBox && arBox.x < 100, 'Arabic: the drawer opens on the left (mirrored)')
    const P = await login(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await P.page.goto(url); await P.page.waitForSelector('[data-blank-sheet] [data-task-marker]')
    await drawer(P.page)
    const box = await P.page.locator('[data-fields-drawer]').boundingBox()
    ok(box && box.width <= 390 && box.y > 100, 'phone: the drawer is a bottom sheet')
    await axe(P.page, 'Fields drawer on a phone')

    ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
    for (const t of Object.values(before)) sql(`update tasks set status='${t.status}', assignee_id=${t.assignee ? `'${t.assignee}'` : 'null'}, due_date=${t.due ? `'${t.due}'` : 'null'} where id='${t.id}'`)
    sql(`delete from sheet_folders where id='${ids.folder}'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
