/**
 * Spec 015 stage 1 on the running app (quickstart.md "Running-app checks,
 * stage 1", rows 1–14), against `next start`.
 *   node scripts/spreadsheet-lab/realapp/format.cjs [base]
 * Seeds a folder with a 5,000 × 26 sheet and a small sheet, drives the format
 * toolbar, merges, the clipboard, comments and notifications as the lab admin
 * and a lab member, on the Content sheet too, then in Arabic and on a phone,
 * with axe. The folder and its notifications are removed at the end.
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const BASE = process.argv[2] || 'http://localhost:3000'
const DB = process.env.DATABASE_URL || 'postgresql://momentum:momentum@localhost:5432/momentum'
const sql = q => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAt`, { input: q.replace(/\s+/g, ' ') }).toString().trim()
const PASS = 'lab-pass-1'
const ADMIN = 'raneem.sarhaan@forefront.consulting', MEMBER = 'content@forefront.consulting', OTHER = 'design@forefront.consulting'
let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) } else { fail++; console.log(`  ✗ ${name} ${extra}`) } }
const errors = []

function seed() {
  const folder = sql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Format lab ' || floor(random()*1e6)) returning id`)
  const big = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Big', 1, 5000, 26) returning id`)
  const small = sql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Plan', 0, 100, 26) returning id`)
  for (const [s, n] of [[big, 5000], [small, 100]]) {
    sql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${s}', g from generate_series(1, ${n}) g`)
    sql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${s}', g from generate_series(1, 26) g`)
  }
  sql(`insert into sheet_cells (sheet_id, row_id, col_id, value) select '${big}', r.id, c.id, 'R' || r.position || 'C' || c.position
       from sheet_rows r cross join sheet_cols c where r.sheet_id='${big}' and c.sheet_id='${big}' and c.position <= 2`)
  return { folder, big, small }
}

async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], ...opts })
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: PASS } })
  if (!r.ok()) throw new Error(`login ${email}: ${r.status()}`)
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${email}: ${e}`))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${email}: ${m.text()}`) })
  return { ctx, page }
}
async function axe(page, name) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run({ exclude: [['aside.fx-sidebar'], ['nav.fx-tabbar'], ['.fx-tabbar']] }, { resultTypes: ['violations'] })
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.id} (${v.nodes.length}): ${v.nodes.map(n => n.target.join(' ')).slice(0, 2).join(' ; ')}`)
  })
  ok(res.length === 0, `axe: ${name}`, res.slice(0, 3).join(' | '))
}
const cellOf = (page, r, c) => page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(r).locator('.fx-sheet-td').nth(c + 1)
const saved = page => page.waitForSelector('[data-save-status="saved"]', { timeout: 15000 })
const typeAt = async (page, r, c, v) => { await cellOf(page, r, c).click(); await page.keyboard.type(v); await page.keyboard.press('Enter') }
const css = (loc, prop) => loc.evaluate((e, p) => getComputedStyle(e)[p], prop)
const paste = (page, text, html) => page.evaluate(([text, html]) => {
  const dt = new DataTransfer(); dt.setData('text/plain', text); if (html) dt.setData('text/html', html)
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
}, [text, html])

;(async () => {
  const ids = seed()
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  const started = new Date().toISOString()
  try {
    const A = await login(browser, ADMIN), page = A.page
    const url = `${BASE}/sheets/${ids.folder}?sheet=${ids.small}`
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]'); await page.waitForSelector('[data-format-bar]')
    for (const [r, c, v] of [[0, 0, 'Campaign'], [0, 1, 'Budget'], [0, 2, 'Launch'], [0, 3, 'Notes'], [1, 0, 'Ramadan teaser'], [1, 1, '12500'], [1, 2, '2026-11-16'], [2, 0, 'Summit'], [2, 1, '48000']]) await typeAt(page, r, c, v)

    console.log('1. Header row: bold, fill, white text, centre, thick bottom border')
    const t0 = Date.now()
    await cellOf(page, 0, 0).click(); await cellOf(page, 0, 3).click({ modifiers: ['Shift'] })
    await page.click('[data-fmt="b"]')
    await page.click('[data-fmt="fill"]'); await page.click('[data-color-picker] [data-pick="#7030A0"] >> nth=0')
    await page.click('[data-fmt="color"]'); await page.click('[data-color-picker] [data-pick="#FFFFFF"] >> nth=0')
    await page.click('[data-fmt="center"]')
    await page.click('[data-fmt="borders"]'); await page.click('[data-border-picker] [data-border="thickBottom"]')
    const secs = (Date.now() - t0) / 1000
    ok(secs < 20, 'SC-001: header formatted in under 20 s (scripted)', `${secs.toFixed(1)} s`)
    await saved(page)
    await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    const h = cellOf(page, 0, 1)
    ok(await css(h, 'fontWeight') === '700' && await css(h, 'backgroundColor') === 'rgb(112, 48, 160)' && await css(h, 'color') === 'rgb(255, 255, 255)' && await css(h, 'textAlign') === 'center', 'the look is the same after a reload')
    ok(await cellOf(page, 0, 1).locator('.fx-cell-bd').count() === 1, 'the thick bottom border is drawn')
    const M = await login(browser, MEMBER)
    await M.page.goto(url); await M.page.waitForSelector('[data-blank-sheet]')
    ok(await css(cellOf(M.page, 0, 1), 'backgroundColor') === 'rgb(112, 48, 160)', 'another member sees the same formatting (SC-005)')
    await page.click('[data-fmt="b"]').catch(() => {})
    await page.keyboard.press('Control+z')

    console.log('2. Currency EGP, 2 decimals; editing shows the value')
    await cellOf(page, 1, 1).click(); await cellOf(page, 2, 1).click({ modifiers: ['Shift'] })
    await page.click('[data-fmt="num"]'); await page.click('[data-num-menu] [role^="menuitem"] >> nth=2')
    const shown = (await cellOf(page, 1, 1).innerText()).replace(/\s/g, ' ')
    ok(shown === 'EGP 12,500.00', 'shows EGP 12,500.00', shown)
    await cellOf(page, 1, 1).dblclick()
    const raw = await page.locator('[data-blank-sheet] .fx-sheet-input').inputValue().catch(() => '')
    ok(raw === '12500', 'the editor shows 12500 (FR-023)', raw)
    await page.keyboard.press('Escape')
    await cellOf(page, 1, 2).click(); await page.keyboard.press('Control+Shift+#')
    ok((await cellOf(page, 1, 2).innerText()) === 'Mon, 16 Nov 2026', 'Ctrl+Shift+# shows the long date')
    await saved(page)

    console.log('3. Ctrl+A on 5,000 rows: one step, under 1 s, undo restores')
    await page.goto(`${BASE}/sheets/${ids.folder}?sheet=${ids.big}`); await page.waitForSelector('[data-blank-sheet]')
    await cellOf(page, 0, 0).click(); await page.keyboard.press('Control+a')
    await page.click('[data-fmt="font"]')
    const tA = Date.now()
    await page.click('[data-font-menu] [role^="menuitem"]:has-text("Arial")')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-blank-sheet] .fx-sheet-tr[data-row] .fx-sheet-td:nth-child(2)')).fontFamily.includes('Arial'))
    const onScreen = Date.now() - tA
    await saved(page)
    const total = Date.now() - tA
    // The outbox waits 400 ms after the last change before it saves (spec 013 R6); the formatting itself is on screen at once.
    ok(onScreen < 1000 && total - 400 < 1000, 'SC-002: whole sheet formatted in under 1 s, saved after the outbox wait', `${onScreen} ms on screen, ${total} ms saved incl. 400 ms wait`)
    ok(sql(`select count(*) from sheet_formats where sheet_id='${ids.big}'`) === '1', 'one record for the whole sheet')
    await page.click('[data-undo]'); await saved(page)
    ok(sql(`select count(*) from sheet_formats where sheet_id='${ids.big}'`) === '0', 'undo removes it in one step')

    console.log('4. Merge & Centre with two values')
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]')
    await typeAt(page, 9, 0, 'Q4 plan'); await typeAt(page, 9, 1, 'extra')
    await cellOf(page, 9, 0).click(); await cellOf(page, 9, 3).click({ modifiers: ['Shift'] })
    await page.click('[data-fmt="merge"]'); await page.click('[data-merge-menu] [role^="menuitem"] >> nth=0')
    ok(await page.locator('[data-merge-warn]').isVisible(), 'asks first, naming the value kept')
    await page.click('[data-merge-warn] [data-ok]')
    const mw = (await cellOf(page, 9, 0).boundingBox()).width
    ok(mw > 300 && (await cellOf(page, 9, 0).innerText()) === 'Q4 plan', 'one cell over the block, keeping A10', `${Math.round(mw)} px`)
    await page.click('[data-undo]')
    ok((await cellOf(page, 9, 1).innerText()) === 'extra', 'undo brings the other value back')
    await page.click('[data-redo]'); await saved(page)

    console.log('5. Paste a formatted table from Excel')
    await cellOf(page, 20, 0).click()
    await paste(page, 'x', fs.readFileSync(path.join(__dirname, '../fixtures/excel-styled.html'), 'utf8'))
    await page.waitForTimeout(500)
    const xl = cellOf(page, 20, 0)
    ok(await css(xl, 'fontWeight') === '700' && await css(xl, 'backgroundColor') === 'rgb(112, 48, 160)' && await css(xl, 'textAlign') === 'center', 'bold, fill, alignment kept')
    await cellOf(page, 30, 5).click()
    const b22 = (await cellOf(page, 21, 1).innerText()).replace(/\s/g, ' '), c22 = await css(cellOf(page, 21, 2), 'backgroundColor')
    ok(b22 === 'EGP 12,500.00' && c22 === 'rgb(198, 239, 206)', 'currency and the Good fill kept', `${b22} ${c22}`)
    await saved(page)

    console.log('6. Copy formatted cells out')
    await cellOf(page, 0, 0).click(); await cellOf(page, 1, 1).click({ modifiers: ['Shift'] })
    const clip = await page.evaluate(() => {
      // After the grid's own handler (on document), while the event is live.
      let out = { html: '', text: '' }
      const on = e => { out = { html: e.clipboardData.getData('text/html'), text: e.clipboardData.getData('text/plain') } }
      window.addEventListener('copy', on)
      document.execCommand('copy')
      window.removeEventListener('copy', on)
      return out
    })
    ok(/background-color:#7030A0/i.test(clip.html) && /font-weight:bold/.test(clip.html), 'HTML carries the styles for Excel and Google Sheets')
    ok(/EGP.12,500\.00/.test(clip.html) && clip.text.includes('12500'), 'shown text in HTML, the value in the text', clip.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 80))

    console.log('7–8. Comments: mention, notification, reply, edit, delete, resolve, reopen')
    const who = sql(`select name from members where email='${MEMBER}'`)
    await cellOf(page, 2, 1).click(); await page.keyboard.press('Control+Alt+m')
    await page.waitForSelector('[data-comment-thread] [data-cmt-input]')
    await page.locator('[data-cmt-input]').type(`@${who.split(' ')[0]}`); await page.keyboard.press('Enter')
    await page.locator('[data-cmt-input]').type('is this the final budget?'); await page.keyboard.press('Control+Enter')
    await page.waitForSelector('[data-comment-thread] .fx-cmt')
    ok(await cellOf(page, 2, 1).locator('[data-comment-marker]').count() === 1, 'a corner marker on the cell')
    await axe(page, 'comment thread')
    const tN = Date.now()
    await M.page.goto(`${BASE}/notifications`); await M.page.waitForSelector('[data-notification]', { timeout: 15000 })
    ok(Date.now() - tN < 60000 && (await M.page.locator('[data-notification]').first().innerText()).includes('B3'), 'SC-004: the mention is in the member’s notifications, naming the cell')
    await M.page.locator('[data-notification]').first().click()
    await M.page.waitForURL(/\/sheets\//); await M.page.waitForSelector('[data-comment-thread]', { timeout: 15000 })
    ok(M.page.url().includes(`sheet=${ids.small}`), 'one click opens the sheet at the cell with its thread')
    await M.page.locator('[data-cmt-input]').fill('Yes, signed off.'); await M.page.click('[data-cmt-send]')
    await M.page.waitForFunction(() => document.querySelectorAll('[data-comment-thread] .fx-cmt').length === 2)
    ok(true, 'the member replies')
    await page.reload(); await page.waitForSelector('[data-blank-sheet]')
    await cellOf(page, 2, 1).click(); await page.waitForSelector('[data-comment-thread] .fx-cmt >> nth=1')
    ok(await page.locator('[data-comment-thread] .fx-cmt').count() === 2, 'everyone sees the reply')
    const myId = await page.locator('[data-comment-thread] .fx-cmt').first().getAttribute('data-cmt-id')
    await page.locator(`[data-cmt-id="${myId}"] [aria-haspopup="menu"]`).click(); await page.click('[data-cmt-edit]')
    await page.locator(`[data-cmt-id="${myId}"] textarea`).fill('Is this the final budget for Q4?'); await page.locator(`[data-cmt-id="${myId}"] .is-go`).click()
    await page.waitForSelector(`[data-cmt-id="${myId}"] small:has-text("edited")`)
    ok(true, 'edit own comment, marked edited')
    const theirs = await page.locator('[data-comment-thread] .fx-cmt').nth(1).getAttribute('data-cmt-id')
    await page.locator(`[data-cmt-id="${theirs}"] [aria-haspopup="menu"]`).click(); await page.click('[data-cmt-delete]'); await page.click('.fx-cmt-confirm [data-ok]')
    await page.waitForSelector(`[data-cmt-id="${theirs}"].is-gone`)
    ok(true, 'an admin deletes a comment; it reads "Comment deleted"')
    await page.click('[data-cmt-resolve]')
    await page.waitForFunction(() => !document.querySelector('[data-comment-thread]'))
    ok(await cellOf(page, 2, 1).locator('[data-comment-marker]').count() === 0, 'resolve hides the marker')
    await page.click('[data-comments-btn]'); await page.click('[data-cmt-tab="resolved"]')
    ok(await page.locator('[data-comments-panel] [data-cmt-thread]').count() === 1, 'the panel lists it under Resolved')
    await axe(page, 'comments panel')
    await page.locator('[data-comments-panel] [data-cmt-thread]').first().click()
    await page.click('[data-cmt-resolve]')
    await page.waitForFunction(() => document.querySelectorAll('[data-comment-marker]').length >= 1)
    ok(true, 'reopen brings the marker back')
    await page.click('[data-comments-btn]')
    await page.keyboard.press('Escape')
    await cellOf(page, 30, 5).click()

    console.log('9. Delete the commented, formatted row; undo')
    await cellOf(page, 2, 1).click({ button: 'right' }).catch(() => {})
    await page.keyboard.press('Escape')
    await page.locator('[data-blank-sheet] .fx-sheet-tr[data-row]').nth(2).locator('.fx-sheet-td').first().click({ button: 'right' })
    await page.click('[data-cell-menu] [role^="menuitem"]:has-text("Delete")')
    await page.waitForTimeout(400)
    ok(await page.locator('[data-blank-sheet] [data-comment-marker]').count() === 0, 'the thread goes with the row', `markers ${await page.locator('[data-blank-sheet] [data-comment-marker]').count()}, row 3: ${(await cellOf(page, 2, 0).innerText())}`)
    await page.click('[data-undo]'); await page.waitForTimeout(500)
    ok(await cellOf(page, 2, 1).locator('[data-comment-marker]').count() === 1 && (await cellOf(page, 2, 1).innerText()).includes('EGP'), 'undo brings the thread and the formatting back')
    await saved(page)

    console.log('10–11. The Content sheet')
    const content = sql(`select id from sheet_folders where linked_key='content'`)
    await page.goto(`${BASE}/sheets/${content}`); await page.waitForSelector('[data-linked-pane] .fx-sheet-tr[data-task]')
    const row = page.locator('[data-linked-pane] .fx-sheet-tr[data-task]').first()
    const task = await row.getAttribute('data-task')
    const n = await row.locator('.fx-sheet-td').count()
    await row.locator('.fx-sheet-td').nth(1).click(); await row.locator('.fx-sheet-td').nth(n - 2).click({ modifiers: ['Shift'] })
    await page.click('[data-fmt="fill"]'); await page.click('[data-color-picker] [data-pick="#FFC000"] >> nth=0')
    await page.waitForTimeout(800)
    await page.locator('[data-linked-pane] .fx-sheet-tr[data-task]').nth(4).locator('.fx-sheet-td').nth(1).click()
    const statusCell = row.locator('.fx-sheet-td.is-status')
    ok(await css(row.locator('.fx-sheet-td').nth(1), 'backgroundColor') === 'rgb(255, 192, 0)', 'a task row filled amber')
    if (await statusCell.count()) ok(await statusCell.locator('*').first().evaluate(e => getComputedStyle(e).backgroundColor) !== 'rgb(255, 192, 0)', 'the status pill keeps its colour, the fill around it')
    ok(sql(`select count(*) from sheet_formats f join sheets s on s.id=f.sheet_id where s.linked_key='linked_content' and f.row_key='${task}'`) !== '0', 'saved by task id')
    await row.locator('.fx-sheet-td').nth(1).click()
    await page.waitForTimeout(300)
    console.log('    (focus:', await page.evaluate(() => { const a = document.activeElement; return `${a?.tagName}.${a?.className?.toString().slice(0, 60)} in panel=${!!a?.closest('.fx-sh-panel')}` }), ')')
    await page.keyboard.press('Control+Alt+m')
    await page.waitForSelector('[data-cmt-input]', { timeout: 5000 }).catch(() => {})
    if (!(await page.locator('[data-cmt-input]').isVisible().catch(() => false))) console.log('    (thread:', await page.evaluate(() => { const t = document.querySelector('[data-comment-thread]'); return t ? t.getAttribute('style') : 'none' }), ')')
    await page.locator('[data-cmt-input]').fill('Check the hook'); await page.keyboard.press('Control+Enter')
    await page.waitForSelector('[data-comment-thread] .fx-cmt')
    ok(await row.locator('[data-comment-marker]').count() === 1, 'a comment on a task’s title')
    await page.keyboard.press('Escape')
    await page.click('[data-fmt="merge"]')
    ok((await page.locator('[data-merge-menu]').innerText()).toLowerCase().includes('task'), 'Merge is off and says why')
    await page.keyboard.press('Escape')
    await page.reload(); await page.waitForSelector('[data-linked-pane] .fx-sheet-tr[data-task]')
    const again = page.locator(`[data-linked-pane] .fx-sheet-tr[data-task="${task}"]`)
    await page.waitForTimeout(1500)
    const bgAfter = await css(again.locator('.fx-sheet-td').nth(1), 'backgroundColor'), mk = await again.locator('[data-comment-marker]').count()
    ok(bgAfter === 'rgb(255, 192, 0)' && mk === 1, 'the formatting and comment follow the task after a reload', `${bgAfter}, ${mk} marker`)
    await axe(page, 'Content sheet with the toolbar')
    sql(`delete from sheet_formats f using sheets s where s.id=f.sheet_id and s.linked_key='linked_content' and f.row_key='${task}'`)
    sql(`delete from sheet_comments c using sheets s where s.id=c.sheet_id and s.linked_key='linked_content' and c.row_key='${task}'`)

    console.log('12. A protected sheet, as another member')
    sql(`update sheets set protected_by='${sql(`select id from members where email='${ADMIN}'`)}' where id='${ids.small}'`)
    const O = await login(browser, OTHER)
    await O.page.goto(url); await O.page.waitForSelector('[data-blank-sheet]')
    await cellOf(O.page, 4, 4).click()
    ok(await O.page.locator('[data-fmt="b"]').getAttribute('aria-disabled') === 'true', 'formatting is off, with the reason in its tooltip')
    await O.page.keyboard.press('Control+Alt+m'); await O.page.locator('[data-cmt-input]').fill('A note on a protected sheet'); await O.page.keyboard.press('Control+Enter')
    await O.page.waitForSelector('[data-comment-thread] .fx-cmt')
    ok(true, 'commenting is allowed')

    console.log('13. Arabic and a 390 px phone')
    const AR = await login(browser, ADMIN)
    await AR.ctx.addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
    await AR.page.goto(url); await AR.page.waitForSelector('[data-blank-sheet]')
    ok(await AR.page.evaluate(() => document.documentElement.dir) === 'rtl', 'right to left')
    const arAmount = await cellOf(AR.page, 1, 1).innerText()
    ok(/[٠-٩]/.test(arAmount), 'numbers follow the language', arAmount)
    await cellOf(AR.page, 1, 1).click()
    await AR.page.click('[data-fmt="fmtCells"]'); await AR.page.waitForSelector('[data-format-dialog]')
    await axe(AR.page, 'Format Cells in Arabic')
    await AR.page.keyboard.press('Escape')
    await axe(AR.page, 'toolbar in Arabic')
    const P = await login(browser, ADMIN, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await P.page.goto(url); await P.page.waitForSelector('[data-blank-sheet]')
    await cellOf(P.page, 1, 0).click()
    await P.page.click('[data-format-open]'); await P.page.waitForSelector('[data-format-sheet]')
    const fb = await P.page.locator('[data-format-sheet] [data-fmt="b"]').boundingBox()
    ok(fb.width >= 44 && fb.height >= 44, 'phone: bottom-sheet formatting, 44 px targets', `${Math.round(fb.width)}×${Math.round(fb.height)}`)
    await P.page.click('[data-format-sheet] .fx-fmt-done')
    await cellOf(P.page, 2, 1).click()
    await P.page.waitForSelector('[data-comment-thread].is-full', { timeout: 5000 }).catch(() => {})
    const full = await P.page.locator('[data-comment-thread]').boundingBox().catch(() => null)
    ok(!!full && full.width >= 380, 'phone: the thread opens full screen')
    await axe(P.page, 'thread on a phone')

    console.log('14. Accessibility')
    await page.goto(url); await page.waitForSelector('[data-blank-sheet]')
    await cellOf(page, 1, 1).click()
    await axe(page, 'toolbar')
    await page.click('[data-fmt="fill"]'); await axe(page, 'colour picker'); await page.keyboard.press('Escape')
    await page.click('[data-fmt="borders"]'); await axe(page, 'border picker'); await page.keyboard.press('Escape')
    // Ctrl+1 is Chrome's own "first tab" key, so the page never hears it there; the button (and More number formats…) open it.
    await page.click('[data-fmt="fmtCells"]'); await page.waitForSelector('[data-format-dialog]'); await axe(page, 'Format Cells'); await page.keyboard.press('Escape')
    ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
    sql(`delete from notifications where kind in ('sheet_mention','sheet_reply') and created_at >= '${started}'`)
    sql(`delete from sheet_folders where id='${ids.folder}'`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
