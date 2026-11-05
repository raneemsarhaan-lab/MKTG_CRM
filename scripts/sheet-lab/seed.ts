/**
 * Seed the local database with the sheet lab's video and clips, for the
 * running-app checks (spec 008 quickstart §3, T004).
 *
 *   npx tsx scripts/sheet-lab/seed.ts
 *
 * Idempotent: everything it makes carries an external_id starting
 * "sheet-lab:", and is deleted and made again on every run. Clips are assigned
 * to whoever in the local team holds the matching role.
 */
import { PrismaClient } from '@prisma/client'
import { CLIPS, DRIVE } from './fixtures'
import { parseClipFileName } from '../../src/lib/clip-file-name'

const prisma = new PrismaClient()
const PREFIX = 'sheet-lab:'

async function main() {
  const members = await prisma.member.findMany()
  const byRole = (re: RegExp) => members.find(m => re.test(m.role))
  const manager = byRole(/marketing manager/i)
  const editor  = byRole(/video editor/i) ?? manager
  const writer  = byRole(/content/i) ?? manager
  const motion  = byRole(/design|motion/i) ?? editor
  if (!manager || !editor || !writer || !motion) throw new Error('Seed the team first: no Marketing Manager in members')
  const brand = await prisma.brand.findFirst({ orderBy: { name: 'asc' } })

  // Clear the previous run (clips first: a deleted video would orphan them).
  const old = await prisma.task.findMany({ where: { external_id: { startsWith: PREFIX } }, select: { id: true, parent_task_id: true } })
  await prisma.task.deleteMany({ where: { id: { in: old.filter(t => t.parent_task_id).map(t => t.id) } } })
  await prisma.task.deleteMany({ where: { id: { in: old.filter(t => !t.parent_task_id).map(t => t.id) } } })

  const today = new Date()
  const daysAgo = (n: number) => new Date(Date.now() - n * 864e5)
  const video = await prisma.task.create({
    data: {
      external_id: `${PREFIX}v1`, name: 'Strategy Execution and Leadership', brand_id: brand?.id, content_type_label: 'Video',
      task_owner_id: manager.id, assignee_id: editor.id, initiator_role: manager.role, status: 'd-prog',
      stage_date: daysAgo(2), priority: 'High', created_by: manager.id,
      attachments: { create: { filename: 'Google Drive', url: DRIVE, content_type: 'text/uri-list', uploaded_by: manager.id } },
    },
  })
  const who: Record<string, string> = { lina: editor.id, omar: motion.id, sara: writer.id }
  for (const [i, [file, title, status, assignee, pub, dropped]] of CLIPS.entries()) {
    const p = parseClipFileName(file)!
    await prisma.task.create({
      data: {
        external_id: `${PREFIX}c${i + 1}`, name: title, parent_task_id: video.id, brand_id: brand?.id,
        content_type_label: 'Reel', task_owner_id: writer.id, assignee_id: assignee ? who[assignee] ?? null : null,
        initiator_role: writer.role, status, stage_date: daysAgo(5), published_url: pub,
        dropped_at: dropped ? daysAgo(1) : null, created_by: writer.id, created_at: new Date(today.getTime() - (100 - i) * 60_000),
        clip: { create: { video_id: video.id, clip_no: p.clip_no, source: p.source, file_name: file, in_ms: p.in_ms, out_ms: p.out_ms } },
        attachments: { create: { filename: 'Google Drive', url: DRIVE, content_type: 'text/uri-list', uploaded_by: writer.id } },
      },
    })
  }
  await prisma.task.create({
    data: {
      external_id: `${PREFIX}v3`, name: 'Founder Interview', brand_id: brand?.id, content_type_label: 'Video',
      task_owner_id: manager.id, initiator_role: manager.role, status: 'todo', created_by: manager.id,
    },
  })
  const n = await prisma.task.count({ where: { external_id: { startsWith: PREFIX } } })
  console.log(`seeded ${n} tasks: video ${video.id}`)
}

main().finally(() => prisma.$disconnect())
