import { prisma } from '@/lib/prisma'

/**
 * Spec 026 (§1): where a workbook lives now that there is no Sheets section — the Sheet view of its
 * Space, its brand's page or My tasks. Null for a folder of blank sheets made in the old Sheets
 * section (kind 'team'), which has no page of its own and still opens at `/sheets/<id>`.
 */
export async function folderHome(folderId: string): Promise<string | null> {
  const f = await prisma.sheetFolder.findUnique({ where: { id: folderId }, select: { kind: true, brand_id: true, linked_key: true } })
  if (!f) return null
  if (f.kind === 'content' || f.kind === 'video') return `/spaces/${f.kind}?view=sheet`
  if (f.kind === 'brand' && f.brand_id) return `/brands/${f.brand_id}?view=sheet&sheet=tasks`
  const node = /^node:(space|me):([0-9a-f-]{36})$/.exec(f.linked_key ?? '')
  if (node?.[1] === 'me') return '/me?view=sheet'
  if (node?.[1] === 'space') {
    const space = await prisma.teamSpace.findUnique({ where: { id: node[2] }, select: { key: true } })
    return space ? `/spaces/${space.key}?view=sheet` : null
  }
  return null
}
