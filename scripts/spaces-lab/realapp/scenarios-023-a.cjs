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
          await go(`/spaces/planning?view=board&task=${id}`)
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
          await go(`/spaces/planning?view=board&task=${id}`)
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
          // Spec 025: List is a view of the brand's page (a Space has Board, Sheet and Calendar).
          await go(`/brands/${brand()}?view=list`)
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
          await go(`/brands/${brand()}?view=list`)
          await page.waitForSelector(`[data-row="${id}"] [data-list-field="${fid}"]`)
          ok((await page.textContent(`[data-row="${id}"] [data-list-field="${fid}"]`)).includes('Hello world'), 'the row shows the value')
          // Switching Brand off hides it on rows (kept for this member).
          await page.click('[data-fields-button]')
          await page.uncheck('[data-fields-menu] [data-view-field="brand"]')
          await page.waitForTimeout(1200)
          await go(`/brands/${brand()}?view=list`)
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
        await go('/spaces/planning?view=board')
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
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet&sheet=tasks`)
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
          await go(`/spaces/planning?view=board&task=${id}`)
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'C-Review' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${id}'`) === 'c-prog', 'the move was refused')
          const body = await page.textContent('body')
          ok(new RegExp(`${name}.* (is|are) required before C-Review`).test(body), 'the panel names the field and the stage')
          psql(`insert into task_field_values (task_id, field_id, value) select '${id}', id, '"done"' from task_fields where id='${fid}' or (name_en in ('Caption','TOV') and retired_at is null)`)
          await go(`/spaces/planning?view=board&task=${id}`)
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'C-Review' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${id}'`) === 'c-final', 'filled, it moves')
        } finally { dropField(fid); dropTasks([id]) }
      },
    },
    {
      id: '023-panel-caption-tov-channels', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const theme = psql(`insert into projects (id, name, brand_id, is_theme) values (gen_random_uuid(), 'Lab theme ${n}', '${brand()}', true) returning id`).split(/\n/)[0]
        const id = task(`Lab caption ${n}`, 'Post', 'c-prog')
        psql(`update tasks set project_id='${theme}' where id='${id}'`)
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('content')}', 'manual') on conflict do nothing`)
        const f = name => psql(`select id from task_fields where name_en='${name}' and retired_at is null`)
        ok(!!f('Caption') && !!f('TOV') && !!f('Channels'), 'Caption, TOV and Channels exist')
        try {
          await go(`/spaces/content?view=board&task=${id}`)
          await page.waitForSelector('[data-field-section="Caption"]')
          // Channels is a top row, before the Publishing date; Caption above the Description, TOV below.
          const order = await page.evaluate(() => {
            const at = sel => { const el = document.querySelector(sel); const box = el && (el.closest('.fx-prop') ?? el); return box ? box.getBoundingClientRect().top : -1 }
            return { channels: at('[data-panel-field="Channels"]'), publish: at('[data-publish-date]'), caption: at('[data-field-section="Caption"]'), tov: at('[data-field-section="TOV"]') }
          })
          ok(order.channels > 0 && order.channels <= order.publish && order.caption < order.tov, `layout: ${JSON.stringify(order)}`)
          ok(await page.isVisible('[data-field-section="Caption"] [data-field-missing="Caption"]'), 'Caption not added, in red')
          ok((await page.getAttribute('[data-field-section="TOV"] [data-field-required-badge]', 'title')) === 'Required before C-Review', 'badge says the stage on hover')
          // Channels: + Add only, then pick Instagram.
          await page.click('[data-panel-field="Channels"] [data-chip-add]')
          await page.click('[data-chip-option="Instagram"]')
          await page.waitForTimeout(1500)
          ok(psql(`select value::text from task_field_values where task_id='${id}' and field_id='${f('Channels')}'`) === '["instagram"]', 'channel saved')
          // Clicking the red words opens the field; typing saves it.
          await page.click('[data-field-missing="Caption"]')
          await page.keyboard.type('Hello Ramadan')
          await page.locator('[data-field-section="TOV"] span').first().click()
          await page.waitForTimeout(1500)
          ok(psql(`select value #>> '{}' from task_field_values where task_id='${id}' and field_id='${f('Caption')}'`) === 'Hello Ramadan', 'caption saved')
          // Moving on is refused for TOV, and the TOV section is outlined.
          await page.locator('button', { hasText: '→ C-Review' }).first().click()
          await page.waitForTimeout(2000)
          ok(psql(`select status from tasks where id='${id}'`) === 'c-prog', 'refused without TOV')
          ok((await page.textContent('body')).includes('TOV is required before C-Review'), 'the message names TOV')
          // Card and Content sheet show what's missing.
          await go('/spaces/content?view=board')
          await page.waitForSelector(`[data-task-card="${id}"]`)
          ok(await page.isVisible(`[data-task-card="${id}"] [data-card-missing="TOV"]`), 'card: TOV missing')
          ok(!(await page.$(`[data-task-card="${id}"] [data-card-missing="Caption"]`)), 'card: no Caption label once filled')
          await go('/spaces/content?view=sheet')
          await page.waitForSelector(`[data-cell*="${id}|f:${f('TOV')}"]`, { timeout: 60000 })
          ok((await page.textContent(`[data-cell*="${id}|f:${f('TOV')}"]`)).includes('TOV not added'), 'sheet: TOV not added')
          // Typing in the sheet fills the field.
          await page.click(`[data-cell*="${id}|f:${f('TOV')}"]`)
          await page.keyboard.type('Ramadan nights')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(2000)
          ok(psql(`select value #>> '{}' from task_field_values where task_id='${id}' and field_id='${f('TOV')}'`) === 'Ramadan nights', 'TOV saved from the sheet')
        } finally { dropTasks([id]); psql(`delete from projects where id='${theme}'`) }
      },
    },
    {
      id: '023-make-it-a-task-field', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), id = task(`Lab column ${n}`, 'Post'), sheet = `tasks:brand:${psql('select id from brands order by name limit 1')}`
        const col = psql(`insert into sheet_columns (id, sheet, key, name, position, kind) values (gen_random_uuid(), '${sheet}', 'c:' || gen_random_uuid(), 'Lab hook ${n}', 90, 'text') returning id`).split(/\n/)[0]
        const key = psql(`select key from sheet_columns where id='${col}'`)
        psql(`insert into sheet_values (column_id, task_id, value) values ('${col}', '${id}', 'Big hook')`)
        try {
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet&sheet=tasks`)
          await page.waitForSelector(`[data-col-menu="${key}"]`, { state: 'attached', timeout: 60000 })
          await page.hover(`[data-col-head="${key}"]`)
          await page.click(`[data-col-menu="${key}"]`, { force: true })
          await page.click('[data-sheet-menu] [data-make-field]')
          await page.waitForTimeout(2500)
          const fid = psql(`select id from task_fields where name_en='Lab hook ${n}'`)
          ok(!!fid, 'a task field was made with the column\'s name')
          ok(psql(`select value #>> '{}' from task_field_values where task_id='${id}' and field_id='${fid}'`) === 'Big hook', 'the value moved onto the task')
          ok(psql(`select deleted_at is not null from sheet_columns where id='${col}'`) === 't', 'the column is gone from the sheet')
          ok(psql(`select count(*) from task_type_fields where field_id='${fid}' and type_label='Post'`) === '1', 'attached to the types that had values')
          psql(`delete from task_fields where id='${fid}'`)
        } finally { psql(`delete from sheet_columns where id='${col}'`); dropTasks([id]) }
      },
    },
    {
      id: '023-brand-switches-a-field-off', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), b = brand(), id = task(`Lab switch ${n}`, 'Post', 'c-prog')
        const fid = field(`Lab switchable ${n}`); attach('Post', fid, 'c-final')
        psql(`update task_fields set switchable=true where id='${fid}'`)
        const before = psql(`select coalesce(features::text, '{}') from brands where id='${b}'`)
        try {
          await go(`/brands/${b}/settings`)
          await page.click(`[data-feature-switch="f:${fid}"]`)
          await page.waitForTimeout(1500)
          ok(psql(`select features ->> 'f:${fid}' from brands where id='${b}'`) === 'false', 'switched off for the brand')
          // Hidden in the panel, and it no longer stops a move.
          await go(`/spaces/planning?view=board&task=${id}`)
          await page.waitForSelector('[data-type-picker-open]')
          ok(!(await page.$(`[data-field-section="Lab switchable ${n}"]`)), 'hidden in the task panel')
          psql(`insert into task_field_values (task_id, field_id, value) select '${id}', f.id, '"lab"' from task_fields f where f.name_en in ('Caption','TOV') and f.retired_at is null on conflict do nothing`)
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'C-Review' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${id}'`) === 'c-final', 'a switched-off required field doesn\'t stop the move')
        } finally { psql(`update brands set features='${before}'::jsonb where id='${b}'`); dropField(fid); dropTasks([id]) }
      },
    },
    {
      id: '023-status-groups-and-milestones', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), a = task(`Lab group ${n}`, 'Post', 'todo'), c = task(`Lab group done ${n}`, 'Post', 'scheduled')
        const day = psql(`select to_char((now() at time zone 'Africa/Cairo')::date + 2, 'YYYY-MM-DD')`)
        try {
          await go(`/brands/${brand()}?view=list`)
          await page.click('[data-group="statusGroup"]')
          ok(await page.isVisible(`[data-group-key="not_started"] [data-row="${a}"]`), 'To Do is Not started')
          ok(await page.isVisible(`[data-group-key="done"] [data-row="${c}"]`), 'Scheduled is Done')
          // Milestones: add one on a day of the brand's calendar; it shows on the Space calendar too.
          await go(`/brands/${brand()}?view=calendar`)
          await page.waitForSelector(`[data-day="${day}"]`)
          await page.hover(`[data-day="${day}"]`)
          await page.click(`[data-milestone-add="${day}"]`)
          await page.fill('[data-milestone-name]', `Ramadan launch ${n}`)
          await page.click('[data-milestone-save]')
          await page.waitForTimeout(1500)
          const mid = psql(`select id from milestones where name='Ramadan launch ${n}'`)
          ok(!!mid, 'added')
          ok(await page.isVisible(`[data-day="${day}"] [data-milestone="${mid}"]`), 'on its day')
          ok((await page.getAttribute(`[data-milestone="${mid}"]`, 'draggable')) === 'false', 'not draggable')
          await go('/spaces/planning?view=calendar')
          await page.waitForSelector(`[data-day="${day}"]`)
          ok(await page.isVisible(`[data-milestone="${mid}"]`), 'on the Space calendar, which has that brand\'s work')
          psql(`delete from milestones where id='${mid}'`)
        } finally { dropTasks([a, c]) }
      },
    },
    {
      id: '023-milestones-user-cannot-add', as: 'content',
      async run({ page, go }) {
        await go(`/brands/${brand()}?view=calendar`)
        await page.waitForSelector('[data-day]')
        ok(!(await page.$('[data-milestone-add]')), 'no Add milestone for a user')
      },
    },
  ]
}
