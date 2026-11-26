// Spec 027, US2 (Stage B): the Sheet view's Board tab mirrors the board — every task on the board, the
// Board's own Mine / Everyone shared with the Board view, a "No theme" group last, always linked.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const brandId = name => psql(`select id from brands where name ilike '${name}%' order by name limit 1`)
  const task = (name, assignee, brand) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
      select gen_random_uuid(), '${name}', '${brand}', 'Post', '${who('admin')}', '${assignee}', 'Marketing Manager', true, 'c-prog', now(), 'Normal', now() returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('content')}', 'created') on conflict do nothing`)
    return id
  }
  const findInSheet = async (page, sel, timeout = 30000) => {
    const end = Date.now() + timeout
    await page.waitForSelector('.fx-sheet-scroll', { timeout })
    await page.evaluate(() => { const s = document.querySelector('.fx-sheet-scroll'); if (s) s.scrollTop = 0 })
    await page.waitForTimeout(250)
    if (await page.$(sel)) return true
    // The end of the sheet next ("No theme" closes it), then a sweep from the top.
    await page.evaluate(() => { const s = document.querySelector('.fx-sheet-scroll'); if (s) s.scrollTop = s.scrollHeight })
    await page.waitForTimeout(300)
    if (await page.$(sel)) return true
    await page.evaluate(() => { const s = document.querySelector('.fx-sheet-scroll'); if (s) s.scrollTop = 0 })
    await page.waitForTimeout(250)
    while (Date.now() < end) {
      if (await page.$(sel)) return true
      const done = await page.evaluate(() => { const s = document.querySelector('.fx-sheet-scroll'); if (!s) return true; const before = s.scrollTop; s.scrollTop += s.clientHeight * 0.8; return s.scrollTop === before })
      if (done) return !!(await page.$(sel))
      await page.waitForTimeout(150)
    }
    return false
  }
  // The Board view keeps Mine / Everyone; the sheet's simple header has Mine as my avatar (on or off).
  const scopeTo = async (page, v) => {
    if (await page.$(`[data-scope="${v}"]`)) await page.click(`[data-scope="${v}"]`)
    else if ((await page.getAttribute('[data-scope-mine]', 'aria-pressed') === 'true') !== (v === 'me')) await page.click('[data-scope-mine]')
    await page.waitForTimeout(400)
  }

  return [
    {
      id: '027-us2-mine-on-board-same-tasks-in-board-tab', as: 'admin',
      async run({ page, go }) {
        const n = Math.floor(Math.random() * 1e6)
        const b = brandId('Forefront')
        const mine = task(`Lab mine ${n}`, who('admin'), b)
        const theirs = task(`Lab theirs ${n}`, who('content'), b)
        try {
          await go('/spaces/content?view=board')
          // QA 26 Nov 2026 (F12): Mine is the avatar button on every view.
          await page.waitForSelector('[data-scope-mine]', { timeout: 30000 })
          await scopeTo(page, 'me')
          ok(await page.$(`[data-task-card="${mine}"]`) !== null, 'Mine: my task is on the board')
          ok(await page.$(`[data-task-card="${theirs}"]`) === null, "Mine: someone else's task is not on the board")
          await page.click('[data-view-tab="sheet"]')
          await page.waitForSelector('[data-board-tab-filters]', { timeout: 30000 })
          ok(await page.getAttribute('[data-board-tab-filters] [data-scope-mine]', 'aria-pressed') === 'true', 'the Board tab shows Mine too (shared)')
          ok(await findInSheet(page, `[data-row="k:${mine}"]`), 'my task is a row in the Board tab')
          ok(!(await findInSheet(page, `[data-row="k:${theirs}"]`, 5000)), "someone else's task is not")
          await scopeTo(page, 'team')
          ok(await findInSheet(page, `[data-row="k:${theirs}"]`), 'Everyone: their task appears in the Board tab')
          // The Board tab's "No theme" group (it takes rows of its own too).
          ok(await page.$(`[data-row="t:__rows"]`) !== null || await findInSheet(page, '[data-row="t:__rows"]'), 'tasks with no theme sit in "No theme"')
        } finally {
          psql(`delete from tasks where id in ('${mine}', '${theirs}')`)
        }
      },
    },
    {
      id: '027-us2-stage-moves-show-in-the-board-tab', as: 'admin',
      async run({ page, go }) {
        const n = Math.floor(Math.random() * 1e6)
        const t = task(`Lab stage ${n}`, who('admin'), brandId('Forefront'))
        try {
          await go('/spaces/content?view=sheet')
          await page.waitForSelector('[data-board-tab-filters]', { timeout: 30000 })
          await scopeTo(page, 'team')
          ok(await findInSheet(page, `[data-row="k:${t}"]`), 'the task is a row')
          // A move on the board (here: the stage changed elsewhere) shows in the tab after a refresh.
          psql(`update tasks set status='c-check', stage_date=now() where id='${t}'`)
          await page.reload()
          await page.waitForSelector('[data-board-tab-filters]', { timeout: 30000 })
          ok(await findInSheet(page, `[data-row="k:${t}"]`), 'still a row')
          const text = await page.textContent(`[data-row="k:${t}"]`)
          ok(/Check/i.test(text), `its Status follows the board (got: ${text.slice(0, 80)})`)
        } finally {
          psql(`delete from tasks where id='${t}'`)
        }
      },
    },
    {
      id: '027-us2-board-tab-is-always-linked', as: 'admin',
      async run({ page, go }) {
        await go('/spaces/content?view=sheet')
        await page.waitForSelector('[data-sheet-tab]', { timeout: 30000 })
        const first = page.locator('[data-sheet-tab]').first()
        ok((await first.textContent()).includes('Board'), 'the first tab is "Board"')
        ok(await first.locator('[data-tab-linked]').count() === 1, 'it shows the link icon')
        ok(await first.getAttribute('draggable') === 'false', "it can't be dragged")
        await first.click({ button: 'right' })
        await page.waitForSelector('[role="menu"][data-tab-menu]', { timeout: 5000 })
        const menu = await page.textContent('[role="menu"][data-tab-menu]')
        ok(menu.includes('The Board tab is always linked'), 'its menu says it is always linked')
        await page.keyboard.press('Escape')
      },
    },
    {
      id: '027-us2-folder-board-tab-is-its-brand-only', as: 'admin',
      async run({ page, go }) {
        const n = Math.floor(Math.random() * 1e6)
        const ff = brandId('Forefront'), other = psql(`select id from brands where id <> '${ff}' order by name limit 1`)
        const a = task(`Lab folder ff ${n}`, who('admin'), ff)
        const b = task(`Lab folder other ${n}`, who('admin'), other)
        try {
          await go(`/spaces/content/${ff}?view=sheet`)
          await page.waitForSelector('[data-board-tab-filters]', { timeout: 30000 })
          await scopeTo(page, 'team')
          ok(await findInSheet(page, `[data-row="k:${a}"]`), "the folder's brand task is in its Board tab")
          ok(!(await findInSheet(page, `[data-row="k:${b}"]`, 5000)), "another brand's task is not")
        } finally {
          psql(`delete from tasks where id in ('${a}', '${b}')`)
        }
      },
    },
  ]
}
