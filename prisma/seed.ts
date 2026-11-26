import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { ROLE_SPACES, membersBySpace, startingSpaces } from '../src/lib/spaces'
import { stagesFromWords } from '../src/lib/space-stages'
import { calcDueDate, dayDate, dayOf, ruleFromSettings } from '../src/lib/due-dates'
import { contentStageFrom, passedDCheck } from '../src/lib/media'
import { STARTING_LOOKS } from '../src/lib/task-types'

const prisma = new PrismaClient()

/** Same convention the plan importer uses — see scripts/import-plan.ts. */
function looksLikeMilestone(name: string): boolean {
  const letters = [...name].filter(c => /\p{L}/u.test(c))
  if (letters.length < 3) return false
  const caps = letters.filter(c => c === c.toUpperCase() && c !== c.toLowerCase()).length
  if (caps / letters.length > 0.6) return true
  return /\b(GO LIVE|LAUNCH|DELIVERED|OPENS|CLOSES)\b/.test(name)
}


/**
 * Run something exactly once, ever, across all future deploys.
 *
 * The seed runs on every container start, so anything that CHANGES existing
 * rows has to be guarded or it re-asserts itself forever — undoing whatever an
 * admin did in between. A marker row is the guard: written after the work
 * succeeds, checked before it runs.
 *
 * This is the only sanctioned way to change data that already exists. Everything
 * else in this file creates and then leaves alone.
 */
async function once(key: string, label: string, work: () => Promise<string>) {
  const marker = { kind: 'migration', key }
  const done = await prisma.tombstone.findUnique({
    where: { kind_key: { kind: marker.kind, key: marker.key } },
  })
  if (done) return
  const result = await work()
  await prisma.tombstone.create({ data: { ...marker, label: result } })
  console.log(`  ✦ ${label} — ${result} (one-time)`)
}


/**
 * Has this seeded row already been created, once, ever?
 *
 * The seed matches its rows by a natural key — a member by email, a brand by
 * name — and both of those are editable in the app. Rename one and the seed
 * stops recognising it, decides it is missing, and creates it again. That is
 * not a lost edit; it is a phantom row. For a member it is worse still: the
 * ghost arrives with the shared default password and can be signed into.
 *
 * A marker fixes it: written the first time the row is ensured, checked ever
 * after. Renaming is then invisible to the seed, which is the point. Adding a
 * genuinely new name to one of these lists still works, because it has no
 * marker yet.
 */
async function seedOnce(kind: string, key: string, ensure: () => Promise<void>) {
  const marker = { kind: `seed-${kind}`, key }
  const seen = await prisma.tombstone.findUnique({
    where: { kind_key: { kind: marker.kind, key: marker.key } },
  })
  if (seen) return false
  await ensure()
  await prisma.tombstone.create({ data: marker })
  return true
}

