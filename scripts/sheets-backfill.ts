/**
 * Spec 013 launch step (data-model §5), safe to run twice: the Content and
 * Video folders, each with its linked sheet first. Nothing else; members' pins
 * stay unset, which means the default (Content, then Video).
 *
 * listFolders() makes the same two folders on demand, so the Sheets home
 * never waits on this script; it exists so a fresh deploy has them at once.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const LINKED = [
  { folder: 'content', sheet: 'linked_content' },
  { folder: 'video', sheet: 'linked_video' },
] as const

async function main() {
  let made = 0
  for (const l of LINKED) {
    const folder = await prisma.sheetFolder.upsert({
      where: { linked_key: l.folder },
      create: { kind: l.folder, linked_key: l.folder },
      update: {},
    })
    const existing = await prisma.sheet.findUnique({ where: { linked_key: l.sheet } })
    if (!existing) {
      await prisma.sheet.create({ data: { folder_id: folder.id, kind: l.sheet, linked_key: l.sheet, position: 0 } })
      made++
    }
  }
  console.log(`  ✓ Sheets: linked folders ready${made ? ` (${made} created)` : ''}`)
  await videoLayout()
}

/**
 * The redesigned Video sheet (design/video-sheet-v2.html), once: saved
 * Video columns take the new order (Clip, Type, Stage, Owner, Reviewer, Due, In
 * stage, File, the link columns, Archive, then the clip details), custom columns after them. The new
 * columns' rows mark it done, so a later deploy leaves people's own order alone.
 */
const VIDEO_ORDER = ['title', 'type', 'status', 'editor', 'reviewer', 'due', 'inStage', 'files', 'doc', 'design', 'task', 'post', 'published', 'drop',
  'clipNo', 'source', 'fileName', 'in', 'out', 'length']
async function videoLayout() {
  const recs = await prisma.sheetColumn.findMany({ where: { sheet: 'video' }, orderBy: { position: 'asc' } })
  if (!recs.length || recs.some(r => r.key === 'post')) return
  const custom = recs.filter(r => !VIDEO_ORDER.includes(r.key))
  await prisma.$transaction([
    ...VIDEO_ORDER.map((key, i) => {
      const r = recs.find(x => x.key === key)
      return r
        ? prisma.sheetColumn.update({ where: { id: r.id }, data: { position: i } })
        : prisma.sheetColumn.create({ data: { sheet: 'video', key, position: i } })
    }),
    ...custom.map((r, i) => prisma.sheetColumn.update({ where: { id: r.id }, data: { position: VIDEO_ORDER.length + i } })),
  ])
  console.log('  ✓ Sheets: Video columns in the new order')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
