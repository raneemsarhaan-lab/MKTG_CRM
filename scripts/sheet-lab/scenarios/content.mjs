// The Content sheet (spec 009): one or more scenarios per acceptance scenario,
// plus keyboard, Arabic, phone width, axe and the 20-row check.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const h = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), '../out/pure.mjs'))

const C = 'view=content'
const P2 = '3be798dc-ba7a-4742-a1df-d48722c2b039'
const SUEZ = '76fd7193-0db7-4564-946d-1fcf2bc72e13'
const POST1 = 'f51f43c9-069d-46af-95c0-04cba2f72efa'
const summary = t => t.page.locator('[data-summary]').innerText().then(s => s.replace(/\s+/g, ' '))
const stageText = async (t, key) => (await t.page.locator(`[data-cell="${key}|status"] .fx-sheet-ellipsis`).first().innerText()).trim()

async function pastePlan(t, kind = 'html') {
  await t.page.locator('[data-paste-plan]').click()
  await t.page.waitForSelector('[data-plan-preview] textarea')
  await t.page.locator('[data-plan-preview] textarea').focus()
  if (kind === 'html') {
    const html = await t.page.evaluate(() => window.__sheet.referenceHtml())
    await t.paste({ html, text: 'x\ty' })
  } else {
    const text = await t.page.evaluate(() => window.__sheet.referenceText())
    await t.page.locator('[data-plan-preview] textarea').fill(text)
  }
  await t.page.waitForSelector('[data-plan-counts]')
}
const counts = t => t.page.locator('[data-plan-counts]').innerText().then(s => s.trim())
async function addPlan(t) {
  await t.page.locator('[data-plan-add]').click()
  await t.page.waitForSelector('[data-plan-preview]', { state: 'detached' })
  await t.idle(150)
}

