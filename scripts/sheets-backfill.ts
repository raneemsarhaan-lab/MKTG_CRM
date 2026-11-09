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
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
