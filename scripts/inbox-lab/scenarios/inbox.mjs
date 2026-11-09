// Inbox lab scenarios (spec 006): one or more per acceptance scenario, then
// keyboard, right to left, phone, axe and speed. Raneem's starting Inbox is in
// fixtures.ts: reviews r1 r2, yours y1 (late) y2 (today) y3 (undated),
// total 5. Mentions and Team moved to the notification bell (spec 012 R12):
// the Inbox has To do and Done, and its number counts the to-dos only.

export const SCENARIOS = [
  // ── US1: see how much needs me, open it in one click ─────────────────────
  {
    id: 'us1-1',
    async run(t) {
      t.eq(await t.count(), 5, 'the number: 2 reviews + 3 tasks (mentions are in the bell)')
      t.eq((await t.summary()).trim(), '2 reviews waiting · 1 late', 'the two most pressing kinds')
      t.eq(await t.page.locator('[data-inbox-badge]').innerText(), '5', 'badge')
      t.assert(await t.page.locator('[data-inbox-badge].is-urgent').count() === 1, 'urgent colour (due today and late)')
      t.eq(await t.page.getByRole('button', { name: /^Inbox\s*2 reviews waiting · 1 late\s*, 5 to do$/ }).count(), 1, 'visible words, then the counts in words (FR-013)')
      t.eq(await t.button().getAttribute('aria-expanded'), 'false', 'collapsed')
      t.assert(!(await t.panelOpen()), 'hidden by default')
    },
  },
  {
    id: 'us1-2',
    async run(t) {
      await t.openInbox()
      t.eq(await t.button().getAttribute('aria-expanded'), 'true', 'expanded')
      t.eq(await t.selectedTab(), 'todo', 'opens on To do')
      t.eq(await t.rows('review'), ['r1', 'r2'], 'reviews')
      t.eq(await t.rows('yours'), ['y1', 'y2', 'y3'], 'your tasks')
      t.eq((await t.page.locator('[data-inbox-counts]').innerText()).trim(), '5 to do', 'heading')
      // The same items the number counts (SC-002).
      const listed = (await t.rows('review')).length + (await t.rows('yours')).length
      t.eq(listed, await t.count(), 'number equals listed items')
      t.eq(await t.page.$$eval('[data-inbox-panel] [role="tab"]', ts => ts.map(x => x.getAttribute('data-tab'))), ['todo', 'done'], 'two tabs: To do and Done (spec 012)')
    },
  },
  {
    id: 'us1-3',
    async run(t) {
      await t.openInbox()
      await t.page.keyboard.press('Escape')
      await t.idle()
      t.assert(!(await t.panelOpen()), 'Esc closes')
      t.eq(await t.focused(), 'button', 'focus back on the button')
      await t.openInbox()
      await t.page.locator('[data-inbox-close]').click()
      await t.idle()
      t.assert(!(await t.panelOpen()), '✕ closes')
      await t.openInbox()
      await t.page.mouse.click(150, 400)
      await t.idle()
      t.assert(!(await t.panelOpen()), 'a click on the board closes')
      await t.openInbox()
      await t.button().click()
      await t.idle()
      t.assert(!(await t.panelOpen()), 'the button toggles it closed (FR-014)')
    },
  },
  {
    id: 'us1-4', hash: 'empty=1',
    async run(t) {
      t.eq(await t.count(), 0, 'nothing waiting')
      t.assert(await t.page.locator('[data-inbox-button].is-zero').count() === 1, 'quiet style')
      t.eq((await t.summary()).trim(), 'All clear', 'All clear')
      t.eq(await t.page.locator('[data-inbox-badge]').count(), 0, 'no number')
      t.eq(await t.page.getByRole('button', { name: /^Inbox\s*All clear$/ }).count(), 1, 'name')
      await t.openInbox()
      t.eq((await t.page.locator('[data-inbox-counts]').innerText()).trim(), 'All clear', 'the panel says All clear')
      t.eq(await t.selectedTab(), 'todo', 'opens on To do (FR-016, spec 012)')
    },
  },
  {
    id: 'us1-5', hash: 'me=mona',
    async run(t) {
      t.eq(await t.count(), 1, 'one review, not due')
      t.eq(await t.page.locator('[data-inbox-badge].is-urgent').count(), 0, 'normal colour when nothing is due today or late')
      t.eq((await t.summary()).trim(), '1 review waiting', 'summary')
    },
  },
  {
    id: 'us1-6',
    async run(t) {
      await t.openInbox()
      await t.row('yours:y3').locator('.fx-inbox-main').click()
      await t.idle()
      t.eq((await t.lab()).opened.map(o => o.id), ['y3'], 'the row opens the task')
      t.assert(!(await t.panelOpen()), 'and the panel steps aside')
      t.eq((await t.calls('move')).length, 0, 'no action taken')
    },
  },
  {
    id: 'us1-ring',
    async run(t) {
      t.eq(await t.page.locator('[data-inbox-button].is-ring').count(), 1, 'pulses with new mentions and urgent tasks')
      await t.openInbox()
      t.eq(await t.page.locator('[data-inbox-button].is-ring').count(), 0, 'stops once opened')
      await t.page.reload(); await t.page.waitForSelector('[data-lab-ready]'); await t.idle()
      t.eq(await t.page.locator('[data-inbox-button].is-ring').count(), 0, 'does not pulse again for the same items')
      const anim = await t.page.evaluate(() => getComputedStyle(document.querySelector('[data-inbox-button]'), '::after').animationIterationCount)
      t.assert(anim === '3' || anim === '1', `three pulses at most (${anim})`)
    },
  },
  {
    id: 'us1-reduced', reducedMotion: 'reduce',
    async run(t) {
      const name = await t.page.evaluate(() => getComputedStyle(document.querySelector('[data-inbox-button]'), '::after').animationName)
      t.eq(name, 'none', 'no pulse under reduced motion (FR-012d)')
    },
  },

  // ── US2: reviews waiting on me ───────────────────────────────────────────
  {
    id: 'us2-1',
    async run(t) {
      await t.openInbox()
      const heads = await t.page.$$eval('.fx-inbox-group', hs => hs.map(h => h.textContent.trim()))
      t.eq(heads.slice(0, 2), ['Waiting for your review · 2', 'Your tasks · 3'], 'reviews above your tasks')
      const r1 = await t.row('review:r1').innerText()
      t.assert(/C-Review/.test(r1) && /Waiting 2 days/.test(r1) && /Due in 1 day/.test(r1), `stage, wait and due (${r1.replace(/\n/g, ' | ')})`)
    },
  },
  {
    id: 'us2-2',
    async run(t) {
      await t.openInbox()
      await t.act('review:r1', 'approve').click()
      await t.idle(250)
      t.eq(await t.calls('move'), [['r1', 'r-design']], 'moved to the next stage')
      t.eq((await t.lab()).celebrations.map(c => c.stage), ['r-design'], 'celebrates: her own stage, forward')
      t.eq(await t.rows('review'), ['r2'], 'the row leaves')
      t.eq(await t.count(), 4, 'the number drops')
    },
  },
  {
    id: 'us2-3',
    async run(t) {
      await t.openInbox()
      await t.act('review:r2', 'sendBack').click()
      await t.page.locator('[data-row="review:r2"] input').fill('Logo is cropped on the last slide')
      await t.page.locator('[data-row="review:r2"] .fx-inbox-act.is-go').click()
      await t.idle(300)
      t.eq(await t.calls('move'), [['r2', 'd-check']], 'back to the stage before')
      t.eq(await t.calls('comment'), [['r2', '@Lina Logo is cropped on the last slide', ['lina']]], 'the note names the owner')
      t.eq((await t.lab()).celebrations, [], 'no celebration for a step back')
      t.eq(await t.rows('review'), ['r1'], 'the row leaves')
    },
  },
  {
    id: 'us2-4', hash: 'me=lina',
    async run(t) {
      await t.openInbox()
      t.eq(await t.rows('review'), [], 'no review role, no review rows')
      const heads = await t.page.$$eval('.fx-inbox-group', hs => hs.map(h => h.textContent))
      t.assert(!heads.some(h => /review/i.test(h)), 'and no group')
    },
  },
  {
    id: 'us2-5', hash: 'me=mona',
    async run(t) {
      await t.openInbox()
      t.eq(await t.rows('review'), ['r4'], 'an admin sees only the stage her role owns')
      await t.failNext('move', 'not_found')
      await t.act('review:r4', 'approve').click()
      await t.idle(250)
      t.eq((await t.row('review:r4').locator('[role="alert"]').innerText()).trim(), 'Already moved. The list is up to date.', 'already moved')
      t.eq(await t.count(), 1, 'the number does not change on failure (FR-029)')
    },
  },

  // ── US3: my own work ─────────────────────────────────────────────────────
  {
    id: 'us3-1',
    async run(t) {
      await t.openInbox()
      const why = await t.page.$$eval('[data-row^="yours:"] .fx-inbox-why', ws => ws.map(w => w.textContent.trim()))
      t.eq(why, ['2 days late', 'Due today', 'No due date'], 'late, today, undated, each with its reason')
      t.eq(await t.rows('yours'), ['y1', 'y2', 'y3'], 'not y4 (due later) nor the dropped one')
    },
  },
  {
    id: 'us3-2',
    async run(t) {
      await t.openInbox()
      await t.act('yours:y1', 'tomorrow').click()
      await t.idle(250)
      const [[id, until]] = await t.calls('snooze')
      t.eq(id, 'y1', 'put off')
      t.eq(new Date(until).getTime(), new Date('2026-11-06T00:00').getTime(), 'until the next local midnight')
      t.eq(await t.rows('yours'), ['y2', 'y3'], 'the row leaves')
      t.eq(await t.count(), 4, 'and the number')
      t.assert(/Put off until tomorrow · 1/.test(await t.page.locator('[data-inbox-snoozed]').innerText()), 'the Put off line')
      await t.page.locator('[data-inbox-snoozed] button').click()
      await t.idle(250)
      t.eq(await t.calls('unsnooze'), [[['y1']]], 'Bring back')
      t.eq(await t.rows('yours'), ['y1', 'y2', 'y3'], 'back in the list')
    },
  },
  {
    id: 'us3-3',
    async run(t) {
      await t.openInbox()
      await t.act('yours:y3', 'setDate').click()
      await t.page.locator('[data-row="yours:y3"] input[type="date"]').fill('2026-11-10')
      await t.page.locator('[data-row="yours:y3"] .fx-inbox-act.is-go').click()
      await t.idle(250)
      t.eq(await t.calls('setDate'), [['y3', '2026-11-10']], 'saved')
      t.eq(await t.rows('yours'), ['y1', 'y2'], 'no longer needs a decision today')
      t.eq(await t.count(), 4, 'the number drops')
    },
  },
  {
    id: 'us3-4',
    async run(t) {
      await t.openInbox()
      await t.act('yours:y1', 'moveOn').click()
      await t.idle(250)
      t.eq(await t.calls('move'), [['y1', 'c-final']], 'one stage on')
      t.eq((await t.lab()).celebrations.map(c => c.stage), ['c-final'], 'celebrates under the board\'s rule')
      // As Marketing Manager, the task now waits for her own review.
      t.eq(await t.rows('review'), ['r1', 'r2', 'y1'], 'it reaches her reviews, longest waiting first')
    },
  },
  {
    id: 'us3-denied', hash: 'me=sara',
    async run(t) {
      await t.openInbox()
      // Sara owns y2, but it is assigned to Raneem: Sara sees no row for it.
      t.eq(await t.rows('yours'), [], 'yours means assigned-or-owned-if-unassigned')
    },
  },

  // ── US4 and US5 (Mentions, Team) moved to the notification bell: lab:notify ──

  // ── US6: Done ────────────────────────────────────────────────────────────
  {
    id: 'us6-1',
    async run(t) {
      await t.openInbox(); await t.tab('done')
      t.eq(await t.rows('done'), ['d1'], 'this week')
      t.assert(/Published today/.test(await t.row('done:d1').innerText()), 'when')
      t.eq((await t.page.locator('[data-inbox-total]').innerText()).trim(), '2 published in total', 'all-time total')
    },
  },
  {
    id: 'us6-2',
    async run(t) {
      await t.page.evaluate(() => window.__inbox.setTasks(ts => ts.filter(x => x.id !== 'd1')))
      await t.idle()
      await t.openInbox(); await t.tab('done')
      t.assert(/Nothing published yet this week/.test(await t.page.locator('[data-inbox-panel]').innerText()), 'says so')
      t.eq((await t.page.locator('[data-inbox-total]').innerText()).trim(), '1 published in total', 'still shows the total')
    },
  },

  // ── US7: pin and View ────────────────────────────────────────────────────
  {
    id: 'us7-1',
    async run(t) {
      await t.openInbox()
      await t.page.locator('[data-inbox-pin]').click()
      await t.idle(200)
      t.eq(await t.calls('setPrefs'), [[{ pinned: true }]], 'remembered')
      t.eq(await t.page.locator('[data-inbox-panel][data-pinned]').count(), 1, 'pinned')
      const panel = await t.page.locator('[data-inbox-panel]').boundingBox()
      const board = await t.page.locator('[data-lab-board]').boundingBox()
      t.assert(board.x + board.width <= panel.x + 1, 'beside the board, which narrowed')
      await t.page.mouse.click(150, 400); await t.idle()
      t.assert(await t.panelOpen(), 'a click on the board leaves it open')
      await t.page.keyboard.press('Escape'); await t.idle()
      t.assert(await t.panelOpen(), 'Esc leaves a pinned panel')
    },
  },
  {
    id: 'us7-2', hash: 'pinned=1',
    async run(t) {
      t.eq(await t.page.locator('[data-inbox-panel][data-pinned]').count(), 1, 'still pinned after a reload')
    },
  },
  {
    id: 'us7-3', hash: 'pinned=1',
    async run(t) {
      await t.page.locator('[data-inbox-pin]').click()
      await t.idle(200)
      t.assert(!(await t.panelOpen()), 'unpinned and closed')
      t.eq(await t.calls('setPrefs'), [[{ pinned: false }]], 'remembered')
      const board = await t.page.locator('[data-lab-board]').boundingBox()
      t.assert(board.width > 1250, 'the board takes its full width')
    },
  },
  {
    id: 'us7-4',
    async run(t) {
      t.eq(await t.page.locator('[data-lab-week]').count(), 0, 'Your week off by default')
      await t.page.locator('[data-view-menu] [aria-haspopup="menu"]').click()
      await t.page.locator('[data-view="week"]').click()
      await t.idle(200)
      t.eq(await t.calls('setPrefs'), [[{ showWeek: true }]], 'remembered')
      t.eq(await t.page.locator('[data-lab-week]').count(), 1, 'shown')
      t.eq(await t.page.locator('[data-view="week"]').getAttribute('aria-checked'), 'true', 'checked')
    },
  },
  {
    id: 'us7-5',
    async run(t) {
      await t.page.locator('[data-view-menu] [aria-haspopup="menu"]').click()
      t.eq(await t.page.locator('[data-view="upstream"]').getAttribute('aria-checked'), 'true', 'columns before design shown')
      await t.page.locator('[data-view="upstream"]').click()
      t.eq((await t.lab()).upstream, [false], 'the same switch as the old button')
    },
  },

  // ── Polish ───────────────────────────────────────────────────────────────
  {
    id: 'inbox-kbd',
    async run(t) {
      await t.button().focus()
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq(await t.focused(), 'tab:todo', 'focus on the selected tab')
      await t.page.keyboard.press('ArrowRight'); await t.idle(60)
      t.eq(await t.focused(), 'tab:done', 'arrows move between tabs')
      t.eq(await t.selectedTab(), 'done', 'and select')
      await t.page.keyboard.press('End'); await t.idle(60)
      t.eq(await t.focused(), 'tab:done', 'End')
      await t.page.keyboard.press('Home'); await t.idle(60)
      await t.page.keyboard.press('Tab'); await t.page.keyboard.press('Tab')
      const acts = await t.page.evaluate(() => document.activeElement?.className)
      t.assert(/fx-inbox-main/.test(acts), `Tab reaches the rows (${acts})`)
      await t.page.keyboard.press('Tab')
      t.eq(await t.page.evaluate(() => document.activeElement?.getAttribute('data-act')), 'approve', 'then its actions')
      await t.page.keyboard.press('Enter'); await t.idle(250)
      t.eq(await t.calls('move'), [['r1', 'r-design']], 'usable by keyboard alone')
      await t.page.keyboard.press('Escape'); await t.idle()
      t.eq(await t.focused(), 'button', 'Esc returns focus to the button')
    },
  },
  {
    id: 'inbox-rtl', hash: 'locale=ar',
    async run(t) {
      t.eq(await t.page.evaluate(() => document.documentElement.dir), 'rtl', 'right to left')
      await t.openInbox()
      const box = await t.page.locator('[data-inbox-panel]').boundingBox()
      t.assert(box.x < 40, `opens from the left (${box.x})`)
      t.eq((await t.page.locator('[data-tab="todo"]').innerText()).replace(/\s+/g, ' ').trim(), 'للإنجاز 5', 'Arabic tabs')
      t.assert(/\d/.test(await t.page.locator('[data-inbox-badge]').innerText()), 'digits')
      await t.tab('done')
    },
  },
  {
    id: 'inbox-phone', viewport: { width: 390, height: 844 }, touch: true,
    async run(t) {
      t.assert(!(await t.page.locator('[data-inbox-summary]').isVisible()), 'no summary line on a phone')
      t.eq(await t.page.locator('[data-inbox-badge]').innerText(), '5', 'keeps the number')
      await t.openInbox()
      const box = await t.page.locator('[data-inbox-panel]').boundingBox()
      t.eq([Math.round(box.x), Math.round(box.width)], [0, 390], 'full width')
      const page = await t.page.evaluate(() => document.scrollingElement.scrollWidth)
      t.assert(page <= 390, `no sideways scroll (${page})`)
      const acts = await t.row('yours:y1').locator('.fx-inbox-acts').boundingBox()
      const main = await t.row('yours:y1').locator('.fx-inbox-main').boundingBox()
      t.assert(acts.y >= main.y + main.height - 1, 'actions on their own line')
    },
  },
  {
    id: 'inbox-axe',
    async run(t) {
      const closed = await t.axe('[data-inbox-button]')
      t.eq(closed, [], 'button')
      await t.openInbox()
      for (const tab of ['todo', 'done']) {
        await t.tab(tab)
        t.eq(await t.axe('[data-inbox-panel]'), [], `panel, ${tab}`)
      }
      await t.page.keyboard.press('Escape')
      await t.page.locator('[data-view-menu] [aria-haspopup="menu"]').click()
      t.eq(await t.axe('[data-view-menu]'), [], 'View menu')
    },
  },
  {
    id: 'inbox-perf',
    async run(t) {
      const ms = await t.page.evaluate(async () => {
        const btn = document.querySelector('[data-inbox-button]')
        const t0 = performance.now()
        btn.click()
        await new Promise(r => { const tick = () => (document.querySelector('[data-inbox-panel]') ? r() : requestAnimationFrame(tick)); tick() })
        const t1 = performance.now()
        btn.click()
        await new Promise(r => { const tick = () => (!document.querySelector('[data-inbox-panel]') ? r() : requestAnimationFrame(tick)); tick() })
        return [t1 - t0, performance.now() - t1]
      })
      t.assert(ms[0] < 500 && ms[1] < 500, `open ${Math.round(ms[0])} ms, close ${Math.round(ms[1])} ms (SC-008)`)
    },
  },
]
