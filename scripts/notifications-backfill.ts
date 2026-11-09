/**
 * Spec 012 launch steps (data-model §6), idempotent:
 *   1. Followers for live tasks: creator, owner, assignee, every comment author.
 *   2. Unread mentions from the last 7 days (not in mention_reads) become
 *      "mention" notifications, once each, so nothing waiting is lost when the
 *      Inbox's Mentions tab moves to the bell (FR-080).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const followers = await prisma.$executeRaw`
    INSERT INTO task_followers (task_id, member_id)
    SELECT DISTINCT t.id, x.member_id FROM tasks t
    CROSS JOIN LATERAL (VALUES (t.created_by), (t.task_owner_id), (t.assignee_id)) AS x(member_id)
    WHERE t.dropped_at IS NULL AND x.member_id IS NOT NULL
    ON CONFLICT DO NOTHING`
  const commenters = await prisma.$executeRaw`
    INSERT INTO task_followers (task_id, member_id)
    SELECT DISTINCT c.task_id, c.author_id FROM task_comments c JOIN tasks t ON t.id = c.task_id
    WHERE t.dropped_at IS NULL
    ON CONFLICT DO NOTHING`
  // One notification per (mentioned member, comment), skipped if it already exists.
  const mentions = await prisma.$executeRaw`
    INSERT INTO notifications (id, recipient_id, kind, task_id, comment_id, actor_ids, count, first_event_at, last_event_at, meta, created_at, updated_at)
    SELECT gen_random_uuid(), m.member_id, 'mention', c.task_id, c.id, ARRAY[c.author_id], 1, c.created_at, c.created_at,
           jsonb_build_object('task_name', t.name, 'snippet', left(regexp_replace(c.body, '\\s+', ' ', 'g'), 100)),
           c.created_at, now()
    FROM task_comments c
    JOIN tasks t ON t.id = c.task_id
    CROSS JOIN LATERAL unnest(c.mentions) AS m(member_id)
    WHERE c.created_at > now() - interval '7 days'
      AND m.member_id <> c.author_id
      AND EXISTS (SELECT 1 FROM members mm WHERE mm.id = m.member_id)
      AND NOT EXISTS (SELECT 1 FROM mention_reads r WHERE r.member_id = m.member_id AND r.comment_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.recipient_id = m.member_id AND n.comment_id = c.id AND n.kind = 'mention')`
  console.log(`  followers +${followers + commenters}, carried-over mentions +${mentions}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
