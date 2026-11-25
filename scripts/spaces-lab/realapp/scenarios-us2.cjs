// Spaces lab real-app scenarios for US2 (spec 021): views anywhere, brand Folders, Me.
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const firstBrand = () => psql('select id from brands order by name limit 1')
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const seedTask = (name, type, status, nine, assigneeRole) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,hours_estimate,updated_at)
      select gen_random_uuid(), '${name} ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), '${type}',
        (select id from members where role='Content Creator' limit 1), (select id from members where role='${assigneeRole}' limit 1),
        'Content Creator', ${nine}, '${status}', now(), 'Medium', 2, now() returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${spaceId('content')}', 'manual')`)
    return id
  }

  return [
    {
      id: 'us2-calendar-navigates-and-drags', as: 'admin',
      async run({ page, go }) {
        const t = seedTask('Calendar lab', 'Post', 'c-prog', false, 'Content Creator')
        const today = new Date()
        psql(`update tasks set due_date='${iso(today)}' where id='${t}'`)
        await go('/spaces/content?view=calendar')
        const h0 = await page.textContent('[data-cal-heading]')
        await page.click('[data-cal="next"]')
        const h1 = await page.textContent('[data-cal-heading]')
        await page.click('[data-cal="today"]')
        const h2 = await page.textContent('[data-cal-heading]')
        ok(h0 !== h1 && h2 === h0, `month navigation: ${h0} → ${h1} → ${h2}`)
        await page.click('[data-cal-mode="week"]')
        ok((await page.$$('[data-day]')).length === 7, 'week has 7 days')
        await page.click('[data-cal-mode="month"]')
        const target = new Date(today)
        target.setDate(today.getDate() + (today.getDate() > 20 ? -3 : 3))
        await page.dragAndDrop(`[data-cal-task="${t}"]`, `[data-day="${iso(target)}"]`)
        await page.waitForTimeout(1500)
        ok(psql(`select due_date::text from tasks where id='${t}'`) === iso(target), 'drag sets the due date')
        await page.click('[data-cal-undo]')
        await page.waitForTimeout(1500)
        ok(psql(`select due_date::text from tasks where id='${t}'`) === iso(today), 'Undo puts it back')
      },
    },
    {
      id: 'us2-space-sheet-is-todays-content-sheet', as: 'admin',
      async run({ page, go }) {
        await go('/spaces/content?view=sheet')
        ok(await page.$('.fx-board-page.is-sheet'), "the Content Space's Sheet tab is today's sheet")
        // Spec 026: every Space's Sheet view is its sheet of rows; the task sheet is on the brand's page.
        await go('/spaces/design?view=sheet')
        await page.waitForSelector('.fx-board-page.is-sheet', { timeout: 60000 })
        ok(await page.$('[data-content-sheet]'), "other Spaces have the same sheet of rows")
        await go(`/brands/${firstBrand()}?view=sheet&sheet=tasks`)
        await page.waitForSelector('[data-task-sheet]', { timeout: 60000 })
        ok(true, "the brand's Sheet view is the task sheet")
      },
    },
    {
      id: 'us2-brand-folders', as: 'admin',
      async run({ page, go }) {
        const b = firstBrand()
        // Spec 025: the Calendar and Sheet folders are views of the brand's Brand section now.
        await go(`/brands/${b}/calendar`)
        ok(page.url().endsWith(`/brands/${b}?view=calendar`), `the Calendar address leads to the brand's Calendar view: ${page.url()}`)
        ok(await page.$('[data-calendar-view]'), 'which is its calendar')
        await go(`/brands/${b}/assets`)
        ok(await page.$('[data-brand-assets]'), 'Assets section')
        await go(`/brands/${b}/library`)
        const want = psql(`select count(*) from tasks where brand_id='${b}' and status='publish' and dropped_at is null and content_task_id is null and not migrated_simple`)
        ok(String((await page.$$('[data-library-item]')).length) === want, `Library lists published only (${want})`)
        await go(`/brands/${b}/sheet`)
        await page.waitForSelector('[data-node-workbook] [data-task-sheet]', { timeout: 60000 })
        ok(psql(`select count(*) from sheet_folders where brand_id='${b}' and kind='brand'`) === '1', "the Sheet address opens the brand's own workbook, once")
      },
    },
    {
      id: 'us2-my-tasks', as: 'content',
      async run({ page, go }) {
        // The page reopens on the view used last (spec 027), so ask for the List.
        await go('/me?view=list')
        const me = psql(`select id from members where role='Content Creator'`)
        const want = psql(`select count(*) from tasks where dropped_at is null and (assignee_id='${me}' or (task_owner_id='${me}' and assignee_id is distinct from '${me}'))`)
        const rows = await page.$$eval('[data-my-tasks] [data-row]', els => els.length)
        ok(String(rows) === want, `My tasks lists mine and handed off: ${rows} vs ${want}`)
        await page.click('[data-show="handed"]')
        const handed = psql(`select count(*) from tasks where dropped_at is null and task_owner_id='${me}' and assignee_id is distinct from '${me}'`)
        ok(String(await page.$$eval('[data-my-tasks] [data-row]', els => els.length)) === handed, 'Handed off filter')
      },
    },
    {
      id: 'us2-calendar-no-date-panel', as: 'admin',
      async run({ page, go }) {
        const t = seedTask('Undated lab', 'Post', 'c-prog', false, 'Content Creator')
        const d = seedTask('Undated done lab', 'Post', 'publish', false, 'Content Creator')
        psql(`update tasks set due_date=null where id in ('${t}','${d}')`)
        await go('/spaces/content?view=calendar')
        ok(await page.$(`[data-cal-undated] [data-undated-task="${t}"]`), 'an undated task is in the No date panel')
        ok(!(await page.$(`[data-cal-undated] [data-undated-task="${d}"]`)), 'finished undated tasks are hidden by default')
        const today = new Date()
        // Only this task in the panel, so the list can't shift under the pointer (lab runs leave undated tasks behind).
        await page.fill('[data-cal-find]', psql(`select name from tasks where id='${t}'`))
        await page.waitForTimeout(300)
        await page.dragAndDrop(`[data-undated-task="${t}"] [data-cal-task]`, `[data-day="${iso(today)}"]`, { targetPosition: { x: 30, y: 12 } })
        await page.waitForTimeout(1500)
        ok(psql(`select due_date::text from tasks where id='${t}'`) === iso(today), 'dragging from the panel onto a day sets the date')
        await go('/spaces/content?view=calendar')
        await page.dragAndDrop(`[data-day="${iso(today)}"] [data-cal-task="${t}"]`, '[data-cal-undated] h3')
        await page.waitForTimeout(1500)
        ok(psql(`select coalesce(due_date::text,'none') from tasks where id='${t}'`) === 'none', 'dropping on the panel clears the date')
      },
    },
  ]
}
