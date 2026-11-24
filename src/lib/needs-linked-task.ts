import type { PrismaClient } from '@prisma/client'

/**
 * User, 25 Nov 2026: linked Design and Video tasks are not created automatically for work that was
 * already in flight at the release. A content task in the design stages with no linked task is an
 * error to fix by hand: open it and link or create its Design or Video task (its "Link task" cell
 * or panel). Published work is never listed. From F-Check on no new link is made, so those stages
 * aren't listed either.
 */
export const DESIGN_STAGES = ['r-design', 'd-prog', 'd-check']

export interface NeedsLink { id: string; name: string; status: string; brand: string | null; type: string | null; board: 'design' | 'video' }

export async function needsLinkedTask(db: PrismaClient): Promise<NeedsLink[]> {
  const [tasks, types] = await Promise.all([
    db.task.findMany({
      // A content task: not itself on a media board, not a clip of a video, live.
      where: { status: { in: DESIGN_STAGES }, dropped_at: null, media_board: null, clip: null, media_tasks: { none: { dropped_at: null } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, status: true, content_type_label: true, brand: { select: { name: true } } },
    }),
    db.contentType.findMany({ select: { label: true, media_boards: true } }),
  ])
  const boards = new Map(types.map(t => [t.label, t.media_boards]))
  return tasks.map(t => ({
    id: t.id, name: t.name, status: t.status, brand: t.brand?.name ?? null, type: t.content_type_label,
    board: (boards.get(t.content_type_label ?? '') ?? []).includes('video') ? 'video' as const : 'design' as const,
  }))
}
