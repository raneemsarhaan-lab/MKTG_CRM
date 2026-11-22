/**
 * Saved views' reads (spec 021 T039): a node's shared views plus the
 * member's own personal ones, in tab order. Not a server action file.
 */
import { prisma } from '@/lib/prisma'
import type { SavedView, ViewType } from '@/types/index'

export const VIEW_TYPES: ViewType[] = ['list', 'board', 'sheet', 'calendar', 'workload', 'files', 'gallery']
/** 'everything' | 'me' | 'space:<uuid>' | 'brand:<uuid>' | 'brand:<uuid>:<folder>' */
const NODE = /^(everything|me|space:[0-9a-f-]{36}|brand:[0-9a-f-]{36}(:(calendar|assets|sheet|library))?)$/
export const validNode = (node: string) => NODE.test(node)

export async function loadViews(node: string, memberId: string): Promise<SavedView[]> {
  if (!validNode(node)) return []
  const rows = await prisma.savedView.findMany({
    where: { node, OR: [{ owner_id: null }, { owner_id: memberId }] },
    orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
  })
  return rows.map(r => ({
    id: r.id, node: r.node, type: r.type as ViewType, name: r.name,
    config: (r.config ?? {}) as Record<string, unknown>, owner_id: r.owner_id, position: r.position,
    mine: r.created_by === memberId,
  }))
}
