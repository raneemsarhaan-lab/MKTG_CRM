/**
 * Running-app helper (spec 012 quickstart §3): makes events the way the
 * actions do, for the checks that need many of them at once.
 *   comment <authorId> <taskId> <body> [mentionIds,] [parentId]
 *   attach  <actorId> <taskId> <count>
 *   due     (the hourly due-date job, once)
 * Prints the created comment id, if any.
 */
import { createComment } from '@/lib/comments'
import { notifyAfter, notify } from '@/lib/notify/notify'
import { prisma } from '@/lib/prisma'
import { runDueReminders } from '@/lib/notify/scheduler'

async function main() {
  const [cmd, a, b, c, d, e] = process.argv.slice(2)
  if (cmd === 'comment') {
    const r = await createComment({ id: a }, { taskId: b, body: c, mentions: d ? d.split(',').filter(Boolean) : [], taskRefs: [], parentId: e || null })
    console.log(r.ok ? r.id : `error:${r.error}`)
  } else if (cmd === 'attach') {
    await notifyAfter(tx => notify(tx, { kind: 'attachment', actorId: a, taskId: b, attachmentId: null, count: Number(c) }))
    console.log('ok')
  } else if (cmd === 'due') {
    console.log(JSON.stringify(await runDueReminders(new Date())))
  }
  // Delivery runs after the transaction; give it a moment, then leave.
  await new Promise(r => setTimeout(r, 300))
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
