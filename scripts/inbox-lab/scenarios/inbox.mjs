// Inbox lab scenarios (spec 006): one or more per acceptance scenario, then
// keyboard, right to left, phone, axe and speed. Raneem's starting Inbox is in
// fixtures.ts: reviews r1 r2, yours y1 (late) y2 (today) y3 (undated),
// unread mentions m2 m1, total 7.

export const SCENARIOS = [
  // ── US1: see how much needs me, open it in one click ─────────────────────
  {
    id: 'us1-1',
    async run(t) {
      t.eq(await t.count(), 7, 'the number: 2 reviews + 3 tasks + 2 mentions')
      t.eq((await t.summary()).trim(), '2 reviews waiting · 1 late', 'the two most pressing kinds')
      t.eq(await t.page.locator('[data-inbox-badge]').innerText(), '7', 'badge')
      t.assert(await t.page.locator('[data-inbox-badge].is-urgent').count() === 1, 'urgent colour (due today and late)')
      t.eq(await t.page.getByRole('button', { name: /^Inbox\s*2 reviews waiting · 1 late\s*, 5 to do, 2 unread mentions$/ }).count(), 1, 'visible words, then the counts in words (FR-013)')
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
      t.eq((await t.page.locator('[data-inbox-counts]').innerText()).trim(), '5 to do · 2 unread mentions', 'heading')
      // The same items the number counts (SC-002).
      const listed = (await t.rows('review')).length + (await t.rows('yours')).length
      await t.tab('mentions')
      const unread = await t.page.locator('[data-row^="mention:"].is-unread').count()
      t.eq(listed + unread, await t.count(), 'number equals listed items')
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
      t.eq(await t.selectedTab(), 'team', 'To do and Mentions empty: opens on Team (FR-016)')
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
      t.eq(await t.count(), 6, 'the number drops')
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
      t.eq(await t.count(), 6, 'and the number')
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
      t.eq(await t.count(), 6, 'the number drops')
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

  // ── US4: mentions ────────────────────────────────────────────────────────
  {
    id: 'us4-1',
    async run(t) {
      await t.openInbox()
      t.eq((await t.page.locator('[data-tab="mentions"]').innerText()).replace(/\s+/g, ' ').trim(), 'Mentions 2 new', 'tab shows new')
      await t.tab('mentions')
      t.eq(await t.rows('mention'), ['m2', 'm1', 'm0'], 'unread first, newest first')
      t.eq(await t.page.locator('[data-row="mention:m0"].is-unread').count(), 0, 'older than the launch window: read (FR-034)')
      const m1 = await t.row('mention:m1').innerText()
      t.assert(/Yosra Eltopgy mentioned you/.test(m1) && /Suez Canal/.test(m1) && /headline before 3pm/.test(m1) && /1d ago/.test(m1), 'author, task, text, age')
    },
  },
  {
    id: 'us4-2',
    async run(t) {
      await t.openInbox(); await t.tab('mentions')
      await t.act('mention:m2', 'markRead').click()
      await t.idle(200)
      t.eq(await t.calls('markRead'), [[['m2']]], 'marked read')
      t.eq(await t.count(), 6, 'number drops')
      t.eq(await t.rows('mention'), ['m1', 'm2', 'm0'], 'read ones go below')
    },
  },
  {
    id: 'us4-3',
    async run(t) {
      await t.openInbox(); await t.tab('mentions')
      await t.page.locator('[data-row="mention:m1"] input').fill('Version B. Shorter.')
      await t.act('mention:m1', 'reply').click()
      await t.idle(200)
      t.eq(await t.calls('reply'), [['m1', 'Version B. Shorter.']], 'reply in place')
      t.eq(await t.count(), 6, 'replying reads it')
      t.eq(await t.page.locator('[data-row="mention:m1"] input').inputValue(), '', 'box cleared')
    },
  },
  {
    id: 'us4-4',
    async run(t) {
      await t.openInbox(); await t.tab('mentions')
      await t.page.locator('[data-act="markAllRead"]').click()
      await t.idle(200)
      t.eq(await t.calls('markRead'), [[['m2', 'm1']]], 'all unread')
      t.eq(await t.count(), 5, 'only To do left')
      t.eq((await t.page.locator('[data-tab="mentions"]').innerText()).trim(), 'Mentions', 'no new count')
    },
  },
  {
    id: 'us4-5',
    async run(t) {
      await t.openInbox(); await t.tab('mentions'); await t.tab('team'); await t.tab('mentions')
      await t.page.keyboard.press('Escape'); await t.idle()
      t.eq(await t.calls('markRead'), [], 'looking marks nothing read (FR-031)')
      t.eq(await t.count(), 7, 'number unchanged')
      await t.openInbox(); await t.tab('mentions')
      await t.row('mention:m1').locator('.fx-inbox-main').click()
      await t.idle(200)
      t.eq(await t.calls('markRead'), [[['m1']]], 'opening the task from the mention reads it')
      t.eq((await t.lab()).opened, [{ id: 'r1', opts: { commentId: 'm1' } }], 'at that comment')
    },
  },

  // ── US5: Team ────────────────────────────────────────────────────────────
  {
    id: 'us5-1',
    async run(t) {
      await t.openInbox(); await t.tab('team')
      const keys = await t.rows('team')
      t.assert(keys.includes('c:c1') && keys.includes('a:a1'), `others' comment and file (${keys})`)
      t.assert(!keys.includes('c:c2') && !keys.includes('a:a0'), 'not my own')
      t.assert(!keys.some(k => k.startsWith('c:m')), 'mentions live in Mentions')
      t.assert(/Sara Nabil added cover_v3.png/.test(await t.row('team:a:a1').innerText()), 'names the uploader')
    },
  },
  {
    id: 'us5-2',
    async run(t) {
      await t.openInbox(); await t.tab('team')
      const move = await t.row('team:s:y2').innerText()
      t.assert(/Moved to D-In Progress/.test(move) && /yesterday/.test(move), `stage and day (${move})`)
      t.assert(!/Raneem|Sara|just now/.test(move), 'no name, never "just now" (FR-041)')
      t.eq(await t.row('team:s:y2').locator('.fx-person-av').count(), 0, 'no avatar')
    },
  },
  {
    id: 'us5-3',
    async run(t) {
      await t.openInbox(); await t.tab('team')
      await t.row('team:c:c1').locator('.fx-inbox-main').click()
      await t.idle()
      t.eq((await t.lab()).opened, [{ id: 'y1', opts: { commentId: 'c1' } }], 'opens the task at the comment')
    },
  },

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
      t.eq(await t.focused(), 'tab:mentions', 'arrows move between tabs')
      t.eq(await t.selectedTab(), 'mentions', 'and select')
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
      for (const tab of ['mentions', 'team', 'done']) await t.tab(tab)
    },
  },
  {
    id: 'inbox-phone', viewport: { width: 390, height: 844 }, touch: true,
    async run(t) {
      t.assert(!(await t.page.locator('[data-inbox-summary]').isVisible()), 'no summary line on a phone')
      t.eq(await t.page.locator('[data-inbox-badge]').innerText(), '7', 'keeps the number')
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
      for (const tab of ['todo', 'mentions', 'team', 'done']) {
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
