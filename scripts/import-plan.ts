import { PrismaClient } from '@prisma/client'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Load the Aspiring / Focus plan from data/projects-plan.json.
 *
 * Runs on every container start, so the rule that matters is this: a project
 * or step that already exists is left completely alone. The plan is going to
 * be edited in the app — dates revisited, brands assigned, steps ticked off —
 * and a deploy that quietly reverted that work would be worse than no import
 * at all. Only genuinely new keys are created.
 *
 * The same reasoning as the ClickUp importer, which learned it the hard way.
 */

const prisma = new PrismaClient()
const PLAN_PATH = join(process.cwd(), 'data', 'projects-plan.json')

interface PlanStep {
  key: string
  name: string
  duration_days: number
  due_date: string | null
  done: boolean
  assignee: string | null
}
interface PlanProject {
  key: string
  name: string
  brand: string | null
  standing: boolean
  due_date: string | null
  focus: boolean
  steps: PlanStep[]
}
interface Plan {
  people: [string, string, string, string][]
  projects: PlanProject[]
}

/** Brand names in the plan are shortened — "Forefront" is "Forefront Consulting". */
function matchBrand(planName: string | null, brands: { id: string; name: string }[]) {
  if (!planName) return null
  const want = planName.toLowerCase()
  const exact = brands.find(b => b.name.toLowerCase() === want)
  if (exact) return exact.id
  const partial = brands.find(b => b.name.toLowerCase().startsWith(want) || want.startsWith(b.name.toLowerCase()))
  return partial?.id ?? null
}

async function main() {
  if (!existsSync(PLAN_PATH)) {
    console.log('▶ No plan at data/projects-plan.json — skipping.')
    return
  }

  const plan: Plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'))
  const [brands, members] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, name: true } }),
    prisma.member.findMany({ select: { id: true, name: true } }),
  ])

  // "samaa" → the member whose name starts with it. The three short names in
  // the plan correspond to people already in the database.
  const memberByShort = new Map<string, string>()
  for (const [short] of plan.people) {
    const m = members.find(x => x.name.toLowerCase().startsWith(short.toLowerCase()))
    if (m) memberByShort.set(short, m.id)
    else console.log(`  ! no member matches "${short}" — those steps stay unassigned`)
  }

  const existing = new Set(
    (await prisma.project.findMany({ where: { key: { not: null } }, select: { key: true } }))
      .map(p => p.key!),
  )
  const existingSteps = new Set(
    (await prisma.projectStep.findMany({ where: { key: { not: null } }, select: { key: true } }))
      .map(s => s.key!),
  )

  // Projects and steps an admin deleted in the app. "Not in the database" and
  // "deleted on purpose" look identical from here, and creating whatever is
  // missing would undo the deletion on every deploy.
  const tombs = await prisma.tombstone.findMany({
    where: { kind: { in: ['project', 'step'] } },
    select: { kind: true, key: true },
  })
  const deadProjects = new Set(tombs.filter(t => t.kind === 'project').map(t => t.key))
  const deadSteps    = new Set(tombs.filter(t => t.kind === 'step').map(t => t.key))

  let created = 0, addedSteps = 0, skipped = 0, removed = 0

  for (const [i, p] of plan.projects.entries()) {
    if (deadProjects.has(p.key)) { removed++; continue }

    if (existing.has(p.key)) {
      // Already here and possibly edited. Only fill in steps that are new to
      // the plan, never touch the project row itself.
      const row = await prisma.project.findUnique({ where: { key: p.key }, select: { id: true } })
      if (row) {
        for (const [j, s] of p.steps.entries()) {
          if (existingSteps.has(s.key) || deadSteps.has(s.key)) continue
          await prisma.projectStep.create({
            data: {
              key: s.key, project_id: row.id, name: s.name,
              duration_days: s.duration_days,
              due_date: s.due_date ? new Date(s.due_date) : null,
              done: s.done,
              assignee_id: s.assignee ? memberByShort.get(s.assignee) ?? null : null,
              sort_order: j,
            },
          })
          addedSteps++
        }
      }
      skipped++
      continue
    }

    await prisma.project.create({
      data: {
        key: p.key, name: p.name,
        brand_id: matchBrand(p.brand, brands),
        standing: p.standing,
        due_date: p.due_date ? new Date(p.due_date) : null,
        focus: p.focus,
        sort_order: i,
        steps: {
          create: p.steps.filter(s => !deadSteps.has(s.key)).map((s, j) => ({
            key: s.key, name: s.name,
            duration_days: s.duration_days,
            due_date: s.due_date ? new Date(s.due_date) : null,
            done: s.done,
            assignee_id: s.assignee ? memberByShort.get(s.assignee) ?? null : null,
            sort_order: j,
          })),
        },
      },
    })
    created++
    addedSteps += p.steps.filter(s => !deadSteps.has(s.key)).length
  }

  const unbranded = await prisma.project.count({ where: { brand_id: null } })
  console.log(
    `✅ Plan loaded — ${created} projects created, ${skipped} already present, ` +
    `${addedSteps} steps added.` +
    (removed ? ` ${removed} project(s) skipped — removed in the app.` : '') +
    (unbranded ? ` ${unbranded} project(s) have no brand — set them under Unassigned.` : ''),
  )
}

main()
  .catch(e => { console.error('✖ Plan import failed:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
