// Inbox lab: Node checks on the pure model (spec 006 quickstart §1).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(LAB, '../..')
const m = await import(path.join(LAB, 'out/pure.mjs'))
let failed = 0, ran = 0
function check(id, fn) {
  ran++
  try { fn(); console.log(`PASS ${id}`) } catch (e) { failed++; console.log(`FAIL ${id}: ${e.message}`) }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
const ok = (c, msg) => { if (!c) throw new Error(msg) }

const NOW = new Date('2026-11-05T09:00')
const lab = m.makeLab(NOW)
const who = id => lab.members.find(x => x.id === id)
const model = (id = 'raneem', state = lab.state, tasks = lab.tasks) =>
  m.inboxModel({ tasks: tasks.filter(t => !t.dropped_at), member: who(id), state, slaConfig: {}, now: NOW })

check('pure-counts-equal-rows', () => {
  // SC-002: the number is exactly the rows listed in To do plus unread Mentions.
  for (const id of ['raneem', 'yosra', 'mona', 'lina', 'sara']) {
    const x = model(id)
    eq(x.counts.total, x.reviews.length + x.yours.length + x.mentions.filter(r => r.unread).length, `${id} total`)
    eq(x.counts.todo, x.reviews.length + x.yours.length, `${id} todo`)
  }
  const r = model()
  eq([r.counts.reviews, r.counts.yours, r.counts.unread, r.counts.total, r.counts.urgent], [2, 3, 2, 7, true], 'raneem')
})

check('pure-reviews-by-role', () => {
  // SC-003: every live review-stage task appears for its role, and only there.
  const reviewStages = { 'c-final': 'Marketing Manager', 'c-check': 'Managing Director', 'd-check': 'Brand Director', 'final-check': 'Marketing Manager' }
  for (const mem of lab.members) {
    const want = lab.tasks.filter(t => !t.dropped_at && reviewStages[t.status] === mem.role).map(t => t.id).sort()
    eq(model(mem.id).reviews.map(r => r.task.id).sort(), want, mem.id)
  }
  eq(model().reviews.map(r => r.task.id), ['r1', 'r2'], 'longest waiting first')
  eq(model('mona').reviews.map(r => r.task.id), ['r4'], 'admin sees only her role\'s stage')
  eq(model('lina').reviews, [], 'no review role, no group')
})

check('pure-your-tasks', () => {
  const r = model()
  eq(r.yours.map(x => [x.task.id, x.reason, x.days]), [['y1', 'late', 2], ['y2', 'today', 0], ['y3', 'undated', 0]], 'late, today, undated')
  ok(!r.yours.some(x => x.task.id === 'y4'), 'due later stays on the board (FR-023)')
  ok(!r.yours.some(x => x.task.id === 'x1'), 'dropped tasks are out')
})

check('pure-snooze', () => {
  const until = m.nextMidnight(NOW).toISOString()
  const r = model('raneem', { ...lab.state, snoozes: { y1: until } })
  eq(r.yours.map(x => x.task.id), ['y2', 'y3'], 'put off leaves the list')
  eq(r.snoozed, ['y1'], 'and is counted on the line')
  eq(r.counts.total, 6, 'and the number')
  const back = model('raneem', { ...lab.state, snoozes: { y1: new Date(NOW.getTime() - 1000).toISOString() } })
  eq(back.yours.length, 3, 'an expired put-off comes back')
  eq(m.nextMidnight(NOW).getHours(), 0, 'midnight')
  eq(m.localDay(m.nextMidnight(NOW)), '2026-11-06', 'the next day')
})

check('pure-mentions-window', () => {
  // SC-007 / FR-034: older than inbox_since − 7 days starts read.
  const r = model()
  eq(r.mentions.map(x => [x.comment.id, x.unread]), [['m2', true], ['m1', true], ['m0', false]], 'unread first, newest first')
  const read = model('raneem', { ...lab.state, readIds: ['m2'] })
  eq(read.counts.unread, 1, 'read state lowers the count')
  eq(read.mentions[0].comment.id, 'm1', 'read ones go below')
  const later = model('raneem', { ...lab.state, since: new Date(NOW.getTime() - 30 * 86400000).toISOString() })
  eq(later.counts.unread, 3, 'a member who started earlier still sees the old one')
})

check('pure-team', () => {
  const r = model()
  const keys = r.team.map(x => x.key)
  ok(keys.includes('c:c1'), 'Sara\'s comment')
  ok(keys.includes('a:a1'), 'Sara\'s file')
  ok(!keys.includes('c:c2'), 'not my own comment (A3)')
  ok(!keys.includes('a:a0'), 'not my own upload (A3)')
  ok(!keys.includes('c:m2'), 'mentions live in Mentions')
  const move = r.team.find(x => x.key === 's:y2')
  ok(move && move.dateOnly && move.type === 'move' && !move.who, 'a move names no one, by day (FR-041)')
  ok(r.team.some(x => x.key === 's:d1' && x.type === 'publish'), 'a publish')
})

check('pure-done', () => {
  const r = model()
  eq(r.done.week.map(x => x.task.id), ['d1'], 'published this week')
  eq(r.done.total, 2, 'all-time total')
})

check('pure-summary', () => {
  const s = c => m.inboxSummary({ reviews: 0, yours: 0, late: 0, today: 0, undated: 0, unread: 0, todo: 0, total: 0, urgent: false, ...c })
  eq(s({ reviews: 2, late: 1, today: 1, unread: 2 }), [{ key: 'reviews', n: 2 }, { key: 'late', n: 1 }], 'the two most pressing')
  eq(s({ today: 1, unread: 3 }), [{ key: 'today', n: 1 }, { key: 'mentions', n: 3 }], 'today, then mentions')
  eq(s({ todo: 4, undated: 4, yours: 4 }), [{ key: 'todo', n: 4 }], 'only undated: N to do')
  eq(s({}), [], 'all clear')
  eq(m.openingTab({ todo: 0, unread: 2 }), 'mentions', 'opens on Mentions when To do is empty')
  eq(m.openingTab({ todo: 0, unread: 0 }), 'team', 'then Team')
})

check('pure-date-words', () => {
  eq(m.dateWords('2026-11-05', NOW), { word: 'today' }, 'today')
  eq(m.dateWords('2026-11-04', NOW), { word: 'yesterday' }, 'yesterday')
  eq(m.dateWords('2026-11-02', NOW), { days: 3 }, '3 days')
  eq(m.dateWords('2026-11-05T00:00:00.000Z', NOW), { word: 'today' }, 'a stored date stays its day')
  eq(m.previousOnPath({ status: 'c-final', nine_stage: false }), 'c-prog', 'send back from C-Review')
  eq(m.previousOnPath({ status: 'final-check', nine_stage: false }), 'd-check', 'send back from Final check')
  eq(m.mondayOf(NOW), '2026-11-02', 'Monday')
})

check('tokens-only', () => {
  const bad = []
  const dir = path.join(root, 'src/components/inbox')
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    for (const x of src.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)) bad.push(`${f}: ${x[0]}`)
  }
  if (bad.length) throw new Error(bad.slice(0, 5).join(', '))
})

check('messages-parity', () => {
  const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8')).inbox
  const ar = JSON.parse(fs.readFileSync(path.join(root, 'messages/ar.json'), 'utf8')).inbox
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort()
  eq(keys(ar), keys(en), 'inbox keys')
})

console.log(`\n${ran - failed}/${ran} node checks passed`)
if (failed) process.exitCode = 1
