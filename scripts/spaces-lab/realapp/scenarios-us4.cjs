// Spaces lab real-app scenarios for per-brand feature switches (spec 021 US4, T069).
module.exports = (EMAIL, psql, ok) => {
  const brandId = name => psql(`select id from brands where name='${name}'`)
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const A = 'The Strategy Community', B = 'Forefront Consulting'
  const seed = (name, brand, extra = {}) => {
    const due = extra.overdue ? "now() - interval '5 days'" : "now() + interval '10 days'"
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,platform,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,due_date,priority,hours_estimate,updated_at)
      select gen_random_uuid(), '${name} ' || floor(random()*1e6)::text, '${brandId(brand)}', 'Design', 'LinkedIn',
        (select id from members where role='Content Creator' limit 1), (select id from members where role='Graphic Designer' limit 1),
        'Content Creator', ${extra.nine ? 'true' : 'false'}, 'd-prog', now() - interval '20 days', ${due}, 'High', 2, now() returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${spaceId('design')}', 'manual') on conflict do nothing`)
    return id
  }
  const reset = () => {
    psql(`update brands set features='{}', nine_stage_default=null`)
    psql(`update workspace_settings set brand_feature_defaults='{}'`)
  }
  const openPanel = async (page, go, brand) => {
    await go(`/brands/${brandId(brand)}`)
    await page.click('[data-brand-features-open]')
    await page.waitForSelector('[data-brand-features] [data-feature-switch]')
  }
  const featuresOf = brand => psql(`select features::text from brands where name='${brand}'`)
  const cell = (id, col) => `[data-task-sheet] [data-cell$="${id}|${col}"]`

  return [
    {
      id: 'us4-switch-off-hides-for-that-brand-only', as: 'admin',
      async run({ page, go }) {
        reset()
        try {
          const a = seed('Features lab A', A), b = seed('Features lab B', B)
          await openPanel(page, go, A)
          await page.click('[data-brand-features] [data-feature-switch="platform"]')
          await page.waitForTimeout(1500)
          ok(featuresOf(A) === '{"platform": false}', `the brand keeps an override: ${featuresOf(A)}`)
          ok(await page.$('[data-brand-features] [data-feature-reset="platform"]'), 'it says the brand has its own setting')

          await go('/spaces/design?view=sheet')
          await page.waitForSelector(cell(a, 'platform'), { timeout: 60000 })
          ok(await page.$(`${cell(a, 'platform')} [data-feature-off]`), "A's Platform is a hatched, empty cell")
          ok((await page.locator(cell(b, 'platform')).innerText()).trim() === 'LinkedIn', "B's Platform still shows")
          await page.locator(cell(a, 'platform')).click()
          await page.keyboard.type('Instagram')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1200)
          ok(psql(`select platform from tasks where id='${a}'`) === 'LinkedIn', "a hidden field can't be typed into, and its value is kept")

          await go(`/spaces/design?view=list&task=${a}`)
          await page.waitForSelector('text=Time estimate', { timeout: 30000 })
          ok(!(await page.locator('text=/^Platform$/').count()), 'the task panel has no Platform field')

          await openPanel(page, go, A)
          await page.click('[data-brand-features] [data-feature-reset="platform"]')
          await page.waitForTimeout(1500)
          ok(featuresOf(A) === '{}', 'Use default clears the override')
          await go('/spaces/design?view=sheet')
          await page.waitForSelector(cell(a, 'platform'), { timeout: 60000 })
          ok((await page.locator(cell(a, 'platform')).innerText()).trim() === 'LinkedIn', 'switched back on, the value returns')
        } finally { reset() }
      },
    },
    {
      id: 'us4-sla-off-removes-badges', as: 'admin',
      async run({ page, go }) {
        reset()
        try {
          const a = seed('SLA lab A', A, { overdue: true }), b = seed('SLA lab B', B, { overdue: true })
          psql(`update brands set features='{"sla": false}' where name='${A}'`)
          await go('/spaces/design?view=board')
          await page.waitForSelector(`[data-task-card="${b}"]`, { timeout: 60000 })
          ok(await page.$(`[data-task-card="${b}"] [data-sla-chip]`), "B's late card has its SLA badge")
          ok(!(await page.$(`[data-task-card="${a}"] [data-sla-chip]`)), "A's card has none")
          ok(await page.$(`[data-task-card="${a}"]`), "A's card is still on the Board")
        } finally { reset() }
      },
    },
    {
      id: 'us4-islam-check-new-tasks-only', as: 'admin',
      async run({ page, go }) {
        reset()
        try {
          const old = seed('C-Check lab old', B)
          await openPanel(page, go, B)
          const sw = '[data-brand-features] [data-feature-switch="cCheck"]'
          ok((await page.getAttribute(sw, 'aria-checked')) === 'false', 'follows the workspace (off)')
          await page.click(sw)
          await page.waitForTimeout(1500)
          ok(psql(`select nine_stage_default from brands where name='${B}'`) === 't', "the brand's C-Check is on for new tasks")
          const name = `Lab C-Check ${Date.now()}`
          await go('/spaces/content?view=board')
          await page.getByRole('button', { name: 'Add task' }).first().click()
          await page.fill('input[placeholder="Task name — or paste a list"]', name)
          await page.locator('button', { hasText: /^Create Task$/i }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select b.name||':'||t.nine_stage from tasks t join brands b on b.id=t.brand_id where t.name='${name}'`) === `${B}:true`, 'a new task for the brand has the C-Check stage')
          ok(psql(`select nine_stage from tasks where id='${old}'`) === 'f', 'an existing task keeps its stages')
        } finally { reset() }
      },
    },
    {
      id: 'us4-defaults-in-settings-and-admins-only', as: 'admin',
      async run({ page, go }) {
        reset()
        try {
          await go('/settings')
          await page.locator('main button', { hasText: /^Brands$/ }).first().click()
          await page.waitForSelector('[data-brand-defaults] [data-feature-switch="covers"]')
          await page.click('[data-brand-defaults] [data-feature-switch="covers"]')
          await page.waitForTimeout(1500)
          ok(psql('select brand_feature_defaults::text from workspace_settings') === '{"covers": false}', 'the workspace default is saved')
          await go('/spaces/design?view=board')
          await page.waitForSelector('[data-task-card]', { timeout: 60000 })
          ok(!(await page.$('[data-task-card] [data-card-cover]')), 'no brand without its own switch shows covers')
        } finally { reset() }
      },
    },
    {
      id: 'us4-users-see-no-switches', as: 'design',
      async run({ page, go }) {
        await go(`/brands/${brandId(A)}`)
        ok(!(await page.$('[data-brand-features-open]')), "a user can't change a brand's features")
      },
    },
  ]
}
