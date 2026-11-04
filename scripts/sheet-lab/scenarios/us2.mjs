// US2: change status in the sheet, with the board's rules (FR-010–FR-012, FR-020–FR-024, SC-002, SC-003).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const h = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), '../out/pure.mjs'))

export const us2 = [
  {
    id: 'us2-1',
    async run(t) {
      t.eq((await t.text('c:c07', 'status')).split('\n')[0].replace('▾', '').trim(), 'Editing', 'video name for d-prog')
      await t.cell('c:c07', 'status').hover()
      const tip = t.page.locator('[data-cell="c:c07|status"] .fx-sheet-tip')
      t.assert(await tip.isVisible(), 'tooltip on hover')
      t.eq((await tip.innerText()).trim(), 'Editing · D-In Progress', 'shows the real name')
      t.eq((await t.text('c:c10', 'status')).split('\n')[0].replace('▾', '').trim(), 'Script Review', 'c-final')
    },
  },
  {
    id: 'us2-tip-focus',
    async run(t) {
      await t.focusCell('c:c07', 'source')
      await t.page.keyboard.press('ArrowLeft')
      await t.page.keyboard.press('ArrowLeft')
      t.eq(await t.active(), 'c:c07|status', 'keyboard reached the status cell')
      const tip = t.page.locator('[data-cell="c:c07|status"] .fx-sheet-tip')
      t.assert(await tip.isVisible(), 'tooltip on keyboard focus (FR-012)')
      const desc = await t.cell('c:c07', 'status').getAttribute('aria-describedby')
      t.assert(desc?.includes('fx-tip-c:c07'), 'linked by aria-describedby')
    },
  },
  ...['lina', 'mona', 'sara', 'omar', 'yosra'].map(me => ({
    id: `us2-2-${me}`,
    hash: `me=${me}`,
    async run(t) {
      const member = h.MEMBERS.find(m => m.id === me)
      const tasks = await t.tasks()
      for (const id of ['v1', 'c01', 'c05', 'c06', 'c07', 'c08', 'c10', 'c11', 'c12', 'c99']) {
        const task = tasks.find(x => x.id === id)
        const key = id.startsWith('v') ? `v:${id}` : `c:${id}`
        const want = h.allowedStages(task, member)
        await t.cell(key, 'status').click()
        await t.idle(60)
        const got = (await t.menuOpen()) ? await t.menuItems() : []
        await t.page.keyboard.press('Escape')
        t.eq([...got].sort(), [...want].sort(), `${me} on ${id}: exactly the board's moves`)
        const next = h.nextOnPath(task)
        if (got.length && want.includes(next)) t.eq(got[0], next, `${me} on ${id}: the next stage first`)
      }
    },
  })),
  {
    id: 'us2-3',
    hash: 'me=lina',
    async run(t) {
      await t.cell('c:c07', 'status').click()
      await t.page.locator('[data-menu-item="d-check"]').click()
      await t.idle(250)
      const c = await t.task('c07')
      t.eq(c.status, 'd-check', 'moved to D-Check')
      t.eq(c.stage_date, new Date().toISOString().slice(0, 10), 'stage date is today')
      t.eq((await t.lab()).celebrations.map(x => x.stage), ['d-check'], 'own stage, forward: celebration')
      t.eq((await t.text('c:c07', 'status')).split('\n')[0].replace('▾', '').trim(), 'Edit Review', 'cell shows the new stage')
    },
  },
  {
    id: 'us2-3-override',
    async run(t) {
      await t.cell('c:c09', 'status').click()
      await t.page.locator('[data-menu-item="d-check"]').click()
      await t.idle(250)
      t.eq((await t.task('c09')).status, 'd-check', 'admin override moves it')
      t.eq((await t.lab()).celebrations.length, 0, "an override isn't the admin's win")
    },
  },
  {
    id: 'us2-4',
    async run(t) {
      await t.page.evaluate(() => window.__sheet.setTasks(ts => ts.map(x => (x.id === 'c03' ? { ...x, status: 'scheduled' } : x))))
      await t.idle()
      t.assert((await t.text('c:c03', 'status')).includes('Scheduled'), 'a move made elsewhere shows in the sheet')
    },
  },
  {
    id: 'us2-5',
    async run(t) {
      await t.page.evaluate(() => { window.__sheet.failNext.move = 'not_authorized' })
      await t.cell('c:c06', 'status').click()
      await t.page.locator('[data-menu-item="publish"]').click()
      await t.idle(300)
      t.eq((await t.task('c06')).status, 'final-check', 'back to its previous stage')
      t.assert((await t.text('c:c06', 'status')).includes('Final Cut'), 'the cell shows it')
      t.assert((await t.toast()).includes("You can't change this clip."), `says why: ${await t.toast()}`)
      t.assert(await t.page.locator('[data-cell="c:c06|status"] .fx-sheet-cellnote').count() === 1, 'a note on the cell')
    },
  },
  {
    id: 'us2-video-alone',
    async run(t) {
      const before = (await t.tasks()).filter(x => x.parent_task_id === 'v1').map(x => x.status)
      await t.cell('v:v1', 'status').click()
      await t.page.locator('[data-menu-item="d-check"]').click()
      await t.idle(250)
      t.eq((await t.task('v1')).status, 'd-check', 'the video moved')
      t.eq((await t.tasks()).filter(x => x.parent_task_id === 'v1').map(x => x.status), before, 'its clips did not (FR-024)')
    },
  },
]
