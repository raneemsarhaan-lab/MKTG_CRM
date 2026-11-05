/**
 * Seed the local database for the Content sheet's running-app checks
 * (spec 009 quickstart §2): the seven board tasks the reference rows link to,
 * with their real ids, and no Strategy or Newsjacking theme yet. Writes the
 * reference rows as Google Sheets HTML for the check script to paste.
 *
 *   npx tsx scripts/sheet-lab/seed-content.ts <out-file.html>
 */
import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { LINKED, referenceHtml } from './content-fixtures'

const prisma = new PrismaClient()

async function main() {
  const members = await prisma.member.findMany()
  const admin = members.find(m => m.access === 'admin')!
  const designer = members.find(m => /design/i.test(m.role)) ?? admin
  // Start clean: the two themes and everything the last run pasted into them.
  const themes = await prisma.project.findMany({ where: { name: { in: ['Strategy', 'Newsjacking'] } } })
  await prisma.task.deleteMany({ where: { project_id: { in: themes.map(t => t.id) }, id: { notIn: Object.keys(LINKED) } } })
  await prisma.project.deleteMany({ where: { id: { in: themes.map(t => t.id) } } })
  for (const [id, v] of Object.entries(LINKED)) {
    const data = {
      name: v.name, status: v.status, content_type_label: /Post/.test(v.name) ? 'Post' : 'Report',
      task_owner_id: admin.id, assignee_id: designer.id, initiator_role: admin.role, project_id: null, pillar_id: null,
      stage_date: new Date(), dropped_at: null, post_url: null, published_url: null,
    }
    await prisma.task.upsert({ where: { id }, update: data, create: { id, ...data, hours_estimate: 0, priority: 'Medium', created_by: admin.id } })
    await prisma.taskAttachment.deleteMany({ where: { task_id: id, link_role: { not: null } } })
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2], referenceHtml())
  console.log('seeded 7 linked tasks; themes cleared')
}
main().finally(() => prisma.$disconnect())
