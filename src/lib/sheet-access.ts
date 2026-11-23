/**
 * Who may use a sheet (spec 021 R6 + the spec 015 audit, 2026-11-23). Server-only.
 *
 * Most sheets are the team's: every signed-in member may open them. Two kinds
 * belong to someone:
 *   - My tasks (`tasks:me:<id>` and the `me:<id>` workbook's blank tabs): only that member;
 *   - a team Space's (`tasks:space:<id>` and the `space:<id>` workbook's tabs):
 *     its members, superusers and admins (as ensureNodeWorkbook decides).
 * Brand workbooks and the linked Content and Video sheets are open to all.
 */
import { prisma } from '@/lib/prisma'

type Who = { id: string; access: string }

/** A node key (`me:<id>`, `space:<id>`, `brand:<id>`) and whether `m` may use it. */
async function nodeAllowed(node: string | null | undefined, m: Who): Promise<boolean> {
  if (!node) return true
  const [kind, id] = node.split(':')
  if (kind === 'me') return id === m.id
  if (kind === 'space') {
    if (m.access === 'admin' || m.access === 'superuser') return true
    return !!(await prisma.teamSpaceMember.findFirst({ where: { space_id: id, member_id: m.id }, select: { member_id: true } }))
  }
  return true
}

/** The node a linked task sheet belongs to: `tasks:me:<id>` → `me:<id>`. */
const nodeOfLinked = (key: string | null | undefined) => (key && key.startsWith('tasks:') ? key.slice('tasks:'.length) : null)

/** Whether `m` may use the folder (its blank tabs). */
export async function mayUseFolder(folderId: string | null | undefined, m: Who): Promise<boolean> {
  if (!folderId) return true
  const f = await prisma.sheetFolder.findUnique({ where: { id: folderId }, select: { kind: true, linked_key: true } })
  if (!f) return true
  return f.kind === 'node' ? nodeAllowed(f.linked_key, m) : true
}

/** Whether `m` may use the sheet, given its id or linked key. Unknown sheets pass (the caller reports 'gone'). */
export async function mayUseSheet(idOrKey: string, m: Who): Promise<boolean> {
  const byKey = idOrKey === 'linked_content' || idOrKey === 'linked_video' || idOrKey.startsWith('tasks:')
  const s = await prisma.sheet.findUnique({ where: byKey ? { linked_key: idOrKey } : { id: idOrKey }, select: { linked_key: true, folder_id: true } })
    .catch(() => null)
  if (!s) return byKey ? nodeAllowed(nodeOfLinked(idOrKey), m) : true
  if (s.linked_key?.startsWith('tasks:')) return nodeAllowed(nodeOfLinked(s.linked_key), m)
  return mayUseFolder(s.folder_id, m)
}

/** Whether `m` may use every one of these sheets. */
export async function mayUseSheets(ids: string[], m: Who): Promise<boolean> {
  for (const id of ids) if (!(await mayUseSheet(id, m))) return false
  return true
}
