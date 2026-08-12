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

/** The only ClickUp list this tool tracks. */
export const KEEP_LIST = 'ALL MEDIA'

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

/** ClickUp's Attachments column is a JSON array of { title, url }. */
export function parseAttachments(raw: string): { title: string; url: string }[] {
  const text = (raw ?? '').trim()
  if (!text || text === '[]') return []
  try {
    const list = JSON.parse(text) as { title?: string; url?: string }[]
    return list
      .filter(a => a && (a.title || a.url))
      .map(a => ({ title: a.title ?? 'attachment', url: a.url ?? '' }))
  } catch {
    return []
  }
}

export function parseAssignees(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  if (!inner) return []
  return inner.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * ClickUp writes newlines inside Task Content as the two characters `\` and
 * `n`, not as real line breaks — 4,247 of them across this export, plus 6
 * escaped quotes. Stored verbatim they render as visible "\n" through the
 * middle of every brief, which is what "the description was corrupted" was.
 *
 * Only \n, \r, \t, \" and \\ appear in practice; anything else is left
 * alone rather than silently swallowing a real backslash.
 */
export function unescapeClickUp(text: string): string {
  return text.replace(/\\([nrt"\\])/g, (_, ch) => {
    switch (ch) {
      case 'n':  return '\n'
      case 'r':  return '\r'
      case 't':  return '\t'
      default:   return ch      // \" → "   and   \\ → \
    }
  })
}

/**
 * Escape the Markdown syntax in text that was never Markdown.
 *
 * The plain-text briefs are literal prose, but they are stored in a Markdown
 * column and rendered by a Markdown renderer, which quietly reinterprets them.
 * Measured across the export:
 *
 *   13 separator lines of dashes are swallowed as horizontal rules — and every
 *      one of them follows a line of text, so that line becomes a setext H2.
 *      "Caption:" followed by ------- rendered as a page-wide heading.
 *   83 lines that begin "1. " lose their own numbering to the renderer's,
 *      which renumbers from 1 regardless of what the author wrote.
 *    5 lines lose asterisks or underscores to emphasis.
 *
 * Escaping is deliberately narrow: only constructs that would actually change
 * meaning. Over-escaping would fill the editor with backslashes for no gain,
 * and these briefs are now editable by hand.
 */
export function escapeMarkdown(text: string): string {
  return text.split('\n').map(line => {
    // Block constructs, which only matter at the start of a line.
    let out = line
      .replace(/^(\s*)([-+*])(\s)/,        (_, s, c, t) => `${s}\\${c}${t}`)  // bullet
      .replace(/^(\s*)(\d{1,9})([.)])(\s)/, (_, s, n, c, t) => `${s}${n}\\${c}${t}`) // ordered
      .replace(/^(\s*)(#{1,6})(\s|$)/,     (_, s, h, t) => `${s}\\${h}${t}`)  // heading
      .replace(/^(\s*)(>)/,                (_, s, c) => `${s}\\${c}`)         // quote
      .replace(/^(\s*)(\|)/,               (_, s, c) => `${s}\\${c}`)         // table row

    // A line that is nothing but rule characters — or a run of = or - directly
    // under text, which promotes that text to a heading.
    if (/^\s{0,3}([-_*=]\s*){3,}$/.test(out) || /^\s{0,3}[-=]+\s*$/.test(out)) {
      out = out.replace(/([-_*=])/, '\\$1')
    }

    // Inline marks, escaped only where they could actually fire. A lone
    // asterisk or backtick is inert, and "[SALMA]" is a bracket, not a link —
    // escaping those would add backslashes to 36 briefs for nothing.
    const pair = (ch: string) => (out.split(ch).length - 1) >= 2
    if (pair('*')) out = out.replace(/\*/g, '\\*')
    if (pair('_')) out = out.replace(/_/g, '\\_')
    if (pair('`')) out = out.replace(/`/g, '\\`')
    if (out.includes('~~')) out = out.replace(/~/g, '\\~')
    if (/\]\(/.test(out)) out = out.replace(/\[/g, '\\[')
    out = out.replace(/<(?=[a-zA-Z/!?])/g, '\\<')

    return out
  }).join('\n')
}

/**
 * Task Content arrives in two shapes, and both rendered as garbage when stored
 * verbatim — this is what "the description was corrupted" meant.
 *
 *  210 rows  plain text whose newlines are the two characters \ and n
 *   20 rows  Quill Delta rich text as raw JSON
 *
 * Both are converted to Markdown, which the task panel renders. The Delta rows
 * carry real structure worth keeping: 26 H3s, 8 H2s, 54 bullets, 115 bold runs,
 * blockquotes, links and images.
 */

interface DeltaOp {
  insert?: unknown
  attributes?: Record<string, unknown>
}


/** Wrap a run of text in its inline marks. Whitespace stays outside the
 *  markers, or Markdown will not close the emphasis. */
function inlineMd(text: string, attrs: Record<string, unknown>): string {
  if (!text) return ''
  const lead  = text.match(/^\s*/)?.[0] ?? ''
  const trail = text.match(/\s*$/)?.[0] ?? ''
  let core = text.slice(lead.length, text.length - trail.length)
  if (!core) return text

  if (attrs.bold)   core = `**${core}**`
  if (attrs.italic) core = `*${core}*`
  if (typeof attrs.link === 'string') core = `[${core}](${attrs.link})`
  return lead + core + trail
}

/**
 * Quill Delta → Markdown.
 *
 * Delta is line-oriented in an unusual way: block formatting (heading level,
 * list type, blockquote) is carried by the *newline* that ends a line, not by
 * the line's own text. So text is buffered until a newline arrives, and that
 * newline's attributes decide how the buffered line is emitted.
 */
export function deltaToMarkdown(ops: DeltaOp[]): string {
  const out: string[] = []
  let line = ''

  const flush = (attrs: Record<string, unknown>) => {
    const content = line.trim()
    line = ''

    const header = typeof attrs.header === 'number' ? attrs.header : 0
    const list   = attrs.list as { list?: string } | string | undefined
    const listKind =
      typeof list === 'string' ? list :
      list && typeof list === 'object' ? list.list : undefined

    if (!content) { out.push(''); return }
    if (header)            out.push(`${'#'.repeat(Math.min(header, 6))} ${content}`)
    else if (listKind === 'ordered') out.push(`1. ${content}`)
    else if (listKind)     out.push(`- ${content}`)
    else if (attrs.blockquote) out.push(`> ${content}`)
    // A plain line gets a Markdown hard break, or adjacent lines collapse
    // into one paragraph — ClickUp treats each as its own line.
    else                   out.push(`${content}  `)
  }

  for (const op of ops) {
    const attrs = op.attributes ?? {}

    if (typeof op.insert !== 'string') {
      // Embeds. Images, dividers, links and attachment names carry meaning
      // and become Markdown; table-embed is a reference to rows stored
      // elsewhere in the export and has no content to recover, so it is
      // dropped rather than rendered as an empty table.
      const embed = op.insert as Record<string, unknown> | null
      if (embed && typeof embed === 'object') {
        if ('image' in embed && typeof embed.image === 'string') {
          line += `![](${embed.image})`
        } else if ('divider' in embed) {
          flush({}); out.push('---')
        } else if ('link_mention' in embed) {
          const url = (embed.link_mention as { url?: string })?.url
          if (url) line += `[${url}](${url})`
        } else if ('attachment' in embed) {
          const name = (embed.attachment as { name?: string })?.name
          if (name) line += `📎 ${name}`
        }
      }
      continue
    }

    const parts = op.insert.split('\n')
    parts.forEach((part, i) => {
      if (i > 0) flush(attrs)          // the newline that ended the previous line
      line += inlineMd(part, attrs)
    })
  }
  if (line.trim()) flush({})

  // Collapse runs of blank lines, and keep list items adjacent.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function decodeContent(raw: string): string {
  const text = (raw ?? '').trim()
  if (!text) return ''

  if (text.startsWith('{') && text.includes('"ops"')) {
    try {
      const delta = JSON.parse(text) as { ops?: DeltaOp[] }
      // Return whatever the Delta yields, even nothing: two briefs contain
      // only a newline, and treating empty as a parse failure would fall
      // through and store the raw JSON instead.
      return deltaToMarkdown(delta.ops ?? [])
    } catch {
      // Not the Delta shape after all — treat it as text.
    }
  }

  // Plain text: escape it so the renderer shows it verbatim, then give every
  // newline a hard break — a single newline is not a break in Markdown, and
  // without this a brief written as separate lines reads as a run-on.
  return escapeMarkdown(unescapeClickUp(text)).replace(/\n/g, '  \n')
}

/**
 * What `decodeContent` produced before the escaping fix.
 *
 * Kept solely so a re-import can recognise its own earlier output and repair
 * it. A brief that still matches this byte for byte has not been touched by
 * anyone, so it is safe to rewrite; anything else has been edited in the app
 * and is left alone.
 */
export function decodeContentLegacy(raw: string): string {
  const text = (raw ?? '').trim()
  if (!text) return ''
  if (text.startsWith('{') && text.includes('"ops"')) {
    try {
      const delta = JSON.parse(text) as { ops?: DeltaOp[] }
      return deltaToMarkdown(delta.ops ?? [])
    } catch { /* fall through */ }
  }
  return unescapeClickUp(text).replace(/\n/g, '  \n')
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

  const allRows = parseCsv(readFileSync(CSV_PATH, 'utf8'))

  // Only the ALL MEDIA list belongs in this tool. The export also carries a
  // CONTENT list, which was imported originally and is not wanted.
  const rows  = allRows.filter(r => r['List Name']?.trim() === KEEP_LIST)
  const drop  = allRows.filter(r => r['List Name']?.trim() !== KEEP_LIST)
  console.log(`▶ Importing ${rows.length} tasks from "${KEEP_LIST}" (${drop.length} rows in other lists ignored)...`)

  // Anything this script imported from another list is removed. Keyed on the
  // export's own ids, so it can only ever delete rows this import created —
  // a task made in the app has no external_id and is never touched.
  const dropIds = drop.map(r => r['Task ID']?.trim()).filter((v): v is string => Boolean(v))
  if (dropIds.length) {
    const removed = await prisma.task.deleteMany({ where: { external_id: { in: dropIds } } })
    if (removed.count > 0) console.log(`  – removed ${removed.count} previously imported tasks from other lists`)
  }

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

  // People an admin removed in the app. Both keys are needed: this loop finds
  // people by display name and creates them by email, and either one may be
  // the thing that matches.
  const memberTombs = await prisma.tombstone.findMany({
    where: { kind: { in: ['member', 'member-name'] } },
    select: { kind: true, key: true },
  })
  const deadEmails = new Set(memberTombs.filter(t => t.kind === 'member').map(t => t.key))
  const deadNames  = new Set(memberTombs.filter(t => t.kind === 'member-name').map(t => t.key))

  for (const name of csvNames) {
    if (memberByName.has(name.toLowerCase())) continue
    const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@forefront.consulting`

    if (deadNames.has(name.toLowerCase()) || deadEmails.has(email)) {
      console.log(`  – skipping "${name}" — removed in the app`)
      continue
    }

    // The loop above matches on display name, but the account is keyed by
    // email — "Raneem Sarhaan" in the export and "Raneem S." in the app derive
    // the same address and are the same person. Look the address up before
    // creating, so an existing account is reused and, just as importantly, the
    // log stops announcing "+ member" for people who were already here.
    const existing = await prisma.member.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      memberByName.set(name.toLowerCase(), existing.id)
      continue
    }

    const made = await prisma.member.create({
      data: {
        name, email,
        role: 'Team Member',
        access: 'user',
        capacity_hrs_wk: 40,
        status: 'Available',
        password_hash: null,       // cannot sign in until a password is set
      },
    })
    memberByName.set(name.toLowerCase(), made.id)
    console.log(`  + member: ${name}`)
  }

  let created = 0, updated = 0, skipped = 0, attached = 0, repaired = 0
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
    // The CONTENT list used to default to Forefront Consulting. It is no
    // longer imported, so that rule has nothing left to match and is gone.

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
      description:    decodeContent(r['Task Content']).trim() || null,
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
    let taskId: string
    if (existing) {
      // This script runs on every container start, so a blanket update would
      // reset the board on each deploy: a task advanced through stages,
      // reassigned, re-dated or whose brief was edited would silently snap back
      // to whatever the ClickUp export said. Those fields belong to the app
      // once a task exists.
      //
      // Two things still happen on a re-run. Genuinely absent data is filled
      // in, and a description that is still byte-for-byte what a previous
      // import wrote is repaired — that is how the escaping fix reaches the
      // 210 briefs already in the database without touching an edited one.
      const patch: Record<string, unknown> = {}

      const pristine =
        (existing.description ?? '') === decodeContentLegacy(r['Task Content']).trim() ||
        (existing.description ?? '') === (data.description ?? '')
      if (pristine && (existing.description ?? '') !== (data.description ?? '')) {
        patch.description = data.description
        repaired++
      }
      if (existing.brand_id === null && data.brand_id) patch.brand_id = data.brand_id

      if (Object.keys(patch).length > 0) {
        await prisma.task.update({ where: { external_id: externalId }, data: patch })
        updated++
      }
      taskId = existing.id
    } else {
      const t = await prisma.task.create({ data: { ...data, external_id: externalId } })
      taskId = t.id
      created++
    }

    // Attachments are replaced wholesale rather than merged: the export is the
    // source of truth for them, and TaskAttachment has no external key to
    // upsert on, so merging would duplicate on every re-run. The set is
    // compared first so an unchanged task is not rewritten on every boot.
    const files   = parseAttachments(r['Attachments'])
    const current = await prisma.taskAttachment.findMany({ where: { task_id: taskId } })
    const key = (l: { filename: string; url: string | null }[]) =>
      l.map(f => `${f.filename} ${f.url ?? ''}`).sort().join('')

    if (key(current) !== key(files.map(f => ({ filename: f.title, url: f.url || null })))) {
      await prisma.taskAttachment.deleteMany({ where: { task_id: taskId } })
      if (files.length) {
        await prisma.taskAttachment.createMany({
          data: files.map(f => ({ task_id: taskId, filename: f.title, url: f.url || null })),
        })
        attached += files.length
      }
    }
  }

  console.log(`✅ Import complete — ${created} created, ${updated} updated (${repaired} briefs repaired), ${skipped} skipped, ${attached} attachments written.`)
  if (unmapped.size) console.log(`   Unmapped statuses: ${[...unmapped].join(', ')}`)
}

// Only run when executed directly, so the mappings above can be imported
// and exercised without touching the database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch(e => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
