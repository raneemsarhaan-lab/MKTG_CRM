// Spec 022 US4 (T040): Space stages — rename and split, sub-stage moves, sheets in the Space's names.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const rnd = () => Math.floor(Math.random() * 1e6)
  const clearStages = key => psql(`delete from space_stages where space_id='${space(key)}'`)
  const media = (name, status = 'd-prog') => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,entry_stage,media_board,priority,updated_at)
      select gen_random_uuid(), '${name}', (select id from brands order by name limit 1), 'Post',
        m.id, m.id, m.role, true, '${status}', now() - interval '2 days', 'r-design', 'design', 'Medium', now() from members m where m.email='${EMAIL.design}' returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('design')}', 'created') on conflict do nothing`)
    return id
  }
  const panelStage = async (page, go, id, label) => {
    await go(`/spaces/design?view=board&task=${id}`)
    await page.locator('button[aria-label^="Stage:"]').first().click()
    await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: label }).first().click()
    await page.waitForTimeout(2000)
  }
  const typeStatus = async (page, go, path, id, text) => {
    await go(path)
    const cell = `[data-cell*="${id}|status"]`
    await page.waitForSelector(cell, { timeout: 60000 })
    await page.locator(cell).first().click()
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
  }

  return [
    {
      id: '022-us4-split-rename-and-refuse', as: 'admin',
      async run({ page, go }) {
        clearStages('design')
        try {
          await go('/spaces/design?view=board')
          await page.click('[data-space-settings-open]'); await page.click('[data-space-settings-tab="flow"]'); await page.click('[data-space-stages-open]')
          await page.waitForSelector('[data-space-stages]')
          await page.fill('[data-space-stage-name="d-prog:0"]', 'Sketch')
          await page.click('[data-space-stage-add="d-prog"]')
          await page.fill('[data-space-stage-name="d-prog:1"]', ' sketch ')
          ok(await page.isDisabled('[data-space-stages-save]'), 'the same name twice cannot be saved')
          ok(/twice/.test(await page.textContent('[data-space-stages-msg]') ?? ''), 'and it says why')
          await page.fill('[data-space-stage-name="d-prog:1"]', 'D-Check')
          ok(await page.isDisabled('[data-space-stages-save]'), "another stage's name cannot be saved")
          await page.fill('[data-space-stage-name="d-prog:1"]', 'Final art')
          await page.fill('[data-space-stage-name="d-check:0"]', 'Client review')
          await page.click('[data-space-stages-save]')
          await page.waitForSelector('[data-space-stages]', { state: 'detached', timeout: 15000 })
          const rows = psql(`select string_agg(stage_id||':'||coalesce(name,'-')||':'||position, ',' order by stage_id, position) from space_stages where space_id='${space('design')}' and name is not null`)
          ok(rows === 'd-check:Client review:0,d-prog:Sketch:0,d-prog:Final art:1', `saved: ${rows}`)
          ok(psql(`select count(*) from space_stages where space_id<>'${space('design')}' and name in ('Sketch','Final art')`) === '0', 'only this Space')
        } finally { clearStages('design') }
      },
    },
    {
      id: '022-us4-sub-stage-move-changes-only-the-space', as: 'admin',
      async run({ page, go }) {
        clearStages('design')
        const ds = space('design')
        psql(`insert into space_stages (id, space_id, stage_id, name, position, aliases) values
          (gen_random_uuid(), '${ds}', 'd-prog', 'Sketch', 0, '{}'), (gen_random_uuid(), '${ds}', 'd-prog', 'Final art', 1, '{}')`)
        const final = psql(`select id from space_stages where space_id='${ds}' and name='Final art'`)
        const t = media(`Lab 022 split ${rnd()}`)
        const before = psql(`select status||'|'||stage_date::text from tasks where id='${t}'`)
        try {
          // Spec 026: a saved Sheet view of the Space is its tasks as a task sheet, with the Space's stage names.
          const view = psql(`insert into saved_views (id, node, type, name, config, position) values (gen_random_uuid(), 'space:${ds}', 'sheet', 'Lab steps ${rnd()}', '{}', 99) returning id`).split(/\n/)[0]
          await typeStatus(page, go, `/spaces/design?view=v:${view}`, t, 'Final art')
          ok(psql(`select status||'|'||stage_date::text from tasks where id='${t}'`) === before, 'the original stage and its date are unchanged')
          ok(psql(`select space_stage_id from task_space_stages where task_id='${t}' and space_id='${ds}'`) === final, 'this Space remembers Final art')
          ok(psql(`select count(*) from task_space_stages where task_id='${t}' and space_id<>'${ds}'`) === '0', 'no other Space changes')
          await go('/spaces/design?view=board')
          await page.waitForSelector(`[data-space-stage="${final}"]`, { timeout: 30000 })
          ok(await page.locator(`[data-space-stage="${final}"]`).filter({ hasText: 'Lab 022 split' }).count() === 1, 'the Board shows it under Final art')
          // Leaving the stage and coming back starts at the first step.
          await panelStage(page, go, t, 'D-Check')
          ok(psql(`select status from tasks where id='${t}'`) === 'd-check', 'moved on to D-Check')
          await panelStage(page, go, t, 'Sketch') // the panel carries the Space's names (spec 024)
          ok(psql(`select status from tasks where id='${t}'`) === 'd-prog', 'and back')
          await go(`/spaces/design?view=v:${view}`)
          const cell = `[data-cell*="${t}|status"]`
          await page.waitForSelector(cell, { timeout: 60000 })
          ok(/Sketch/.test(await page.textContent(cell) ?? ''), `re-entering starts at Sketch: ${await page.textContent(cell)}`)
        } finally { psql(`update tasks set dropped_at=now() where id='${t}'`); psql(`delete from saved_views where name like 'Lab steps %'`); clearStages('design') }
      },
    },
    {
      id: '022-us4-content-sheet-uses-space-names', as: 'admin',
      async run({ page, go }) {
        clearStages('content')
        const cs = space('content')
        psql(`insert into space_stages (id, space_id, stage_id, name, position, aliases) values
          (gen_random_uuid(), '${cs}', 'c-prog', 'Writing', 0, '{}'), (gen_random_uuid(), '${cs}', 'c-final', 'Polishing', 0, '{Polish}')`)
        const name = `Lab 022 words ${rnd()}`
        // The Content sheet lists pieces under their theme.
        const theme = psql(`insert into projects (id, name, brand_id, is_theme) values (gen_random_uuid(), 'Lab 022 theme', (select id from brands order by name limit 1), true) returning id`).split(/\n/)[0]
        const t = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,project_id)
          select gen_random_uuid(), '${name}', (select id from brands order by name limit 1), 'Post', m.id, m.id, m.role, true, 'c-prog', now(), 'Medium', now(), '${theme}'
          from members m where m.email='${EMAIL.admin}' returning id`).split(/\n/)[0]
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${t}', '${cs}', 'manual') on conflict do nothing`)
        // Spec 023: this is about stage words; Post's required fields are filled.
        psql(`insert into task_field_values (task_id, field_id, value) select '${t}', l.field_id, '"lab"' from task_type_fields l join task_fields f on f.id=l.field_id
          where l.type_label='Post' and l.required_from is not null and f.kind='text' on conflict do nothing`)
        try {
          await go('/spaces/content?view=sheet')
          const cell = `[data-content-sheet] [data-cell*="${t}|status"]`
          await page.waitForSelector(cell, { timeout: 60000 })
          ok(/Writing/.test(await page.textContent(cell) ?? ''), `the Content sheet shows the Space's name: ${await page.textContent(cell)}`)
          await page.locator(cell).click()
          await page.keyboard.type('polish')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${t}'`) === 'c-final', 'typing a Space name (an alias) moves it')
          // QA 26 Nov 2026 (F08): there is no all-tasks board any more; its address opens a Space instead.
          await go('/board')
          ok(!new URL(page.url()).pathname.startsWith('/board'), `the old board's address redirects, now at ${new URL(page.url()).pathname}`)
        } finally { psql(`delete from tasks where id='${t}'`); psql(`delete from projects where id='${theme}'`); clearStages('content') }
      },
    },
  ]
}
