// Spec 023 Stage A: task types, the Fields button, task fields in sheets, required fields.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => Math.floor(Math.random() * 1e6)
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const brand = () => psql(`select id from brands order by name limit 1`)
  const task = (name, type, status = 'c-prog', who = EMAIL.admin) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
      select gen_random_uuid(), '${name}', '${brand()}', '${type}', m.id, m.id, m.role, true, '${status}', now(), 'Medium', now()
      from members m where m.email='${who}' returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('planning')}', 'manual') on conflict do nothing`)
    return id
  }
  const field = (name, kind = 'text', options = '{}') =>
    psql(`insert into task_fields (id, name_en, kind, options, position) values (gen_random_uuid(), '${name}', '${kind}', '${options}', 0) returning id`).split(/\n/)[0]
  const attach = (type, id, req = null) =>
    psql(`insert into task_type_fields (type_label, field_id, required_from, position) values ('${type}', '${id}', ${req ? `'${req}'` : 'null'}, 0)`)
  const dropField = id => psql(`delete from task_fields where id='${id}'`)
  const dropTasks = ids => psql(`delete from tasks where id in ('${ids.join("','")}')`)

  return [
    {
      id: '023-types-page-admin-edits', as: 'admin',
      async run({ page, go }) {
        const before = psql(`select coalesce(name_ar,'') || '|' || color from content_types where label='Reel'`)
        try {
          await go('/task-types')
          await page.waitForSelector('[data-task-type="Reel"]')
          await page.click('[data-type-edit="Reel"]')
          await page.fill('[data-type-editor="Reel"] [data-type-field="name_ar"]', 'ريلز')
          await page.click('[data-type-editor="Reel"] [data-type-color-choice="#D22040"]')
          await page.click('[data-type-editor="Reel"] [data-type-save]')
          await page.waitForTimeout(1500)
          ok(psql(`select name_ar || '|' || color from content_types where label='Reel'`) === 'ريلز|#D22040', 'Reel saved with its Arabic name and colour')
          ok(await page.isVisible('[data-task-type="Reel"] >> text=ريلز'), 'the row shows the Arabic name')
        } finally {
          const [ar, color] = before.split('|')
          psql(`update content_types set name_ar=${ar ? `'${ar}'` : 'null'}, color='${color}' where label='Reel'`)
        }
      },
    },
    {
      id: '023-types-page-user-reads', as: 'content',
      async run({ page, go }) {
        await go('/task-types')
        await page.waitForSelector('[data-task-type="Post"]')
        ok(!(await page.$('[data-type-edit]')), 'no Edit for a user')
        await page.click('[data-types-tab="fields"]')
        ok(!(await page.$('[data-field-new]')), 'no New field for a user')
        ok(await page.isVisible('[data-read-only]'), 'says it is read-only')
      },
    },
    {
      id: '023-panel-type-picker-and-add-type', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), id = task(`Lab type ${n}`, 'Post'), label = `Lab type ${n}`
        try {
          await go(`/spaces/planning?view=list&task=${id}`)
          await page.waitForSelector('[data-type-picker-open]')
          await page.click('[data-type-picker-open]')
          ok(await page.isVisible('[data-type-option="Reel"] [data-type-icon]'), 'each type has its icon')
          await page.click('[data-type-add]')
          await page.fill('[data-type-add-name]', label)
          await page.click('[data-type-add-save]')
          await page.waitForTimeout(2500)
          ok(psql(`select count(*) from content_types where label='${label}'`) === '1', 'the type was added')
          ok(psql(`select content_type_label from tasks where id='${id}'`) === label, 'and picked for the task')
        } finally { dropTasks([id]); psql(`delete from sla_config where content_type_label='${label}'`); psql(`delete from content_types where label='${label}'`) }
      },
    },
    {
      id: '023-panel-type-picker-user-no-add', as: 'content',
      async run({ page, go }) {
        const n = rnd(), id = task(`Lab type user ${n}`, 'Post', 'c-prog', EMAIL.content)
        try {
          await go(`/spaces/planning?view=list&task=${id}`)
          await page.waitForSelector('[data-type-picker-open]')
          await page.click('[data-type-picker-open]')
          await page.waitForSelector('[data-type-option="Post"]')
          ok(!(await page.$('[data-type-add]')), 'no + Type for a user')
        } finally { dropTasks([id]) }
      },
    },
    {
      id: '023-fields-button-add-field-and-show', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), id = task(`Lab fields ${n}`, 'Post'), name = `Lab caption ${n}`
        try {
          await go('/spaces/planning?view=list')
          await page.click('[data-fields-button]')
          await page.waitForSelector('[data-fields-menu] [data-view-field="brand"]')
          await page.click('[data-field-add]')
          await page.fill('[data-field-add-name]', name)
          ok(await page.isChecked('[data-field-add-type="Post"]'), 'types on the page are picked by default')
          await page.click('[data-field-add-save]')
          await page.waitForTimeout(2500)
          const fid = psql(`select id from task_fields where name_en='${name}'`)
          ok(!!fid, 'the field was created')
          ok(psql(`select count(*) from task_type_fields where field_id='${fid}' and type_label='Post'`) === '1', 'attached to Post')
          await page.waitForSelector(`[data-fields-menu] [data-view-field="f:${fid}"]`)
          ok(await page.isChecked(`[data-view-field="f:${fid}"]`), 'shown at once')
          // A value shows on the row.
          psql(`insert into task_field_values (task_id, field_id, value) values ('${id}', '${fid}', '"Hello world"')`)
          await go('/spaces/planning?view=list')
          await page.waitForSelector(`[data-row="${id}"] [data-list-field="${fid}"]`)
          ok((await page.textContent(`[data-row="${id}"] [data-list-field="${fid}"]`)).includes('Hello world'), 'the row shows the value')
          // Switching Brand off hides it on rows (kept for this member).
          await page.click('[data-fields-button]')
          await page.uncheck('[data-fields-menu] [data-view-field="brand"]')
          await page.waitForTimeout(1200)
          await go('/spaces/planning?view=list')
          ok(!(await page.textContent(`[data-row="${id}"]`)).includes(psql(`select name from brands where id='${brand()}'`)), 'brand hidden after reload')
        } finally {
          psql(`update members set view_prefs = view_prefs - ('space:' || '${space('planning')}') where email='${EMAIL.admin}'`)
          const fid = psql(`select id from task_fields where name_en='${name}'`)
          if (fid) dropField(fid)
          dropTasks([id])
        }
      },
    },
    {
      id: '023-fields-button-user-no-add', as: 'content',
      async run({ page, go }) {
        await go('/spaces/planning?view=list')
        await page.click('[data-fields-button]')
        await page.waitForSelector('[data-fields-menu]')
        ok(!(await page.$('[data-field-add]')), 'no + Field for a user')
      },
    },
    {
      id: '023-sheet-field-column-type-and-hatched', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), post = task(`Lab sheet post ${n}`, 'Post'), video = task(`Lab sheet video ${n}`, 'Video')
        const fid = field(`Lab hashtags ${n}`); attach('Post', fid)
        try {
          await go('/spaces/planning?view=sheet')
          const cell = id => `[data-cell="t:${id}|f:${fid}"]`
          await page.waitForSelector(cell(post), { timeout: 60000 })
          await page.click(cell(post))
          await page.keyboard.type('#eid')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(2500)
          ok(psql(`select value #>> '{}' from task_field_values where task_id='${post}' and field_id='${fid}'`) === '#eid', 'typing saves the value')
          await page.click(cell(video))
          await page.keyboard.type('x')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1500)
          ok(psql(`select count(*) from task_field_values where task_id='${video}' and field_id='${fid}'`) === '0', 'a Video row refuses a Post-only field')
        } finally { dropField(fid); dropTasks([post, video]) }
      },
    },
    {
      id: '023-required-field-blocks-move', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), id = task(`Lab required ${n}`, 'Post', 'c-prog'), name = `Lab must ${n}`
        const fid = field(name); attach('Post', fid, 'c-final')
        try {
          await go(`/spaces/planning?view=list&task=${id}`)
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'C-Review' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${id}'`) === 'c-prog', 'the move was refused')
          const body = await page.textContent('body')
          ok(body.includes(`${name} is required before C-Review`), 'the panel names the field and the stage')
          psql(`insert into task_field_values (task_id, field_id, value) values ('${id}', '${fid}', '"done"')`)
          await go(`/spaces/planning?view=list&task=${id}`)
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'C-Review' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${id}'`) === 'c-final', 'filled, it moves')
        } finally { dropField(fid); dropTasks([id]) }
      },
    },
  ]
}
