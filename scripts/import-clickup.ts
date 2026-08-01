/**
 * ClickUp → Fluxo task import.
 *
 * Reads data/clickup-export.csv and upserts every row as a Fluxo task, keyed
 * on the ClickUp task ID in `external_id`. Safe to run repeatedly: a second run
 * updates the same rows rather than creating duplicates, so it can live in the
 * startup path alongside the seed.
 *
 * Mapping decisions were agreed with the owner:
 *
 *   Brand    A brand name in the task title wins (TSC / Strategy Community,
 *            Omnisight, Forefront / FFNT, Islam Personal Branding / IPB).
 *            Otherwise the CONTENT list maps to Forefront Consulting.
 *            Anything else is left with no brand.
 *   Owner    Assignees are matched by name; the people in the export who are
 *            not yet members are created without a password, so they can hold
 *            work but cannot sign in until one is set. Multi-assignee rows take
 *            the first. Unassigned rows go to the admin.
 *   Due date Published tasks keep no due date — they are history. Tasks still
 *            in flight get one derived from the stage SLA.
 *   Status   ClickUp statuses map onto the pipeline; 'ready to publish' and
 *            'scheduled' are stages in their own right.
 *
 * Not imported: ClickUp's parent/subtask hierarchy (Fluxo is flat), tags,
 * time tracking, checklists and comments.
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const prisma = new PrismaClient()

const CSV_PATH = join(process.cwd(), 'data', 'clickup-export.csv')

// ─── CSV parsing ─────────────────────────────────────────────────────────────
// Hand-rolled because the export embeds commas, quotes and newlines in fields.

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }

  const header = rows.shift()
  if (!header) return []
  return rows
    .filter(r => r.length > 1)
    .map(r => Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, ''), r[i] ?? ''])))
}

// ─── Mappings ────────────────────────────────────────────────────────────────

export const STATUS_TO_STAGE: Record<string, string> = {
  'to do':              'todo',
  'c-in progress':      'c-prog',
  'c-final':            'c-final',
  'c-check by islam':   'c-check',
  't-check by yussef':  'c-check',   // no separate technical check in Fluxo
  'ready for design':   'r-design',
  'd-in progress':      'd-prog',
  'd-check':            'd-check',
  'final check':        'final-check',
  'ready to publish':   'ready-publish',
  'scheduled':          'scheduled',
  'published':          'publish',
}

export const BRAND_PATTERNS: [RegExp, string][] = [
  [/\btsc\b|strategy community/i,   'The Strategy Community'],
  [/omnisight/i,                    'Omnisight'],
  [/forefront|\bffnt\b/i,           'Forefront Consulting'],
  [/islam personal|\bipb\b/i,       'Islam Personal Branding'],
]

/** ClickUp priority: 1 urgent, 2 high, 3 normal, 4 low. */
const PRIORITY: Record<string, string> = { '1': 'High', '2': 'High', '3': 'Medium', '4': 'Low' }

export function parseAssignees(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  if (!inner) return []
  return inner.split(',').map(s => s.trim()).filter(Boolean)
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let left = days
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return d
}

// ─── Import ──────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.log('▶ No ClickUp export at data/clickup-export.csv — skipping import.')
    return
  }

  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'))
  console.log(`▶ Importing ${rows.length} ClickUp tasks...`)

  const admin = await prisma.member.findFirst({ where: { access: 'admin' } })
  if (!admin) throw new Error('No admin member — run the seed first.')

  const brands = await prisma.brand.findMany()
  const brandByName = new Map(brands.map(b => [b.name, b.id]))

  const slaRows = await prisma.slaConfig.findMany()
  const slaFor = (stage: string) =>
    slaRows.find(r => r.stage_id === stage && r.content_type_label === 'Other')?.max_business_days ?? 2

  // Members: match by name, create anyone missing without a password.
  const members = await prisma.member.findMany()
  const memberByName = new Map(members.map(m => [m.name.toLowerCase(), m.id]))

  const csvNames = new Set<string>()
  for (const r of rows) parseAssignees(r['Assignees']).forEach(n => csvNames.add(n))

  for (const name of csvNames) {
    if (memberByName.has(name.toLowerCase())) continue
    const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@forefront.consulting`
    const created = await prisma.member.upsert({
      where:  { email },
      update: {},
      create: {
        name, email,
        role: 'Team Member',
        access: 'user',
        capacity_hrs_wk: 40,
        status: 'Available',
        password_hash: null,       // cannot sign in until a password is set
      },
    })
    memberByName.set(name.toLowerCase(), created.id)
    console.log(`  + member: ${name}`)
  }

  let created = 0, updated = 0, skipped = 0
  const unmapped = new Set<string>()

  for (const r of rows) {
    const externalId = r['Task ID']?.trim()
    const name       = r['Task Name']?.trim()
    if (!externalId || !name) { skipped++; continue }

    const stage = STATUS_TO_STAGE[r['Status']?.trim().toLowerCase()]
    if (!stage) { unmapped.add(r['Status']); skipped++; continue }

    // Brand: title match first, then the CONTENT list, else none.
    let brandId: string | null = null
    for (const [pattern, brandName] of BRAND_PATTERNS) {
      if (pattern.test(name)) { brandId = brandByName.get(brandName) ?? null; break }
    }
    if (!brandId && r['List Name']?.trim() === 'CONTENT') {
      brandId = brandByName.get('Forefront Consulting') ?? null
    }

    const assignees = parseAssignees(r['Assignees'])
    const ownerId   = (assignees.length && memberByName.get(assignees[0].toLowerCase())) || admin.id

    const createdMs = Number(r['Date Created'])
    const stageDate = Number.isFinite(createdMs) && createdMs > 0 ? new Date(createdMs) : new Date()

    // Published work is history and carries no deadline at all — including the
    // 53 rows that do have a ClickUp due date. Keeping those would mark them
    // Overdue, since the date is in the past and the task is already done.
    // Live work keeps its real date, or gets one derived from the stage SLA.
    let dueDate: Date | null = null
    if (stage !== 'publish') {
      const dueMs = Number(r['Due Date'])
      dueDate = Number.isFinite(dueMs) && dueMs > 0
        ? new Date(dueMs)
        : addBusinessDays(stageDate, slaFor(stage))
    }

    const data = {
      name,
      description:    r['Task Content']?.trim() || null,
      brand_id:       brandId,
      task_owner_id:  ownerId,
      initiator_role: 'Marketing Manager',
      nine_stage:     false,
      status:         stage,
      stage_date:     stageDate,
      due_date:       dueDate,
      hours_estimate: 0,
      priority:       PRIORITY[r['Priority']?.trim()] ?? 'Medium',
      created_by:     admin.id,
    }

    const existing = await prisma.task.findUnique({ where: { external_id: externalId } })
    if (existing) {
      await prisma.task.update({ where: { external_id: externalId }, data })
      updated++
    } else {
      await prisma.task.create({ data: { ...data, external_id: externalId } })
      created++
    }
  }

  console.log(`✅ Import complete — ${created} created, ${updated} updated, ${skipped} skipped.`)
  if (unmapped.size) console.log(`   Unmapped statuses: ${[...unmapped].join(', ')}`)
}

// Only run when executed directly, so the mappings above can be imported
// and exercised without touching the database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch(e => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
