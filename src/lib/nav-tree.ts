/**
 * The sidebar's Me / Teams / Brands sections (spec 021, contracts/routes.md).
 * Server-only. Counts are open tasks: not published, not dropped, and — for
 * simple tasks — not done.
 *
 * Teams lists the Spaces the member belongs to; admins see every Space.
 */
import { prisma } from '@/lib/prisma'
import type { NavTree } from '@/types/index'
import { stagesHeldBy } from '@/lib/my-tasks'
import { cairoToday } from '@/lib/due-dates'

type NavMember = { id: string; access: string; role?: string }

const OPEN = {
  dropped_at: null,
  NOT: [{ status: 'publish' as const, kind: 'pipeline' }, { kind: 'simple', simple_status: 's-done' }],
}

export async function loadNavTree(member: NavMember): Promise<NavTree> {
  const admin = member.access === 'admin'
  // My tasks: assigned to me, or waiting in a review stage my role holds; and my open to-dos.
  const today = new Date(`${cairoToday()}T00:00:00Z`)
  const held = member.role ? stagesHeldBy(member.role) : []
  const MINE = { dropped_at: null, status: { not: 'publish' }, OR: [{ assignee_id: member.id }, ...(held.length ? [{ status: { in: held } }] : [])] }
  const [spaces, brands, byBrand, noBrand, bySpace, mine, mtOpen, mtLate, tdOpen, tdLate] = await Promise.all([
    prisma.teamSpace.findMany({
      where: { archived_at: null, ...(admin ? {} : { members: { some: { member_id: member.id } } }) },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: { id: true, key: true, name: true, color: true },
    }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    prisma.task.groupBy({ by: ['brand_id'], where: { ...OPEN, brand_id: { not: null } }, _count: { _all: true } }),
    prisma.task.count({ where: { ...OPEN, brand_id: null } }),
    prisma.taskSpace.groupBy({ by: ['space_id'], where: { task: OPEN }, _count: { _all: true } }),
    prisma.task.count({ where: { ...OPEN, OR: [{ assignee_id: member.id }, { task_owner_id: member.id }] } }),
    prisma.task.count({ where: MINE }),
    prisma.task.count({ where: { ...MINE, due_date: { lt: today } } }),
    prisma.todo.count({ where: { owner_id: member.id, done_at: null } }),
    prisma.todo.count({ where: { owner_id: member.id, done_at: null, day: { lt: today } } }),
  ])
  const brandOpen = new Map(byBrand.map(r => [r.brand_id, r._count._all]))
  const spaceOpen = new Map(bySpace.map(r => [r.space_id, r._count._all]))
  return {
    myOpen: mine,
    myTasks: { open: mtOpen + tdOpen, overdue: mtLate + tdLate },
    spaces: spaces.map(s => ({ ...s, open: spaceOpen.get(s.id) ?? 0 })),
    brands: brands.map(b => ({ ...b, open: brandOpen.get(b.id) ?? 0 })),
    noBrandOpen: noBrand,
  }
}
