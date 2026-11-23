// Spaces lab: Node checks on the pure rules (spec 021, quickstart Stage A).
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const m = await import(path.join(LAB, 'out/pure.mjs'))
let failed = 0
function check(id, fn) {
  try { fn(); console.log(`PASS ${id}`) } catch (e) { failed++; console.log(`FAIL ${id}: ${e.message}`) }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
const ok = (c, msg) => { if (!c) throw new Error(msg) }

const lab = m.makeLab()
const S = Object.fromEntries(lab.spaces.map(s => [s.key, s.id]))
const sorted = a => [...a].sort()

check('pure-starting-spaces-table', () => {
  const t = (status, type, assignee = null, kind = 'pipeline', nine = true) => sorted(m.startingSpaces({ status, nine_stage: nine, kind, content_type_label: type, assignee_id: assignee }, lab.spaces, lab.bySpace))
  eq(t('c-prog', 'Post'), [S.content], 'post while writing')
  eq(t('d-prog', 'Video'), sorted([S.content, S.video]), 'video at D-In Progress')
  eq(t('d-check', 'Post'), sorted([S.content, S.design]), 'post at D-Check')
  eq(t('r-design', 'Reel', null, 'pipeline', false), sorted([S.content, S.video]), 'reel at Ready For Design (no C-Check)')
  eq(t('todo', 'Video', 'karim'), sorted([S.content, S.video]), 'assigned to the video editor before design')
  eq(t('c-prog', 'Post', 'noran'), [S.content], 'a content member adds Content only, not Planning (pipeline)')
  eq(t('todo', null, null, 'simple'), [S.planning], 'a simple task goes to Planning')
  eq(t('todo', null, 'noran', 'simple'), sorted([S.content, S.planning]), 'a simple task also shows where its assignee works (FR-029)')
  eq(t('publish', 'Post'), sorted([S.content, S.design]), 'published post')
})

check('pure-spaces-for-assignee', () => {
  eq(m.spacesForAssignee({ kind: 'pipeline' }, 'karim', lab.spaces, lab.bySpace), [S.video], 'editor')
  eq(m.spacesForAssignee({ kind: 'pipeline' }, 'noran', lab.spaces, lab.bySpace), [S.content], 'Planning skipped for pipeline')
  eq(m.spacesForAssignee({ kind: 'simple' }, 'noran', lab.spaces, lab.bySpace), [S.content], 'every task skips Planning (kind no longer decides)')
  eq(m.spacesForAssignee({ kind: 'pipeline' }, 'raneem', lab.spaces, lab.bySpace), [], 'an admin outside every Space adds none')
  eq(m.spacesForAssignee({ kind: 'pipeline' }, null, lab.spaces, lab.bySpace), [], 'no assignee')
  const archived = lab.spaces.map(s => s.key === 'video' ? { ...s, archived_at: '2026-11-01' } : s)
  eq(m.spacesForAssignee({ kind: 'pipeline' }, 'karim', archived, lab.bySpace), [], 'archived Space not added')
})

check('pure-needs-handoff-matrix', () => {
  const nh = (status, target, shown, nine = true, kind = 'pipeline') => m.needsHandoff({ status, nine_stage: nine, kind }, target, shown, lab.spaces)
  ok(nh('c-check', 'r-design', [S.content]), 'C-Check → Ready For Design without production')
  ok(nh('c-final', 'r-design', [S.content], false), 'C-Review → Ready For Design on the path without C-Check')
  ok(nh('todo', 'd-prog', [S.content]), 'jumping into the design half')
  ok(nh('c-prog', 'publish', []), 'straight to Published')
  ok(!nh('c-check', 'r-design', [S.content, S.video]), 'already in Video')
  ok(!nh('c-check', 'r-design', [S.design]), 'already in Design')
  ok(!nh('c-prog', 'c-final', [S.content]), 'within the content half')
  ok(!nh('d-prog', 'd-check', [S.content]), 'already in the design half')
  ok(!nh('r-design', 'c-check', [S.content]), 'moving back')
  ok(!nh('c-check', 'r-design', [], true, 'simple'), 'simple tasks never')
  ok(nh('c-check', 'r-design', ['nope']), 'an unknown Space does not count')
  ok(!nh('c-check', 'c-check', []), 'same stage')
  const archived = lab.spaces.map(s => s.key === 'video' ? { ...s, archived_at: '2026-11-01' } : s)
  ok(m.needsHandoff({ status: 'c-check', nine_stage: true, kind: 'pipeline' }, 'r-design', [S.video], archived), 'an archived production Space does not count')
  ok(!nh('c-check', 'ready-publish', [S.content], false), 'c-check is not on the 10-stage path')
})

check('pure-handoff-defaults', () => {
  eq(m.handoffDefaults({ content_type_label: 'Video' }, lab.spaces, lab.bySpace).spaceIds, [S.video], 'video → Video')
  eq(m.handoffDefaults({ content_type_label: 'Reel' }, lab.spaces, lab.bySpace).spaceIds, [S.video], 'reel → Video')
  eq(m.handoffDefaults({ content_type_label: 'Post' }, lab.spaces, lab.bySpace).spaceIds, [S.design], 'post → Design')
  eq(m.handoffDefaults({ content_type_label: 'Post' }, lab.spaces, lab.bySpace).candidates, { [S.design]: ['omar'], [S.video]: ['karim'] }, 'candidates')
})

check('pure-creator-spaces', () => {
  eq(m.creatorSpaces('noran', 'pipeline', lab.spaces, lab.bySpace), [S.content], 'pipeline task → Content')
  eq(m.creatorSpaces('noran', 'simple', lab.spaces, lab.bySpace), [S.content], 'a new (simple) task → the creator\'s working Space')
  eq(m.creatorSpaces('raneem', 'pipeline', lab.spaces, lab.bySpace), [], 'admin outside every Space')
})

check('pure-feature-on', () => {
  ok(m.featureOn({ features: {} }, 'platform'), 'missing → on')
  ok(!m.featureOn({ features: { platform: false } }, 'platform'), 'override off')
  ok(!m.featureOn({ features: {} }, 'sla', { sla: false }), 'workspace default off')
  ok(m.featureOn({ features: { sla: true } }, 'sla', { sla: false }), 'brand override beats default')
  ok(m.featureOn(null, 'pillars'), 'no brand → on')
  eq(m.cleanFeatures({ platform: false, bogus: true, sla: 'no' }), { platform: false }, 'cleaned')
})

check('pure-simple-status', () => {
  eq(m.nextSimple('s-todo'), 's-doing', 'todo → doing')
  eq(m.nextSimple('s-doing'), 's-done', 'doing → done')
  eq(m.nextSimple('s-done'), null, 'done is the end')
  ok(m.isSimpleStatus('s-doing') && !m.isSimpleStatus('todo'), 'guard')
})

check('pure-fixtures-sane', () => {
  ok(lab.tasks.every(t => lab.taskSpaces.some(r => r.task_id === t.id)), 'every task shows somewhere')
})

check('pure-calendar-grids', () => {
  const nov = m.monthGrid(2026, 10)
  eq(nov[0].iso, '2026-10-26', 'November 2026 starts on Monday 26 Oct')
  ok(nov.length % 7 === 0, 'whole weeks')
  eq(nov.filter(d => d.inMonth).length, 30, '30 days in November')
  eq(nov.at(-1).iso, '2026-12-06', 'ends on Sunday 6 Dec')
  const feb = m.monthGrid(2027, 1)
  eq(feb.filter(d => d.inMonth).length, 28, 'February 2027')
  eq(m.moveMonth(2026, 11, 1), { year: 2027, month: 0 }, 'December → January crosses the year')
  eq(m.moveMonth(2027, 0, -1), { year: 2026, month: 11 }, 'and back')
  eq(m.weekGrid('2026-11-22').map(d => d.iso), ['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22'], 'Sunday belongs to the week before')
  eq(m.moveWeek('2026-12-28', 1), '2027-01-04', 'week across the year')
})

check('pure-view-config', () => {
  const c = m.cleanConfig({ filters: { brand: ['b1', 5, 'b1'], bogus: ['x'] }, group: 'weird', sort: 'due', fields: ['status', 'nope'] })
  eq(c, { filters: { brand: ['b1'] }, group: null, sort: 'due', fields: ['status'] }, 'bad values are dropped')
  eq(m.cleanConfig(null), m.EMPTY_CONFIG, 'nothing is the empty config')
  const ts = [
    { name: 'B', status: 'd-prog', brand_id: 'b1', assignee_id: 'm1', content_type_label: 'Post', project_id: null, due_date: '2026-12-10', priority: 'Low' },
    { name: 'A', status: 'todo', brand_id: 'b2', assignee_id: null, content_type_label: 'Video', project_id: 'p1', due_date: null, priority: 'High' },
    { name: 'C', status: 'c-prog', brand_id: 'b1', assignee_id: 'm2', content_type_label: 'Post', project_id: 'p1', due_date: '2026-12-01', priority: 'Medium' },
  ]
  const names = (cfg) => m.applyView(ts, m.cleanConfig(cfg)).map(x => x.name)
  eq(names({}), ['B', 'A', 'C'], 'no config keeps everything in place')
  eq(names({ filters: { brand: ['b1'] } }), ['B', 'C'], 'brand filter')
  eq(names({ filters: { assignee: ['__none'] } }), ['A'], 'No one')
  eq(names({ filters: { campaign: ['p1'], type: ['Post'] } }), ['C'], 'filters combine')
  eq(names({ sort: 'due' }), ['C', 'B', 'A'], 'due date, undated last')
  eq(names({ sort: 'priority' }), ['A', 'C', 'B'], 'priority High first')
  eq(names({ sort: 'stage' }), ['A', 'C', 'B'], 'pipeline order')
  eq(names({ sort: 'name' }), ['A', 'B', 'C'], 'name')
})

check('pure-space-words', () => {
  const w = m.cleanSpaceWords({ 'd-prog': ' Editing ,  editing, Cutting ', 'c-check': [' Script  review '], bogus: ['x'], 's-done': 'Shipped' })
  eq(w, { 'c-check': ['Script review'], 'd-prog': ['Editing', 'Cutting'], 's-done': ['Shipped'] }, 'trimmed, once each, known values only')
  eq(m.wordOf('d-prog', w), 'Editing', 'the first word is shown')
  eq(m.wordOf('todo', w), null, 'no word, board name')
  eq(m.matchWord('  cutting ', w), 'd-prog', 'any word can be typed, case and spacing ignored')
  eq(m.matchWord('D-In Progress', w), 'd-prog', 'the board name still works')
  eq(m.matchWord('shipped', w), null, 'a simple word never moves a pipeline task')
  eq(m.matchWord('nonsense', w), null, 'unknown')
  const names = { 's-todo': ['To Do'], 's-doing': ['In progress'], 's-done': ['Done'] }
  eq(m.matchSimpleWord('SHIPPED', w, names), 's-done', 'simple words')
  eq(m.matchSimpleWord('in progress', w, names), 's-doing', 'simple names')
  eq(m.findClash(w), null, 'no clash')
  const c1 = m.findClash({ 'd-prog': ['Review'], 'c-check': ['review'] })
  eq(c1 && [c1.a, c1.b], ['d-prog', 'c-check'], 'one word for two stages')
  const c2 = m.findClash({ 'd-prog': ['C-Check'] })
  eq(c2 && c2.a, 'c-check', "another stage's board name")
  eq(m.findClash({ 'd-prog': ['D-In Progress'] }), null, 'its own board name is fine')
  eq(m.wordsFor({ key: 'design', words: { 'd-check': ['Client review'] } }), { 'd-check': ['Client review'] }, 'a team Space keeps its own')
  eq(m.wordsFor({ key: 'content', words: { todo: ['x'] } }, { words: { stage: { todo: ['Idea'] } } }), { todo: ['Idea'] }, "Content reads its sheet's words")
  eq(m.wordsFor({ key: 'video', words: {} }, { words: { stage: { todo: ['Idea'] } }, show: 'board' }), {}, 'a sheet showing board names gives none')
})

check('pure-brand-features', () => {
  eq(m.featureOn(null, 'platform'), true, 'no brand: on')
  eq(m.featureOn({ features: {} }, 'platform', { platform: false }), false, 'the workspace default')
  eq(m.featureOn({ features: { platform: true } }, 'platform', { platform: false }), true, "the brand's own switch wins")
  const r = m.resolveFeatures({ sla: false, bogus: true }, { clips: false })
  eq([r.sla, r.clips, r.platform, Object.keys(r).length], [false, false, true, 8], 'every switch resolved')
  const b = m.withResolvedFeatures({ id: 'b', features: { hours: false } }, { covers: false })
  eq([b.own_features, b.features.hours, b.features.covers], [{ hours: false }, false, false], 'own overrides kept apart')
  eq(m.featureOn(b, 'covers'), false, 'resolved brands need no defaults')
  eq(m.featureOnAny([{ features: { type: false } }, { features: {} }], 'type'), true, 'any brand still uses it')
  eq(m.featureOnAny([{ features: { type: false } }], 'type'), false, 'none do')
  eq(m.offFeatureFor({ features: { priorities: false } }, 'priority'), 'priorities', 'a sheet column follows its switch')
  eq(m.offFeatureFor({ features: { priorities: false } }, 'title'), null, 'other columns never hatch')
  const load = m.taskLoad([
    { assignee_id: 'a', brand_id: 'x', hours_estimate: 3, status: 'todo', brand: { features: { hours: false } } },
    { assignee_id: 'a', brand_id: 'y', hours_estimate: 2, status: 'todo', brand: { features: {} } },
  ])
  eq([load[0].hours, load[0].tasks], [2, 2], 'hours switched off add nothing; the task still counts')
  const t = { kind: 'pipeline', status: 'c-prog', stage_date: '2020-01-01', due_date: '2020-01-02', content_type_label: 'Design' }
  eq(m.getAlertStatus({ ...t, brand: { features: {} } }, {}, new Date('2026-01-01')), 'Overdue', 'SLA on: late')
  eq(m.getAlertStatus({ ...t, brand: { features: { sla: false } } }, {}, new Date('2026-01-01')), 'On Track', 'SLA off: no badge, no breach')
})

check('pure-task-link-values', () => {
  const tasks = [{ id: '11111111-1111-1111-1111-111111111111', name: 'Ramadan launch plan' }, { id: '22222222-2222-2222-2222-222222222222', name: 'Poster' }, { id: '33333333-3333-3333-3333-333333333333', name: 'poster' }]
  eq(m.COLUMN_KINDS.includes('task'), true, 'Task link is a field kind')
  eq(m.parseValue('task', tasks[0].id, { tasks }), { ok: true, value: tasks[0].id }, 'by id')
  eq(m.parseValue('task', '  ramadan LAUNCH plan ', { tasks }), { ok: true, value: tasks[0].id }, 'by its name, case and spacing ignored')
  eq(m.parseValue('task', 'Poster', { tasks }).ok, false, 'a name two tasks share is refused')
  eq(m.parseValue('task', 'Nothing', { tasks }), { ok: false, code: 'task' }, 'unknown')
  eq(m.parseValue('task', '', { tasks }), { ok: true, value: '' }, 'empty unlinks')
  eq(m.formatValue('task', tasks[0].id, { tasks }), 'Ramadan launch plan', 'shown as its name')
})

check('pure-due-dates', () => {
  const R = m.DEFAULT_RULE
  eq(R, { daysBefore: 7, weekend: [5, 6], shift: 'earlier' }, 'defaults: 7 days, Friday and Saturday, earlier')
  eq(m.calcDueDate('2026-12-15', R), '2026-12-08', 'Publishing Tue 15 Dec → Due Tue 8 Dec')
  eq(m.weekday('2026-12-11'), 5, '11 Dec 2026 is a Friday')
  eq(m.calcDueDate('2026-12-18', R), '2026-12-10', 'due lands on Fri 11 Dec → moves back to Thu 10 Dec')
  eq(m.calcDueDate('2026-12-19', R), '2026-12-10', 'due lands on Sat 12 Dec → moves back to Thu 10 Dec')
  eq(m.calcDueDate('2026-12-18', { ...R, shift: 'later' }), '2026-12-13', 'later: Fri 11 Dec → Sun 13 Dec')
  eq(m.calcDueDate('2026-12-15', { ...R, daysBefore: 0 }), '2026-12-15', '0 days: the publishing day itself')
  eq(m.calcDueDate('2026-03-05', R), '2026-02-26', 'across a month end (Thu 5 Mar → Thu 26 Feb)')
  eq(m.calcDueDate('2027-01-05', R), '2026-12-29', 'across a year end')
  eq(m.cleanRule({ daysBefore: 7, weekend: [0, 1, 2, 3, 4, 5, 6], shift: 'earlier' }).error, 'weekend_all', 'every day a weekend is refused')
  eq(m.cleanRule({ daysBefore: -1, weekend: [5], shift: 'earlier' }).error, 'days', 'negative days refused')
  eq(m.cleanRule({ daysBefore: 3, weekend: [6, 5, 5, 9], shift: 'later' }).rule, { daysBefore: 3, weekend: [5, 6], shift: 'later' }, 'cleaned')
  eq(m.nextDueDate({ publish: '2026-12-15', due: '2026-12-01', manual: true }, R), '2026-12-01', 'a hand-set due date is kept')
  eq(m.nextDueDate({ publish: '2026-12-15', due: '2026-12-01', manual: false }, R), '2026-12-08', 'an automatic one follows')
  eq(m.nextDueDate({ publish: null, due: '2026-12-01', manual: false }, R), null, 'no publishing date, no automatic due date')
  // Near-term: due lands in the past, still set, and the task is overdue.
  const today = '2026-11-23'
  const due = m.calcDueDate('2026-11-26', R)
  eq(due, '2026-11-19', 'publishing in 3 days → due 4 days ago')
  eq(m.isOverdue({ due_date: due, status: 'c-prog' }, today), true, '…and overdue')
  eq(m.isOverdue({ due_date: due, status: 'publish' }, today), false, 'published work is never overdue')
  eq(m.isOverdue({ due_date: due, kind: 'simple', simple_status: 's-done' }, today), false, 'done simple work is never overdue')
  // Cairo: 23:30 UTC on 22 Nov is already 23 Nov in Cairo (UTC+2).
  eq(m.cairoToday(new Date('2026-11-22T23:30:00Z')), '2026-11-23', 'today is Cairo\'s day')
  eq(m.formatDay('2026-12-15', 'en', '2026-11-23'), 'Tue 15 Dec', 'one format: weekday, day, month')
  eq(m.formatDay('2027-01-05', 'en', '2026-11-23'), 'Tue 5 Jan 2027', 'with the year when not this year')
  const list = [{ id: 'a', due_date: null, created_at: '1' }, { id: 'b', due_date: '2026-12-10', publish_date: '2026-12-20', created_at: '2' }, { id: 'c', due_date: '2026-12-10', publish_date: '2026-12-17', created_at: '3' }, { id: 'd', due_date: '2026-12-01', created_at: '4' }]
  eq([...list].sort(m.compareByDue).map(x => x.id), ['d', 'c', 'b', 'a'], 'due earliest first, ties by publishing date, undated last')
})

if (failed) process.exitCode = 1
