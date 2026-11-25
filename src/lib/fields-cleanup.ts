/**
 * Fields clean-up (owner's request of 25 Nov 2026, section 5; approved after the read-only report
 * scripts/release/fields-report.sh). Server-only; run once by the seed.
 *
 *   Platform → Channels: a task whose Platform is set and whose Channels is empty gets the Channels
 *   choice of the same name (LinkedIn → LinkedIn). Channels already set is never touched; a Platform
 *   with no matching choice is left as it is and counted. Platform itself stays (nothing deleted).
 */
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export async function platformToChannels(db: Db): Promise<{ copied: number; noMatch: number }> {
  const field = await db.taskField.findFirst({ where: { name_en: 'Channels', retired_at: null } })
  if (!field) return { copied: 0, noMatch: 0 }
  const choices = (((field.options ?? {}) as { choices?: { id: string; en?: string }[] }).choices ?? [])
  const byName = new Map(choices.map(c => [(c.en ?? '').trim().toLowerCase(), c.id]))
  const tasks = await db.task.findMany({
    where: { platform: { not: null }, NOT: { platform: '' }, field_values: { none: { field_id: field.id } } },
    select: { id: true, platform: true },
  })
  let copied = 0, noMatch = 0
  for (const t of tasks) {
    const id = byName.get((t.platform ?? '').trim().toLowerCase())
    if (!id) { noMatch++; continue }
    await db.taskFieldValue.create({ data: { task_id: t.id, field_id: field.id, value: [id] } })
    copied++
  }
  return { copied, noMatch }
}
