'use server'

/**
 * Team Spaces (spec 021, contracts/server-actions.md). Admin-only, each
 * action checking for itself (HANDOVER ground rule 9). Tasks never live in a
 * Space, so nothing here touches a task: deleting a Space removes only its
 * Shows in rows.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdmin, requireTaskCreator } from '@/lib/authz'
import { cleanSpaceWords, findClash, linkedKeyOf, type Clash } from '@/lib/space-words'
import type { TaskKind } from '@/types/index'

type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

function revalidateSpaces(key?: string) {
  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  if (key) revalidatePath(`/spaces/${key}`)
}

const COLOR = /^#[0-9a-f]{6}$/i
const keyFrom = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'space'

export interface SpaceInput {
  name: string
  color: string
  is_production: boolean
  /** Spec 022: unused (every task is a pipeline task); kept so older callers compile. */
  default_kind?: TaskKind
  /** Spec 022 (R9): the role new tasks made in this Space go to; null for none. */
  default_assignee_role?: string | null
}

const cleanRole = (r: string | null | undefined) => (typeof r === 'string' && r.trim() ? r.trim().slice(0, 60) : null)

export async function createSpace(input: SpaceInput): Promise<Result<{ id: string; key: string }>> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const name = input.name.trim()
  if (!name || name.length > 60 || !COLOR.test(input.color)) return { success: false, error: 'invalid' }
  let key = keyFrom(name)
  for (let n = 2; await prisma.teamSpace.findUnique({ where: { key } }); n++) key = `${keyFrom(name)}-${n}`
  const last = await prisma.teamSpace.aggregate({ _max: { sort_order: true } })
  const row = await prisma.teamSpace.create({
    data: {
      key, name, color: input.color, is_production: !!input.is_production,
      default_assignee_role: cleanRole(input.default_assignee_role),
      sort_order: (last._max.sort_order ?? -1) + 1,
    },
  })
  revalidateSpaces(row.key)
  return { success: true, id: row.id, key: row.key }
}

export async function updateSpace(id: string, patch: Partial<SpaceInput & { sort_order: number }>): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const data: Record<string, unknown> = { updated_at: new Date() }
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name || name.length > 60) return { success: false, error: 'invalid' }
    data.name = name
  }
  if (patch.color !== undefined) {
    if (!COLOR.test(patch.color)) return { success: false, error: 'invalid' }
    data.color = patch.color
  }
  if (patch.is_production !== undefined) data.is_production = !!patch.is_production
  // Spec 022: applies to tasks created from now on.
  if (patch.default_assignee_role !== undefined) data.default_assignee_role = cleanRole(patch.default_assignee_role)
  if (patch.sort_order !== undefined) data.sort_order = Math.trunc(patch.sort_order)
  const row = await prisma.teamSpace.update({ where: { id }, data }).catch(() => null)
  if (!row) return { success: false, error: 'not_found' }
  revalidateSpaces(row.key)
  return { success: true }
}

/**
 * Spec 021 (US3): a Space's status words. Admins and superusers. Content and
 * Video keep theirs on their sheet (R5), so the sheet and the Space always
 * agree; every other Space keeps them on the Space. Ambiguous words are refused.
 */
export async function setSpaceWords(id: string, words: unknown): Promise<Result | { success: false; error: 'clash'; clash: Clash }> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const space = await prisma.teamSpace.findUnique({ where: { id } })
  if (!space || space.archived_at) return { success: false, error: 'not_found' }
  const clean = cleanSpaceWords(words)
  const clash = findClash(clean)
  if (clash) return { success: false, error: 'clash', clash }
  const linkedKey = linkedKeyOf(space.key)
  if (linkedKey) {
    // The sheet's stage words; its Type and Priority words are left as they are.
    const stage = Object.fromEntries(Object.entries(clean).filter(([k]) => !k.startsWith('s-')))
    const sheet = await prisma.sheet.findUnique({ where: { linked_key: linkedKey }, select: { id: true, view: true } })
    if (!sheet) return { success: false, error: 'not_found' }
    const view = { ...((sheet.view ?? {}) as Record<string, unknown>) }
    const all = { ...((view.words ?? {}) as Record<string, unknown>) }
    if (Object.keys(stage).length) all.stage = stage; else delete all.stage
    if (Object.keys(all).length) view.words = all; else delete view.words
    await prisma.sheet.update({ where: { id: sheet.id }, data: { view: view as object } })
    revalidatePath('/sheets')
  } else {
    await prisma.teamSpace.update({ where: { id }, data: { words: clean, updated_at: new Date() } })
  }
  revalidateSpaces(space.key)
  return { success: true }
}

/** Replace a Space's members. */
export async function setSpaceMembers(id: string, memberIds: string[]): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const space = await prisma.teamSpace.findUnique({ where: { id } })
  if (!space) return { success: false, error: 'not_found' }
  const ids = [...new Set(memberIds)]
  const known = await prisma.member.count({ where: { id: { in: ids } } })
  if (known !== ids.length) return { success: false, error: 'invalid' }
  await prisma.$transaction([
    prisma.teamSpaceMember.deleteMany({ where: { space_id: id, member_id: { notIn: ids } } }),
    prisma.teamSpaceMember.createMany({ data: ids.map(member_id => ({ space_id: id, member_id })), skipDuplicates: true }),
  ])
  revalidateSpaces(space.key)
  return { success: true }
}

export async function archiveSpace(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const row = await prisma.teamSpace.update({ where: { id }, data: { archived_at: new Date() } }).catch(() => null)
  if (!row) return { success: false, error: 'not_found' }
  revalidateSpaces(row.key)
  return { success: true }
}

export async function restoreSpace(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const row = await prisma.teamSpace.update({ where: { id }, data: { archived_at: null } }).catch(() => null)
  if (!row) return { success: false, error: 'not_found' }
  revalidateSpaces(row.key)
  return { success: true }
}

/** Only an archived Space, and only with its name typed back (FR-004). Tasks stay in their brands. */
export async function deleteSpace(id: string, confirmName: string): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const space = await prisma.teamSpace.findUnique({ where: { id } })
  if (!space) return { success: false, error: 'not_found' }
  if (!space.archived_at) return { success: false, error: 'not_archived' }
  if (confirmName.trim() !== space.name) return { success: false, error: 'confirm' }
  await prisma.teamSpace.delete({ where: { id } })
  revalidateSpaces()
  return { success: true }
}

/** Every Space, archived included, with members — for Settings. */
export async function listSpacesForSettings(): Promise<Result<{
  spaces: { id: string; key: string; name: string; color: string; is_production: boolean; default_assignee_role: string | null; archived: boolean; memberIds: string[] }[]
}>> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const rows = await prisma.teamSpace.findMany({ orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }], include: { members: { select: { member_id: true } } } })
  return {
    success: true,
    spaces: rows.map(r => ({
      id: r.id, key: r.key, name: r.name, color: r.color, is_production: r.is_production,
      default_assignee_role: r.default_assignee_role ?? null, archived: !!r.archived_at, memberIds: r.members.map(m => m.member_id),
    })),
  }
}
