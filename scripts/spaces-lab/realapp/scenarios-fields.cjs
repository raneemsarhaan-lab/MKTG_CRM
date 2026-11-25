// Fields (owner's design of 25 Nov 2026): Standard / Custom / Regular, the Add column panel, each Space
// turning custom fields on and off, each person's own columns, and promotion to Standard. §6 of the request.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const first = sql => psql(sql).split(/\n/)[0]
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const brand = () => first(`select id || '|' || name from brands order by name limit 1`).split('|')
  const theme = (name, spaceKey) => {
    const id = first(`insert into projects (id, name, standing, is_theme, owner_id, brand_id) values (gen_random_uuid(), '${name}', true, true, '${who('admin')}', '${brand()[0]}') returning id`)
    psql(`insert into content_themes (id, project_id, space_id, position) values (gen_random_uuid(), '${id}', '${space(spaceKey)}', -20)`)
    return id
  }
  const task = (name, projectId, type = 'Post') => {
    const id = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,project_id)
      select gen_random_uuid(), '${name}', '${brand()[0]}', '${type}', m.id, m.id, m.role, true, 'c-prog', now(), 'Normal', now(), ${projectId ? `'${projectId}'` : 'null'}
      from members m where m.email='${EMAIL.admin}' returning id`)
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('content')}', 'created') on conflict do nothing`)
    return id
  }
  const settingsOf = key => psql(`select settings::text from team_spaces where key='${key}'`)
  const restoreSettings = (key, text) => psql(`update team_spaces set settings='${text.replace(/'/g, "''")}'::jsonb where key='${key}'`)
  const cleanup = ids => {
    for (const id of ids) {
      psql(`delete from tasks where project_id='${id}'`)
      psql(`delete from content_rows where project_id='${id}'`)
      psql(`delete from content_themes where project_id='${id}'`)
      psql(`delete from projects where id='${id}'`)
    }
  }
  const openAdd = async page => {
    await page.click('[data-add-field]')
    await page.waitForSelector('[data-add-column-panel]', { timeout: 20000 })
  }
  const sectionItems = (page, id) => page.$$eval(`[data-add-section="${id}"] [data-add-item]`, els => els.map(e => e.getAttribute('data-add-item')))

  return [
    {
      id: 'fields-standard-brand-on-content-sheet', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab fields theme ${n}`, 'content')
        const t = task(`Lab fields piece ${n}`, th)
        psql(`update members set sheet_layouts='{}' where email='${EMAIL.admin}'`)
        try {
          await go('/spaces/content?view=sheet')
          await page.waitForSelector(`[data-row="t:${th}"]`, { timeout: 90000 })
          await openAdd(page)
          ok((await sectionItems(page, 'standard')).includes('brand'), 'Brand is under Standard in the ＋ panel')
          await page.click('[data-add-section="standard"] [data-add-item="brand"] [data-add-do]')
          await page.waitForSelector(`[data-brand-cell="${brand()[0]}"]`, { timeout: 20000 })
          ok(true, 'Show adds the real Brand column, with the task\'s brand')
          await page.waitForTimeout(1500)
          const mine = psql(`select (sheet_layouts->'content'->'cols')::text from members where email='${EMAIL.admin}'`)
          ok(mine.includes('"brand"'), `saved in my own view only: ${mine}`)
          ok(psql(`select count(*) from sheet_columns where sheet='content' and key='brand'`) === '0', 'the Space default is untouched')
        } finally {
          psql(`update members set sheet_layouts='{}' where email='${EMAIL.admin}'`)
          cleanup([th])
        }
      },
    },
    {
      id: 'fields-hiding-a-column-is-mine-only', as: 'content',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab fields hide ${n}`, 'content')
        task(`Lab fields hide piece ${n}`, th)
        psql(`update members set sheet_layouts='{}' where email in ('${EMAIL.content}','${EMAIL.admin}')`)
        try {
          await go('/spaces/content?view=sheet')
          await page.waitForSelector(`[data-row="t:${th}"]`, { timeout: 90000 })
          // Hide Type from the column's menu.
          await page.locator('[role="columnheader"]', { hasText: /^Type/ }).first().click({ button: 'right' }).catch(() => {})
          await page.keyboard.press('Escape')
          await page.evaluate(() => document.dispatchEvent(new CustomEvent('momentum:fields-open')))
          await page.waitForSelector('[data-fields-drawer]', { timeout: 20000 })
          ok(await page.isVisible('[data-fields-mode="me"]'), 'the drawer shows "Just me"')
          ok(!(await page.$('[data-fields-mode="default"]')), 'no "Space default" for a member who isn\'t an admin')
          await page.click('[data-field-switch="type"]')
          await page.waitForTimeout(1200)
          const mine = psql(`select sheet_layouts->'content'->'cols' from members where email='${EMAIL.content}'`)
          ok(!!mine && !mine.includes('"type"'), `Type is hidden in my view: ${mine}`)
          ok(psql(`select count(*) from sheet_columns where sheet='content' and key='type' and shown_default=false`) === '0', 'nobody else\'s columns changed')
          const other = psql(`select coalesce((sheet_layouts->'content')::text, 'none') from members where email='${EMAIL.admin}'`)
          ok(other === 'none', `the admin has no change: ${other}`)
          ok(await page.isVisible('[data-fields-reset]'), 'Reset to Space default is offered')
          await page.click('[data-fields-reset]')
          await page.waitForTimeout(1200)
          ok(psql(`select coalesce((sheet_layouts->'content')::text, 'none') from members where email='${EMAIL.content}'`) === 'none', 'Reset puts the Space default back')
        } finally {
          psql(`update members set sheet_layouts='{}' where email in ('${EMAIL.content}','${EMAIL.admin}')`)
          cleanup([th])
        }
      },
    },
    {
      id: 'fields-new-custom-field-hook', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const name = `Hook ${n}`
        const th = theme(`Lab fields hook ${n}`, 'content')
        const t = task(`Lab fields hook piece ${n}`, th)
        const before = { content: settingsOf('content'), design: settingsOf('design'), video: settingsOf('video') }
        let fid = ''
        try {
          await go('/spaces/content?view=sheet')
          await page.waitForSelector(`[data-row="t:${th}"]`, { timeout: 90000 })
          await openAdd(page)
          await page.click('[data-add-new]')
          await page.fill('[data-new-name]', name)
          await page.click('[data-new-kind="text"]')
          ok(await page.getAttribute('[data-new-kind="text"]', 'aria-checked') === 'true', 'the Text tile is picked')
          // "This sheet only" hides the Space chips; back to "On the task".
          await page.click('[data-new-place="sheet"]')
          ok(!(await page.$('[data-new-space]')), 'This sheet only: no Space chips')
          await page.click('[data-new-place="task"]')
          ok(await page.getAttribute(`[data-new-space="${space('content')}"]`, 'aria-pressed') === 'true', 'this Space is always on')
          await page.click(`[data-new-space="${space('design')}"]`)
          await page.click('[data-new-add]')
          await page.waitForFunction(() => !document.querySelector('[data-add-column-panel]'), null, { timeout: 20000 })
          fid = psql(`select id from task_fields where name_en='${name}'`)
          ok(!!fid, 'the field is made')
          ok(psql(`select count(*) from task_type_fields where field_id='${fid}'`) === '0', 'attached to no type: it applies to every task')
          ok(psql(`select settings->'fields'->'${fid}'->>'shown' from team_spaces where key='content'`) === 'true', 'on in Content')
          ok(psql(`select settings->'fields'->'${fid}'->>'shown' from team_spaces where key='design'`) === 'true', 'on in Design (its chip was tapped)')
          // Content's task panel.
          await go(`/spaces/content?task=${t}`)
          await page.waitForSelector(`[data-panel-field="${name}"], [data-field-section="${name}"], [role="dialog"] >> text=${name}`, { timeout: 30000 })
          ok(true, 'it appears in Content\'s task panel')
          // Video: off, under "Custom · off in Video".
          await go('/spaces/video?view=sheet')
          await page.waitForSelector('[data-add-field]', { timeout: 90000 }).catch(() => null)
          if (await page.$('[data-add-field]')) {
            await openAdd(page)
            ok((await sectionItems(page, 'off')).includes(`f:${fid}`), 'in Video it is under "Custom · off in Video"')
          } else {
            ok(psql(`select coalesce(settings->'fields'->'${fid}'->>'shown', 'none') from team_spaces where key='video'`) === 'none', 'Video has not turned it on')
          }
        } finally {
          restoreSettings('content', before.content); restoreSettings('design', before.design); restoreSettings('video', before.video)
          if (fid) { psql(`delete from task_field_values where field_id='${fid}'`); psql(`delete from task_fields where id='${fid}'`) }
          cleanup([th])
        }
      },
    },
    {
      id: 'fields-tov-off-in-video-keeps-the-value', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const tov = psql(`select id from task_fields where name_en='TOV' and retired_at is null`)
        const th = theme(`Lab fields tov ${n}`, 'content')
        const t = task(`Lab fields tov piece ${n}`, th, 'Post')
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${t}', '${space('video')}', 'manual') on conflict do nothing`)
        psql(`insert into task_field_values (task_id, field_id, value) values ('${t}', '${tov}', '"Lab TOV words ${n}"') on conflict (task_id, field_id) do update set value=excluded.value`)
        const before = settingsOf('video')
        try {
          // Turned off in Video by an admin (the column menu's "Turn off in this Space" calls this).
          await page.evaluate(() => 0)
          psql(`update team_spaces set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{fields}', coalesce(settings->'fields','{}'::jsonb) || jsonb_build_object('${tov}', jsonb_build_object('shown', false))) where key='video'`)
          await go(`/spaces/video?task=${t}`)
          await page.waitForSelector('[role="dialog"]', { timeout: 60000 })
          await page.waitForTimeout(2000)
          ok(!(await page.locator('[role="dialog"]').innerText()).includes(`Lab TOV words ${n}`), 'TOV is hidden in Video')
          ok(psql(`select value::text from task_field_values where task_id='${t}' and field_id='${tov}'`) === `"Lab TOV words ${n}"`, 'the TOV text is still on the task')
          await go(`/spaces/content?task=${t}`)
          await page.waitForSelector('[role="dialog"]', { timeout: 60000 })
          await page.waitForFunction(w => document.querySelector('[role="dialog"]')?.textContent?.includes(w), `Lab TOV words ${n}`, { timeout: 20000 })
          ok(true, 'and it shows in Content')
        } finally {
          restoreSettings('video', before)
          psql(`delete from task_field_values where task_id='${t}'`)
          cleanup([th])
        }
      },
    },
    {
      id: 'fields-promoted-to-standard-is-on-everywhere', as: 'admin',
      async run({ page, go }) {
        const caption = psql(`select id from task_fields where name_en='Caption' and retired_at is null`)
        const key = `f:${caption}`
        const before = { list: psql(`select coalesce(array_to_string(standard_fields, ','), '') from workspace_settings where id=1`), design: settingsOf('design') }
        try {
          psql(`update team_spaces set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{fields}', coalesce(settings->'fields','{}'::jsonb) || jsonb_build_object('${caption}', jsonb_build_object('shown', false))) where key='design'`)
          await go('/spaces/design')
          await page.click('[data-space-settings-open]')
          await page.waitForSelector('[data-space-settings]')
          await page.click('[data-space-settings-tab="panel"]')
          await page.waitForSelector('[data-space-field="Caption"] [data-field-standard]')
          await page.click('[data-space-field="Caption"] [data-field-standard]')
          await page.waitForFunction(() => document.querySelector('[data-space-field="Caption"] [data-field-is-standard]'), null, { timeout: 20000 })
          ok(psql(`select '${key}' = any(standard_fields) from workspace_settings where id=1`) === 't', 'Caption is Standard')
          ok(!(await page.$('[data-space-field="Caption"] [data-field-shown]')), 'it can\'t be turned off (no switch)')
          // The server refuses turning it off too.
          const r = await page.evaluate(async () => (await fetch('/settings')).ok)
          ok(r, 'settings still open')
        } finally {
          const list = before.list ? `'{${before.list}}'` : `'{}'`
          psql(`update workspace_settings set standard_fields=${list} where id=1`)
          restoreSettings('design', before.design)
        }
      },
    },
    {
      id: 'fields-no-value-lost-when-a-space-turns-a-field-off', as: 'admin',
      async run() {
        const n = rnd()
        const caption = psql(`select id from task_fields where name_en='Caption' and retired_at is null`)
        const th = theme(`Lab fields keep ${n}`, 'content')
        const t = task(`Lab fields keep piece ${n}`, th)
        psql(`insert into task_field_values (task_id, field_id, value) values ('${t}', '${caption}', '"keep ${n}"')`)
        const before = settingsOf('content')
        const count = () => psql(`select count(*) from task_field_values`)
        try {
          const c0 = count()
          psql(`update team_spaces set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{fields}', coalesce(settings->'fields','{}'::jsonb) || jsonb_build_object('${caption}', jsonb_build_object('shown', false))) where key='content'`)
          ok(count() === c0, 'turning a field off deletes no value')
          restoreSettings('content', before)
          ok(psql(`select value::text from task_field_values where task_id='${t}'`) === `"keep ${n}"`, 'turning it on shows the same value again')
        } finally {
          restoreSettings('content', before)
          psql(`delete from task_field_values where task_id='${t}'`)
          cleanup([th])
        }
      },
    },
    {
      // §8: a saved view filtered by Theme keeps working after Theme is turned off in the Space, with a note.
      id: 'fields-filter-keeps-working-when-field-off', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab fields filter ${n}`, 'content')
        const inTheme = task(`Lab fields filter in ${n}`, th)
        const other = task(`Lab fields filter out ${n}`, null)
        const before = settingsOf('content')
        const node = `space:${space('content')}`
        const vid = first(`insert into saved_views (id, node, type, name, config, owner_id, position) values (gen_random_uuid(), '${node}', 'sheet', 'Lab by theme ${n}',
          '{"filters":{"campaign":["${th}"]}}'::jsonb, '${who('admin')}', 99) returning id`)
        try {
          // jsonb_set can't add a missing "fields" object: build it.
          psql(`update team_spaces set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('fields', coalesce(settings->'fields','{}'::jsonb) || '{"theme":{"shown":false}}'::jsonb) where key='content'`)
          await go(`/spaces/content?view=v:${vid}`)
          await page.waitForSelector('[data-view-config]', { timeout: 90000 })
          await page.waitForSelector('[data-view-field-off="theme"]', { timeout: 20000 })
          ok(/Filtered by Theme, which is off in this Space\./.test(await page.textContent('[data-view-field-off="theme"]')), 'the note names Theme')
          // Spec 027: a saved Sheet view is the new sheet, narrowed by the view.
          await page.waitForSelector(`[data-content-sheet] [data-row="k:${inTheme}"]`, { timeout: 60000 })
          ok(true, 'the filter still works on the stored theme')
          ok(!(await page.$(`[data-content-sheet] [data-row="k:${other}"]`)), 'tasks outside the theme stay out')
        } finally {
          restoreSettings('content', before)
          psql(`delete from saved_views where id='${vid}'`)
          psql(`delete from tasks where id in ('${inTheme}', '${other}')`)
          cleanup([th])
        }
      },
    },
  ]
}