async function main() {
  const defaultPassword = await bcrypt.hash('FluxoAdmin2026!', 10)
  const adminPassword   = await bcrypt.hash('Fluxo-rSpNJNGb9c7prM', 10)

  // Stages
  const stages = [
    { id: 'todo',        label_en: 'To Do',           label_ar: 'افكار للتنفيذ',             phase: 'Intake',   owner_role: null,                terminal_flag: false, sort_order: 0 },
    { id: 'c-prog',      label_en: 'Writing',         label_ar: 'كتابة المحتوى',             phase: 'Content',  owner_role: null,                terminal_flag: false, sort_order: 1 },
    { id: 'c-final',     label_en: 'Content Review',  label_ar: 'مراجعة المحتوى',            phase: 'Content',  owner_role: 'Marketing Manager', terminal_flag: false, sort_order: 2 },
    { id: 'c-check',     label_en: 'Islam Check',     label_ar: 'موافقة نهائية على المحتوى', phase: 'Content',  owner_role: 'Managing Director', terminal_flag: false, sort_order: 3 },
    { id: 'r-design',    label_en: 'Ready to Design', label_ar: 'جاهز للتصميم',              phase: 'Design',   owner_role: null,                terminal_flag: false, sort_order: 4 },
    { id: 'd-prog',      label_en: 'Designing',       label_ar: 'تصميم',                     phase: 'Design',   owner_role: null,                terminal_flag: false, sort_order: 5 },
    { id: 'd-check',     label_en: 'Design Review',   label_ar: 'مراجعة التصميم',            phase: 'Design',   owner_role: 'Brand Director',    terminal_flag: false, sort_order: 6 },
    { id: 'final-check', label_en: 'Final Check',     label_ar: 'المراجعة النهائية',         phase: 'Ship',     owner_role: 'Marketing Manager', terminal_flag: false, sort_order: 7 },
    { id: 'ready-publish', label_en: 'Ready to Publish', label_ar: 'جاهز للنشر',              phase: 'Ship',     owner_role: null,                terminal_flag: false, sort_order: 8 },
    { id: 'scheduled',   label_en: 'Scheduled',       label_ar: 'مجدول',                     phase: 'Ship',     owner_role: null,                terminal_flag: false, sort_order: 9 },
    { id: 'publish',     label_en: 'Published',       label_ar: 'تم النشر',                  phase: 'Ship',     owner_role: null,                terminal_flag: true,  sort_order: 10 },
  ]
  for (const s of stages) {
    // create-only, like everything else here. Nothing in the app writes to
    // this table today, but a seed that asserts its values on every start is
    // one UI away from silently reverting them — and stage ownership is
    // exactly the kind of thing that gets changed deliberately.
    await prisma.stage.upsert({ where: { id: s.id }, update: {}, create: s })
  }

  // Brands
  // Emblems ship with the app (public/brands) — the Pipeline handoff §6 draws
  // the brand chips with real marks, and three of the four have artwork. The
  // Strategy Community has none in the handoff and falls back to its initial
  // on its own colour, which is what the reference does too.
  const brands = [
    { name: 'Forefront Consulting',    color: '#B4322F', logo_url: '/brands/forefront.png' },
    { name: 'Omnisight',               color: '#0E7C7B', logo_url: '/brands/omnisight.png' },
    { name: 'The Strategy Community',  color: '#7A5A2E', logo_url: null },
    { name: 'Islam Personal Branding', color: '#1E293B', logo_url: '/brands/islam.png' },
  ]
  for (const b of brands) {
    // create-only, and only once ever: colour, logo and description are edited
    // in Settings, and so is the name — which the upsert matches on.
    await seedOnce('brand', b.name, async () => {
      await prisma.brand.upsert({ where: { name: b.name }, update: {}, create: b })
    })
  }

  // Content types
  // Article, Report and Framework/Model: the Content Library's types (spec 009).
  const labels = ['Post', 'Video', 'Reel', 'Design', 'Email', 'Story', 'Deck', 'Other', 'Article', 'Report', 'Framework/Model']
  for (const label of labels) {
    await prisma.contentType.upsert({ where: { label }, update: {}, create: { label } })
  }

  // SLA config
  const slaStages = ['todo', 'c-prog', 'c-final', 'c-check', 'r-design', 'd-prog', 'd-check', 'final-check', 'ready-publish', 'scheduled', 'publish']
  const slaDays: Record<string, Record<string, number>> = {
    'todo':        { Post: 1, Video: 2, Reel: 2, Design: 1, Email: 1, Story: 1, Deck: 3, Other: 2 },
    'c-prog':      { Post: 2, Video: 4, Reel: 3, Design: 2, Email: 2, Story: 1, Deck: 5, Other: 3 },
    'c-final':     { Post: 1, Video: 1, Reel: 1, Design: 1, Email: 1, Story: 1, Deck: 2, Other: 1 },
    'c-check':     { Post: 1, Video: 2, Reel: 1, Design: 1, Email: 1, Story: 1, Deck: 2, Other: 1 },
    'r-design':    { Post: 1, Video: 2, Reel: 2, Design: 1, Email: 1, Story: 1, Deck: 2, Other: 2 },
    'd-prog':      { Post: 2, Video: 5, Reel: 4, Design: 3, Email: 2, Story: 1, Deck: 4, Other: 3 },
    'd-check':     { Post: 1, Video: 2, Reel: 2, Design: 1, Email: 1, Story: 1, Deck: 2, Other: 1 },
    'final-check': { Post: 1, Video: 1, Reel: 1, Design: 1, Email: 1, Story: 1, Deck: 1, Other: 1 },
    'ready-publish': { Post: 1, Video: 1, Reel: 1, Design: 1, Email: 1, Story: 1, Deck: 1, Other: 1 },
    'scheduled':   { Post: 2, Video: 2, Reel: 2, Design: 2, Email: 2, Story: 2, Deck: 2, Other: 2 },
    'publish':     { Post: 0, Video: 0, Reel: 0, Design: 0, Email: 0, Story: 0, Deck: 0, Other: 0 },
  }
  // The spec 009 types start from Post's thresholds until an admin tunes them.
  for (const stage_id of slaStages) {
    for (const label of ['Article', 'Report', 'Framework/Model']) slaDays[stage_id][label] = slaDays[stage_id].Post
  }
  for (const stage_id of slaStages) {
    for (const [label, days] of Object.entries(slaDays[stage_id] ?? {})) {
      // create-only: the SLA matrix is tuned in Settings, and updating here
      // threw that tuning away on every deploy.
      await prisma.slaConfig.upsert({
        where:  { stage_id_content_type_label: { stage_id, content_type_label: label } },
        update: {},
        create: { stage_id, content_type_label: label, max_business_days: days },
      })
    }
  }

  // Members (initial team with default password)
  const members = [
    { name: 'Raneem',                       email: 'raneem.sarhaan@forefront.consulting', role: 'Marketing Manager',    access: 'admin',     capacity_hrs_wk: 40, status: 'Available' },
    { name: 'Islam',                        email: 'islam@forefront.consulting',   role: 'Managing Director',           access: 'superuser', capacity_hrs_wk: 20, status: 'Busy' },
    { name: 'Brand Director',               email: 'brand@forefront.consulting',   role: 'Brand Director',              access: 'superuser', capacity_hrs_wk: 35, status: 'Busy' },
    { name: 'Digital Marketing Specialist', email: 'dms@forefront.consulting',     role: 'Digital Marketing Specialist',access: 'superuser', capacity_hrs_wk: 40, status: 'Available' },
    { name: 'Content Creator',              email: 'content@forefront.consulting', role: 'Content Creator',             access: 'user',      capacity_hrs_wk: 40, status: 'Available' },
    { name: 'Graphic Designer',             email: 'design@forefront.consulting',  role: 'Graphic Designer',            access: 'user',      capacity_hrs_wk: 40, status: 'Available' },
    { name: 'Video Editor',                 email: 'video@forefront.consulting',   role: 'Video Editor',                access: 'user',      capacity_hrs_wk: 40, status: 'Available' },
  ]
  // Accounts removed in the app. The seed runs on every container start and
  // re-creates whatever is missing, which is exactly what made a removed
  // member come back after a deploy.
  const removedEmails = new Set(
    (await prisma.tombstone.findMany({ where: { kind: 'member' }, select: { key: true } }))
      .map(t => t.key),
  )

  for (const m of members) {
    if (removedEmails.has(m.email)) {
      console.log(`  – skipping ${m.email} — removed in the app`)
      continue
    }
    // The admin account gets its own password; the rest still share the
    // default until they are rotated (HANDOVER §14).
    //
    // Once ever, keyed on the seeded address. Change someone's email in the
    // app and the plain upsert would create a second account at the old one,
    // carrying that shared default password — a working sign-in nobody made.
    const password_hash = m.access === 'admin' ? adminPassword : defaultPassword
    await seedOnce('member', m.email, async () => {
      await prisma.member.upsert({
        where:  { email: m.email },
        update: {},
        create: { ...m, password_hash },
      })
    })
  }

  // Seniority levels — what each rung costs.
  //
  // `update: {}` on purpose: the rates are meant to be tuned in Settings, and
  // this file runs on every container start. A blanket update would reset an
  // admin's tuning on each deploy.
  const levels = [
    { key: 'junior', label: 'Junior', effort_factor: 1.8, supervision_rate: 0.25, sort_order: 0 },
    { key: 'mid',    label: 'Mid',    effort_factor: 1.0, supervision_rate: 0.0,  sort_order: 1 },
    { key: 'senior', label: 'Senior', effort_factor: 1.0, supervision_rate: 0.0,  sort_order: 2 },
  ]
  for (const l of levels) {
    await prisma.seniorityLevel.upsert({ where: { key: l.key }, update: {}, create: l })
  }

  // One-time milestone backfill.
  //
  // The plan importer flags a milestone when it creates a step, which does
  // nothing for the 327 steps that already exist — the feature would ship with
  // an empty tile on the only deployment that has data. Backfilling is safe
  // *because the column is new*: every value is still the default, so there is
  // no admin intent to overwrite yet.
  //
  // It must happen exactly once, or unflagging a step by hand would be undone
  // on the next deploy. The marker row is the guard.
  await once('milestone-backfill', 'flagged existing steps as milestones', async () => {
    const steps = await prisma.projectStep.findMany({ select: { id: true, name: true } })
    const hits = steps.filter(s => looksLikeMilestone(s.name)).map(s => s.id)
    if (hits.length) {
      await prisma.projectStep.updateMany({ where: { id: { in: hits } }, data: { milestone: true } })
    }
    return `${hits.length} steps`
  })

  /**
   * Owner and assignee used to be one column.
   *
   * Everything that existed before the split meant "the person whose task
   * this is", so every row's assignee starts as its owner. Guarded by once()
   * rather than run every deploy: a task deliberately left unassigned must
   * stay unassigned, and an unguarded backfill would hand it straight back to
   * the owner on the next container start.
   */
  await once('assignee-backfill', 'gave existing tasks an assignee', async () => {
    // Raw SQL because this copies one column into another, which updateMany
    // cannot express.
    const rows = await prisma.$executeRawUnsafe(
      'UPDATE tasks SET assignee_id = task_owner_id WHERE assignee_id IS NULL',
    )
    return `${rows} tasks`
  })

  /**
   * Release safety (user, 25 Nov 2026): the one-time steps below rewrite some existing values in
   * place (stages of clips and linked rows, due dates, priority Medium → Normal, where the Video
   * sheet's own columns belong, which projects are themes). Before any of them runs, the old values
   * are copied into kept exports (Settings › Diagnostics › Kept exports), so nothing is lost.
   */
  await once('before-release-snapshot-v1', 'kept a copy of the values the one-time steps rewrite', async () => {
    const { snapshotBeforeRelease } = await import('../src/lib/release-snapshot')
    const r = await snapshotBeforeRelease(prisma)
    return `${r.tasks} tasks, ${r.columns} sheet columns, ${r.projects} projects, ${r.types} task types`
  })

  /**
   * Spec 021 (research R3): the four team Spaces, with members started from
   * their job roles. Admins edit membership afterwards, so this runs once —
   * a later role change must not move anyone, and a Space an admin renamed
   * must not come back.
   */
  await once('spaces-v1', 'created the team Spaces and their members', async () => {
    const defs = [
      { key: 'content',  name: 'Content',  color: '#3B82F6', is_production: false, default_kind: 'pipeline', sort_order: 0 },
      { key: 'design',   name: 'Design',   color: '#7C3AED', is_production: true,  default_kind: 'pipeline', sort_order: 1 },
      { key: 'video',    name: 'Video',    color: '#0E9F9A', is_production: true,  default_kind: 'pipeline', sort_order: 2 },
      { key: 'planning', name: 'Planning', color: '#0EA5E9', is_production: false, default_kind: 'simple',   sort_order: 3 },
    ]
    for (const d of defs) await prisma.teamSpace.upsert({ where: { key: d.key }, update: {}, create: d })
    const spaces = await prisma.teamSpace.findMany({ select: { id: true, key: true } })
    const idOf = Object.fromEntries(spaces.map(x => [x.key, x.id]))
    const members = await prisma.member.findMany({ select: { id: true, role: true } })
    const rows = members.flatMap(m => (ROLE_SPACES[m.role] ?? []).filter(k => idOf[k]).map(k => ({ space_id: idOf[k], member_id: m.id })))
    if (rows.length) await prisma.teamSpaceMember.createMany({ data: rows, skipDuplicates: true })
    return `${spaces.length} Spaces, ${rows.length} memberships`
  })

  /**
   * Spec 021 (FR-008): every existing task gets its starting Shows in list.
   * Creates rows only (skipDuplicates), so running it twice changes nothing,
   * and no task's stage, owner, dates or SLA clock is touched.
   */
  await once('task-spaces-v1', 'gave every task its starting team Spaces', async () => {
    const before = await prisma.task.count()
    const spaces = (await prisma.teamSpace.findMany()).map(x => ({ ...x, archived_at: x.archived_at }))
    const members = membersBySpace(await prisma.teamSpaceMember.findMany({ select: { space_id: true, member_id: true } }))
    const tasks = await prisma.task.findMany({
      select: { id: true, status: true, nine_stage: true, kind: true, content_type_label: true, assignee_id: true },
    })
    const rows = tasks.flatMap(t => startingSpaces(t, spaces, members).map(space_id => ({ task_id: t.id, space_id, added_via: 'migration' })))
    for (let i = 0; i < rows.length; i += 1000) {
      await prisma.taskSpace.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true })
    }
    const after = await prisma.task.count()
    if (after !== before) throw new Error(`task count changed during task-spaces-v1: ${before} → ${after}`)
    return `${rows.length} rows for ${tasks.length} tasks`
  })

  /**
   * Spec 022 (FR-001, R16): every task is a pipeline task. Simple tasks move
   * to To Do, C-In Progress or Published; To Do and C-In Progress start their
   * SLA today. Marked migrated_simple: no celebration, not a new post in the
   * brand Library or Calendar. No notifications. The kind columns stay.
   */
  await once('simple-to-pipeline-v1', 'made every simple task a pipeline task', async () => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const base = { kind: 'pipeline', simple_status: null, migrated_simple: true, updated_at: new Date() }
    const todo = await prisma.task.updateMany({ where: { kind: 'simple', OR: [{ simple_status: 's-todo' }, { simple_status: null }] }, data: { ...base, status: 'todo', stage_date: today } })
    const doing = await prisma.task.updateMany({ where: { kind: 'simple', simple_status: 's-doing' }, data: { ...base, status: 'c-prog', stage_date: today } })
    const done = await prisma.task.updateMany({ where: { kind: 'simple', simple_status: 's-done' }, data: { ...base, status: 'publish' } })
    const left = await prisma.task.count({ where: { kind: 'simple' } })
    if (left) throw new Error(`simple-to-pipeline-v1 left ${left} simple tasks`)
    return `${todo.count} to To Do, ${doing.count} to C-In Progress, ${done.count} to Published`
  })

  /** Spec 022 (R9): each Space's default assignee role; Design and Video are the media boards. */
  await once('space-default-roles-v1', 'set default assignees and media boards', async () => {
    const roles: Record<string, string> = { content: 'Content Creator', design: 'Graphic Designer', video: 'Video Editor' }
    let n = 0
    for (const [key, role] of Object.entries(roles)) {
      const r = await prisma.teamSpace.updateMany({ where: { key, default_assignee_role: null }, data: { default_assignee_role: role } })
      n += r.count
    }
    await prisma.teamSpace.updateMany({ where: { key: 'design' }, data: { media_board: 'design' } })
    await prisma.teamSpace.updateMany({ where: { key: 'video' }, data: { media_board: 'video' } })
    return `${n} Spaces`
  })

  /** Spec 022 (R6): Video and Reel go to the Video board at Ready For Design; every other type to Design. */
  await once('content-type-boards-v1', 'set the media boards per content type', async () => {
    const v = await prisma.contentType.updateMany({ where: { label: { in: ['Video', 'Reel'] } }, data: { media_boards: ['video'] } })
    const d = await prisma.contentType.updateMany({ where: { label: { notIn: ['Video', 'Reel'] } }, data: { media_boards: ['design'] } })
    return `${v.count} to Video, ${d.count} to Design`
  })

  /**
   * Spec 022 (R1, R5) made a linked Design or Video task for every hand-off already made. By the
   * user's decision of 25 Nov 2026 the release creates none: nothing is created for published work,
   * and a content task in the design stages (Ready For Design, D-In Progress, D-Check) that has no
   * linked task is an error to fix by hand after go-live. They are listed live in Settings ›
   * Diagnostics ("Needs a linked task") and kept as a CSV here. No task and no "shows in" row is
   * created, changed or removed by this step.
   */
  await once('media-tasks-v1', 'listed the hand-offs that need a linked task (none created)', async () => {
    const { needsLinkedTask } = await import('../src/lib/needs-linked-task')
    const rows = await needsLinkedTask(prisma)
    const cell = (v: unknown) => { const x = v == null ? '' : String(v); return /[",\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x }
    const content = ['task id,name,stage,brand,type,board it needs', ...rows.map(r => [r.id, r.name, r.status, r.brand ?? '', r.type ?? '', r.board].map(cell).join(','))].join('\r\n') + '\r\n'
    await prisma.dataExport.upsert({
      where: { name: 'needs-linked-task.csv' },
      create: { name: 'needs-linked-task.csv', title: 'Content tasks in the design stages with no linked Design or Video task, at the release of 25 Nov 2026', content, rows: rows.length },
      update: {},
    })
    return `${rows.length} content tasks need a linked task`
  })

  /**
   * Publishing and due dates (spec 022 R15; was scripts/due-dates-migrate.ts):
   * Content pieces' planned dates (due_date) become publishing dates and get a
   * due date from the rule; every other due date is kept as set by hand; a
   * publishing date with no due date gets one. Skipped where it already ran
   * (due_dates_migrated_at is set).
   */
  await once('due-dates-v1', 'moved planned dates to publishing dates and marked due dates', async () => {
    const ws = await prisma.workspaceSettings.findUnique({ where: { id: 1 } })
    if (ws?.due_dates_migrated_at) return 'already migrated'
  const rule = ruleFromSettings(ws)

    const themes = new Set((await prisma.project.findMany({ where: { is_theme: true }, select: { id: true } })).map(p => p.id))
    const tasks = await prisma.task.findMany({
      select: { id: true, project_id: true, parent_task_id: true, kind: true, status: true, content_type_label: true, due_date: true, publish_date: true, stage_date: true },
    })
    const videos = new Set(tasks.filter(t => t.content_type_label === 'Video' && !t.parent_task_id).map(t => t.id))
    const isPiece = (t: typeof tasks[number]) =>
      !!t.project_id && themes.has(t.project_id) && t.kind !== 'simple' && !(t.parent_task_id && videos.has(t.parent_task_id))

    let pieces = 0, manual = 0, calculated = 0
    for (const t of tasks) {
      const due = dayOf(t.due_date), publish = dayOf(t.publish_date)
      if (isPiece(t) && due && !publish) {
        if (t.status === 'publish') {
          await prisma.task.update({ where: { id: t.id }, data: { publish_date: t.stage_date ?? dayDate(due), due_manual: true } })
        } else {
          // Owner's decision, 24 Nov 2026: the old due date stays as it is, marked set by hand; the planned
          // date is also the publishing date. (The rule would have moved it 7 days earlier.)
          await prisma.task.update({ where: { id: t.id }, data: { publish_date: dayDate(due), due_manual: true } })
        }
        pieces++
      } else if (due) {
        await prisma.task.update({ where: { id: t.id }, data: { due_manual: true } })
        manual++
      } else if (publish) {
        await prisma.task.update({ where: { id: t.id }, data: { due_date: dayDate(calcDueDate(publish, rule)), due_manual: false } })
        calculated++
      }
    }
    await prisma.workspaceSettings.upsert({
      where: { id: 1 },
      update: { due_dates_migrated_at: new Date() },
      create: { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false, due_dates_migrated_at: new Date() },
    })
    return `${pieces} Content pieces moved to publishing dates, ${manual} kept as set by hand, ${calculated} calculated`
  })

  /**
   * Spec 022 (R8): status words become Space stages. Per Space and original
   * stage, one Space stage named by the first word, the other words as
   * aliases. Content and Video take theirs from their sheet's stage words.
   * Stages with no words need no row: they show the original name.
   */
  await once('space-stages-v1', 'turned status words into Space stages', async () => {
    const spaces = await prisma.teamSpace.findMany({ select: { id: true, key: true, words: true } })
    const sheets = await prisma.sheet.findMany({ where: { linked_key: { in: ['linked_content', 'linked_video'] } }, select: { linked_key: true, view: true } })
    let n = 0
    for (const sp of spaces) {
      if (await prisma.spaceStage.count({ where: { space_id: sp.id } })) continue
      const lk = sp.key === 'content' ? 'linked_content' : sp.key === 'video' ? 'linked_video' : null
      const view = (lk ? sheets.find(x => x.linked_key === lk)?.view : null) as { words?: { stage?: Record<string, string[]> }; show?: string } | null
      const words = lk ? (view?.show === 'board' ? {} : view?.words?.stage ?? {}) : ((sp.words ?? {}) as Record<string, string[]>)
      const rows = stagesFromWords(words).filter(r => r.name)
      if (!rows.length) continue
      await prisma.spaceStage.createMany({ data: rows.map(r => ({ space_id: sp.id, ...r })) })
      n += rows.length
    }
    return `${n} named Space stages`
  })

  /**
   * User, 2026-11-23: a linked row's Status follows its linked tasks. Rows already
   * linked take it now: the earliest stage among the linked tasks that haven't
   * passed D-Check, else F-Check (linked tasks past D-Check then follow it).
   */
  await once('content-follows-media-v1', 'set linked rows to their linked tasks’ stage', async () => {
    const order = ['todo', 'c-prog', 'c-final', 'c-check', 'r-design', 'd-prog', 'd-check', 'final-check', 'ready-publish', 'scheduled', 'publish']
    const media = await prisma.task.findMany({ where: { content_task_id: { not: null }, media_board: { not: null }, dropped_at: null }, select: { id: true, status: true, content_task_id: true } })
    const ids = [...new Set(media.map(m => m.content_task_id!))]
    let n = 0
    for (const id of ids) {
      const c = await prisma.task.findUnique({ where: { id }, select: { id: true, status: true, dropped_at: true, media_board: true } })
      if (!c || c.dropped_at || c.media_board) continue
      const mine = media.filter(m => m.content_task_id === id)
      let stage = contentStageFrom(mine) ?? (order.indexOf(c.status) < order.indexOf('final-check') ? 'final-check' : c.status)
      if (stage !== c.status) {
        await prisma.task.update({ where: { id }, data: { status: stage, stage_date: new Date(), auto_linked_at: new Date() } })
        n++
      }
      const follow = mine.filter(m => passedDCheck(m) && m.status !== stage && order.indexOf(stage) >= order.indexOf('final-check'))
      if (follow.length) await prisma.task.updateMany({ where: { id: { in: follow.map(m => m.id) } }, data: { status: stage } })
    }
    return `${n} of ${ids.length} linked rows moved`
  })

  /** Spec 023 (R1): content types become task types — an Arabic name, an icon, a colour and an order. */
  await once('task-types-v1', 'gave task types their Arabic names, icons and colours', async () => {
    const types = await prisma.contentType.findMany({ orderBy: { label: 'asc' } })
    let i = 0
    for (const t of types) {
      const look = STARTING_LOOKS[t.label]
      await prisma.contentType.update({ where: { id: t.id }, data: { position: i++, ...(look ? { icon: look.icon, color: look.color, name_ar: t.name_ar ?? look.ar } : {}) } })
    }
    return `${types.length} types`
  })

  // Spec 023 (user, 2026-11-23): the content fields. Channels sits in the panel's top rows;
  // Caption above the Description and TOV (Text on Visual) below it, both required before C-Review.
  await once('content-fields-v1', 'added Caption, Channels and TOV to the content task types', async () => {
    const norm = (x: string) => x.trim().toLowerCase()
    const live = await prisma.taskField.findMany({ where: { retired_at: null } })
    const make = async (name_en: string, name_ar: string, kind: string, options: object, position: number) =>
      live.find(f => norm(f.name_en) === norm(name_en))
      ?? await prisma.taskField.create({ data: { name_en, name_ar, kind, options, position } })
    const caption = await make('Caption', 'الكابشن', 'text', { place: 'above' }, 0)
    const channels = await make('Channels', 'القنوات', 'multi', { place: 'top', choices: [
      { id: 'instagram', en: 'Instagram', ar: 'إنستغرام', color: '#D6409F' }, { id: 'facebook', en: 'Facebook', ar: 'فيسبوك', color: '#3E7BEA' },
      { id: 'linkedin', en: 'LinkedIn', ar: 'لينكدإن', color: '#1E9E8A' }, { id: 'tiktok', en: 'TikTok', ar: 'تيك توك', color: '#4A5061' },
      { id: 'x', en: 'X', ar: 'إكس', color: '#6B7280' }, { id: 'youtube', en: 'YouTube', ar: 'يوتيوب', color: '#D22040' },
    ] }, 1)
    const tov = await make('TOV', 'النص على التصميم', 'text', { place: 'below', hint: { en: 'Text on Visual · one line per slide', ar: 'النص على التصميم · سطر لكل شريحة' } }, 2)
    const types = new Set((await prisma.contentType.findMany({ select: { label: true } })).map(t => t.label))
    const plan: [string, string, string | null, number][] = []
    for (const type of ['Post', 'Reel', 'Story']) plan.push([type, caption.id, 'c-final', 0], [type, channels.id, null, 1], [type, tov.id, 'c-final', 2])
    plan.push(['Video', caption.id, 'c-final', 0], ['Video', channels.id, null, 1])
    let n = 0
    for (const [type_label, field_id, required_from, position] of plan) {
      if (!types.has(type_label)) continue
      await prisma.taskTypeField.upsert({ where: { type_label_field_id: { type_label, field_id } }, update: {}, create: { type_label, field_id, required_from, position } })
      n++
    }
    return `${n} attachments`
  })

  // Spec 023 (D7): Medium is now called Normal.
  await once('priority-normal-v1', 'renamed priority Medium to Normal', async () => {
    const t = await prisma.task.updateMany({ where: { priority: 'Medium' }, data: { priority: 'Normal' } })
    await prisma.contentType.updateMany({ where: { default_priority: 'Medium' }, data: { default_priority: 'Normal' } })
    return `${t.count} tasks`
  })

  // Spec 024 (§8): the Video Space's own stage names, when it has none yet.
  await once('video-stage-names-v1', 'named the Video Space stages Editing, Edit Review and Final Cut', async () => {
    const video = await prisma.teamSpace.findUnique({ where: { key: 'video' } })
    if (!video) return 'no Video Space'
    if (await prisma.spaceStage.count({ where: { space_id: video.id } })) return 'already named'
    const names: [string, string][] = [['d-prog', 'Editing'], ['d-check', 'Edit Review'], ['final-check', 'Final Cut']]
    await prisma.spaceStage.createMany({ data: names.map(([stage_id, name]) => ({ space_id: video.id, stage_id, name, position: 0 })) })
    return `${names.length} names`
  })

  // Spec 024 (§8): clips still at To Do start where the Video Space starts — Ready For Design on the Video board.
  await once('clips-to-video-v1', 'moved clips at To Do to Ready For Design on the Video board', async () => {
    const { moveTodoClips } = await import('../src/lib/space-settings-server')
    return `${await moveTodoClips(prisma)} clips`
  })

  // Spec 025: short brand names for the sidebar, where a brand has none yet.
  await once('brand-short-names-v1', 'gave brands their short sidebar names', async () => {
    const names: Record<string, string> = { 'Forefront Consulting': 'Forefront', 'Islam Personal Branding': 'Islam Saadany', 'The Strategy Community': 'TSC' }
    let n = 0
    for (const [name, short_name] of Object.entries(names)) n += (await prisma.brand.updateMany({ where: { name, short_name: null }, data: { short_name } })).count
    return `${n} brands`
  })

  // Spec 026 (§8): one sheet per Space — the Content sheet's rows get their Space, the clip details are
  // exported and kept, and each video becomes a linked row with its clips as child rows on the Video sheet.
  await once('sheet-spaces-v1', 'converted the Content and Video sheets to one sheet per Space', async () => {
    const { convertSheets } = await import('../src/lib/sheet-convert')
    const r = await convertSheets(prisma)
    return `${r.backfilled} rows and themes placed, ${r.exported} clip details exported, ${r.videos} videos and ${r.clips} clips as rows, ${r.themes} themes`
  })

  // The old Sheets section's two folders (owner's decision, 24 Nov 2026): "TSC Calendar" becomes the
  // workbook of a new Space, Digital Media, tagged with the brand The Strategy Community; "Marketing
  // Projects" is deleted, a CSV of each sheet kept first. Any other folder of that section stays as it is.
  await once('old-sheet-folders-v1', 'moved TSC Calendar to the Digital Media Space and deleted Marketing Projects', async () => {
    const { placeOldSheetFolders } = await import('../src/lib/sheet-convert')
    const r = await placeOldSheetFolders(prisma)
    return `${r.moved} sheets moved (${r.tagged} tagged), ${r.deleted} sheets deleted (${r.exported} kept as CSV)`
  })

  // Owner's decision, 25 Nov 2026 (after go-live): the in-flight design work moves to the Design and
  // Video boards. (On the live app this step ran once, the morning of 25 Nov, and made linked copies;
  // the next step folds them back. Where it hasn't run yet, it puts the tasks themselves on the boards.)
  await once('media-tasks-v2', 'gave the in-flight design work its linked Design and Video tasks', async () => {
    const { linkInFlight } = await import('../src/lib/needs-linked-task')
    const r = await linkInFlight(prisma)
    return `${r.made} tasks put on the boards (${r.design} Design, ${r.video} Video)`
  })

  // Owner's decision, 25 Nov 2026: no copies. Every linked Design or Video task is folded back into its
  // content task (comments, files, followers, people and the rest move to it), which joins that board
  // and stays in Content; then the copy is deleted.
  await once('media-merge-v1', 'folded the linked Design and Video copies back into their tasks', async () => {
    const { mergeLinkedMedia } = await import('../src/lib/needs-linked-task')
    const r = await mergeLinkedMedia(prisma)
    const what = Object.entries(r.moved).map(([k, n]) => `${n} ${k}`).join(', ')
    return `${r.merged} copies folded back${what ? ` (moved: ${what})` : ''}`
  })

  // Fields clean-up (owner's approval, 25 Nov 2026, after the read-only report): Platform is copied into
  // an empty Channels (LinkedIn → LinkedIn). Channels already set is left alone; Platform stays.
  await once('platform-to-channels-v1', 'copied Platform into empty Channels', async () => {
    const { platformToChannels } = await import('../src/lib/fields-cleanup')
    const r = await platformToChannels(prisma)
    return `${r.copied} tasks given their Platform as Channels${r.noMatch ? `, ${r.noMatch} with no matching choice left as they were` : ''}`
  })

  // Owner, 25 Nov 2026: no subtasks. Every subtask and every video's clip becomes a task of its own (only
  // its parent link goes; everything else about it stays), under its theme and pillar like any task.
  await once('subtasks-to-tasks-v1', 'turned subtasks and clips into tasks of their own', async () => {
    const { subtasksToTasks } = await import('../src/lib/subtasks-to-tasks')
    const r = await subtasksToTasks(prisma)
    return `${r.converted} are tasks now (${r.clips} of them clips)${r.boardsAdded ? `; ${r.boardsAdded} put on their parent's boards` : ''}${r.themed ? `; ${r.themed} took a theme (their parent's or their sheet row's)` : ''}${r.rowsFreed ? `; ${r.rowsFreed} sheet rows out from under their parent` : ''}; ${r.linksKept} keep their old parent as a Task link`
  })

  // QA 25 Nov 2026 (F01): every member who isn't an admin belongs to a Space. The first Spaces step knew
  // only four job titles, so on production one person got a Space and everyone else saw "404".
  await once('space-members-v2', 'gave every member without a Space the Spaces of their title', async () => {
    const { giveMissingSpaces } = await import('../src/lib/space-members')
    const r = await giveMissingSpaces(prisma)
    return `${r.members} members, ${r.rows} memberships added`
  })
  {
    // The release check: list anyone still without a Space (an admin adds them in Space settings).
    const { membersWithoutSpace } = await import('../src/lib/space-members')
    const left = await membersWithoutSpace(prisma)
    if (left.length) console.log(`  ⚠ ${left.length} member(s) have no Space and will see none: ${left.map(m => `${m.name} (${m.role})`).join(', ')}`)
    else console.log('  ✓ every member who isn\'t an admin has at least one Space')
  }

  // Workspace settings
  await prisma.workspaceSettings.upsert({
    where:  { id: 1 },
    update: {},
    create: { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false },
  })

  console.log('✅ Seed complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
