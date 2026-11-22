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
        await go('/spaces/design?view=sheet')
        ok(await page.$('[data-task-sheet]'), "other Spaces' Sheet tab is the task Sheet")
      },
    },
    {
      id: 'us2-brand-folders', as: 'admin',
      async run({ page, go }) {
        const b = firstBrand()
        await go(`/brands/${b}/calendar`)
        ok(await page.$('[data-calendar-view]'), 'Calendar folder')
        await go(`/brands/${b}/assets`)
        ok(await page.$('[data-brand-files]'), 'Assets folder')
        await go(`/brands/${b}/library`)
        const want = psql(`select count(*) from tasks where brand_id='${b}' and status='publish' and kind='pipeline' and dropped_at is null`)
        ok(String((await page.$$('[data-library-item]')).length) === want, `Library lists published only (${want})`)
        await go(`/brands/${b}/sheet`)
        ok(await page.$('.fx-board-page.is-sheet'), 'Sheet folder opens the Content sheet')
        await go(`/brands/${b}/sheet?view=own`)
        await page.click('[data-open-own-tabs]')
        await page.waitForURL(/\/sheets\//, { timeout: 30000 })
        ok(psql(`select count(*) from sheet_folders where brand_id='${b}' and kind='brand'`) === '1', "the brand's own folder exists once")
      },
    },
    {
      id: 'us2-my-tasks', as: 'content',
      async run({ page, go }) {
        await go('/me')
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
        await page.dragAndDrop(`[data-undated-task="${t}"] [data-cal-task]`, `[data-day="${iso(today)}"]`)
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
