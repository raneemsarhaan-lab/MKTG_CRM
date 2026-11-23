/**
 * Spec 023 (R9): a task with every assignee, for the move rules on the server.
 * The lead stays in tasks.assignee_id; task_assignees holds the others (and hours).
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assigneeIds } from '@/lib/mappers'

type Db = PrismaClient | Prisma.TransactionClient

export async function withAssignees<T extends { id: string; assignee_id: string | null }>(task: T, db: Db = prisma): Promise<T & { assignee_ids: string[] }> {
  const rows = await db.taskAssignee.findMany({ where: { task_id: task.id }, select: { member_id: true, position: true } })
  return { ...task, assignee_ids: assigneeIds(task.assignee_id, rows) }
}
