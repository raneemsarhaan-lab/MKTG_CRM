'use server'

/**
 * My tasks: personal to-dos (user, 2026-11-23). Private: every action reads and
 * changes only the signed-in member's own to-dos, so nobody else's ever leaves
 * the database for them.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { createTask } from '@/actions/tasks'
import type { Todo } from '@/types/index'

type Fail = { success: false; error: string }
const DAY = /^\d{4}-\d{2}-\d{2}$/
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+$/g, '').replace(/^\s+/, '').slice(0, max) : '')
const day = (v: unknown): Date | null | undefined => (v === null || v === '' ? null : typeof v === 'string' && DAY.test(v) ? new Date(`${v}T00:00:00Z`) : undefined)

export const toTodo = async (t: { id: string; name: string; note: string | null; day: Date | null; flagged: boolean; done_at: Date | null; created_at: Date }): Promise<Todo> => ({
  id: t.id, name: t.name, note: t.note, day: t.day ? t.day.toISOString().slice(0, 10) : null, flagged: t.flagged,
  done_at: t.done_at ? t.done_at.toISOString() : null, created_at: t.created_at.toISOString(),
})

async function mine(id: string) {
  const me = await getSessionMember()
  if (!me) return { me: null, todo: null }
  const todo = await prisma.todo.findFirst({ where: { id, owner_id: me.id } })
  return { me, todo }
}

export async function addTodo(input: { name: string; note?: string | null; day?: string | null; flagged?: boolean }): Promise<{ success: true; todo: Todo } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const name = clean(input.name, 200)
  if (!name) return { success: false, error: 'empty' }
  const d = day(input.day ?? null)
  if (d === undefined) return { success: false, error: 'bad_date' }
  const t = await prisma.todo.create({ data: { owner_id: me.id, name, note: clean(input.note, 2000) || null, day: d, flagged: !!input.flagged } })
  revalidatePath('/', 'layout')
  return { success: true, todo: await toTodo(t) }
}

export async function updateTodo(id: string, patch: { name?: string; note?: string | null; day?: string | null; flagged?: boolean }): Promise<{ success: true; todo: Todo } | Fail> {
  const { me, todo } = await mine(id)
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!todo) return { success: false, error: 'not_found' }
  const data: Record<string, unknown> = { updated_at: new Date() }
  if (patch.name !== undefined) { const n = clean(patch.name, 200); if (!n) return { success: false, error: 'empty' }; data.name = n }
  if (patch.note !== undefined) data.note = clean(patch.note, 2000) || null
  if (patch.day !== undefined) { const d = day(patch.day); if (d === undefined) return { success: false, error: 'bad_date' }; data.day = d }
  if (patch.flagged !== undefined) data.flagged = !!patch.flagged
  const t = await prisma.todo.update({ where: { id }, data })
  revalidatePath('/', 'layout')
  return { success: true, todo: await toTodo(t) }
}

/** Done (or back to open). */
export async function completeTodo(id: string, done: boolean): Promise<{ success: true } | Fail> {
  const { me, todo } = await mine(id)
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!todo) return { success: false, error: 'not_found' }
  await prisma.todo.update({ where: { id }, data: { done_at: done ? new Date() : null, updated_at: new Date() } })
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function deleteTodo(id: string): Promise<{ success: true } | Fail> {
  const { me, todo } = await mine(id)
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!todo) return { success: false, error: 'not_found' }
  await prisma.todo.delete({ where: { id } })
  revalidatePath('/', 'layout')
  return { success: true }
}

/** Completed in the last 30 days, newest first. */
export async function completedTodos(): Promise<{ success: true; todos: Todo[] } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const since = new Date(Date.now() - 30 * 86_400_000)
  const rows = await prisma.todo.findMany({ where: { owner_id: me.id, done_at: { gte: since } }, orderBy: { done_at: 'desc' }, take: 200 })
  return { success: true, todos: await Promise.all(rows.map(toTodo)) }
}

/**
 * "Make it a task": a pipeline task at To Do with the to-do's name, note (as
 * the description) and date (as the publishing date), in the brand and Space
 * chosen, assigned to me. The to-do goes once the task exists.
 */
export async function todoToTask(id: string, opts: { brandId: string; spaceId: string; type?: string }): Promise<{ success: true; taskId: string } | Fail> {
  const { me, todo } = await mine(id)
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!todo) return { success: false, error: 'not_found' }
  const type = opts.type || (await prisma.contentType.findFirst({ where: { label: 'Other' } }))?.label || (await prisma.contentType.findFirst({ orderBy: { position: 'asc' } }))?.label
  if (!type) return { success: false, error: 'no_type' }
  const r = await createTask({
    name: todo.name, description: todo.note ?? undefined, brand_id: opts.brandId, content_type_label: type,
    task_owner_id: me.id, assignee_id: me.id, publish_date: todo.day ? todo.day.toISOString().slice(0, 10) : null, space_id: opts.spaceId,
  })
  if (!r.success || !r.id) return { success: false, error: r.error ?? 'generic' }
  await prisma.todo.delete({ where: { id } })
  revalidatePath('/', 'layout')
  return { success: true, taskId: r.id }
}
