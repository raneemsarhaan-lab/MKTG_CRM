// Spec 023 Stage C: start dates — panel, sheet, calendar spans, workload spread.
module.exports = (EMAIL, psql, ok) => {
  // Spec 027 sheet look: the grid draws only the rows near the screen; scroll down it (as a person would) until the cell is there.
  const findInSheet = async (page, sel, timeout = 60000) => {
    const end = Date.now() + timeout
    await page.waitForSelector('.fx-sheet-scroll', { timeout })
    while (Date.now() < end) {
      const el = await page.$(sel)
      if (el) { await el.scrollIntoViewIfNeeded(); return }
      await page.evaluate(() => { const s = document.querySelector('.fx-sheet-scroll'); if (s) s.scrollTop = s.scrollTop + s.clientHeight * 0.8 >= s.scrollHeight - s.clientHeight ? 0 : s.scrollTop + s.clientHeight * 0.8 })
      await page.waitForTimeout(150)
    }
    throw new Error(`not found in the sheet: ${sel}`)
  }

  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const task = (name, opts = {}) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,due_date,due_manual,hours_estimate)
      values (gen_random_uuid(), '${name}', (select id from brands order by name limit 1), 'Post', '${who('admin')}', '${who('content')}', 'Content Creator', true, 'c-prog', now(), 'Normal', now(),
      '${opts.due}', true, ${opts.hours ?? 2}) returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('planning')}', 'manual') on conflict do nothing`)
    return id
  }
  const drop = id => psql(`delete from tasks where id='${id}'`)
  const setDate = async (page, sel, iso) => {
    await page.click(`${sel} button`)
    const input = page.locator(`${sel} input[type="date"]`)
    await input.fill(iso)
    await input.press('Enter')
    await page.waitForTimeout(1800)
  }
  const dayHours = async (page, day) => {
    const el = await page.$(`[data-load="${who('content')}"] [data-load-day="${day}"]`)
    return el ? Number(await el.getAttribute('data-hours') ?? 0) : 0
  }
  const toWeekOf = async (page, sunday) => {
    for (let i = 0; i < 30 && (await page.getAttribute('[data-workload-week]', 'data-workload-week')) < sunday; i++) await page.click('[data-workload-nav="next"]')
  }

  return [
    {
      id: '023c-start-date-panel-refuses-after-due', as: 'admin',
      async run({ page, go }) {
        const id = task(`Lab start ${rnd()}`, { due: '2026-12-10', hours: 10 })
        try {
          await go(`/spaces/planning?view=board&task=${id}`)
          await page.waitForSelector('[data-start-date]')
          ok((await page.getAttribute('[data-start-date]', 'data-start-date')) === '', 'empty unless set')
          await setDate(page, '[data-start-date]', '2026-12-06')
          ok(psql(`select start_date::text from tasks where id='${id}'`) === '2026-12-06', 'start saved')
          await setDate(page, '[data-start-date]', '2026-12-12')
          ok(psql(`select start_date::text from tasks where id='${id}'`) === '2026-12-06', 'a start after the due date is refused')
          ok(await page.isVisible('text=The start date can’t be after the due date.'), 'the panel says why')
        } finally { drop(id) }
      },
    },
    {
      id: '023c-workload-spreads-and-calendar-spans', as: 'admin',
      async run({ page, go }) {
        // Sun 6 Dec → Thu 10 Dec 2026, 10 h: five working days, 2 h a day.
        await go(`/brands/${psql('select id from brands order by name limit 1')}?view=workload`)
        await page.waitForSelector('[data-workload-week]')
        await toWeekOf(page, '2026-12-06')
        const before = {}
        for (const d of ['2026-12-06', '2026-12-08', '2026-12-10', '2026-12-11']) before[d] = await dayHours(page, d)
        const id = task(`Lab span ${rnd()}`, { due: '2026-12-10', hours: 10 })
        psql(`update tasks set start_date='2026-12-06' where id='${id}'`)
        try {
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=workload`)
          await page.waitForSelector('[data-workload-week]')
          await toWeekOf(page, '2026-12-06')
          for (const d of ['2026-12-06', '2026-12-08', '2026-12-10'])
            ok(Math.abs((await dayHours(page, d)) - before[d] - 2) < 0.01, `2 h on ${d}`)
          ok(Math.abs((await dayHours(page, '2026-12-11')) - before['2026-12-11']) < 0.01, 'nothing on Friday (weekend)')

          // Calendar: Spans shows it on each day from start to due (per device).
          await go('/spaces/planning?view=calendar')
          await page.waitForSelector('[data-calendar-view]')
          await page.click('[data-cal-by="due"]')
          if ((await page.getAttribute('[data-cal-spans]', 'aria-pressed')) !== 'true') await page.click('[data-cal-spans]')
          for (let i = 0; i < 3 && !(await page.$('[data-day="2026-12-10"]')); i++) await page.click('[data-cal="next"]')
          ok(await page.isVisible(`[data-day="2026-12-10"] [data-cal-task="${id}"]`), 'on its due day')
          ok(await page.isVisible(`[data-day="2026-12-07"] [data-cal-span="${id}"]`), 'spans the days before')
          ok(!(await page.$(`[data-day="2026-12-05"] [data-cal-span="${id}"]`)), 'not before the start')
          await go('/spaces/planning?view=calendar')
          await page.waitForSelector('[data-calendar-view]')
          ok((await page.getAttribute('[data-cal-spans]', 'aria-pressed')) === 'true', 'the choice is remembered')
          await page.click('[data-cal-spans]')

          // Sheet: a Start column.
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet&sheet=tasks`)
          await findInSheet(page, `[data-start-cell="2026-12-06"]`, 30000)
          ok(true, 'the sheet shows the start date')
        } finally { drop(id) }
      },
    },
  ]
}
