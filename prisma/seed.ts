import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
  const labels = ['Post', 'Video', 'Reel', 'Design', 'Email', 'Story', 'Deck', 'Other']
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