export const content = [
  // ── US1 ──
  {
    id: 'cus1-1', hash: C,
    async run(t) {
      const rows = await t.rows()
      t.eq(rows.slice(0, 2), ['t:th-strategy', 'p:pl-ai'], 'theme, then its pillar')
      const line = (await t.text('t:th-strategy', 'title')).replace(/\s+/g, ' ')
      for (const s of ['Strategy', 'Samaa', '2 per week', 'this week 1 of 2', 'C-Level of large companies', 'Strategy Heads', 'Top Management']) t.assert(line.includes(s), `theme row shows ${s}: ${line}`)
      t.assert((await t.text('p:pl-ai', 'title')).includes('AI'), 'pillar row')
      t.eq(rows.indexOf(`k:${POST1}`) < rows.indexOf('k:v1'), true, 'pillar pieces, then pieces without a pillar')
      t.eq(rows.at(-1), 'a:th-strategy', '+ Piece ends the theme')
    },
  },
  {
    id: 'cus1-2', hash: C,
    async run(t) {
      const heads = await t.page.$$eval('[role="columnheader"]', hs => hs.slice(1).map(h => h.textContent || h.getAttribute('aria-label')))
      t.eq(heads, ['Title', 'Type', 'Status', 'Owner', 'Assignee', 'Pillar', 'Working doc', 'Design', 'Post', 'Published', 'Date', 'Archive or restore'], 'piece columns')
      t.eq(await t.page.getAttribute('[data-cell="t:th-strategy|title"]', 'class').then(c => c.includes('is-span')), true, 'the theme row spans the columns')
    },
  },
  {
    id: 'cus1-3', hash: C,
    async run(t) {
      const x = () => t.page.$eval(`[data-cell="k:${POST1}|title"]`, e => Math.round(e.getBoundingClientRect().left))
      const before = await x()
      await t.page.locator('.fx-sheet-scroll').evaluate(e => { e.scrollLeft = 600 })
      t.eq(await x(), before, 'the title column stays in place')
      t.eq(await t.page.$eval('[role="columnheader"].is-title', e => getComputedStyle(e.parentElement).position), 'sticky', 'the header row is frozen')
    },
  },
  {
    id: 'cus1-4', hash: C,
    async run(t) {
      const s = await summary(t)
      t.assert(s.includes('2 pieces') && s.includes('1 published (1 no link)') && s.includes('1 in design') && s.includes('0 archived'), s)
    },
  },
  {
    id: 'cus1-5', hash: C,
    async run(t) {
      await t.page.locator('[data-cell="t:th-strategy|title"] .fx-sheet-caret').click()
      t.eq(await t.rows(), ['t:th-strategy'], 'collapsed')
      t.assert((await t.text('t:th-strategy', 'title')).includes('2 pieces'), 'says how many')
      await t.focusCell('t:th-strategy', 'rowNo')
      await t.page.keyboard.press('Escape')
      await t.page.keyboard.press('Space')
      t.assert((await t.rows()).length > 3, 'Space expands it')
    },
  },
  // ── US2 ──
  {
    id: 'cus2-1', hash: C,
    async run(t) {
      await pastePlan(t, 'html')
      t.eq(await counts(t), '11 new · 7 matched by Task Link · 0 already in the sheet · 0 with problems', 'merged cells read (SC-001)')
      const themes = await t.page.locator('[data-plan-themes]').innerText()
      t.assert(themes.includes('Strategy · existing') && themes.includes('Newsjacking · new'), themes)
      const pillars = await t.page.locator('[data-plan-pillars]').innerText()
      t.assert(pillars.includes('Strategy · AI · existing') && pillars.includes('Strategy · Decision Making · new'), pillars)
    },
  },
  {
    id: 'cus2-2', hash: C,
    async run(t) {
      await pastePlan(t, 'html')
      await addPlan(t)
      const call = (await t.lab()).calls.find(c => c.fn === 'addPlan')
      t.eq(call.args[0].length, 18, 'all 18 rows sent')
      t.assert(call.args[0].every(r => !r.published || /^https?:/.test(r.published)) && call.args[0].every(r => !r.post || /^https?:/.test(r.post)), 'no non-link sent as a link (SC-005)')
      const tasks = await t.tasks()
      t.eq(tasks.filter(x => x.project_id === 'th-newsjacking').length, 10, 'Newsjacking pieces')
      t.eq(tasks.find(x => x.id === SUEZ).project_id, 'th-newsjacking', 'a matched task joins its theme')
      t.assert((await t.rows()).includes('t:th-newsjacking'), 'the new theme shows')
      t.assert((await t.toast()).includes('11 added · 7 updated'), await t.toast())
      await pastePlan(t, 'html')
      t.eq(await counts(t), '0 new · 7 matched by Task Link · 11 already in the sheet · 0 with problems', 'a second paste adds nothing new (FR-035)')
    },
  },
  {
    id: 'cus2-3', hash: C,
    async run(t) {
      await pastePlan(t, 'html')
      const warn = await t.page.locator('[data-plan-warnings]').innerText()
      t.assert(warn.includes('FIFA World Cup Movement Report') && warn.includes('Link error'), 'Link error listed')
      t.assert(warn.includes('Federal Reserve Decision Report'), 'the post title listed')
      await t.page.locator('[data-plan-warnings] tr', { hasText: 'FIFA' }).getByLabel('Published').fill('https://www.forefront.consulting/pdf/fifa.pdf')
      await addPlan(t)
      const row = (await t.lab()).calls.find(c => c.fn === 'addPlan').args[0].find(r => r.title.startsWith('FIFA'))
      t.eq(row.published, 'https://www.forefront.consulting/pdf/fifa.pdf', 'fixed in place')
    },
  },
  {
    id: 'cus2-4', hash: C,
    async run(t) {
      await pastePlan(t, 'html')
      await t.page.locator('[data-use-sheet]').check()
      await addPlan(t)
      t.eq((await t.task(SUEZ)).status, 'd-check', 'Final Design → D-Check')
      t.eq((await t.lab()).calls.find(c => c.fn === 'addPlan').args[1], { useSheetTitleStatus: true }, 'the choice is sent')
      t.assert((await t.tasks()).some(x => x.name === 'iPhone 18 Report' && x.dropped_at), 'Archived pieces are archived')
    },
  },
  {
    id: 'cus2-5', hash: C,
    async run(t) {
      await pastePlan(t, 'text')
      t.eq(await counts(t), '11 new · 7 matched by Task Link · 0 already in the sheet · 0 with problems', 'plain text with blanks under merged cells')
    },
  },
  {
    id: 'cus2-6', hash: `${C}&me=samaa`,
    async run(t) {
      await pastePlan(t, 'html')
      t.eq(await counts(t), '4 new · 4 matched by Task Link · 0 already in the sheet · 10 with problems', 'a user adds to her own theme only')
      t.assert((await t.page.locator('[data-plan-problems]').innerText()).includes('Only an admin can add the new theme Newsjacking'), 'says why')
    },
  },
  // ── US3 ──
  {
    id: 'cus3-1', hash: C,
    async run(t) {
      t.eq(await stageText(t, 'k:v1'), 'Initial Design', 'content name')
      await t.cell('k:v1', 'status').hover()
      t.eq((await t.page.locator('[data-cell="k:v1|status"] .fx-sheet-tip').innerText()).trim(), 'Initial Design · D-In Progress', 'real name on hover')
    },
  },
  ...['raneem', 'samaa', 'noran', 'omar'].map(me => ({
    id: `cus3-2-${me}`, hash: `${C}&me=${me}`,
    async run(t) {
      const member = h.CONTENT_MEMBERS.find(m => m.id === me)
      for (const id of [POST1, 'v1']) {
        const task = (await t.tasks()).find(x => x.id === id)
        await t.cell(`k:${id}`, 'status').click()
        await t.idle(60)
        const got = (await t.menuOpen()) ? await t.menuItems() : []
        await t.page.keyboard.press('Escape')
        t.eq([...got].sort(), [...h.allowedStages(task, member)].sort(), `${me} on ${id}: exactly the board's moves`)
      }
    },
  })),
  {
    id: 'cus3-3', hash: `${C}&me=omar`,
    async run(t) {
      await t.cell('k:v1', 'status').click()
      await t.page.locator('[data-menu-item="d-check"]').click()
      await t.idle(200)
      t.eq((await t.task('v1')).status, 'd-check', 'moved')
      t.eq(await stageText(t, 'k:v1'), 'Final Design', 'shown in content words')
      t.eq((await t.lab()).celebrations.length, 1, 'own stage, forward: celebration')
    },
  },
  {
    id: 'cus3-4', hash: C,
    async run(t) {
      await pastePlan(t, 'html'); await addPlan(t)
      await t.cell(`k:${P2}`, 'status').click()
      await t.page.locator('[data-menu-item="publish"]').click()
      await t.page.waitForSelector('[data-sheet-pop] input')
      t.assert((await t.page.locator('[data-sheet-pop]').innerText()).includes('Published! Paste the published link'), 'asks for the published link')
      await t.page.locator('[data-sheet-pop] input').fill('https://www.forefront.consulting/p2')
      await t.page.keyboard.press('Enter')
      await t.page.waitForFunction(() => /post link/.test(document.querySelector('[data-sheet-pop]')?.textContent ?? ''))
      await t.page.locator('[data-sheet-pop] input').fill('https://www.linkedin.com/posts/p2')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      const task = await t.task(P2)
      t.eq([task.published_url, task.post_url], ['https://www.forefront.consulting/p2', 'https://www.linkedin.com/posts/p2'], 'both links, for a Post')
    },
  },
  // ── US4 ──
  {
    id: 'cus4-1', hash: C,
    async run(t) {
      await t.cell(`k:${POST1}`, 'doc').click()
      await t.page.locator('[data-sheet-pop] input').fill('https://docs.google.com/document/d/abc')
      await t.page.keyboard.press('Enter')
      await t.idle(150)
      t.eq((await t.text(`k:${POST1}`, 'doc')).trim(), 'Google Docs', 'saved and shown as the site')
      t.eq(await t.page.$eval(`[data-cell="k:${POST1}|doc"] a`, a => a.target), '_blank', 'opens in a new tab')
      t.eq((await t.task(POST1)).attachments.filter(a => a.link_role === 'working_doc').length, 1, 'a working-doc link attachment (FR-041)')
    },
  },
  {
    id: 'cus4-2', hash: C,
    async run(t) {
      await t.focusCell(`k:${POST1}`, 'post')
      await t.page.keyboard.press('Escape')
      await t.paste({ text: 'Link error' })
      t.assert((await t.text(`k:${POST1}`, 'post')).includes('Not a link'), 'refused with a note')
      t.eq((await t.lab()).calls.filter(c => c.fn === 'updatePiece').length, 0, 'nothing saved (SC-005)')
      await t.cell(`k:${POST1}`, 'post').click()
      await t.page.locator('[data-sheet-pop] input').fill('not a link')
      await t.page.keyboard.press('Enter')
      t.assert((await t.page.locator('[data-sheet-pop]').innerText()).includes("That isn't a web address."), 'the prompt refuses it too')
    },
  },
  {
    id: 'cus4-3', hash: C,
    async run(t) {
      t.eq((await t.text(`k:${POST1}`, 'published')).trim(), 'Missing link', 'a published piece without a published link')
      await t.cell(`k:${POST1}`, 'published').click()
      await t.page.locator('[data-sheet-pop] input').fill('https://www.forefront.consulting/post1')
      await t.page.keyboard.press('Enter')
      await t.idle(150)
      t.eq((await t.text(`k:${POST1}`, 'published')).trim(), 'forefront.consulting', 'fixed')
      t.assert(!(await summary(t)).includes('no link'), 'the summary no longer counts it')
    },
  },
  {
    id: 'cus4-4', hash: C,
    async run(t) {
      await t.cell(`k:${POST1}`, 'design').click()
      await t.page.locator('[data-sheet-pop] input').fill('https://claude.ai/design/p/x')
      await t.page.keyboard.press('Enter'); await t.idle(150)
      // With a link in it, a click opens the link; Enter edits.
      await t.cell(`k:${POST1}`, 'design').focus()
      await t.page.keyboard.press('Enter')
      await t.page.locator('[data-sheet-pop] input').fill('')
      await t.page.keyboard.press('Enter'); await t.idle(150)
      t.eq((await t.text(`k:${POST1}`, 'design')).trim(), '+ link', 'removed')
    },
  },
  // ── US5 ──
  {
    id: 'cus5-1', hash: C,
    async run(t) {
      await t.cell('k:v1', 'status').click()
      await t.page.locator('[data-menu-item="publish"]').click()
      await t.idle(200)
      await t.page.keyboard.press('Escape')
      t.assert((await t.text('t:th-strategy', 'title')).includes('this week 2 of 2 ✓'), 'cadence met')
    },
  },
  {
    id: 'cus5-2', hash: C,
    async run(t) {
      await t.focusCell('t:th-strategy', 'rowNo')
      await t.page.keyboard.press('Escape')
      await t.page.keyboard.press('Enter')
      await t.page.locator('[data-menu-item="edit"]').click()
      const ed = t.page.locator('[data-theme-editor]')
      await ed.locator('input[type="number"]').fill('3')
      await ed.getByLabel('2nd Line Management').check()
      await ed.getByRole('button', { name: 'Save' }).click()
      await t.idle(150)
      const call = (await t.lab()).calls.find(c => c.fn === 'saveTheme')
      t.eq(call.args[1].frequency_count, 3, 'frequency saved')
      t.eq(call.args[1].audience, ['c-level', 'strategy-heads', 'top-management', 'second-line'], 'audience, in list order')
      t.assert((await t.text('t:th-strategy', 'title')).includes('3 per week'), 'shown')
    },
  },
  {
    id: 'cus5-3', hash: `${C}&me=noran`,
    async run(t) {
      await t.cell('t:th-strategy', 'title').click()
      const items = await t.menuItems()
      t.assert(!items.includes('edit') && !items.includes('pillar'), `no editing for a non-owner: ${items}`)
    },
  },
  // ── US6 ──
  {
    id: 'cus6-1', hash: C,
    async run(t) {
      t.eq(await t.page.getAttribute('[data-row="k:v1"]', 'aria-expanded'), 'false', 'a video piece can expand')
      await t.page.locator('[data-cell="k:v1|title"] .fx-sheet-caret').click()
      const rows = await t.rows()
      t.assert(rows.includes('q:c01') && rows.includes('q:c07'), 'its clips show')
      t.eq(await stageText(t, 'q:c07'), 'Editing', 'clips keep video names')
    },
  },
  {
    id: 'cus6-2', hash: C,
    async run(t) {
      await t.cell('k:v1', 'rowNo').click()
      await t.page.locator('[data-menu-item="video"]').click()
      t.eq((await t.lab()).opened, [{ id: 'v1', opts: { videoSheet: true } }], 'Open in video sheet')
    },
  },
  {
    id: 'cus6-3', hash: C,
    async run(t) {
      await t.page.locator('[data-cell="k:v1|title"] .fx-sheet-caret').click()
      t.assert((await summary(t)).includes('2 pieces'), 'clips are not pieces')
    },
  },
  // ── US7 ──
  {
    id: 'cus7-1', hash: `${C}&me=samaa`,
    async run(t) {
      await t.cell('a:th-strategy', 'title').click()
      await t.page.keyboard.type('Strategy in 90 seconds')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq((await t.lab()).calls.filter(c => c.fn === 'addPiece').map(c => c.args), [['th-strategy', { title: 'Strategy in 90 seconds', pillarId: null }]], 'added')
      const added = (await t.tasks()).find(x => x.name === 'Strategy in 90 seconds')
      t.eq([added.task_owner_id, added.status, added.project_id], ['samaa', 'todo', 'th-strategy'], 'owned by her, Planned, in the theme')
    },
  },
  {
    id: 'cus7-2', hash: `${C}&me=noran`,
    async run(t) {
      await t.cell('a:th-strategy', 'title').click()
      await t.idle(100)
      t.eq((await t.rows()).filter(r => r.startsWith('d:')).length, 0, 'no draft')
      t.assert((await t.toast()).includes("You can't add pieces to this theme."), 'says why (SC-009)')
    },
  },
  {
    id: 'cus7-3', hash: C,
    async run(t) {
      await t.cell(`k:${POST1}`, 'archive').click()
      await t.page.locator('[data-archive-confirm]').getByRole('button', { name: 'Archive' }).click()
      await t.idle(200)
      t.assert(await t.page.locator(`[data-row="k:${POST1}"].is-dropped`).count() === 1, 'greyed')
      t.assert((await summary(t)).includes('1 archived'), 'counted as archived')
      await t.page.locator('[data-show-archived]').click()
      t.assert(!(await t.rows()).includes(`k:${POST1}`), 'Show archived off hides it')
      await t.page.locator('[data-show-archived]').click()
      await t.cell(`k:${POST1}`, 'archive').click()
      await t.idle(200)
      t.eq((await t.task(POST1)).dropped_at, null, 'restored')
    },
  },
  {
    id: 'cus7-4', hash: C,
    async run(t) {
      await t.focusCell('k:v1', 'date')
      await t.page.keyboard.press('Escape')
      await t.page.keyboard.press('Enter')
      await t.page.locator('[data-cell="k:v1|date"] input').fill('20/11/2026')
      await t.page.keyboard.press('Enter')
      await t.idle(150)
      t.eq((await t.task('v1')).due_date, '2026-11-20', 'due date')
      t.assert((await t.text('k:v1', 'date')).includes('Due 20 Nov'), 'shown')
      await t.cell('k:v1', 'pillar').click()
      await t.page.locator('[data-menu-item="pl-ai"]').click()
      await t.idle(150)
      t.eq((await t.task('v1')).pillar_id, 'pl-ai', 'pillar set')
    },
  },
  // ── cross-cutting ──
  {
    id: 'content-kbd', hash: `${C}&me=omar`,
    async run(t) {
      for (let i = 0; i < 14 && !(await t.active())?.includes('|'); i++) await t.page.keyboard.press('Tab')
      t.assert((await t.active())?.includes('|'), 'Tab reaches the grid')
      await t.page.keyboard.press('Control+Home')
      for (let i = 0; i < 3; i++) await t.page.keyboard.press('ArrowDown')
      t.eq(await t.active(), 'k:v1|rowNo', 'down to the video')
      for (let i = 0; i < 3; i++) await t.page.keyboard.press('ArrowRight')
      t.eq(await t.active(), 'k:v1|status', 'across to its status')
      await t.page.keyboard.press('Enter')
      await t.page.waitForFunction(() => document.activeElement?.matches('[data-sheet-menu] [role="menuitem"]'))
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq((await t.task('v1')).status, 'd-check', 'moved by keyboard')
    },
  },
  {
    id: 'content-rtl', hash: `${C}&locale=ar`,
    async run(t) {
      t.eq(await t.page.$eval('[data-sheet-grid]', g => getComputedStyle(g).direction), 'rtl', 'right to left')
      t.eq(await stageText(t, 'k:v1'), 'تصميم أولي', 'Arabic content name')
      t.assert(/\d/.test(await t.text('t:th-strategy', 'title')), 'Western digits')
    },
  },
  {
    id: 'content-phone', hash: C, viewport: { width: 390, height: 844 },
    async run(t) {
      const m = await t.page.evaluate(() => ({ page: document.scrollingElement.scrollWidth, vw: innerWidth, grid: document.querySelector('.fx-sheet-scroll').scrollWidth, box: document.querySelector('.fx-sheet-scroll').clientWidth }))
      t.assert(m.page <= m.vw && m.grid > m.box, JSON.stringify(m))
    },
  },
  {
    id: 'content-rows', hash: C,
    async run(t) {
      await t.page.evaluate(() => window.__sheet.setTasks(ts => {
        const base = ts.find(x => x.id === 'f51f43c9-069d-46af-95c0-04cba2f72efa')
        return [...ts, ...Array.from({ length: 30 }, (_, i) => ({ ...base, id: `extra${i}`, name: `Extra piece ${i}`, pillar_id: null }))]
      }))
      await t.idle()
      const n = await t.page.evaluate(() => {
        const box = document.querySelector('.fx-sheet-scroll').getBoundingClientRect()
        const head = document.querySelector('.fx-sheet-tr.is-head').getBoundingClientRect()
        return [...document.querySelectorAll('[data-row]')].filter(r => { const b = r.getBoundingClientRect(); return b.top >= head.bottom - 1 && b.bottom <= box.bottom + 1 }).length
      })
      t.assert(n >= 20, `at least 20 rows at 1366×657 (SC-006): ${n}`)
    },
  },
  {
    id: 'content-axe', hash: C,
    async run(t) {
      t.eq(await t.axe('[data-content-sheet]'), [], 'grid')
      await t.cell('t:th-strategy', 'title').click()
      await t.page.locator('[data-menu-item="edit"]').click()
      t.eq(await t.axe('[data-sheet-pop]'), [], 'theme editor')
      await t.page.keyboard.press('Escape')
      await pastePlan(t, 'html')
      t.eq(await t.axe('[data-plan-preview]'), [], 'plan preview')
    },
  },
]
