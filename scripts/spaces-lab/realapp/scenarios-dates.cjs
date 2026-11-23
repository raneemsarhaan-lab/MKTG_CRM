// Real-app scenarios: publishing dates, automatic due dates, manual override, Settings › Due Dates, board sort.
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const seed = (name, extra = {}) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,hours_estimate,updated_at,publish_date,due_date,due_manual)
      select gen_random_uuid(), '${name} ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), 'Design',
        (select id from members where role='Content Creator' limit 1), (select id from members where role='Graphic Designer' limit 1),
        'Content Creator', false, '${extra.status ?? 'd-prog'}', now(), '${extra.priority ?? 'Medium'}', 2, now(),
        ${extra.publish ? `'${extra.publish}'` : 'null'}, ${extra.due ? `'${extra.due}'` : 'null'}, ${extra.manual ? 'true' : 'false'} returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${spaceId('design')}', 'manual') on conflict do nothing`)
    psql(`update tasks set media_board='design', entry_stage='r-design' where id='${id}'`)
    return id
  }
  const dates = id => psql(`select coalesce(publish_date::text,'') || '|' || coalesce(due_date::text,'') || '|' || due_manual from tasks where id='${id}'`)
  const resetRule = () => psql(`update workspace_settings set due_days_before=7, due_weekend_days='{5,6}', due_weekend_shift='earlier'`)
  const setDate = async (page, sel, iso) => {
    await page.click(`${sel} button`)
    const input = page.locator(`${sel} input[type="date"]`)
    await input.fill(iso)
    await input.press('Enter')
    await page.waitForTimeout(1800)
  }

  return [
    {
      id: 'dates-publish-sets-due-and-manual-override', as: 'admin',
      async run({ page, go }) {
        resetRule()
        const t = seed('Dates lab')
        await go(`/spaces/design?view=list&task=${t}`)
        await page.waitForSelector('[data-publish-date]', { timeout: 60000 })
        await setDate(page, '[data-publish-date]', '2026-12-15')
        ok(dates(t) === '2026-12-15|2026-12-08|false', `publishing Tue 15 Dec → due Tue 8 Dec, automatic: ${dates(t)}`)
        await setDate(page, '[data-publish-date]', '2026-12-18')
        ok(dates(t) === '2026-12-18|2026-12-10|false', `due on a Friday moves back to Thursday: ${dates(t)}`)
        ok(/Thu 10 Dec/.test(await page.textContent('[data-due-date]') ?? ''), 'the panel writes the due date as "Thu 10 Dec"')

        await setDate(page, '[data-due-date]', '2026-12-03')
        ok(dates(t) === '2026-12-18|2026-12-03|true', `a due date set by hand is marked: ${dates(t)}`)
        ok(await page.$('[data-due-date] [data-due-manual-mark]'), 'the hand-set mark shows')
        await setDate(page, '[data-publish-date]', '2026-12-22')
        ok(dates(t) === '2026-12-22|2026-12-03|true', `a new publishing date leaves it alone: ${dates(t)}`)
        await page.click('[data-due-reset]')
        await page.waitForTimeout(1800)
        ok(dates(t) === '2026-12-22|2026-12-15|false', `Reset to auto works it out again: ${dates(t)}`)
        ok(!(await page.$('[data-due-reset]')), 'Reset to auto goes once it is automatic')
      },
    },
    {
      id: 'dates-near-publish-is-overdue', as: 'admin',
      async run({ page, go }) {
        resetRule()
        const today = psql(`select (now() at time zone 'Africa/Cairo')::date::text`)
        const publish = psql(`select ((now() at time zone 'Africa/Cairo')::date + 3)::text`)
        const t = seed('Dates soon lab')
        await go(`/spaces/design?view=list&task=${t}`)
        await page.waitForSelector('[data-publish-date]', { timeout: 60000 })
        await setDate(page, '[data-publish-date]', publish)
        const [, due] = dates(t).split('|')
        ok(due && due < today, `the due date is still set, in the past: ${due} < ${today}`)
        await go('/spaces/design?view=board')
        await page.waitForSelector(`[data-task-card="${t}"]`, { timeout: 60000 })
        ok(await page.$(`[data-task-card="${t}"] [data-card-due][data-overdue="true"]`), 'the card marks it overdue')
        ok(await page.$(`[data-task-card="${t}"] [data-card-publish="${publish}"]`), 'the card shows the publishing date too')
      },
    },
    {
      id: 'dates-settings-recalc-with-confirmation', as: 'admin',
      async run({ page, go }) {
        resetRule()
        const auto = seed('Dates auto lab', { publish: '2026-12-15', due: '2026-12-08' })
        const manual = seed('Dates manual lab', { publish: '2026-12-15', due: '2026-12-01', manual: true })
        const published = seed('Dates published lab', { publish: '2026-12-15', due: '2026-12-08', status: 'publish' })
        try {
          await go('/settings')
          await page.click('[data-settings-tab="due"]')
          await page.waitForSelector('[data-due-settings]')
          ok(/Tue 8 Dec|→ Due/.test(await page.textContent('[data-due-example]') ?? ''), 'a live example shows')
          for (const d of [0, 1, 2, 3, 4]) await page.click(`[data-due-weekend="${d}"]`)
          ok(/working day/.test(await page.textContent('[data-due-error]') ?? '') && await page.isDisabled('[data-due-save]'), 'every day a weekend is blocked')
          for (const d of [0, 1, 2, 3, 4]) await page.click(`[data-due-weekend="${d}"]`)
          await page.fill('[data-due-days]', '3')
          await page.click('[data-due-save]')
          await page.waitForSelector('[data-due-confirm]')
          const body = await page.textContent('[data-due-confirm]') ?? ''
          ok(/\d+ open tasks? will get a new due date/.test(body), `the confirmation says how many: ${body}`)
          await page.click('[data-due-confirm-go]')
          await page.waitForTimeout(2500)
          ok(psql('select due_days_before from workspace_settings') === '3', 'saved')
          ok(dates(auto) === '2026-12-15|2026-12-12|false' || dates(auto) === '2026-12-15|2026-12-10|false', `an automatic due date moved: ${dates(auto)}`)
          ok(dates(manual) === '2026-12-15|2026-12-01|true', 'a hand-set due date stayed')
          ok(dates(published) === '2026-12-15|2026-12-08|false', 'a published task stayed')
        } finally { resetRule() }
      },
    },
    {
      id: 'dates-board-sort-default-saved-reset', as: 'admin',
      async run({ page, go }) {
        psql(`update members set board_sorts='{}' where email='${EMAIL.admin}'`)
        const late = seed('Sort lab late', { due: '2026-12-20', manual: true, priority: 'High', status: 'd-check' })
        const soon = seed('Sort lab soon', { due: '2026-12-02', manual: true, priority: 'Low', status: 'd-check' })
        const none = seed('Sort lab none', { status: 'd-check', priority: 'High' })
        const order = async () => {
          await page.waitForSelector(`[data-task-card="${late}"]`, { timeout: 60000 })
          const ids = await page.$$eval('[data-task-card]', els => els.map(e => e.getAttribute('data-task-card')))
          return [soon, late, none].map(x => ids.indexOf(x))
        }
        await go('/spaces/design?view=board')
        const [a, b, c] = await order()
        ok(a < b && b < c, `due date first, undated last: ${[a, b, c]}`)
        await page.click('[data-sort-menu] button, [data-sort-menu]')
        await page.click('[data-sort-option="priority"]')
        await page.waitForTimeout(1200)
        ok(/"space:[0-9a-f-]+": "priority"/.test(psql(`select board_sorts::text from members where email='${EMAIL.admin}'`)), 'the choice is saved for this board')
        await go('/spaces/design?view=board')
        const [a2, b2] = await order()
        ok(b2 < a2, `still sorted by priority after a reload: ${[a2, b2]}`)
        await page.click('[data-sort-menu] button, [data-sort-menu]')
        await page.click('[data-sort-reset]')
        await page.waitForTimeout(1200)
        ok(psql(`select board_sorts::text from members where email='${EMAIL.admin}'`) === '{}', 'Reset to default sort forgets it')
      },
    },
  ]
}
