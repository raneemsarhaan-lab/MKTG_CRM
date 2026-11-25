// Running-app checks for spec 012 (quickstart §3): local PostgreSQL and
// the app on :3000 (`next build && next start`; under `next dev` a hot reload
// can wipe the page mid-check) with NOTIFY_TICK_SECRET=lab-tick and
// NOTIFY_SCHEDULER=0. Two members:
// Raneem (admin, Marketing Manager) and the Content Creator (a user).
// Usage: node scripts/notify-lab/realapp/run.cjs <screenshot dir>
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const path = require('path')

const BASE = 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? 'postgresql://momentum:momentum@localhost:5432/momentum'
const ROOT = path.resolve(__dirname, '../../..')
const SHOTS = process.argv[2] ?? '/tmp'
const PASS = process.env.LAB_PASS ?? 'lab-pass-1'
const sql = q => execSync(`psql "${DB}" -At -F '|' -c "${q.replace(/"/g, '\\"')}"`).toString().trim()
const helper = (...args) => execSync(`npx tsx scripts/notify-lab/realapp/helper.ts ${args.map(a => JSON.stringify(a)).join(' ')}`,
  { cwd: ROOT, env: { ...process.env, DATABASE_URL: DB } }).toString().trim().split('\n').pop()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const ok = (step, cond, detail = '') => { results.push({ step, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${step}${detail ? ' — ' + detail : ''}`) }

async function signIn(browser, email, locale = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addCookies([{ name: 'fluxo-locale', value: locale, url: BASE }])
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { email, password: PASS } })
  if (!(await r.json()).ok) throw new Error(`sign-in failed: ${email}`)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && /MISSING_MESSAGE|FORMATTING_ERROR|Maximum update depth/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  return { ctx, page, errors }
}
const badge = async page => (await page.locator('[data-bell-badge]').count()) ? Number((await page.locator('[data-bell-badge]').innerText()).replace('9+', '10')) : 0
async function waitBadge(page, want, ms = 12_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if ((await badge(page)) === want) return Date.now() - t0; await sleep(400) }
  return -1
}
async function openPanel(page) {
  await page.locator('[data-bell]').click()
  await page.waitForSelector('[data-notification-panel] [data-nt-list], [data-notification-panel] [data-nt-empty]')
  await sleep(300)
}

;(async () => {
  const R = sql(`select id from members where email='raneem.sarhaan@forefront.consulting'`)
  const C = sql(`select id from members where email='content@forefront.consulting'`)
  const G = sql(`select id from members where email='design@forefront.consulting'`)
  const V = sql(`select id from members where email='video@forefront.consulting'`)
  const pick = st => sql(`select id from tasks where status='${st}' and dropped_at is null order by created_at limit 1`)
  const T1 = pick('c-prog'), T2 = pick('todo'), T3 = pick('d-prog'), T4 = sql(`select id from tasks where status='c-prog' and dropped_at is null order by created_at offset 1 limit 1`)
  // A clean slate for both members: no notifications, no follows, default settings.
  sql(`delete from notifications; delete from task_followers; delete from notification_settings; delete from due_reminders;
       update members set notify_dnd=false, email_mode='daily', gender=null, locale='en';
       delete from task_comments where body like '[nt]%';
       update tasks set assignee_id='${R}', task_owner_id='${R}', created_by='${R}' where id in ('${T1}','${T4}');
       update tasks set assignee_id='${G}', task_owner_id='${G}', created_by='${G}', due_date=null, description_mentions='{}' where id='${T2}';
       update tasks set assignee_id='${R}', task_owner_id='${G}', due_date=current_date + 1 where id='${T3}'`)
  sql(`insert into task_followers (task_id, member_id) values ('${T1}','${R}'),('${T4}','${R}') on conflict do nothing`)
  const name1 = sql(`select name from tasks where id='${T1}'`)

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  const b = await signIn(browser, 'raneem.sarhaan@forefront.consulting')
  const a = await signIn(browser, 'content@forefront.consulting')
  await b.page.goto(`${BASE}/board`); await b.page.waitForSelector('[data-bell]')
  await a.page.goto(`${BASE}/board?task=${T1}`); await a.page.waitForSelector('textarea[placeholder^="Write a comment"]')

  // 1 · A comments on B's task: B's bell within 10 s; A's stays at 0; click opens the comment.
  await a.page.locator('textarea[placeholder^="Write a comment"]').fill('[nt] Draft is up, please check the hook.')
  await a.page.locator('[aria-label="Send comment"]').click()
  const took = await waitBadge(b.page, 1)
  ok('1 B\'s bell goes up within 10 s', took >= 0 && took <= 10_500, `${took} ms`)
  ok('1 A\'s bell stays at 0', (await badge(a.page)) === 0)
  await openPanel(b.page)
  const row = b.page.locator('[data-notification-panel] [data-notification]').first()
  const sentence = await row.locator('.fx-nt-sentence').innerText()
  ok('1 the sentence', sentence === `Content Creator commented on ${name1}`, sentence)
  await b.page.screenshot({ path: `${SHOTS}/rt-1-panel.png` })
  await row.locator('[data-nt-open]').click()
  await b.page.waitForSelector('.fx-comment-flash', { timeout: 12000 }).catch(() => null)
  ok('1 opens the task at the comment, highlighted', (await b.page.locator('.fx-comment-flash').count()) === 1)
  await sleep(1200)
  ok('1 the count goes down', (await badge(b.page)) === 0)
  await b.page.screenshot({ path: `${SHOTS}/rt-1-opened.png` })

  // 2 · B is the assignee, owner and creator: one notification.
  ok('2 one notification for the assignee who is also owner and creator', sql(`select count(*) from notifications where recipient_id='${R}' and task_id='${T1}'`) === '1')

  // 6 · B replies in the panel: A (the comment's author) is told.
  const cid = sql(`select id from task_comments where body like '[nt] Draft is up%'`)
  await b.page.locator(`[data-reply="${cid}"]`).click()
  await b.page.locator('[data-reply-composer] textarea').fill('[nt] Looks good — swapping the photo.')
  await b.page.keyboard.press('Enter')
  await sleep(1500)
  ok('6 the reply shows under the comment', (await b.page.locator('[data-thread] .fx-nt-reply').count()) === 1)
  ok('6 its author is told', sql(`select count(*) from notifications where recipient_id='${C}' and kind='reply'`) === '1')
  await b.page.screenshot({ path: `${SHOTS}/rt-6-reply.png` })
  await a.page.keyboard.press('Escape'); await sleep(300) // close A's task panel to reach the bell
  await waitBadge(a.page, 1)
  await openPanel(a.page)
  const replyText = await a.page.locator('[data-notification-panel] [data-kind="reply"] .fx-nt-sentence').innerText()
  ok('6 "replied to your comment"', replyText === `Raneem replied to your comment on ${name1}`, replyText)
  await a.page.keyboard.press('Escape')

  // Follow toggle: A follows T2 (no role on it), is told about its next comment; unfollows, isn't.
  await a.page.goto(`${BASE}/board?task=${T2}`); await a.page.waitForSelector('[data-follow]')
  ok('5 Follow shows for a task A has no role on', (await a.page.locator('[data-follow]').getAttribute('aria-pressed')) === 'false')
  await a.page.locator('[data-follow]').click(); await sleep(700)
  ok('5 Following after a click', (await a.page.locator('[data-follow]').getAttribute('aria-pressed')) === 'true' && sql(`select count(*) from task_followers where task_id='${T2}' and member_id='${C}' and not muted`) === '1')
  helper('comment', G, T2, '[nt] new colours are in')
  ok('5 a follower hears about the next comment', sql(`select count(*) from notifications where recipient_id='${C}' and task_id='${T2}'`) === '1')
  await a.page.locator('[data-follow]').click(); await sleep(700)
  sql(`delete from notifications where recipient_id='${C}' and task_id='${T2}'`)
  helper('comment', G, T2, '[nt] and the copy')
  ok('5 after Unfollow, nothing', sql(`select count(*) from notifications where recipient_id='${C}' and task_id='${T2}'`) === '0')

  // 3 · Five comments by three people within the window: one grouped row.
  sql(`update notifications set read_at=now() where recipient_id='${R}'`)
  for (const [who, i] of [[C, 1], [G, 2], [V, 3], [C, 4], [G, 5]]) helper('comment', who, T4, `[nt] note ${i}`)
  ok('3 one row for five comments', sql(`select count(*)||'|'||max(count)||'|'||max(cardinality(actor_ids)) from notifications where recipient_id='${R}' and task_id='${T4}' and read_at is null`) === '1|5|3')
  await b.page.goto(`${BASE}/board`); await b.page.waitForSelector('[data-bell]')
  await openPanel(b.page)
  const grouped = await b.page.locator('[data-notification-panel] [data-notification]').first().locator('.fx-nt-sentence').innerText()
  ok('3 "X, Y and 1 other commented"', /^Graphic Designer, Content Creator and 1 other commented on /.test(grouped), grouped)
  await b.page.screenshot({ path: `${SHOTS}/rt-3-grouped.png` })

  // 7 · Turn off T4 from the row's menu; a comment is quiet, a mention still comes.
  const first = b.page.locator('[data-notification-panel] [data-notification]').first()
  await first.hover(); await first.locator('[data-nt-more-menu]').click(); await first.locator('[data-nt-mute]').click()
  await sleep(600)
  ok('7 turned off', sql(`select muted from task_followers where task_id='${T4}' and member_id='${R}'`) === 't')
  sql(`update notifications set read_at=now() where recipient_id='${R}'`)
  helper('comment', C, T4, '[nt] quiet one')
  ok('7 no comment notification', sql(`select count(*) from notifications where recipient_id='${R}' and read_at is null`) === '0')
  helper('comment', C, T4, '[nt] @Raneem need you here', R)
  ok('7 a mention still comes through', sql(`select kind from notifications where recipient_id='${R}' and read_at is null`) === 'mention')
  await b.page.keyboard.press('Escape')

  // Toast: something new while B works shows a toast, not for the open task.
  await b.page.goto(`${BASE}/board`); await b.page.waitForSelector('[data-bell]'); await sleep(9000)
  helper('comment', V, T1, '[nt] toast please')
  await b.page.waitForSelector('[data-nt-toast]', { timeout: 12_000 }).catch(() => null)
  const toast = await b.page.locator('[data-nt-toast]').innerText().catch(() => '')
  ok('toast while working', /Video Editor commented on/.test(toast), toast.replace(/\n/g, ' '))
  await b.page.screenshot({ path: `${SHOTS}/rt-toast.png` })

  // 9 · Settings: Attachments off in the app → none recorded.
  await b.page.goto(`${BASE}/notifications/settings`); await b.page.waitForSelector('[data-setting="attachment:in_app"]')
  await b.page.locator('[data-setting="attachment:in_app"]').click(); await sleep(900)
  ok('9 saved as a change from the defaults', sql(`select kind||':'||in_app from notification_settings where member_id='${R}'`) === 'attachment:false')
  helper('attach', C, T1, '2')
  ok('9 no attachment notification', sql(`select count(*) from notifications where recipient_id='${R}' and kind='attachment'`) === '0')
  await b.page.screenshot({ path: `${SHOTS}/rt-9-settings.png` })

  // 8 · Due tomorrow, the due job twice: one reminder. (The first tick of the
  // server runs it through /api/notifications/tick; it then waits an hour, so
  // the second run here calls the job itself.)
  await b.ctx.request.post(`${BASE}/api/notifications/tick`, { headers: { 'x-notify-secret': 'lab-tick' } })
  helper('due'); helper('due')
  ok('8 one "due tomorrow"', sql(`select count(*) from notifications where recipient_id='${R}' and task_id='${T3}' and kind='due_soon'`) === '1')

  // 5 · @ in the description: the picker, then the person is told and follows.
  await b.page.goto(`${BASE}/board?task=${T2}`); await b.page.waitForSelector('[aria-label="Edit the brief"]')
  await b.page.locator('[aria-label="Edit the brief"]').click()
  await b.page.waitForSelector('.ProseMirror')
  await b.page.locator('.ProseMirror').click(); await b.page.keyboard.press('Control+End')
  await b.page.keyboard.type(' Over to @Vid')
  await b.page.waitForSelector('[data-brief-mention]', { timeout: 4000 }).catch(() => null)
  ok('5 typing @ opens the people list', /Video Editor/.test(await b.page.locator('[data-brief-mention]').innerText().catch(() => '')))
  await b.page.keyboard.press('Enter'); await sleep(2500)
  ok('5 the brief names them', sql(`select description_mentions::text from tasks where id='${T2}'`).includes(V))
  ok('5 they are told once', sql(`select count(*) from notifications where recipient_id='${V}' and kind='mention' and task_id='${T2}'`) === '1')
  ok('5 and follow the task', sql(`select count(*) from task_followers where task_id='${T2}' and member_id='${V}'`) === '1')

  // 11 · A task deleted after its notification: "no longer available".
  const gone = sql(`insert into tasks (id, name, brand_id, task_owner_id, created_by, initiator_role, status)
    select gen_random_uuid(), '[nt] doomed', brand_id, '${R}', '${R}', initiator_role, 'todo' from tasks where id='${T1}' returning id`).split('\n')[0]
  helper('comment', C, gone, '[nt] soon gone')
  sql(`delete from tasks where id='${gone}'`)
  await b.page.goto(`${BASE}/board`); await b.page.waitForSelector('[data-bell]')
  await openPanel(b.page)
  await b.page.locator('[data-notification-panel] [data-notification]').filter({ hasText: 'doomed' }).locator('[data-nt-open]').click()
  await b.page.waitForSelector('[data-nt-gone]', { timeout: 6000 }).catch(() => null)
  ok('11 "This task is no longer available"', /no longer available/.test(await b.page.locator('[data-nt-gone]').innerText().catch(() => '')))
  await b.page.keyboard.press('Enter')

  // 12 · The Inbox: To do and Done only; its count leaves mentions out.
  await b.page.locator('[data-inbox-button]').click(); await b.page.waitForSelector('[data-inbox-panel]')
  ok('12 the Inbox has To do and Done', (await b.page.$$eval('[data-inbox-panel] [role="tab"]', ts => ts.map(t => t.getAttribute('data-tab')))).join() === 'todo,done')
  await b.page.keyboard.press('Escape')

  // History page: Mentions only.
  await b.page.goto(`${BASE}/notifications`); await b.page.waitForSelector('[data-nt-history] [data-notification]')
  await b.page.locator('[data-nt-filter-kind="mention"]').click(); await sleep(800)
  const kinds = await b.page.$$eval('[data-nt-history] [data-notification]', rs => [...new Set(rs.map(r => r.getAttribute('data-kind')))])
  ok('history: filter by kind', kinds.join() === 'mention', kinds.join())
  await b.page.screenshot({ path: `${SHOTS}/rt-history.png` })

  // 4 · A moves her task into Content review: every Marketing Manager is told once, the mover isn't.
  const T5 = sql(`select id from tasks where dropped_at is null and status='todo' and id not in ('${T1}','${T2}','${T3}','${T4}') order by created_at limit 1`)
  sql(`update tasks set status='c-prog', nine_stage=false, assignee_id='${C}', task_owner_id='${C}', created_by='${C}' where id='${T5}'`)
  const mms = sql(`select count(*) from members where role='Marketing Manager' and id <> '${C}'`)
  await a.page.goto(`${BASE}/board?task=${T5}`); await a.page.waitForSelector('text=→ C-Review')
  await a.page.locator('text=→ C-Review').first().click(); await sleep(2500)
  ok('4 moved', sql(`select status from tasks where id='${T5}'`) === 'c-final')
  ok('4 every Marketing Manager told once', sql(`select count(*) from notifications n join members m on m.id=n.recipient_id where n.task_id='${T5}' and n.kind='task_moved_to_stage' and m.role='Marketing Manager'`) === mms, `${mms} manager(s)`)
  ok('4 the mover is not told', sql(`select count(*) from notifications where task_id='${T5}' and recipient_id='${C}'`) === '0')

  // 10 · Arabic, right to left, gender agreement and plurals.
  sql(`update members set gender='f' where id='${C}'`)
  const ar = await signIn(browser, 'raneem.sarhaan@forefront.consulting', 'ar')
  await ar.page.goto(`${BASE}/board`); await ar.page.waitForSelector('[data-bell]')
  await openPanel(ar.page)
  const arText = await ar.page.locator('[data-notification-panel] [data-kind="mention"] .fx-nt-sentence').first().innerText()
  ok('10 Arabic sentence, feminine', /^أشارت إليك Content Creator في/.test(arText), arText)
  ok('10 right to left', (await ar.page.evaluate(() => document.documentElement.dir)) === 'rtl')
  ok('10 stored language follows the cookie (R13)', (await sleep(800), sql(`select locale from members where id='${R}'`)) === 'ar')
  await ar.page.screenshot({ path: `${SHOTS}/rt-10-arabic.png` })

  const errs = [...a.errors, ...b.errors, ...ar.errors]
  ok('no page or console errors', errs.length === 0, errs[0] ?? '')
  sql(`update members set locale='en', gender=null; delete from notification_settings`)
  await browser.close()
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} pass`)
  process.exit(failed ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
