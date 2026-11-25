// Spec 023 Stage D: templates and recurring tasks.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const brand = () => psql(`select id from brands order by name limit 1`)
  const field = () => psql(`select f.id from task_fields f join task_type_fields l on l.field_id=f.id where l.type_label='Post' and f.kind='text' order by f.position limit 1`)
  const task = (name, opts = {}) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,publish_date,due_date,due_manual,hours_estimate,parent_task_id,project_id)
      values (gen_random_uuid(), '${name}', '${brand()}', 'Post', '${who('admin')}', '${opts.assignee ?? who('content')}', 'Content Creator', true, 'todo', now(), '${opts.priority ?? 'High'}', now(),
      ${opts.publish ? `'${opts.publish}'` : 'null'}, ${opts.due ? `'${opts.due}'` : 'null'}, ${opts.due ? 'true' : 'false'}, ${opts.hours ?? 3}, ${opts.parent ? `'${opts.parent}'` : 'null'}, ${opts.project ? `'${opts.project}'` : 'null'}) returning id`).split(/\n/)[0]
    if (!opts.parent) psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('planning')}', 'manual') on conflict do nothing`)
    return id
  }
  const dropTree = where => { psql(`delete from tasks where parent_task_id in (select id from tasks where ${where})`); psql(`delete from tasks where ${where}`) }
  const tick = async (page, BASE) => {
    const r = await page.request.post(`${BASE}/api/notifications/tick?job=recurring`, { headers: { 'x-notify-secret': 'lab-tick' } })
    ok(r.ok(), 'the recurring job runs (NOTIFY_TICK_SECRET=lab-tick on the dev server)')
  }

  return [
    {
      id: '023d-save-as-template-and-create-from-it', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), name = `Lab recap ${n}`, tplName = `Lab tpl ${n}`
        const src = task(name, { publish: '2026-12-20', due: '2026-12-13' })
        task(`Draft ${n}`, { parent: src, due: '2026-12-10', assignee: who('content') })
        task(`Design ${n}`, { parent: src, due: '2026-12-17', assignee: who('dms') })
        const f = field()
        psql(`insert into task_field_values (task_id, field_id, value) values ('${src}', '${f}', '"lab caption ${n}"')`)
        const tag = psql(`insert into tags (id, name, key, color) values (gen_random_uuid(), 'Lab tpl tag ${n}', 'lab tpl tag ${n}', '#D22040') returning id`).split(/\n/)[0]
        psql(`insert into task_tags (task_id, tag_id) values ('${src}', '${tag}')`)
        try {
          // Save as template from the panel menu.
          await go(`/spaces/planning?view=board&task=${src}`)
          await page.waitForSelector('[data-priority]')
          page.once('dialog', d => d.accept(tplName))
          await page.click('button[aria-label="Task actions"]')
          await page.click('[role="menuitem"]:has-text("Save as template")')
          await page.waitForSelector('[data-template-saved]', { timeout: 15000 })
          const tpl = psql(`select id from task_templates where name='${tplName}'`)
          ok(!!tpl, 'the template is saved')
          ok(psql(`select jsonb_array_length(subtasks) from task_templates where id='${tpl}'`) === '2', 'with its two subtasks')
          ok(psql(`select subtasks->0->>'dueOffset' from task_templates where id='${tpl}'`) === '-10', 'dates relative to the publishing date')

          // Create from it on the calendar for 30 Dec.
          await go('/spaces/planning?view=calendar')
          await page.waitForSelector('[data-calendar-view]')
          for (let i = 0; i < 3 && !(await page.$('[data-day="2026-12-30"]')); i++) await page.click('[data-cal="next"]')
          await page.click('[data-cal-template="2026-12-30"]')
          await page.selectOption('[data-template-pick]', tpl)
          if (await page.$('[data-template-brand]')) await page.selectOption('[data-template-brand]', brand())
          await page.click('[data-template-create]')
          await page.waitForTimeout(3000)
          const made = psql(`select id from tasks where name='${name}' and publish_date='2026-12-30' and parent_task_id is null`)
          ok(!!made, 'a task named from the pattern, publishing 30 Dec')
          ok(psql(`select due_date::text from tasks where id='${made}'`) === '2026-12-23', 'its due date by the rule (Wed 23 Dec)')
          ok(psql(`select priority from tasks where id='${made}'`) === 'High', 'the priority')
          ok(psql(`select value#>>'{}' from task_field_values where task_id='${made}' and field_id='${f}'`) === `lab caption ${n}`, 'the field value')
          ok(psql(`select count(*) from task_tags where task_id='${made}' and tag_id='${tag}'`) === '1', 'the tag')
          const firstCreator = psql(`select id from members where role='Content Creator' order by name limit 1`)
          ok(psql(`select assignee_id from tasks where id='${made}'`) === firstCreator, 'the assignee by role')
          // Owner, 25 Nov 2026: no subtasks — the template's items are tasks of their own, on the same boards.
          ok(psql(`select string_agg(due_date::text, ',' order by due_date) from tasks where name in ('Draft ${n}', 'Design ${n}') and publish_date='2026-12-30' and parent_task_id is null`) === '2026-12-20,2026-12-27', 'its items are tasks of their own, dates relative to 30 Dec')
          ok(psql(`select count(*) from tasks t where t.name in ('Draft ${n}', 'Design ${n}') and t.publish_date='2026-12-30' and exists (select 1 from task_spaces s where s.task_id=t.id)`) === '2', 'on the same boards as the task')

          // Editing the template leaves the task alone.
          await go('/task-types')
          await page.click('[data-types-tab="templates"]')
          await page.click(`[data-template-edit="${tplName}"]`)
          await page.fill('[data-template-pattern]', `{Brand} edited ${n}`)
          await page.click('[data-template-save]')
          await page.waitForTimeout(1500)
          ok(psql(`select name_pattern from task_templates where id='${tpl}'`) === `{Brand} edited ${n}`, 'the template changed')
          ok(psql(`select name from tasks where id='${made}'`) === name, 'the task made from it did not')
        } finally {
          dropTree(`name in ('${name}') or id='${src}'`)
          psql(`delete from task_templates where name='${tplName}'`)
          psql(`delete from tags where id='${tag}'`)
        }
      },
    },
    {
      id: '023d-repeat-weekly-once-skip-stop', as: 'admin',
      async run({ page, go, BASE }) {
        const n = rnd(), name = `Lab weekly ${n}`
        const project = psql(`insert into projects (id, name) values (gen_random_uuid(), 'Lab standing ${n}') returning id`).split(/\n/)[0]
        // Sunday 29 Nov publishing; repeats every week on Sunday.
        const src = task(name, { publish: '2026-11-29', project })
        const f = field()
        psql(`insert into task_field_values (task_id, field_id, value) values ('${src}', '${f}', '"weekly ${n}"')`)
        const min = Number(psql(`select coalesce(sum(max_business_days),0) from sla_config where content_type_label='Post'`))
        const inProject = () => Number(psql(`select count(*) from tasks where project_id='${project}' and name='${name}'`))
        try {
          await go(`/spaces/planning?view=board&task=${src}`)
          await page.waitForSelector('[data-repeat]')
          ok((await page.getAttribute('[data-repeat]', 'data-repeat-on')) === 'false', 'doesn’t repeat yet')
          await page.click('[data-repeat-open]')
          await page.selectOption('[data-repeat-freq]', 'weeks')
          if ((await page.getAttribute('[data-repeat-day="0"]', 'aria-pressed')) !== 'true') await page.click('[data-repeat-day="0"]')
          if (min > 0) {
            await page.fill('[data-repeat-lead]', String(min - 1))
            await page.click('[data-repeat-save]')
            await page.waitForSelector('[data-repeat-error]')
            ok((await page.textContent('[data-repeat-error]')).includes(String(min)), 'a short lead time is refused, naming the minimum')
          }
          await page.fill('[data-repeat-lead]', String(min))
          await page.click('[data-repeat-save]')
          await page.waitForTimeout(2000)
          const rule = psql(`select repeat_rule_id from tasks where id='${src}'`)
          ok(!!rule, 'the rule is saved')
          ok(psql(`select next_publish::text from repeat_rules where id='${rule}'`) === '2026-12-06', 'next publishing: Sun 6 Dec')
          ok(await page.isVisible('[data-repeat-next="2026-12-06"]'), 'the panel shows the next date')

          // The job makes the occurrence once, however often it runs.
          const before = inProject()
          await tick(page, BASE)
          await tick(page, BASE)
          const occ = psql(`select id from tasks where recurrence_key='${rule}:2026-12-06'`)
          ok(!!occ, 'the 6 Dec occurrence is created on its creation day')
          ok(psql(`select count(*) from tasks where recurrence_key like '${rule}:%' group by recurrence_key having count(*) > 1`) === '', 'each occurrence once')
          ok(psql(`select value#>>'{}' from task_field_values where task_id='${occ}' and field_id='${f}'`) === `weekly ${n}`, 'with its fields copied')
          ok(psql(`select due_date::text from tasks where id='${occ}'`) === '2026-11-29', 'its due date by the rule')
          ok(inProject() > before, 'the standing project counts it')

          // Board: ↻ on the cards.
          await go('/spaces/planning?view=board')
          ok(await page.isVisible(`[data-repeat-mark]`), '↻ shows on rows')

          // Skip next moves the series on a week.
          const next = psql(`select next_publish::text from repeat_rules where id='${rule}'`)
          await go(`/spaces/planning?view=board&task=${src}`)
          await page.waitForSelector('[data-repeat-skip]')
          await page.click('[data-repeat-skip]')
          await page.waitForTimeout(1500)
          const after = psql(`select next_publish::text from repeat_rules where id='${rule}'`)
          ok(Date.parse(after) - Date.parse(next) === 7 * 86400000, `Skip next: ${next} → ${after}`)

          // Stop repeating.
          await page.click('[data-repeat-open]')
          await page.click('[data-repeat-stop]')
          await page.waitForTimeout(1500)
          ok(psql(`select stopped_at is not null from repeat_rules where id='${rule}'`) === 't', 'stopped')
          ok(psql(`select count(*) from tasks where repeat_rule_id='${rule}'`) === '0', 'no ↻ left')
          ok(!!psql(`select id from tasks where id='${occ}'`), 'the occurrences made stay')
          psql(`delete from repeat_rules where id='${rule}'`)
        } finally { dropTree(`name='${name}'`); psql(`delete from projects where id='${project}'`) }
      },
    },
  ]
}
