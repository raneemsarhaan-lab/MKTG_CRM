// US1: a header that reads in three rows (spec 011).
export const us1 = [
  {
    id: 'h1-rows',
    async run(t) {
      const top = await t.box('[data-top-bar]'), title = await t.box('[data-title-row]'), tools = await t.box('[data-toolbar]'), board = await t.box('[data-board]')
      t.assert(top.y < title.y && title.y < tools.y && tools.y < board.y, 'top bar, title row, toolbar, then the board')
      t.eq(await t.page.locator('[data-top-bar] [role="tab"]').allInnerTexts(), ['Pipeline', 'Content'], 'tabs')
      t.eq(await t.text('[data-page-title]'), 'Pipeline', 'title')
      // Row 1, in order: tabs, search, Inbox, avatar.
      const xs = await Promise.all(['[data-tab="pipeline"]', '[data-header-search]', '[data-inbox-button]', '[data-account]'].map(s => t.box(s).then(b => b.x)))
      t.assert(xs.every((x, i) => i === 0 || x > xs[i - 1]), `top bar order ${xs}`)
      // Row 3, in order.
      const ys = await Promise.all(['[data-scope="me"]', '[data-brand-menu]', '[data-filters]', '[data-view-pair]', '[data-display-options]'].map(s => t.box(s)))
      t.assert(ys.every((b, i) => i === 0 || b.x > ys[i - 1].x), 'toolbar order')
      t.assert(new Set(ys.map(b => Math.round(b.y + b.height / 2))).size <= 2, 'toolbar on one line')
      t.assert(board.y <= 280, `the first column starts at ${board.y}px (≤ 280, SC-001)`)
    },
  },
  {
    id: 'h1-removed',
    async run(t) {
      const body = await t.page.locator('body').innerText()
      t.assert(!/Good morning|Hey,|Good evening|move the needle|PIPELINE/.test(body), 'no greeting, tagline or PIPELINE heading')
      t.eq(await t.page.locator('[data-view-switch]').count(), 0, 'no three-way switch')
      t.eq(await t.page.locator('[data-toolbar] [data-view-pair] button').count(), 2, 'Board | Sheet only')
    },
  },
  {
    id: 'h1-user', hash: 'me=user',
    async run(t) {
      t.eq(await t.page.locator('[data-new-task]').count(), 0, 'no New task for a user (FR-020)')
      const row = await t.box('[data-title-row]')
      await t.open('me=admin')
      const row2 = await t.box('[data-title-row]')
      t.eq(Math.round(row.height), Math.round(row2.height), 'the title row keeps its height')
    },
  },
  {
    id: 'h1-wired',
    async run(t) {
      await t.page.locator('[data-new-task]').click()
      t.eq((await t.host()).newTask, 1, 'New task opens the form')
      await t.page.locator('[data-header-search]').fill('founder')
      t.eq((await t.host()).search, 'founder', 'search reaches the board filter')
      await t.page.locator('[data-scope="team"]').click()
      t.eq((await t.host()).scope, 'team', 'Team tasks')
      await t.page.locator('[data-display-options]').click()
      await t.page.locator('[role="menuitemcheckbox"][data-view="week"]').click()
      t.eq((await t.host()).showWeek, true, 'Display options → Show your week')
      t.assert(await t.page.locator('[data-week]').count() === 1, 'the week sits under the toolbar')
      await t.page.locator('[role="menuitemcheckbox"][data-view="upstream"]').click()
      t.eq((await t.host()).upstream, false, 'Columns before design')
      await t.page.keyboard.press('Escape')
      await t.page.locator('[data-filters]').click()
      await t.page.locator('.fx-hd-pop button', { hasText: 'High' }).click()
      t.eq((await t.host()).filters.priorities, ['High'], 'Filters: the same menu inside')
      t.assert(/Filters · 1/.test(await t.text('[data-filters]')), 'the count on the button')
      await t.page.locator('[data-inbox-button]').click()
      t.eq((await t.host()).inboxOpen, true, 'the Inbox opens its panel')
    },
  },
]
