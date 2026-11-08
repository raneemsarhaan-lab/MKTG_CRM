// Notifications lab scenarios (spec 012): the bell, the panel and its rows,
// opening, marking, paging, toasts, settings, history, phone alerts, the reply
// composer, Arabic, phones and axe. The starting list is in entry.tsx: 11
// notifications, 4 unread (g, move, mention, assigned), newest first.

const ORDER = ['g', 'move', 'mention', 'assigned', 'created', 'attach', 'reply', 'thread', 'due', 'overdue', 'gone']

export const SCENARIOS = [
  // ── US1: the bell, the panel, opening ────────────────────────────────────
  {
    id: 'n1-bell',
    async run(t) {
      t.eq(await t.badge().innerText(), '4', 'the red count')
      t.eq(await t.bell().getAttribute('aria-label'), 'Notifications, 4 unread', 'accessible name')
      for (let i = 0; i < 8; i++) await t.arrive({ kind: 'comment', actorIds: ['kai'], meta: { task_name: `Busy ${i}` } })
      await t.poll()
      t.eq(await t.badge().innerText(), '9+', 'above nine: 9+')
      t.eq(await t.bell().getAttribute('aria-label'), 'Notifications, 12 unread', 'the name keeps the real number')
    },
  },
  {
    id: 'n1-bell-zero', hash: 'unread=none',
    async run(t) {
      t.eq(await t.badge().count(), 0, 'hidden at zero')
      t.eq(await t.bell().getAttribute('aria-label'), 'Notifications', 'name without a count')
    },
  },
  {
    id: 'n1-panel',
    async run(t) {
      await t.openPanel()
      t.eq(await t.bell().getAttribute('aria-expanded'), 'true', 'expanded')
      t.eq(await t.rows('[data-notification-panel]'), ORDER, 'newest first')
      t.eq(await t.page.$$eval('[data-notification-panel] .fx-nt-sect', hs => hs.map(h => h.textContent)), ['Today', 'Earlier'], 'Today, then Earlier')
      t.eq(await t.page.$$eval('[data-notification-panel] [data-notification].is-unread', rs => rs.map(r => r.getAttribute('data-notification'))), ['g', 'move', 'mention', 'assigned'], 'unread tint')
      t.eq(await t.row('g').locator('.fx-nt-dot').count(), 1, 'blue dot when unread')
      t.eq(await t.row('created').locator('.fx-nt-dot').count(), 0, 'none when read')
      t.eq(await t.text('move'), 'Nermin moved Manifesto Post to your stage: C-Review', 'move names the stage')
      t.eq(await t.text('mention'), 'Omar mentioned you in Campaign Brief', 'mention')
      t.eq(await t.text('assigned'), 'You were assigned to Omnisight Launch Teaser', 'assigned')
      t.eq(await t.text('created'), 'New task Event Recap Video was added to your stage: D-In Progress', 'new task')
      t.eq(await t.text('reply'), 'Yosra replied to your comment on Retreat Banner', 'a reply to my comment')
      t.eq(await t.text('thread'), 'Kai replied in a thread on Retreat Banner', 'a reply in a thread I am in')
      t.eq(await t.text('due'), 'Newsletter Draft is due tomorrow', 'due soon')
      t.eq(await t.text('overdue'), 'Event Teaser is overdue', 'overdue')
      t.assert(/“@Raneem can you check the hook/.test(await t.row('mention').innerText()), 'the snippet in quotes')
      t.eq(await t.row('move').locator('q').count(), 0, 'no snippet for moves')
      t.eq(await t.row('mention').locator('time').innerText(), '1h', 'relative time')
      t.eq(await t.row('g').locator('.fx-nt-sentence b').allInnerTexts(), ['Salma', 'Yosra', 'Q4 LinkedIn Carousel'], 'names and task in bold')
    },
  },
  {
    id: 'n1-open',
    async run(t) {
      await t.openPanel()
      await t.row('mention').locator('[data-nt-open]').click()
      await t.idle(250)
      t.eq(await t.calls('open'), [['mention']], 'asks the server where it points (and reads it)')
      t.eq((await t.lab()).opened, [{ taskId: 't-brief', commentId: 'cm' }], 'opens the task at the comment')
      t.assert(!(await t.panelOpen()), 'the panel closes')
      t.eq(await t.badge().innerText(), '3', 'the count goes down')
      await t.openPanel()
      await t.row('attach').locator('[data-nt-open]').click()
      await t.idle(250)
      t.eq((await t.lab()).opened[1], { taskId: 't-Website Hero Visual', section: 'attachments' }, 'attachments open Attachments')
    },
  },
  {
    id: 'n1-gone',
    async run(t) {
      await t.openPanel()
      await t.row('gone').locator('[data-nt-open]').click()
      await t.idle(250)
      const dlg = t.page.locator('[data-nt-gone]')
      t.eq(await dlg.count(), 1, 'the dialog shows')
      t.assert(/This task is no longer available/.test(await dlg.innerText()), 'it says so')
      t.eq((await t.lab()).opened, [], 'nothing opens')
      t.eq(await t.page.evaluate(() => document.activeElement?.textContent), 'OK', 'focus on OK')
      await t.page.keyboard.press('Enter')
      await t.idle()
      t.eq(await dlg.count(), 0, 'OK closes it')
    },
  },
  {
    id: 'n1-close',
    async run(t) {
      await t.openPanel()
      t.eq(await t.focused(), 'tab:all', 'focus on the selected tab')
      await t.page.keyboard.press('Escape'); await t.idle()
      t.assert(!(await t.panelOpen()), 'Esc closes')
      t.eq(await t.focused(), 'bell', 'focus back on the bell')
      await t.openPanel()
      await t.page.mouse.click(200, 400); await t.idle()
      t.assert(!(await t.panelOpen()), 'a click outside closes')
      await t.openPanel()
      await t.bell().click(); await t.idle()
      t.assert(!(await t.panelOpen()), 'the bell toggles it')
    },
  },
  {
    id: 'n1-reply', hash: 'page=reply',
    async run(t) {
      const box = t.page.locator('[data-reply-composer] textarea')
      t.eq(await t.page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA', 'focused on open')
      await box.type('@Sal')
      await t.idle(80)
      t.eq(await t.page.locator('.fx-nt-picker [role="option"]').allInnerTexts(), ['Salma'], 'the @ list filters')
      await t.page.keyboard.press('Enter')
      t.eq(await box.inputValue(), '@Salma ', 'picking writes @Name')
      await box.type('one more photo?')
      await t.page.keyboard.press('Enter')
      await t.idle(150)
      t.eq(await t.calls('reply'), [['@Salma one more photo?', ['salma']]], 'sent with the mention')
      t.eq(await box.inputValue(), '', 'cleared')
      await box.type('@Omar x')
      await box.fill('no names here')
      await t.page.locator('[data-reply-send]').click()
      await t.idle(150)
      t.eq((await t.calls('reply'))[1], ['no names here', []], 'a name deleted from the text is not mentioned')
      await box.focus()
      await t.page.keyboard.press('Escape')
      t.eq(await t.calls('cancel'), [[]], 'Esc cancels')
    },
  },

  // ── US3: grouped rows ────────────────────────────────────────────────────
  {
    id: 'n3-grouped',
    async run(t) {
      await t.openPanel()
      t.eq(await t.text('g'), 'Salma, Yosra and 2 others commented on Q4 LinkedIn Carousel', 'two names and the rest counted')
      t.eq(await t.row('g').locator('.fx-nt-ava .fx-nt-face').count(), 2, 'two stacked avatars')
      t.eq(await t.row('mention').locator('.fx-nt-ava .fx-nt-face').count(), 1, 'one for a single person')
      t.eq(await t.text('attach'), 'Samaa added 5 attachments to Website Hero Visual', 'attachments counted')
      await t.arrive({ id: 'two', kind: 'comment', actorIds: ['salma', 'omar'], meta: { task_name: 'Pair' } })
      await t.poll()
      t.eq(await t.text('two'), 'Salma and Omar commented on Pair', 'two people')
    },
  },

  // ── US4: paging, marking, silencing ──────────────────────────────────────
  {
    id: 'n4-scroll', hash: 'count=45',
    async run(t) {
      await t.openPanel()
      t.eq((await t.rows('[data-notification-panel]')).length, 20, 'twenty at a time')
      for (let i = 0; i < 8; i++) {
        await t.page.locator('[data-notification-panel] .fx-nt-body').evaluate(el => { el.scrollTop = el.scrollHeight })
        await t.idle(200)
      }
      const ids = await t.rows('[data-notification-panel]')
      t.eq(ids.length, 56, 'all 56 load as the list scrolls')
      t.eq(new Set(ids).size, 56, 'no row twice')
      t.eq(await t.page.locator('[data-nt-more]').count(), 0, 'no more to load')
      t.eq((await t.calls('list')).length, 3, 'three pages')
    },
  },
  {
    id: 'n4-unread-tab',
    async run(t) {
      await t.openPanel()
      await t.page.locator('[data-nt-tab="unread"]').click(); await t.idle(200)
      t.eq(await t.rows('[data-notification-panel]'), ['g', 'move', 'mention', 'assigned'], 'only unread')
      await t.row('move').hover()
      await t.row('move').locator('[data-nt-more-menu]').click()
      await t.row('move').locator('[data-nt-toggle-read]').click()
      await t.idle(150)
      t.eq(await t.calls('mark'), [['move', true]], 'marked read')
      t.eq(await t.rows('[data-notification-panel]'), ['g', 'move', 'mention', 'assigned'], 'stays in place until the tab is reopened')
      t.eq(await t.row('move').evaluate(r => r.classList.contains('is-unread')), false, 'but shows as read')
      t.eq(await t.badge().innerText(), '3', 'the count follows')
      await t.page.locator('[data-nt-tab="all"]').click(); await t.idle(150)
      await t.page.locator('[data-nt-tab="unread"]').click(); await t.idle(200)
      t.eq(await t.rows('[data-notification-panel]'), ['g', 'mention', 'assigned'], 'gone when the tab is reopened')
    },
  },
  {
    id: 'n4-mark-unread',
    async run(t) {
      await t.openPanel()
      await t.row('created').hover()
      await t.row('created').locator('[data-nt-more-menu]').click()
      t.assert(/Mark as unread/.test(await t.row('created').locator('[data-nt-toggle-read]').innerText()), 'offers Mark as unread on a read row')
      await t.row('created').locator('[data-nt-toggle-read]').click()
      await t.idle(150)
      t.eq(await t.calls('mark'), [['created', false]], 'marked unread')
      t.eq(await t.row('created').locator('.fx-nt-dot').count(), 1, 'the dot comes back')
      t.eq(await t.badge().innerText(), '5', 'the count goes up')
    },
  },
  {
    id: 'n4-mark-all',
    async run(t) {
      await t.openPanel()
      await t.page.locator('[data-mark-all]').click()
      await t.idle(150)
      t.eq(await t.calls('markAll'), [[]], 'Mark all as read')
      t.eq(await t.badge().count(), 0, 'the count goes to zero')
      t.eq(await t.page.locator('[data-notification-panel] [data-notification].is-unread').count(), 0, 'no unread rows')
      t.eq(await t.page.locator('[data-mark-all]').isDisabled(), true, 'nothing left to mark')
      await t.page.locator('[data-nt-tab="unread"]').click(); await t.idle(200)
      t.assert(/You’re all caught up\./.test(await t.page.locator('[data-nt-empty]').innerText()), 'the empty state')
    },
  },
  {
    id: 'n4-mute',
    async run(t) {
      await t.openPanel()
      await t.row('mention').hover()
      await t.row('mention').locator('[data-nt-more-menu]').click()
      await t.row('mention').locator('[data-nt-mute]').click()
      await t.idle(150)
      t.eq(await t.calls('mute'), [['t-brief']], 'turns off the task')
      t.assert(/except mentions and assignments/.test(await t.page.locator('.fx-nt-note').innerText()), 'says what still comes through')
      await t.row('mention').locator('[data-nt-more-menu]').click()
      t.eq(await t.row('mention').locator('[data-nt-mute]').isDisabled(), true, 'already off')
    },
  },
  {
    id: 'n4-keyboard',
    async run(t) {
      await t.bell().focus()
      await t.page.keyboard.press('Enter')
      await t.page.waitForSelector('[data-nt-list]')
      await t.idle(150)
      t.eq(await t.focused(), 'tab:all', 'Enter opens, focus on the tab')
      await t.page.keyboard.press('ArrowRight'); await t.idle(200)
      t.eq(await t.focused(), 'tab:unread', 'arrows switch tabs')
      await t.page.keyboard.press('ArrowLeft'); await t.idle(250)
      await t.row('g').locator('[data-nt-open]').focus()
      await t.page.keyboard.press('ArrowDown')
      t.eq(await t.focused(), 'row:move', '↓ to the next row')
      await t.page.keyboard.press('ArrowUp')
      t.eq(await t.focused(), 'row:g', '↑ back')
      await t.page.keyboard.press('Shift+F10'); await t.idle(80)
      t.eq(await t.focused(), 'row:g:menuitem', 'Shift+F10 opens the menu, focus inside')
      await t.page.keyboard.press('ArrowDown')
      t.eq(await t.focused(), 'row:g:menuitem', '↓ inside the menu')
      await t.page.keyboard.press('Escape'); await t.idle(80)
      t.eq(await t.row('g').locator('.fx-nt-menu').count(), 0, 'Esc closes the menu first')
      t.assert(await t.panelOpen(), 'and leaves the panel')
      await t.row('g').locator('[data-nt-open]').focus()
      await t.page.keyboard.press('Enter'); await t.idle(250)
      t.eq((await t.lab()).opened, [{ taskId: 't-Q4 LinkedIn Carousel', commentId: 'c5' }], 'Enter opens the row')
    },
  },

  // ── US6: toasts ──────────────────────────────────────────────────────────
  {
    id: 'n6-toast',
    async run(t) {
      await t.poll()
      t.eq(await t.page.locator('[data-nt-toast]').count(), 0, 'nothing on the first look')
      const id = await t.arrive({ kind: 'comment', actorIds: ['salma'], meta: { task_name: 'Retreat Banner', snippet: 'Can we try it with the team photo?' } })
      await t.poll()
      const toast = t.page.locator(`[data-nt-toast="${id}"]`)
      t.eq(await toast.count(), 1, 'a toast for something new')
      t.assert(/Salma commented on Retreat Banner/.test(await toast.innerText()), 'the sentence')
      t.eq(await t.page.locator('.fx-nt-toasts').getAttribute('aria-live'), 'polite', 'announced politely')
      t.assert(!(await t.page.evaluate(() => document.activeElement?.closest('[data-nt-toast]'))), 'never takes focus')
      await t.poll()
      t.eq(await t.page.locator('[data-nt-toast]').count(), 1, 'still one; not announced twice')
      await t.idle(5300)
      t.eq(await t.page.locator('[data-nt-toast]').count(), 0, 'gone after 5 seconds')
      await t.poll()
      t.eq(await t.page.locator('[data-nt-toast]').count(), 0, 'and it does not come back')
    },
  },
  {
    id: 'n6-more',
    async run(t) {
      await t.poll()
      for (const who of ['salma', 'omar', 'kai']) await t.arrive({ kind: 'comment', actorIds: [who], meta: { task_name: `From ${who}` } })
      await t.poll()
      const toast = t.page.locator('[data-nt-toast]')
      t.eq(await toast.count(), 1, 'one at a time')
      t.assert(/and 2 more/.test(await toast.innerText()), `and 2 more (${await toast.innerText()})`)
      await toast.hover()
      await t.idle(5600)
      t.eq(await toast.count(), 1, 'paused while hovered')
      await t.page.mouse.move(10, 10)
      await toast.locator('.fx-nt-toast-main').click().catch(() => {})
      await t.idle(200)
      t.eq((await t.lab()).opened.length, 1, 'a click opens it')
    },
  },
  {
    id: 'n6-quiet', hash: 'dnd=1',
    async run(t) {
      await t.poll()
      await t.arrive({ kind: 'mention', actorIds: ['omar'], meta: { task_name: 'Quiet' } })
      await t.poll()
      t.eq(await t.page.locator('[data-nt-toast]').count(), 0, 'Do not disturb: no toast')
      t.eq(await t.badge().innerText(), '5', 'but the count still goes up')
    },
  },
  {
    id: 'n6-open-task',
    async run(t) {
      await t.poll()
      await t.page.evaluate(() => window.__nt.setOpenTask('t-Open'))
      await t.arrive({ kind: 'comment', actorIds: ['omar'], taskId: 't-Open', meta: { task_name: 'Open' } })
      await t.poll()
      t.eq(await t.page.locator('[data-nt-toast]').count(), 0, 'no toast for the task that is open')
    },
  },

  // ── US8: settings ────────────────────────────────────────────────────────
  {
    id: 'n8-defaults', hash: 'page=settings',
    async run(t) {
      await t.page.waitForSelector('[data-setting="mention:in_app"]')
      const on = sel => t.page.locator(`[data-setting="${sel}"]`).getAttribute('aria-checked')
      t.eq(await t.page.$$eval('[data-setting-row]', rs => rs.map(r => r.getAttribute('data-setting-row'))),
        ['mention', 'assigned', 'comment', 'reply', 'attachment', 'task_created_in_stage', 'task_moved_to_stage', 'due_soon', 'overdue'], 'the order')
      for (const k of ['mention', 'assigned', 'due_soon', 'overdue']) t.eq(await on(`${k}:push`), 'true', `${k}: phone on`)
      for (const k of ['comment', 'reply', 'attachment']) t.eq(await on(`${k}:push`), 'false', `${k}: phone off`)
      for (const k of ['mention', 'comment']) t.eq(await on(`${k}:email`), 'false', `${k}: email off`)
      t.eq(await t.page.locator('[data-email-mode="daily"]').getAttribute('aria-pressed'), 'true', 'daily summary by default')
      t.eq(await t.page.locator('[data-dnd]').getAttribute('aria-checked'), 'false', 'DND off')
      t.eq(await t.page.locator('[data-email-not-ready]').count(), 0, 'no note when email is set up')
      t.eq(await t.page.locator('.fx-nt-rec').count(), 2, 'Recommended on mentions and assignments')
    },
  },
  {
    id: 'n8-change', hash: 'page=settings',
    async run(t) {
      await t.page.waitForSelector('[data-setting="comment:in_app"]')
      await t.page.locator('[data-setting="comment:email"]').click(); await t.idle(120)
      await t.page.locator('[data-setting="comment:in_app"]').click(); await t.idle(150)
      t.eq(await t.page.locator('[data-setting="comment:push"]').isDisabled(), true, 'off in the app: phone switch disabled')
      t.eq(await t.page.locator('[data-setting="comment:email"]').getAttribute('aria-checked'), 'false', 'and email turned off')
      t.eq((await t.lab()).settings.kinds.comment, { in_app: false, push: false, email: false }, 'saved')
      t.assert(/Saved/.test(await t.page.locator('[data-nt-saved]').innerText()), 'Saved')
      await t.page.locator('[data-email-mode="instant"]').click(); await t.idle(120)
      t.eq((await t.lab()).settings.emailMode, 'instant', 'email mode saved')
      await t.page.locator('[data-dnd]').click(); await t.idle(120)
      t.eq((await t.lab()).dnd, true, 'DND saved')
      await t.page.locator('[data-nt-gender="f"]').click(); await t.idle(120)
      t.eq((await t.lab()).settings.gender, 'f', 'gender saved')
      await t.page.locator('[data-nt-locale="ar"]').click(); await t.idle(120)
      t.eq((await t.lab()).settings.locale, 'ar', 'language stored for alerts and emails')
      t.eq(await t.page.evaluate(() => document.documentElement.dir), 'rtl', 'the page turns at once')
    },
  },
  {
    id: 'n8-no-email', hash: 'page=settings&email=0',
    async run(t) {
      await t.page.waitForSelector('[data-email-not-ready]')
      t.assert(/Email isn’t set up yet/.test(await t.page.locator('[data-email-not-ready]').innerText()), 'the note')
    },
  },
  {
    id: 'n8-fail', hash: 'page=settings',
    async run(t) {
      await t.page.waitForSelector('[data-setting="reply:push"]')
      await t.page.evaluate(() => { window.__nt.failNext.saveSettings = 'generic' })
      await t.page.locator('[data-setting="reply:push"]').click(); await t.idle(150)
      t.eq(await t.page.locator('[data-setting="reply:push"]').getAttribute('aria-checked'), 'false', 'a refused save rolls back')
      t.assert(/Couldn’t save/.test(await t.page.locator('[data-nt-saved]').innerText()), 'and says so')
    },
  },

  // ── US9: history ─────────────────────────────────────────────────────────
  {
    id: 'n9-history', hash: 'page=history&count=10',
    async run(t) {
      await t.page.waitForSelector('[data-nt-history] [data-notification]')
      t.eq((await t.rows('[data-nt-history]')).length, 20, 'a page at a time')
      await t.page.locator('[data-nt-filter-kind="mention"]').click(); await t.idle(200)
      t.eq(await t.rows('[data-nt-history]'), ['mention'], 'Mentions only')
      await t.page.locator('[data-nt-filter-kind="reply"]').click(); await t.idle(200)
      t.eq(await t.rows('[data-nt-history]'), ['mention', 'reply', 'thread'], 'and Replies')
      await t.page.locator('[data-nt-filter-range="today"]').click(); await t.idle(200)
      t.eq(await t.rows('[data-nt-history]'), ['mention'], 'today only')
      await t.page.locator('[data-nt-filter-kind="due_soon"]').click()
      await t.page.locator('[data-nt-filter-kind="mention"]').click()
      await t.page.locator('[data-nt-filter-kind="reply"]').click(); await t.idle(200)
      t.assert(/Nothing matches these filters/.test(await t.page.locator('[data-nt-empty]').innerText()), 'nothing matches')
      await t.page.locator('[data-nt-clear]').click(); await t.idle(200)
      t.eq((await t.rows('[data-nt-history]')).length, 20, 'cleared')
      await t.row('assigned').locator('[data-nt-open]').click(); await t.idle(200)
      t.eq((await t.lab()).opened, [{ taskId: 't-Omnisight Launch Teaser' }], 'rows open their task')
    },
  },

  // ── US10: Arabic ─────────────────────────────────────────────────────────
  {
    id: 'n10-arabic', hash: 'locale=ar',
    async run(t) {
      await t.openPanel()
      const box = await t.page.locator('[data-notification-panel]').boundingBox()
      t.assert(box.x < 40, `opens on the left (${Math.round(box.x)})`)
      t.eq(await t.text('g'), 'علّقت سلمى ويسرا وشخصان آخران على مهمة Q4 LinkedIn Carousel', 'grouped, feminine, dual')
      t.eq(await t.text('move'), 'نقلت نرمين مهمة Manifesto Post إلى مرحلتك: مراجعة المحتوى', 'the request\'s own example')
      t.eq(await t.text('mention'), 'أشار إليك عمر في Campaign Brief', 'masculine')
      t.assert(!/^ردّت|^ردّ /.test(await t.text('thread')) && /Kai/.test(await t.text('thread')), `neutral when no gender (${await t.text('thread')})`)
      t.eq(await t.text('assigned'), 'أُسندت إليك مهمة Omnisight Launch Teaser', 'assigned')
      t.eq(await t.row('mention').locator('time').innerText(), '1 س', 'Arabic time')
      t.eq(await t.page.locator('[data-mark-all]').innerText(), 'تعليم الكل كمقروء', 'Arabic labels')
    },
  },

  // ── US11: phone alerts ───────────────────────────────────────────────────
  {
    id: 'n11-offer', hash: 'push=off',
    async run(t) {
      await t.openPanel()
      t.eq(await t.page.locator('[data-push-offer]').count(), 1, 'the offer at the top')
      t.eq(await t.calls('requestPermission'), [], 'no permission asked before a tap')
      await t.page.locator('[data-push-on]').click(); await t.idle(200)
      t.eq(await t.calls('requestPermission'), [[]], 'asked after the tap')
      t.eq((await t.calls('pushSave')).length, 1, 'this device saved')
      t.eq(await t.page.locator('[data-push-offer]').count(), 0, 'the offer goes')
    },
  },
  {
    id: 'n11-dismiss', hash: 'push=off',
    async run(t) {
      await t.openPanel()
      await t.page.locator('[data-push-dismiss]').click(); await t.idle(80)
      t.eq(await t.page.locator('[data-push-offer]').count(), 0, 'Not now hides it')
      await t.page.keyboard.press('Escape'); await t.openPanel()
      t.eq(await t.page.locator('[data-push-offer]').count(), 0, 'and it stays hidden')
    },
  },
  {
    id: 'n11-ios', hash: 'push=ios',
    async run(t) {
      await t.openPanel()
      t.eq(await t.page.locator('[data-push-ios]').count(), 1, 'Home Screen steps on an iPhone in Safari')
      t.assert(/Add to Home Screen/.test(await t.page.locator('[data-push-ios]').innerText()), 'the steps')
      t.eq(await t.page.locator('[data-push-on]').count(), 0, 'no Turn on there')
    },
  },
  {
    id: 'n11-unsupported', hash: 'push=unsupported&page=settings',
    async run(t) {
      await t.page.waitForSelector('[data-push-device="unsupported"]')
      t.assert(/can’t show alerts/.test(await t.page.locator('[data-push-device]').innerText()), 'says so in settings')
      await t.openPanel()
      t.eq(await t.page.locator('[data-push-offer]').count(), 0, 'no offer in the panel')
    },
  },
  {
    id: 'n11-device', hash: 'push=on&page=settings',
    async run(t) {
      await t.page.waitForSelector('[data-push-device="on"]')
      t.assert(/Alerts are on for this device/.test(await t.page.locator('[data-push-device]').innerText()), 'on')
      await t.page.locator('[data-push-off]').click(); await t.idle(150)
      t.eq((await t.calls('pushDelete')).length, 1, 'Turn off removes this device')
      t.eq(await t.page.locator('[data-push-device]').getAttribute('data-push-device'), 'off', 'now off')
    },
  },
  {
    id: 'n11-blocked', hash: 'push=blocked&page=settings',
    async run(t) {
      await t.page.waitForSelector('[data-push-device="blocked"]')
      t.assert(/blocked/.test(await t.page.locator('[data-push-device]').innerText()), 'blocked in the browser')
    },
  },

  // ── phones, access ───────────────────────────────────────────────────────
  {
    id: 'n-phone', viewport: { width: 390, height: 844 }, touch: true,
    async run(t) {
      const bell = await t.bell().boundingBox()
      t.assert(bell.width >= 44 && bell.height >= 44, `bell is a 44 px target (${bell.width}×${bell.height})`)
      await t.openPanel()
      const box = await t.page.locator('[data-notification-panel]').boundingBox()
      t.eq([Math.round(box.x), Math.round(box.width)], [0, 390], 'the whole screen')
      t.eq(await t.page.locator('[data-nt-close]').isVisible(), true, 'a close button')
      t.eq(await t.row('g').locator('[data-nt-more-menu]').evaluate(el => getComputedStyle(el).opacity), '1', 'the ⋯ shows without hover')
      const w = await t.page.evaluate(() => document.scrollingElement.scrollWidth)
      t.assert(w <= 390, `no sideways scroll (${w})`)
      await t.page.locator('[data-nt-close]').click(); await t.idle()
      t.assert(!(await t.panelOpen()), '✕ closes')
    },
  },
  {
    id: 'n-axe',
    async run(t) {
      t.eq(await t.axe('[data-bell]'), [], 'bell')
      await t.openPanel()
      t.eq(await t.axe('[data-notification-panel]'), [], 'panel')
      await t.row('g').hover(); await t.row('g').locator('[data-nt-more-menu]').click()
      t.eq(await t.axe('[data-notification-panel]'), [], 'panel with a menu open')
    },
  },
  {
    id: 'n-axe-ar', hash: 'locale=ar',
    async run(t) {
      await t.openPanel()
      t.eq(await t.axe('[data-notification-panel]'), [], 'panel in Arabic')
    },
  },
  {
    id: 'n-axe-pages', hash: 'page=settings',
    async run(t) {
      await t.page.waitForSelector('[data-setting="mention:in_app"]')
      t.eq(await t.axe('[data-nt-settings-page]'), [], 'settings')
    },
  },
  {
    id: 'n-axe-history', hash: 'page=history',
    async run(t) {
      await t.page.waitForSelector('[data-nt-history] [data-notification]')
      t.eq(await t.axe('[data-nt-history]'), [], 'history')
    },
  },
]
