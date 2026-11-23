/**
 * A task's kind (user, 2026-11-23): every new task starts simple (To Do ›
 * In progress › Done). Once it is linked to through a Task link — a Task link
 * field, or a blank sheet's row link — it becomes a pipeline task and starts
 * at the pipeline's To Do. Tasks already on the pipeline keep their stage;
 * unlinking never turns a task back.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma as db } from '@/lib/prisma'

type Client = PrismaClient | Prisma.TransactionClient

/** Makes these tasks pipeline tasks, if they are still simple. Returns how many changed. */
export async function makePipeline(taskIds: (string | null | undefined)[], client: Client = db): Promise<number> {
  const ids = [...new Set(taskIds.filter((x): x is string => !!x))]
  if (!ids.length) return 0
  const r = await client.task.updateMany({
    where: { id: { in: ids }, kind: 'simple' },
    data: { kind: 'pipeline', simple_status: null, status: 'todo', stage_date: new Date(), updated_at: new Date() },
  })
  return r.count
}
