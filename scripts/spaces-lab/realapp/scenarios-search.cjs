// Workspace search (user, 2026-11-23): ranking, close matches, quotes, Arabic, context, Did you mean.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const brandBy = name => psql(`select id from brands where name ilike '${name}%' order by name limit 1`)
  const firstBrand = () => psql(`select id from brands order by name limit 1`)
  const content = () => psql(`select id from team_spaces where key='content'`)
  const make = (name, brand = firstBrand(), extra = {}) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,publish_date)
      select gen_random_uuid(), $$${name}$$, '${brand}', 'Post', m.id, m.id, m.role, true, '${extra.status ?? 'c-prog'}', now(), 'Medium', now(), ${extra.publish ? `'${extra.publish}'` : 'null'}
      from members m where m.email='${EMAIL.admin}' returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${content()}', 'manual') on conflict do nothing`)
    return id
  }
  const drop = ids => psql(`delete from tasks where id in ('${ids.join("','")}')`)
  async function search(page, text) {
    if (!(await page.$('[data-search-dialog]'))) await page.click('[data-sidebar-search]')
    await page.fill('[data-search-input]', text)
    await page.waitForTimeout(1600)
  }
  const results = page => page.$$eval('[data-search-group="tasks"] [data-search-task]', els => els.map(e => e.getAttribute('data-search-task')))

  return [
    {
      id: 'search-exact-first-case-order', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const exact = make(`Ramadan nights teaser ${n}`), longer = make(`Ramadan nights teaser ${n} extra cut`), order = make(`Teaser of the Ramadan nights ${n}`)
        try {
          await go('/overview')
          await search(page, `Ramadan nights teaser ${n}`)
          ok((await results(page))[0] === exact, 'the exact name is first')
          await search(page, `ramadan NIGHTS teaser ${n}`)
          ok((await results(page))[0] === exact, 'case doesn\'t matter')
          await search(page, `teaser ramadan ${n}`)
          const r = await results(page)
          ok(r.includes(order) && r.indexOf(exact) < r.indexOf(order), `words in any order, below closer matches: ${r}`)
          ok((await page.textContent(`[data-search-task="${exact}"] b`)).length > 0, 'matched words in bold')
          await search(page, `Ramdan nights teaser ${n}`)
          ok((await results(page)).includes(exact), 'Ramdan finds Ramadan (close match)')
          await search(page, `"Ramadan nights teaser ${n}"`)
          const q = await results(page)
          ok(q.includes(exact) && q.includes(longer) && !q.includes(order), 'quotes: the exact phrase only')
          await search(page, `"Ramdan nights teaser ${n}"`)
          ok(await page.isVisible('[data-search-none]'), 'quotes: no close matches')
        } finally { drop([exact, longer, order]) }
      },
    },
    {
      id: 'search-did-you-mean-and-caption', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const a = make(`Client quote ${n}`), b = make(`Customer quotes ${n}`)
        const cap = psql(`select id from task_fields where name_en='Caption' and retired_at is null`)
        const c = make(`Iftar post ${n}`)
        if (cap) psql(`insert into task_field_values (task_id, field_id, value) values ('${c}', '${cap}', '"Brighter evenings with Zelqora ${n}"')`)
        try {
          await go('/overview')
          await search(page, `qoute ${n}`)
          const r = await results(page)
          ok(r.includes(a) && r.includes(b), 'qoute finds quote and quotes')
          ok(/Did you mean\s+quote/.test(await page.textContent('[data-search-suggestion]')), 'Did you mean quote?')
          await page.click('[data-search-suggestion] button')
          await page.waitForTimeout(1600)
          ok((await page.inputValue('[data-search-input]')).startsWith('quote'), 'clicking searches the corrected word')
          await search(page, `quotes ${n}`)
          ok((await results(page)).includes(a), 'quotes finds quote')
          if (cap) {
            await search(page, `Zelqora ${n}`)
            ok((await results(page))[0] === c, 'found by its Caption')
            ok((await page.textContent(`[data-search-task="${c}"] [data-search-where]`)).includes('in Caption'), 'says it matched in Caption')
          }
          await search(page, 'zzqxw vvbnm')
          ok(await page.isVisible('[data-search-none]'), 'nothing: "No exact matches", never an empty screen')
        } finally { drop([a, b, c]) }
      },
    },
    {
      id: 'search-arabic-and-context', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const ar = make(`إعلان رمضانَ ${n}`)
        const fore = brandBy('Forefront'), other = psql(`select id from brands where id <> '${fore}' order by name limit 1`)
        const x = make(`Context brief ${n}`, other), y = make(`Context brief ${n} b`, fore)
        try {
          await go('/overview')
          await search(page, `اعلان رمضان ${n}`)
          ok((await results(page))[0] === ar, 'اعلان رمضان finds إعلان رمضانَ')
          await page.keyboard.press('Escape')
          await go(`/brands/${fore}`)
          await search(page, `context brief ${n}`)
          ok((await results(page))[0] === x || (await results(page))[0] === y, 'both found')
          // Same level (name starts with): the Forefront task first on Forefront's page.
          await search(page, `context ${n}`)
          ok((await results(page))[0] === y, 'Forefront tasks first from the Forefront page')
          await page.keyboard.press('Escape')
          if (other) {
            await go(`/brands/${other}`)
            await search(page, `context ${n}`)
            ok((await results(page))[0] === x, 'and the other brand first from its own page')
          }
          // Opening a result opens its task panel.
          await page.click(`[data-search-task="${x}"]`)
          await page.waitForTimeout(1500)
          ok(new URL(page.url()).searchParams.get('task') === x, 'a result opens its task')
        } finally { drop([ar, x, y]) }
      },
    },
  ]
}
