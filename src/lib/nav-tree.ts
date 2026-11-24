/**
 * The sidebar's My work / Spaces / Brands sections (spec 021, restructured in
 * spec 025). Server-only. A count is open tasks — not published, not dropped,
 * and for simple tasks not done — with how many of them are overdue.
 *
 * Spaces lists the Spaces the member can see (admins: every Space), each with
 * one folder per brand.
 */
import { prisma } from '@/lib/prisma'
import type { NavTree } from '@/types/index'
import { stagesHeldBy } from '@/lib/my-tasks'
import { cairoToday } from '@/lib/due-dates'
import { inRange, resolveSettings } from '@/lib/space-settings'

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
  const MINE = { dropped_at: null, status: { not: 'publish' }, OR: [{ assignee_id: member.id }, { assignees: { some: { member_id: member.id } } }, ...(held.length ? [{ status: { in: held } }] : [])] }
  const [spaces, brands, openTasks, inSpaces, mine, mtOpen, mtLate, tdOpen, tdLate, unread] = await Promise.all([
    prisma.teamSpace.findMany({
      // Spec 024 (§1): a Space set to "everyone" is seen by every member.
      where: { archived_at: null, ...(admin ? {} : { OR: [{ members: { some: { member_id: member.id } } }, { settings: { path: ['visibility'], equals: 'everyone' } }] }) },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: { id: true, key: true, name: true, color: true, media_board: true, settings: true },
    }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, short_name: true, color: true, logo_url: true } }),
    // Spec 025: one pass over the open tasks gives every count the sidebar shows.
    prisma.task.findMany({ where: OPEN, select: { id: true, brand_id: true, status: true, due_date: true, media_board: true, content_task_id: true, kind: true } }),
    prisma.taskSpace.findMany({ where: { task: OPEN }, select: { task_id: true, space_id: true } }),
    prisma.task.count({ where: { ...OPEN, OR: [{ assignee_id: member.id }, { task_owner_id: member.id }] } }),
    prisma.task.count({ where: MINE }),
    prisma.task.count({ where: { ...MINE, due_date: { lt: today } } }),
    prisma.todo.count({ where: { owner_id: member.id, done_at: null } }),
    prisma.todo.count({ where: { owner_id: member.id, done_at: null, day: { lt: today } } }),
    prisma.notification.count({ where: { recipient_id: member.id, read_at: null } }).catch(() => 0),
  ])
  const late = (t: { due_date: Date | null }) => !!t.due_date && t.due_date < today
  type N = { open: number; overdue: number }
  const add = (n: N, t: { due_date: Date | null }) => { n.open++; if (late(t)) n.overdue++ }
  const byId = new Map(openTasks.map(t => [t.id, t]))
  // Brands: every open task of the brand, linked media seen through its content task (as on the brand page).
  const brandN = new Map<string, N>()
  const noBrand: N = { open: 0, overdue: 0 }
  for (const t of openTasks) {
    if (t.media_board && t.content_task_id) continue
    if (!t.brand_id) { add(noBrand, t); continue }
    let n = brandN.get(t.brand_id); if (!n) brandN.set(t.brand_id, (n = { open: 0, overdue: 0 }))
    add(n, t)
  }
  // Spaces: what the Space page lists — its Shows in tasks, on its board or not linked media, inside its range.
  const info = new Map(spaces.map(sp => [sp.id, { board: sp.media_board === 'design' || sp.media_board === 'video' ? sp.media_board : null, flow: resolveSettings(sp.key, sp.settings).flow, all: { open: 0, overdue: 0 } as N, brands: new Map<string, N>() }]))
  for (const r of inSpaces) {
    const sp = info.get(r.space_id), t = byId.get(r.task_id)
    if (!sp || !t) continue
    if (sp.board ? t.media_board !== sp.board : !!(t.media_board && t.content_task_id)) continue
    if (t.kind !== 'simple' && !inRange(sp.flow, t.status)) continue
    add(sp.all, t)
    if (t.brand_id) { let n = sp.brands.get(t.brand_id); if (!n) sp.brands.set(t.brand_id, (n = { open: 0, overdue: 0 })); add(n, t) }
  }
  const short = (b: { name: string; short_name: string | null }) => b.short_name?.trim() || b.name
  return {
    myOpen: mine,
    myTasks: { open: mtOpen + tdOpen, overdue: mtLate + tdLate },
    inboxUnread: unread,
    spaces: spaces.map(sp => {
      const x = info.get(sp.id)!
      return {
        id: sp.id, key: sp.key, name: sp.name, color: sp.color, name_ar: resolveSettings(sp.key, sp.settings).name_ar,
        open: x.all.open, overdue: x.all.overdue,
        folders: brands.map(b => ({ id: b.id, name: short(b), color: b.color, open: x.brands.get(b.id)?.open ?? 0, overdue: x.brands.get(b.id)?.overdue ?? 0 })),
      }
    }),
    brands: brands.map(b => ({ id: b.id, name: short(b), full_name: b.name, color: b.color, logo_url: b.logo_url, open: brandN.get(b.id)?.open ?? 0, overdue: brandN.get(b.id)?.overdue ?? 0 })),
    noBrandOpen: noBrand.open,
    noBrandOverdue: noBrand.overdue,
  }
}
