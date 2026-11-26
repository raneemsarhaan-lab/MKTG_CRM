/**
 * QA 25 Nov 2026 (F01): every member who isn't an admin belongs to at least one Space. Admins see every
 * Space anyway. Only adds membership rows; never removes or changes one.
 */
import type { PrismaClient } from '@prisma/client'
import { startingSpacesFor } from './spaces'

type Db = Pick<PrismaClient, 'member' | 'teamSpace' | 'teamSpaceMember'>

/** Members (not admins) with no Space at all. */
export async function membersWithoutSpace(db: Db): Promise<{ id: string; name: string; role: string }[]> {
  return db.member.findMany({
    where: { access: { not: 'admin' }, space_memberships: { none: {} } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
}

/** Gives each member with no Space the Spaces of their title (else Content and Planning). */
export async function giveMissingSpaces(db: Db): Promise<{ members: number; rows: number }> {
  const spaces = await db.teamSpace.findMany({ where: { archived_at: null }, select: { id: true, key: true } })
  const idOf = new Map(spaces.map(s => [s.key, s.id]))
  const missing = await membersWithoutSpace(db)
  const rows = missing.flatMap(m => startingSpacesFor(m.role).map(k => idOf.get(k)).filter((x): x is string => !!x).map(space_id => ({ space_id, member_id: m.id })))
  if (rows.length) await db.teamSpaceMember.createMany({ data: rows, skipDuplicates: true })
  return { members: new Set(rows.map(r => r.member_id)).size, rows: rows.length }
}
