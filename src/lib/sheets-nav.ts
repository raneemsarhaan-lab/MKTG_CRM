/**
 * The member's pinned folders for the sidebar (spec 013 FR-072, R10).
 * Server-only. Until the member has chosen, Content and Video are pinned.
 */
import { prisma } from '@/lib/prisma'
import type { PinnedFolder } from '@/types/index'

export async function loadPinnedFolders(member: { id: string; sheet_pins: string[]; sheet_pins_set: boolean }): Promise<PinnedFolder[]> {
  const folders = await prisma.sheetFolder.findMany({ select: { id: true, kind: true, name: true, _count: { select: { sheets: true } } } })
  const byId = new Map(folders.map(f => [f.id, f]))
  const ids = member.sheet_pins_set
    ? member.sheet_pins.filter(id => byId.has(id))
    : ['content', 'video'].map(k => folders.find(f => f.kind === k)?.id).filter((x): x is string => !!x)
  return ids.map(id => { const f = byId.get(id)!; return { id: f.id, kind: f.kind as PinnedFolder['kind'], name: f.name, sheetCount: f._count.sheets } })
}
