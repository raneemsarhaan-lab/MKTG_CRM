/**
 * Put back files whose rows were deleted but whose objects are still there.
 *
 * The ClickUp importer used to replace a task's attachments wholesale on every
 * boot. That was harmless while importing was the only way to get one, and
 * became data loss when people could upload: a file attached in the app was
 * removed at the next deploy. The object was never touched — only the row that
 * pointed at it — so the files themselves are still in the bucket, orphaned.
 *
 * This finds them and writes the rows back. The key carries the task id, which
 * is what makes recovery possible at all:
 *
 *   tasks/<task-id>/<uuid>.<ext>
 *
 * What cannot be recovered is the original filename and who uploaded it; those
 * lived only in the row. A recovered file is named "Recovered <date>.<ext>",
 * which is honest about what it is rather than inventing a name it never had.
 *
 * Inert unless RECOVER_ORPHANED_FILES=1, and safe to run twice: an object that
 * already has a row is skipped.
 */

import { PrismaClient } from '@prisma/client'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { configured, publicUrl } from '../src/lib/storage'

const prisma = new PrismaClient()

const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
  mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg',
}

async function main() {
  if (process.env.RECOVER_ORPHANED_FILES !== '1') {
    console.log('▶ Recovery not requested — set RECOVER_ORPHANED_FILES=1 to run it.')
    return
  }
  if (!configured()) {
    console.log('▶ No bucket configured — nothing to recover from.')
    return
  }

  const s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId:     process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  })

  // Every object under tasks/, a page at a time.
  const objects: { key: string; size: number; at: Date }[] = []
  let token: string | undefined
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET!, Prefix: 'tasks/', ContinuationToken: token,
    }))
    for (const o of page.Contents ?? []) {
      if (o.Key) objects.push({ key: o.Key, size: o.Size ?? 0, at: o.LastModified ?? new Date() })
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)

  const known = new Set(
    (await prisma.taskAttachment.findMany({
      where: { storage_key: { not: null } }, select: { storage_key: true },
    })).map(r => r.storage_key!),
  )

  const orphans = objects.filter(o => !known.has(o.key))
  if (!orphans.length) {
    console.log(`▶ ${objects.length} object(s), all accounted for. Nothing to recover.`)
    return
  }

  console.log(`▶ ${orphans.length} object(s) with no row. Putting them back...`)
  let restored = 0, skipped = 0

  for (const o of orphans) {
    const taskId = o.key.split('/')[1]
    // A key whose task no longer exists cannot be restored to anything.
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } })
    if (!task) { skipped++; continue }

    const ext  = o.key.match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase() ?? ''
    const when = o.at.toISOString().slice(0, 10)

    await prisma.taskAttachment.create({
      data: {
        task_id:      taskId,
        filename:     `Recovered ${when}${ext ? '.' + ext : ''}`,
        url:          publicUrl(o.key),
        storage_key:  o.key,
        content_type: TYPES[ext] ?? null,
        size_bytes:   o.size,
        uploaded_at:  o.at,
      },
    })
    restored++
  }

  console.log(`✅ Restored ${restored} file(s)${skipped ? `, skipped ${skipped} whose task is gone` : ''}.`)
  console.log('   Names were lost with the rows — rename them in the panel.')
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
