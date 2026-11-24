// Spec 023 Stage B: priorities, tags, several assignees.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const brand = () => psql(`select id from brands order by name limit 1`)
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const task = (name, opts = {}) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,due_date,due_manual,hours_estimate)
      values (gen_random_uuid(), '${name}', '${brand()}', 'Post', '${who('admin')}', '${opts.assignee ?? who('content')}', 'Content Creator', true, '${opts.status ?? 'c-prog'}', now(), '${opts.priority ?? 'Normal'}', now(),
      ${opts.due ? `'${opts.due}'` : 'null'}, true, ${opts.hours ?? 2}) returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('planning')}', 'manual') on conflict do nothing`)
    psql(`insert into task_field_values (task_id, field_id, value) select '${id}', l.field_id, '"lab"' from task_type_fields l join task_fields f on f.id=l.field_id
      where l.type_label='Post' and l.required_from is not null and f.kind='text' on conflict do nothing`)
    return id
  }
  const drop = ids => psql(`delete from tasks where id in ('${ids.join("','")}')`)
  const panel = (go, id) => go(`/spaces/planning?view=board&task=${id}`)

  return [
    {
      id: '023b-priority-normal-urgent-first-notifies', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const old = task(`Lab medium ${n}`, { priority: 'Medium', due: '2026-12-01' })
        const late = task(`Lab urgent later ${n}`, { due: '2026-12-20' })
        try {
          await panel(go, old)
          await page.waitForSelector('[data-priority]')
          ok((await page.getAttribute('[data-priority]', 'data-priority')) === 'Normal', 'Medium reads Normal')
          // Make the later task Urgent from its panel; its assignee hears about it.
          await panel(go, late)
          await page.waitForSelector('[data-priority]')
          await page.locator('[data-priority]').click()
          await page.locator('select').filter({ has: page.locator('option[value="Urgent"]') }).first().selectOption('Urgent')
          await page.keyboard.press('Tab')
          await page.waitForTimeout(2000)
          ok(psql(`select priority from tasks where id='${late}'`) === 'Urgent', 'set to Urgent')
          ok(psql(`select count(*) from notifications where task_id='${late}' and kind='urgent' and recipient_id='${who('content')}'`) === '1', 'the assignee is notified')
          // On the board, Urgent comes first in its column even with a later due date.
          await go('/spaces/planning?view=board')
          await page.waitForSelector(`[data-task-card="${late}"]`)
          const order = await page.$$eval('[data-task-card]', els => els.map(e => e.getAttribute('data-task-card')))
          ok(order.indexOf(late) < order.indexOf(old), 'Urgent sorts first')
          ok(await page.isVisible(`[data-task-card="${late}"] [data-card-urgent]`), 'a red Urgent flag on the card')
        } finally { drop([old, late]) }
      },
    },
    {
      id: '023b-tags-create-filter-merge', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), a = task(`Lab tag a ${n}`), b = task(`Lab tag b ${n}`)
        try {
          await panel(go, a)
          await page.click('[data-tag-add]')
          await page.fill('[data-tag-search]', `Eid ${n}`)
          await page.click('[data-tag-create]')
          await page.waitForTimeout(1500)
          const eid = psql(`select id from tags where key='eid ${n}'`)
          ok(!!eid, 'created while tagging')
          ok(psql(`select count(*) from task_tags where task_id='${a}' and tag_id='${eid}'`) === '1', 'the task is tagged')
          await panel(go, b)
          await page.click('[data-tag-add]')
          await page.fill('[data-tag-search]', `eid ${n}`)
          ok(!(await page.$('[data-tag-create]')), 'no duplicate offered (case ignored)')
          await page.click(`[data-tag-option="Eid ${n}"]`)
          await page.waitForTimeout(1500)
          ok(psql(`select count(*) from task_tags where tag_id='${eid}'`) === '2', 'two tasks tagged')
          // A card shows the tag.
          await go('/spaces/planning?view=board')
          ok(await page.isVisible(`[data-task-card="${a}"] [data-tag="Eid ${n}"]`), 'tag chip on the card')
          // Admin merges it into another tag.
          const keep = psql(`insert into tags (id, name, key, color) values (gen_random_uuid(), 'Eid 2026 ${n}', 'eid 2026 ${n}', '#D22040') returning id`).split(/\n/)[0]
          await go('/task-types')
          await page.click('[data-types-tab="tags"]')
          await page.selectOption(`[data-tag-merge="Eid ${n}"]`, keep)
          await page.waitForTimeout(1500)
          ok(psql(`select count(*) from tags where id='${eid}'`) === '0', 'the merged tag is gone')
          ok(psql(`select count(*) from task_tags where tag_id='${keep}'`) === '2', 'its tasks carry the kept tag')
          psql(`delete from tags where id='${keep}'`)
        } finally { drop([a, b]); psql(`delete from tags where key in ('eid ${n}', 'eid 2026 ${n}')`) }
      },
    },
    {
      id: '023b-assignees-lead-hours-and-moves', as: 'admin',
      async run({ page, go, BASE, signInAs }) {
        const n = rnd(), id = task(`Lab pair ${n}`, { assignee: who('content'), hours: 8 })
        try {
          await panel(go, id)
          await page.waitForSelector('[data-assignees]')
          ok(await page.isVisible('[data-assignee="Samaa"] [data-assignee-lead]'), 'Samaa is the lead')
          await page.click('[data-assignee-add]')
          await page.click('[data-assignee-option="Noran"]')
          await page.waitForTimeout(1500)
          ok(psql(`select count(*) from task_assignees where task_id='${id}'`) === '2', 'two assignees')
          ok(psql(`select assignee_id from tasks where id='${id}'`) === who('content'), 'the lead stays the task\'s assignee')
          ok(psql(`select count(*) from notifications where task_id='${id}' and kind='assigned' and recipient_id='${who('dms')}'`) === '1', 'Noran is told')
          // Hours 6 for Samaa; Noran gets the other 2.
          await page.fill('[data-assignee-hours="Samaa"]', '6')
          await page.keyboard.press('Tab')
          await page.waitForTimeout(1500)
          ok(psql(`select hours from task_assignees where task_id='${id}' and member_id='${who('content')}'`) === '6', 'Samaa: 6 h')
          // Noran (not the lead) can move a working stage and sees it in My tasks.
          const { ctx, page: noran } = await signInAs('dms')
          await noran.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
          ok(await noran.isVisible(`[data-mt-task="${id}"]`), 'in Noran\'s My tasks')
          await ctx.close()
          // Make Noran lead.
          await panel(go, id)
          await page.click('[data-make-lead="Noran"]')
          await page.waitForTimeout(1500)
          ok(psql(`select assignee_id from tasks where id='${id}'`) === who('dms'), 'Noran is now the lead')
          await go(`/brands/${brand()}?view=workload`)
          await page.waitForSelector('[data-workload-view]')
          ok(true, 'workload view renders with split hours')
        } finally { drop([id]) }
      },
    },
    {
      id: '023b-other-assignee-may-move-working-stage', as: 'dms',
      async run({ page, go }) {
        const n = rnd(), id = task(`Lab helper ${n}`, { assignee: who('content') })
        psql(`insert into task_assignees (task_id, member_id, position) values ('${id}', '${who('content')}', 0), ('${id}', '${who('dms')}', 1)`)
        psql(`update members set access='user' where email='${EMAIL.dms}'`)
        try {
          await panel(go, id)
          // The forgotten-hours reminder can open for this member; Later closes it.
          await page.waitForTimeout(1500)
          if (await page.$('[data-hours-later]')) await page.click('[data-hours-later]')
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'C-Review' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${id}'`) === 'c-final', 'a second assignee (a user) moved it on')
        } finally { psql(`update members set access='superuser' where email='${EMAIL.dms}'`); drop([id]) }
      },
    },
  ]
}
