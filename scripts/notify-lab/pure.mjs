// Node checks of the pure notification modules (spec 012 T010).
// Imports the bundle build.sh writes to out/pure.mjs; `root` is the repo.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

export async function runPure(bundle, root) {
  const h = await import(bundle)
  const require = createRequire(path.join(root, 'package.json'))
  const { IntlMessageFormat } = require('intl-messageformat')
  const results = []
  const check = (id, fn) => { try { fn(); results.push({ id, ok: true }) } catch (e) { results.push({ id, ok: false, error: e.message }) } }
  const ok = (c, msg) => { if (!c) throw new Error(msg) }
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }

  // Members: two Marketing Managers (the C-Review holders), a writer, a designer, an admin.
  const M = [
    { id: 'mm1', role: 'Marketing Manager', access: 'superuser' },
    { id: 'mm2', role: 'Marketing Manager', access: 'user' },
    { id: 'cc', role: 'Content Creator', access: 'user' },
    { id: 'gd', role: 'Graphic Designer', access: 'user' },
    { id: 'ad', role: 'Brand Director', access: 'admin' },
  ]
  const task = (o = {}) => ({ id: 't1', status: 'c-prog', nine_stage: true, task_owner_id: 'ad', assignee_id: 'cc', created_by: 'gd', ...o })
  const defaults = () => h.DEFAULT_SETTINGS
  const ctx = (o = {}) => ({ task: task(o.task), members: M, followers: o.followers ?? [], settingsOf: o.settingsOf ?? defaults })
  const sorted = a => [...a].sort()

  check('recipients-comment', () => {
    eq(sorted(h.resolveRecipients({ kind: 'comment', actorId: 'mm1', taskId: 't1', commentId: 'c' }, ctx())), ['ad', 'cc', 'gd'], 'assignee, owner, creator')
    eq(sorted(h.resolveRecipients({ kind: 'comment', actorId: 'cc', taskId: 't1', commentId: 'c' }, ctx())), ['ad', 'gd'], 'never the actor (FR-003)')
    eq(h.resolveRecipients({ kind: 'comment', actorId: 'mm1', taskId: 't1', commentId: 'c' }, ctx({ task: { assignee_id: 'ad', created_by: 'ad' } })), ['ad'], 'one per person (FR-004)')
    eq(sorted(h.resolveRecipients({ kind: 'comment', actorId: 'cc', taskId: 't1', commentId: 'c' }, ctx({ followers: [{ member_id: 'mm2', muted: false }] }))), ['ad', 'gd', 'mm2'], 'followers')
    eq(sorted(h.resolveRecipients({ kind: 'comment', actorId: 'cc', taskId: 't1', commentId: 'c' }, ctx({ followers: [{ member_id: 'gd', muted: true }] }))), ['ad'], 'muted dropped')
  })
  check('recipients-stage', () => {
    eq(sorted(h.resolveRecipients({ kind: 'task_moved_to_stage', actorId: 'cc', taskId: 't1' }, ctx({ task: { status: 'c-final' } }))), ['mm1', 'mm2'], 'review stage: every holder of the role (R2)')
    eq(sorted(h.resolveRecipients({ kind: 'task_moved_to_stage', actorId: 'mm1', taskId: 't1' }, ctx({ task: { status: 'c-final' } }))), ['mm2'], 'not the mover')
    eq(sorted(h.resolveRecipients({ kind: 'task_created_in_stage', actorId: 'mm1', taskId: 't1' }, ctx())), ['ad', 'cc'], 'working stage: assignee and owner')
    eq(h.resolveRecipients({ kind: 'task_moved_to_stage', actorId: 'cc', taskId: 't1' }, { ...ctx({ task: { status: 'c-check' } }) }), [], 'a stage with no holder: nobody, no error')
  })
  check('recipients-assign-mention', () => {
    eq(h.resolveRecipients({ kind: 'assigned', actorId: 'ad', taskId: 't1', assigneeId: 'gd' }, ctx()), ['gd'], 'the new assignee')
    eq(h.resolveRecipients({ kind: 'assigned', actorId: 'gd', taskId: 't1', assigneeId: 'gd' }, ctx()), [], 'not when assigning yourself')
    eq(h.resolveRecipients({ kind: 'mention', actorId: 'cc', taskId: 't1', commentId: 'c', mentionedIds: ['mm2'] }, ctx({ followers: [{ member_id: 'mm2', muted: true }] })), ['mm2'], 'mentions ignore mutes (FR-032)')
  })
  check('recipients-attach-reply-due', () => {
    eq(sorted(h.resolveRecipients({ kind: 'attachment', actorId: 'gd', taskId: 't1', attachmentId: 'a', count: 2 }, ctx({ task: { status: 'c-final' } }))), ['ad', 'cc', 'mm1', 'mm2'], 'attachment: people on the task and the stage')
    eq(sorted(h.resolveRecipients({ kind: 'reply', actorId: 'gd', taskId: 't1', commentId: 'r', parentAuthorId: 'cc', threadAuthorIds: ['mm1', 'gd'] }, ctx())), ['cc', 'mm1'], 'reply: parent author and thread')
    eq(sorted(h.resolveRecipients({ kind: 'due_soon', actorId: null, taskId: 't1', dueDate: '2026-11-09' }, ctx())), ['ad', 'cc'], 'due: assignee and stage holders')
  })
  check('settings', () => {
    eq(h.effective(h.DEFAULT_SETTINGS, 'mention', 'push'), true, 'mentions push by default')
    eq(h.effective(h.DEFAULT_SETTINGS, 'comment', 'push'), false, 'comments do not push by default')
    eq(h.effective(h.DEFAULT_SETTINGS, 'comment', 'email'), false, 'email off by default')
    const s = h.mergeSettings([{ kind: 'mention', in_app: false, push: true, email: true }])
    eq([h.effective(s, 'mention', 'in_app'), h.effective(s, 'mention', 'push'), h.effective(s, 'mention', 'email')], [false, false, false], 'off in the app is off everywhere')
    eq(h.resolveRecipients({ kind: 'comment', actorId: 'mm1', taskId: 't1', commentId: 'c' }, ctx({ settingsOf: id => (id === 'cc' ? h.mergeSettings([{ kind: 'comment', in_app: false, push: false, email: false }]) : h.DEFAULT_SETTINGS) })).includes('cc'), false, 'a kind off is not recorded')
    eq(h.diffFromDefaults(h.DEFAULT_SETTINGS), [], 'defaults store nothing')
  })
  check('grouping', () => {
    const t0 = new Date('2026-11-08T10:00:00Z')
    const open = { actor_ids: ['a'], count: 1, first_event_at: t0, read_at: null }
    eq(h.joins(open, new Date('2026-11-08T11:59:00Z')), true, 'within 2 hours joins')
    eq(h.joins(open, new Date('2026-11-08T12:01:00Z')), false, 'after 2 hours starts a new one')
    eq(h.joins({ ...open, read_at: new Date() }, new Date('2026-11-08T10:30:00Z')), false, 'read ends the group')
    eq(h.merged(open, 'b', 1), { actor_ids: ['b', 'a'], count: 2 }, 'newest actor first, count up')
    eq(h.merged({ ...open, actor_ids: ['b', 'a'] }, 'a', 1).actor_ids, ['a', 'b'], 'no duplicate actors')
    eq(h.groupKey({ kind: 'mention', actorId: 'x', taskId: 't', commentId: 'c', mentionedIds: [] }), null, 'mentions never group')
    eq(h.groupKey({ kind: 'assigned', actorId: 'x', taskId: 't', assigneeId: 'y' }), null, 'assignments never group')
    eq(h.groupKey({ kind: 'reply', actorId: 'x', taskId: 't', commentId: 'r', parentAuthorId: 'p', threadAuthorIds: [] }, 'p1'), 'reply:t:p1', 'replies group per thread')
  })
  check('days', () => {
    // 22:30 UTC on the 7th is 00:30 on the 8th in Cairo (UTC+2).
    const late = new Date('2026-11-07T22:30:00Z')
    eq(h.teamDay(late), '2026-11-08', 'Cairo day, not UTC')
    eq(h.dueState({ due_date: '2026-11-09', status: 'c-prog' }, late), 'due_soon', 'due tomorrow in Cairo')
    eq(h.dueState({ due_date: '2026-11-07', status: 'c-prog' }, late), 'overdue', 'overdue')
    eq(h.dueState({ due_date: '2026-11-08', status: 'c-prog' }, late), null, 'due today: neither')
    eq(h.dueState({ due_date: '2026-11-07', status: 'publish' }, late), null, 'published: never')
    eq(h.dueState({ due_date: '2026-11-07', status: 'c-prog', dropped_at: '2026-11-01' }, late), null, 'archived: never')
  })
  check('messages', () => {
    const msgs = Object.fromEntries(['en', 'ar'].map(l => [l, JSON.parse(fs.readFileSync(path.join(root, 'messages', `${l}.json`), 'utf8')).notifications]))
    const get = (o, k) => k.split('.').reduce((x, p) => x?.[p], o)
    const render = (l, key, values) => {
      const src = get(msgs[l], key)
      if (typeof src !== 'string') throw new Error(`missing ${l} ${key}`)
      const out = new IntlMessageFormat(src, l).format({ ...values, b: c => c, t: c => c })
      return Array.isArray(out) ? out.join('') : out
    }
    const actors = new Map([['s', { id: 's', name: 'Salma', gender: 'f' }], ['y', { id: 'y', name: 'Yosra', gender: 'f' }], ['n', { id: 'n', name: 'Nermin', gender: null }],
      ['a', { id: 'a', name: 'Ali', gender: 'm' }], ['b', { id: 'b', name: 'Bassem', gender: 'm' }]])
    const base = { meta: { task_name: 'Q4 LinkedIn Carousel' }, stageId: 'c-final' }
    for (const kind of h.NOTIFICATION_KINDS) {
      for (const ids of [['s'], ['s', 'y'], ['s', 'y', 'n', 'a', 'b'], ['n'], ['a']]) {
        for (const count of [1, 2, 3, 11, 100]) {
          for (const l of ['en', 'ar']) {
            for (const ownParent of [true, false]) {
              const { key, values } = h.messageFor({ ...base, kind, actorIds: kind.startsWith('due') ? [] : ids, count }, actors, l, { ownParent })
              const text = render(l, key, values)
              if (!text.includes('Q4 LinkedIn Carousel')) throw new Error(`${l} ${kind}: task missing: ${text}`)
              if (/\{|\}/.test(text)) throw new Error(`${l} ${kind}: unfilled: ${text}`)
            }
          }
        }
      }
    }
    // The request's own examples.
    const ar = (kind, ids, count, extra = {}) => { const m = h.messageFor({ ...base, ...extra, kind, actorIds: ids, count }, actors, 'ar'); return render('ar', m.key, m.values) }
    eq(ar('comment', ['s'], 1, { meta: { task_name: 'Q4 LinkedIn Carousel' } }), 'علّقت Salma على مهمة Q4 LinkedIn Carousel', 'AR comment, feminine')
    eq(ar('comment', ['n'], 1), 'تعليق جديد من Nermin على مهمة Q4 LinkedIn Carousel', 'AR comment, no gender: neutral')
    eq(ar('attachment', ['s'], 2, { meta: { task_name: 'Website Hero Visual' } }), 'أضافت Salma مرفقين إلى مهمة Website Hero Visual', 'AR dual')
    const en = (kind, ids, count) => { const m = h.messageFor({ ...base, kind, actorIds: ids, count }, actors, 'en'); return render('en', m.key, m.values) }
    eq(en('comment', ['s', 'y', 'n', 'a', 'b'], 5), 'Salma, Yosra and 3 others commented on Q4 LinkedIn Carousel', 'EN grouped')
    eq(en('attachment', ['s'], 5), 'Salma added 5 attachments to Q4 LinkedIn Carousel', 'EN attachments')
    eq(en('task_moved_to_stage', ['n'], 1), 'Nermin moved Q4 LinkedIn Carousel to your stage: C-Review', 'EN move with stage')
    eq(h.snippet('x'.repeat(150)).length, 100, 'snippet is 100 characters')
  })
  check('description-mentions', () => {
    // Spec 012 R11: who a brief names, as saved.
    const ms = [{ id: 'sam', name: 'Sam' }, { id: 'saml', name: 'Sam Lee' }, { id: 'gd', name: 'Graphic Designer' }, { id: 'ar', name: 'سلمى' }]
    eq(h.mentionedIn('Hi @Sam Lee, see this', ms), ['saml'], 'the longest name wins, not also @Sam')
    eq(h.mentionedIn('@Sam and @Graphic Designer.', ms).sort(), ['gd', 'sam'], 'two names, punctuation after')
    eq(h.mentionedIn('@Samantha', ms), [], 'part of a longer word is not a mention')
    eq(h.mentionedIn('شكرًا @سلمى!', ms), ['ar'], 'Arabic names')
    eq(h.mentionedIn('no names', ms), [], 'none')
  })
  check('email-and-push-text', () => {
    // Spec 012 T052: what phone alerts and emails say, in each language.
    const n = { kind: 'comment', actorIds: ['s'], count: 1, meta: { task_name: 'Q4 <Carousel>' }, stageId: null }
    const actors = new Map([['s', { id: 's', name: 'Salma', gender: 'f' }]])
    const en = h.renderNotification(n, actors, 'en'), ar = h.renderNotification(n, actors, 'ar')
    eq(en.text, 'Salma commented on Q4 <Carousel>', 'EN text')
    eq(en.html, '<b>Salma</b> commented on <b>Q4 &lt;Carousel&gt;</b>', 'EN html, escaped')
    eq(ar.text, 'علّقت Salma على مهمة Q4 <Carousel>', 'AR text')
    const html = h.emailHtml('ar', [{ html: ar.html, url: 'https://x/board?task=t', snippet: 'hi' }])
    ok(/dir="rtl"/.test(html) && /lang="ar"/.test(html), 'Arabic email is right to left')
    ok(/https:\/\/x\/board\?task=t/.test(html), 'links to the task')
    ok(!/dir="rtl"/.test(h.emailHtml('en', [{ html: en.html, url: 'u' }])), 'English email is left to right')
    eq(h.targetPath({ id: 'n1', kind: 'attachment', task_id: 't1', comment_id: null }), '/board?task=t1&n=n1&section=attachments', 'attachment link')
    eq(h.targetPath({ id: 'n2', kind: 'reply', task_id: 't1', comment_id: 'c9' }), '/board?task=t1&n=n2&comment=c9', 'comment link')
  })
  check('messages-parity', () => {
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]))
    const read = l => JSON.parse(fs.readFileSync(path.join(root, 'messages', `${l}.json`), 'utf8')).notifications
    eq(flat(read('ar')).sort(), flat(read('en')).sort(), 'notifications.* in both languages')
  })
  return results
}
