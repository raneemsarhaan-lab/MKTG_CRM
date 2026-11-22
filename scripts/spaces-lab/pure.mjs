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
  eq(sorted(m.spacesForAssignee({ kind: 'simple' }, 'noran', lab.spaces, lab.bySpace)), sorted([S.content, S.planning]), 'simple keeps Planning')
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
  eq(m.creatorSpaces('noran', 'simple', lab.spaces, lab.bySpace), [S.planning], 'simple task → Planning')
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

if (failed) process.exitCode = 1
