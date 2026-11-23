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
  // Spec 022 (R5): a content task's first move into Ready For Design or later, once.
  const nh = (status, target, nine = true, extra = {}) => m.needsHandoff({ status, nine_stage: nine, kind: 'pipeline', ...extra }, target, [], lab.spaces)
  ok(nh('c-check', 'r-design'), 'C-Check → Ready For Design')
  ok(nh('c-final', 'r-design', false), 'C-Review → Ready For Design without C-Check')
  ok(nh('todo', 'd-prog'), 'jumping into the design half')
  ok(nh('c-prog', 'publish'), 'straight to Published')
  ok(!nh('c-check', 'r-design', true, { auto_linked_at: '2026-11-20' }), 'already linked once: never again')
  ok(!nh('c-check', 'r-design', true, { media_board: 'design' }), 'a media task never hands off')
  ok(!nh('c-prog', 'c-final'), 'within the content half')
  ok(!nh('d-prog', 'd-check'), 'already in the design half')
  ok(!nh('r-design', 'c-check'), 'moving back')
  ok(!nh('c-check', 'c-check'), 'same stage')
  ok(!nh('c-check', 'ready-publish', false), 'c-check is not on the 10-stage path')
})

check('pure-media-gate', () => {
  const md = s => ({ status: s })
  eq(m.contentStageFrom([md('d-prog'), md('r-design')]), 'r-design', 'the content task waits at the earliest media stage')
  eq(m.contentStageFrom([md('final-check'), md('d-check')]), 'd-check', 'a media task past D-Check no longer holds it')
  eq(m.contentStageFrom([md('final-check')]), null, 'all passed: nothing holds it')
  eq(m.allMediaPassed([md('final-check'), md('publish')]), true, 'all passed')
  eq(m.allMediaPassed([md('final-check'), md('d-check')]), false, 'one still in D-Check')
  const content = { id: 'c', status: 'd-check', media_board: null, content_task_id: null }
  eq(m.mediaBlock(content, 'final-check', [md('final-check'), md('d-check')]), 'waiting_on_media', 'F-Check waits for both')
  eq(m.mediaBlock(content, 'final-check', [md('final-check'), md('final-check')]), null, 'both passed: F-Check is open')
  eq(m.mediaBlock(content, 'c-prog', [md('d-prog')]), null, 'moving back is allowed')
  eq(m.mediaBlock(content, 'final-check', []), null, 'no linked media: normal moves')
  const media = { id: 'm', status: 'd-check', media_board: 'design', content_task_id: 'c' }
  eq(m.mediaBlock(media, 'final-check', []), null, 'a linked media task passes D-Check')
  eq(m.mediaBlock(media, 'ready-publish', []), 'follows_content', '…but not past F-Check on its own')
  eq(m.mediaBlock({ ...media, status: 'final-check' }, 'ready-publish', []), 'follows_content', 'after D-Check it follows its content task')
  eq(m.mediaBlock({ ...media, content_task_id: null, status: 'final-check' }, 'ready-publish', []), null, 'an unlinked media task moves on its own')
  const types = [{ label: 'Reel', media_boards: ['video'] }, { label: 'Carousel', media_boards: ['design', 'video'] }]
  eq(m.boardsFor('Reel', types), ['video'], 'Reel → Video')
  eq(m.boardsFor('Carousel', types), ['design', 'video'], 'both')
  eq(m.boardsFor('Post', types), ['design'], 'unset → Design')
  eq(m.boardsFor('Video', []), ['video'], 'Video → Video by default')
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

check('pure-default-assignee', () => {
  const members = [{ id: 'm1', name: 'Samaa', role: 'Content Creator' }, { id: 'm2', name: 'Aya', role: 'Content Creator' }, { id: 'm3', name: 'Omar', role: 'Graphic Designer' }]
  eq(m.defaultAssigneeFor({ id: 'c', default_assignee_role: 'Content Creator' }, members, ['m1']), 'm1', 'the role holder who is in the Space')
  eq(m.defaultAssigneeFor({ id: 'c', default_assignee_role: 'Content Creator' }, members, ['m1', 'm2']), 'm2', 'several in the Space: the first by name')
  eq(m.defaultAssigneeFor({ id: 'c', default_assignee_role: 'Content Creator' }, members, []), 'm2', 'none in the Space: the first holder by name')
  eq(m.defaultAssigneeFor({ id: 'c', default_assignee_role: 'Video Editor' }, members, []), null, 'nobody holds it: null (the creator)')
  eq(m.defaultAssigneeFor({ id: 'c', default_assignee_role: null }, members, ['m1']), null, 'no role: null')
})

check('pure-shows-in-media-boards', () => {
  // Spec 022 FR-007: a content task never goes to a Design/Video board through its assignee or creator.
  const spaces = [
    { id: 'c', key: 'content', is_production: false, default_kind: 'pipeline' },
    { id: 'd', key: 'design', is_production: true, default_kind: 'pipeline', media_board: 'design' },
    { id: 'p', key: 'planning', is_production: false, default_kind: 'simple' },
  ]
  const members = { c: ['w'], d: ['w', 'g'], p: ['w'] }
  eq(m.spacesForAssignee({ kind: 'pipeline' }, 'g', spaces, members), [], 'a designer assigned a content task: not on Design')
  eq(m.spacesForAssignee({ kind: 'pipeline' }, 'w', spaces, members), ['c'], 'a writer in Content and Design: Content only')
  eq(m.spacesForAssignee({ kind: 'pipeline', media_board: 'design' }, 'w', spaces, members), [], 'a media task stays on its board')
  eq(m.creatorSpaces('w', 'pipeline', spaces, members), ['c'], 'created outside a Space: never on a board')
})

check('pure-assignee-change-drops', () => {
  // Spec 022 US5: the old assignee's Spaces go, unless created there, added by hand, or the new one brings it too.
  const rows = [{ space_id: 'c', added_via: 'assignee' }, { space_id: 'p', added_via: 'created' }, { space_id: 'x', added_via: 'assignee' }, { space_id: 'm', added_via: 'manual' }]
  eq(m.spacesToDropOnAssigneeChange(rows, ['c', 'p', 'm'], []), ['c'], 'only rows the old assignee brought')
  eq(m.spacesToDropOnAssigneeChange(rows, ['c', 'x'], ['x']), ['c'], 'a Space the new assignee brings stays')
  eq(m.spacesToDropOnAssigneeChange(rows, [], ['c']), [], 'nothing of the old assignee: nothing goes')
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

check('pure-space-stages', () => {
  // Spec 022 US4: validation, the remembered sub-stage, typed names.
  const all = m.ALL_STAGES.map(s => ({ stage_id: s, name: null }))
  eq(m.validateStages(all), [], 'every stage, unnamed: fine')
  ok(m.validateStages(all.filter(r => r.stage_id !== 'd-prog')).some(p => p.kind === 'missing' && p.stage === 'd-prog'), 'a stage with no step is refused')
  const split = [...all.filter(r => r.stage_id !== 'd-prog'), { stage_id: 'd-prog', name: 'Sketch' }, { stage_id: 'd-prog', name: 'Final art' }]
  eq(m.validateStages(split), [], 'a split with two names')
  ok(m.validateStages([...all.filter(r => r.stage_id !== 'd-prog'), { stage_id: 'd-prog', name: 'Sketch' }, { stage_id: 'd-prog', name: ' sketch ' }]).some(p => p.kind === 'duplicate'), 'the same name twice is refused')
  ok(m.validateStages([...all.filter(r => r.stage_id !== 'd-prog'), { stage_id: 'd-prog', name: 'D-Check' }]).some(p => p.kind === 'original'), "another stage's name is refused")
  ok(m.validateStages([...all.filter(r => r.stage_id !== 'd-prog'), { stage_id: 'd-prog', name: null }, { stage_id: 'd-prog', name: null }]).some(p => p.kind === 'duplicate'), 'two unnamed steps of one stage clash')
  const rows = [{ id: 'a', space_id: 'S', stage_id: 'd-prog', name: 'Sketch', position: 0, aliases: [] }, { id: 'b', space_id: 'S', stage_id: 'd-prog', name: 'Final art', position: 1, aliases: ['Polish'] },
    { id: 'c', space_id: 'S', stage_id: 'c-prog', name: 'Writing', position: 0, aliases: [] }]
  const entries = m.stagesForSpace('S', rows, 'en')
  eq(entries.length, 12, '11 stages, one split in two')
  eq(entries.find(e => e.stage_id === 'todo').name, 'To Do', 'an unnamed stage shows its original name')
  ok(m.hasOwnStages(entries) && !m.hasOwnStages(m.stagesForSpace('X', rows, 'en')), 'own stages only where named or split')
  const task = { id: 't', status: 'd-prog' }
  eq(m.spaceStageOf(task, 'S', entries, []).id, 'a', 'no row: the first step')
  eq(m.spaceStageOf(task, 'S', entries, [{ task_id: 't', space_id: 'S', space_stage_id: 'b', stage_id: 'd-prog' }]).id, 'b', 'remembered while still in that stage')
  eq(m.spaceStageOf({ id: 't', status: 'd-check' }, 'S', entries, [{ task_id: 't', space_id: 'S', space_stage_id: 'b', stage_id: 'd-prog' }]).stage_id, 'd-check', 'left the stage: the row no longer counts')
  eq(m.spaceStageOf(task, 'S', entries, [{ task_id: 't', space_id: 'S', space_stage_id: 'b', stage_id: 'd-check' }]).id, 'a', 're-entering starts at the first step')
  eq(m.matchSpaceStage('final  ART', entries).id, 'b', 'a name, case and spacing ignored')
  eq(m.matchSpaceStage('polish', entries).id, 'b', 'an alias')
  eq(m.matchSpaceStage('D-In Progress', entries).id, 'a', "an original name: that stage's first step")
  eq(m.matchSpaceStage('writing', entries).stage_id, 'c-prog', 'a renamed stage')
  eq(m.stagesFromWords({ 'd-prog': ['Editing', 'Cutting'] }).find(r => r.stage_id === 'd-prog'), { stage_id: 'd-prog', name: 'Editing', position: 0, aliases: ['Cutting'] }, 'status words become a named stage with aliases')
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
