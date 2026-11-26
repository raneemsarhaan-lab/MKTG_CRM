/**
 * QA 26 Nov 2026 (F31): checks for the release fixes that are pure rules. Run: npx tsx scripts/spaces-lab/qa-fixes.lab.ts
 * Prints PASS/FAIL per check; exits non-zero on any failure. The real-app side is scenarios-qa.cjs.
 */
import { failed, succeeded, waitMinutes, MAX_PER_EMAIL, MAX_PER_IP } from '../../src/lib/login-limit'
import { matchTask, parseQuery, words, type Searchable } from '../../src/lib/search'
import { allowedStages, isApprovalStage } from '../../src/lib/stage-moves'
import { startingSpacesFor, DEFAULT_SPACES } from '../../src/lib/spaces'
import { readDay, readPlan } from '../../src/components/content/parse-plan'

let bad = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!ok) bad++
}

// F10: login limit — 5 wrong tries per address, 20 per network address, in 15 minutes.
{
  const t0 = Date.UTC(2026, 10, 26, 9), ip = 'lab-ip-1'
  for (let i = 0; i < MAX_PER_EMAIL - 1; i++) failed('a@lab', ip, t0 + i)
  check('F10 four wrong tries: still allowed', waitMinutes('a@lab', ip, t0 + 10) === 0)
  failed('a@lab', ip, t0 + 10)
  const w = waitMinutes('a@lab', ip, t0 + 20)
  check('F10 the fifth wrong try: wait about 15 minutes', w >= 14 && w <= 15, w)
  check('F10 another address on the same network is not blocked', waitMinutes('b@lab', ip, t0 + 20) === 0)
  check('F10 after 15 minutes it is allowed again', waitMinutes('a@lab', ip, t0 + 15 * 60_000 + 20) === 0)
  for (let i = 0; i < MAX_PER_IP; i++) failed(`x${i}@lab`, 'lab-ip-2', t0 + i)
  check('F10 20 wrong tries from one network block that network', waitMinutes('new@lab', 'lab-ip-2', t0 + 50) > 0)
  succeeded('new@lab', 'lab-ip-2')
  check('F10 a correct password clears the network count', waitMinutes('new@lab', 'lab-ip-2', t0 + 60) === 0)
}

// F14: Arabic search finds words with or without "ال" and its joined forms.
{
  const task = (name: string): Searchable => ({ id: name, name, text: [], other: [], open: true, brand_id: null, space_ids: [], publish_date: null } as unknown as Searchable)
  const t = task('إطلاق الحملة الرمضانية')
  check('F14 "حملة" finds "الحملة"', !!matchTask(t, parseQuery('حملة')))
  check('F14 "الحملة" finds "الحملة"', !!matchTask(t, parseQuery('الحملة')))
  check('F14 "بالحملة" finds "الحملة"', !!matchTask(t, parseQuery('بالحملة')))
  check('F14 short words keep their letters (ال + one letter is not cut)', words('الم').join() === 'الم', words('الم'))
}

// F05/F06: a user moves back, or forward up to the next approval stage; admins and superusers skip approvals.
{
  const task = { status: 'c-prog', nine_stage: true, task_owner_id: 'u1', assignee_id: 'u1', assignee_ids: ['u1'] }
  const user = { id: 'u1', role: 'Content Creator', access: 'user' }
  const sup = { id: 's1', role: 'Brand Director', access: 'superuser' }
  const admin = { id: 'a1', role: 'Admin', access: 'admin' }
  const forUser = allowedStages(task, user), forSup = allowedStages(task, sup), forAdmin = allowedStages(task, admin)
  const approvals = forSup.filter(s => isApprovalStage(s))
  const firstApproval = forSup.find(s => isApprovalStage(s))
  check('F06 a user can reach the next approval stage', !!firstApproval && forUser.includes(firstApproval), { forUser, firstApproval })
  check('F06 a user cannot skip past it', approvals.slice(1).every(s => !forUser.includes(s)), { forUser, approvals })
  check('F06 a superuser may skip approval stages', approvals.length > 1 && approvals.every(s => forSup.includes(s)), forSup)
  check('F06 an admin may skip approval stages', approvals.every(s => forAdmin.includes(s)), forAdmin)
  check('F05 a task off its path can still be moved by an admin (a repair)', allowedStages({ ...task, nine_stage: false, status: 'c-check' }, admin).length > 0)
}

// F01: every title starts with Spaces; titles we don't know get the default.
{
  for (const role of ['Team Member', 'Market Researcher', 'Brand Director', 'Community Manager', 'Marketing Manager', 'Managing Director']) {
    check(`F01 ${role} starts with Content and Planning`, ['content', 'planning'].every(k => startingSpacesFor(role).includes(k)), startingSpacesFor(role))
  }
  check('F01 an unknown title gets the default Spaces', JSON.stringify(startingSpacesFor('Lab Unknown Title')) === JSON.stringify(DEFAULT_SPACES), startingSpacesFor('Lab Unknown Title'))
}

// F23: Paste plan with no heading row; dates read day-first.
{
  const cell = (text: string) => ({ text, href: null })
  check('F23 24/11/2026 is 24 November', readDay('24/11/2026') === '2026-11-24', readDay('24/11/2026'))
  check('F23 24 Nov 2026', readDay('24 Nov 2026') === '2026-11-24', readDay('24 Nov 2026'))
  check('F23 31/02/2026 is not a date', readDay('31/02/2026') === null)
  const plain = readPlan([[cell('First post')], [cell('Second post')]])
  check('F23 a one-column list: each line is a title', JSON.stringify(plain.rows.map(r => r.title)) === '["First post","Second post"]', plain.rows.map(r => r.title))
  const dated = readPlan([[cell('Teaser'), cell('24/11/2026')], [cell('Launch'), cell('1/12/2026')]])
  check('F23 no headings: a column of dates is the publishing date', JSON.stringify(dated.rows.map(r => r.date)) === '["2026-11-24","2026-12-01"]', dated.rows.map(r => [r.title, r.date]))
  const headed = readPlan([[cell('Title'), cell('Publishing date')], [cell('Reel'), cell('2026-12-05')]])
  check('F23 with headings: the Date column is read', headed.rows[0]?.title === 'Reel' && headed.rows[0]?.date === '2026-12-05', headed.rows[0])
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
