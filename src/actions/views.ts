'use server'

/**
 * Saved views (spec 021 FR-012a, contracts/server-actions.md): tabs that keep
 * a view type and its filters, group, sort and fields on a node.
 *   Shared   anyone may add one; the creator, an admin or a superuser may change it.
 *   Personal only its owner sees and changes it.
 * On a Space, only its members (or an admin or superuser) save views.
 */
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { cleanConfig, cleanTabPrefs, type TabPrefs } from '@/lib/view-config'
import { loadViews, validNode, VIEW_TYPES } from '@/lib/views-data'
import type { SavedView, ViewType } from '@/types/index'

type Fail = { success: false; error: 'not_authenticated' | 'not_authorized' | 'invalid' | 'not_found' }
type Who = { id: string; access: string }
const lead = (m: Who) => m.access === 'admin' || m.access === 'superuser'

async function mayUseNode(node: string, m: Who): Promise<boolean> {
  if (!validNode(node)) return false
  if (!node.startsWith('space:') || lead(m)) return true
  return !!(await prisma.teamSpaceMember.findFirst({ where: { space_id: node.slice(6, 42), member_id: m.id } }))
}
const mayChange = (v: { owner_id: string | null; created_by: string | null }, m: Who) =>
  v.owner_id ? v.owner_id === m.id : v.created_by === m.id || lead(m)

export async function listViews(node: string): Promise<{ success: true; views: SavedView[]; prefs: TabPrefs } | Fail> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  const all = (m.view_prefs ?? {}) as Record<string, unknown>
  return { success: true, views: await loadViews(node, m.id), prefs: cleanTabPrefs(all[node]) }
}

/** This member's home, pinned and hidden tabs on one page. Only ever their own. */
export async function setTabPrefs(node: string, prefs: TabPrefs): Promise<{ success: true; prefs: TabPrefs } | Fail> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!validNode(node)) return { success: false, error: 'invalid' }
  const clean = cleanTabPrefs(prefs)
  const all = { ...((m.view_prefs ?? {}) as Record<string, unknown>), [node]: clean }
  await prisma.member.update({ where: { id: m.id }, data: { view_prefs: all as object } })
  return { success: true, prefs: clean }
}

/**
 * This member's sort on one board ('board', 'space:<id>', 'brand:<id>', 'me').
 * Null goes back to the default (due date, earliest first) and forgets the choice.
 */
export async function setBoardSort(board: string, sort: string | null): Promise<{ success: true } | Fail> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (typeof board !== 'string' || !/^(board|me|(space|brand):[0-9a-f-]{36})$/.test(board)) return { success: false, error: 'invalid' }
  if (sort !== null && !['due', 'publish', 'priority', 'name', 'created', 'updated'].includes(sort)) return { success: false, error: 'invalid' }
  const row = await prisma.member.findUnique({ where: { id: m.id }, select: { board_sorts: true } })
  const all = { ...((row?.board_sorts ?? {}) as Record<string, string>) }
  if (sort === null) delete all[board]
  else all[board] = sort
  await prisma.member.update({ where: { id: m.id }, data: { board_sorts: all } })
  return { success: true }
}

export async function saveView(input: { id?: string; node: string; type: ViewType; name: string; config: unknown; personal: boolean }): Promise<{ success: true; id: string } | Fail> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  const name = String(input.name ?? '').trim()
  if (!name || name.length > 40 || !VIEW_TYPES.includes(input.type)) return { success: false, error: 'invalid' }
  if (!(await mayUseNode(input.node, m))) return { success: false, error: 'not_authorized' }
  const config = cleanConfig(input.config) as unknown as object
  if (input.id) {
    const v = await prisma.savedView.findUnique({ where: { id: input.id } })
    if (!v || v.node !== input.node) return { success: false, error: 'not_found' }
    if (!mayChange(v, m)) return { success: false, error: 'not_authorized' }
    await prisma.savedView.update({ where: { id: v.id }, data: { name, type: input.type, config, updated_at: new Date() } })
    return { success: true, id: v.id }
  }
  const last = await prisma.savedView.aggregate({ where: { node: input.node }, _max: { position: true } })
  const row = await prisma.savedView.create({
    data: { node: input.node, type: input.type, name, config, owner_id: input.personal ? m.id : null, created_by: m.id, position: (last._max.position ?? -1) + 1 },
  })
  return { success: true, id: row.id }
}

export async function deleteView(id: string): Promise<{ success: true } | Fail> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  const v = await prisma.savedView.findUnique({ where: { id } })
  if (!v) return { success: false, error: 'not_found' }
  if (!mayChange(v, m)) return { success: false, error: 'not_authorized' }
  await prisma.savedView.delete({ where: { id } })
  return { success: true }
}

/** A new tab order for the views this member sees on a node; views they may not change keep their place. */
export async function reorderViews(node: string, ids: string[]): Promise<{ success: true } | Fail> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  const seen = await prisma.savedView.findMany({ where: { node, OR: [{ owner_id: null }, { owner_id: m.id }] } })
  const byId = new Map(seen.map(v => [v.id, v]))
  if (ids.some(id => !byId.has(id))) return { success: false, error: 'invalid' }
  await prisma.$transaction(ids.map((id, i) => {
    const v = byId.get(id)!
    return mayChange(v, m) ? prisma.savedView.update({ where: { id }, data: { position: i } }) : prisma.savedView.findUnique({ where: { id } })
  }))
  return { success: true }
}
