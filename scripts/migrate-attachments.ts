/**
 * Move older uploads out of the database and into the bucket.
 *
 * Before there was object storage, an uploaded file was written into Postgres
 * as a data URL. Those rows still work — the panel renders whichever of `data`
 * and `url` a row has — but they are the reason the attachments table is heavy
 * and the reason the board query has to be careful never to select a column.
 *
 * This walks them: read the base64, put the bytes in the bucket, write the
 * URL and the key onto the row, and clear `data`. Idempotent by construction —
 * it only looks at rows that still have `data` and no `storage_key`, so a row
 * it has already moved is invisible to the next run.
 *
 * Nothing here is destructive in the ordinary sense: `data` is cleared only
 * after the object is stored and the row updated in the same transaction. If
 * the bucket refuses, the row is left exactly as it was and the file keeps
 * rendering from the database.
 *
 * Safe to run when no bucket is configured — it says so and stops.
 */

import { PrismaClient } from '@prisma/client'
import { configured, keyFor, putObject } from '../src/lib/storage'

const prisma = new PrismaClient()

/** "data:image/png;base64,AAAA…" → bytes and the type it claimed to be. */
function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; type: string } | null {
  const m = dataUrl.match(/^data:([^;,]*)(;base64)?,(.*)$/s)
  if (!m) return null
  const [, type, isBase64, payload] = m
  const buf = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8')
  return { bytes: new Uint8Array(buf), type: type || 'application/octet-stream' }
}

async function main() {
  if (!configured()) {
    console.log('▶ No bucket configured — leaving stored files where they are.')
    return
  }

  const rows = await prisma.taskAttachment.findMany({
    where:  { data: { not: null }, storage_key: null },
    select: { id: true, task_id: true, filename: true, data: true },
  })

  if (!rows.length) {
    console.log('▶ No files left in the database to move.')
    return
  }

  console.log(`▶ Moving ${rows.length} file(s) into the bucket...`)
  let moved = 0, failed = 0, bytes = 0

  for (const row of rows) {
    const decoded = row.data ? decodeDataUrl(row.data) : null
    if (!decoded) { failed++; continue }

    try {
      const key = keyFor(row.task_id, row.filename)
      const url = await putObject(key, decoded.bytes, decoded.type)
      await prisma.taskAttachment.update({
        where: { id: row.id },
        data:  {
          url, storage_key: key,
          content_type: decoded.type,
          size_bytes:   decoded.bytes.byteLength,
          // Cleared last, and only once the object is somewhere else.
          data: null,
        },
      })
      moved++
      bytes += decoded.bytes.byteLength
    } catch (e: unknown) {
      failed++
      console.log(`  ✗ ${row.filename}: ${String(e).slice(0, 120)}`)
    }
  }

  const mb = (bytes / 1_000_000).toFixed(1)
  console.log(`✅ Moved ${moved} file(s), ${mb} MB out of the database${failed ? `, ${failed} failed` : ''}.`)
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
