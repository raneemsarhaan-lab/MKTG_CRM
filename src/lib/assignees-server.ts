/**
 * Spec 023 (R9): a task with every assignee, for the move rules on the server.
 * The lead stays in tasks.assignee_id; task_assignees holds the others (and hours).
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assigneeIds } from '@/lib/mappers'

import { stageRoles } from '@/lib/space-settings'
import { homeSpaceOf } from '@/lib/space-settings-server'

type Db = PrismaClient | Prisma.TransactionClient

export async function withAssignees<T extends { id: string; assignee_id: string | null }>(task: T, db: Db = prisma): Promise<T & { assignee_ids: string[]; stage_roles: Partial<Record<string, string>> | null }> {
  const rows = await db.taskAssignee.findMany({ where: { task_id: task.id }, select: { member_id: true, position: true } })
  // Spec 024 (§7): the stage roles of the Space whose rules apply to the task.
  const home = await homeSpaceOf(task.id, db)
  return { ...task, assignee_ids: assigneeIds(task.assignee_id, rows), stage_roles: stageRoles(home?.settings) }
}
