// User request 2026-11-23: a linked row's Status follows its task; Link task shows the task as a link.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const rnd = () => Math.floor(Math.random() * 1e6)
  const setup = (status = 'r-design', boards = ['design']) => {
    const n = rnd()
    const theme = psql(`insert into projects (id, name, brand_id, is_theme) values (gen_random_uuid(), 'Lab rows ${n}', (select id from brands order by name limit 1), true) returning id`).split(/\n/)[0]
    const c = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,project_id,auto_linked_at)
      select gen_random_uuid(), 'Lab row ${n}', (select id from brands order by name limit 1), 'Post', m.id, m.id, m.role, true, '${status}', now(), 'Medium', now(), '${theme}', now()
      from members m where m.email='${EMAIL.admin}' returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${c}', '${space('content')}', 'manual') on conflict do nothing`)
    const media = boards.map(b => {
      const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,entry_stage,media_board,content_task_id,priority,updated_at)
        select gen_random_uuid(), 'Carousel ${b} ${n} with a rather long name for the cell', (select id from brands order by name limit 1), 'Post',
          m.id, m.id, m.role, true, '${status}', now(), 'r-design', '${b}', '${c}', 'Medium', now() from members m where m.email='${b === 'video' ? EMAIL.video : EMAIL.design}' returning id`).split(/\n/)[0]
      psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space(b)}', 'handoff') on conflict do nothing`)
      return id
    })
    return { n, theme, c, media }
  }
  const cleanup = s => { psql(`delete from tasks where id in ('${[s.c, ...s.media].join("','")}')`); psql(`delete from projects where id='${s.theme}'`) }
  const cell = (id, col) => `[data-content-sheet] [data-cell*="${id}|${col}"]`
  const openSheet = async (page, go, id) => {
    await go('/spaces/content?view=sheet')
    await page.waitForSelector(cell(id, 'status'), { timeout: 60000 })
  }
  const stageMenu = async (page, id, label) => {
    await page.locator(cell(id, 'status')).click()
    if (!(await page.$('[data-sheet-menu] [role="menuitem"]'))) await page.keyboard.press('Enter')
    await page.waitForSelector('[data-sheet-menu] [role="menuitem"]', { timeout: 10000 })
    await page.locator('[data-sheet-menu] [role="menuitem"]', { hasText: label }).first().click()
    await page.waitForTimeout(2500)
  }

  return [
    {
      id: 'rows-board-move-updates-sheet-status', as: 'admin',
      async run({ page, go }) {
        const s = setup('r-design')
        try {
          await openSheet(page, go, s.c)
          ok(/Ready For Design|Ready for design/i.test(await page.textContent(cell(s.c, 'status')) ?? ''), `starts at Ready For Design: ${await page.textContent(cell(s.c, 'status'))}`)
          // Move the Design task on its board (its panel's stage menu).
          await go(`/spaces/design?view=list&task=${s.media[0]}`)
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'D-In Progress' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${s.c}'`) === 'd-prog', 'the row follows')
          await openSheet(page, go, s.c)
          ok(/D-In Progress|In design/i.test(await page.textContent(cell(s.c, 'status')) ?? ''), `the sheet shows it: ${await page.textContent(cell(s.c, 'status'))}`)
        } finally { cleanup(s) }
      },
    },
    {
      id: 'rows-sheet-status-moves-the-task', as: 'admin',
      async run({ page, go }) {
        const s = setup('d-prog')
        try {
          await openSheet(page, go, s.c)
          await stageMenu(page, s.c, 'D-Check')
          ok(psql(`select status from tasks where id='${s.media[0]}'`) === 'd-check', 'the Design task moved on its board')
          ok(psql(`select status from tasks where id='${s.c}'`) === 'd-check', 'and the row with it')
          await page.locator(cell(s.c, 'status')).click()
          if (!(await page.$('[data-sheet-menu] [role="menuitem"]'))) await page.keyboard.press('Enter')
          await page.waitForSelector('[data-sheet-menu] [role="menuitem"]', { timeout: 10000 })
          const items = await page.$$eval('[data-sheet-menu] [role="menuitem"]', els => els.map(e => e.textContent))
          ok(!items.some(x => /To Do|C-In Progress/.test(x ?? '')) && items.some(x => /D-In Progress/.test(x ?? '')), `a linked row offers only Ready For Design to F-Check: ${items.join(' | ')}`)
          await page.keyboard.press('Escape')
        } finally { cleanup(s) }
      },
    },
    {
      id: 'rows-link-name-opens-and-unlink-keeps-status', as: 'admin',
      async run({ page, go }) {
        const s = setup('d-check')
        try {
          await openSheet(page, go, s.c)
          const link = `${cell(s.c, 'media')} [data-media-open="${s.media[0]}"]`
          await page.waitForSelector(link, { timeout: 15000 })
          ok((await page.getAttribute(link, 'title'))?.startsWith('Carousel design'), 'the full name is on hover')
          ok(/Design · D-Check/.test(await page.textContent(`${cell(s.c, 'media')} [data-media-where]`) ?? ''), 'board and stage follow the name')
          await page.click(link)
          // The open task is the Design task: its panel links back to this row's content task.
          await page.waitForSelector(`[data-media-section] [data-media-content="${s.c}"]`, { timeout: 15000 })
          await page.keyboard.press('Escape')
          await openSheet(page, go, s.c)
          await page.click(`${cell(s.c, 'media')} [data-media-unlink]`)
          await page.waitForTimeout(2500)
          ok(psql(`select coalesce(content_task_id::text,'-') from tasks where id='${s.media[0]}'`) === '-', 'unlinked')
          ok(psql(`select status from tasks where id='${s.c}'`) === 'd-check', 'Status keeps its value')
          await stageMenu(page, s.c, 'D-In Progress')
          ok(psql(`select status from tasks where id='${s.c}'`) === 'd-prog', 'and is editable again')
          ok(psql(`select status from tasks where id='${s.media[0]}'`) === 'd-check', 'without moving the unlinked task')
        } finally { cleanup(s) }
      },
    },
    {
      id: 'rows-both-boards-show-two-links', as: 'admin',
      async run({ page, go }) {
        const s = setup('d-prog', ['design', 'video'])
        try {
          await openSheet(page, go, s.c)
          await page.waitForSelector(`${cell(s.c, 'media')} [data-media-chip="video"]`, { timeout: 15000 })
          ok(await page.locator(`${cell(s.c, 'media')} [data-media-chip]`).count() === 2, 'one link per board')
        } finally { cleanup(s) }
      },
    },
  ]
}
