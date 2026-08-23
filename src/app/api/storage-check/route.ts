import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/authz'
import { configured, missingSettings, publicUrl, putObject, deleteObject } from '@/lib/storage'

/**
 * Can this deployment actually store a file, and can a browser read it back?
 *
 * "The upload does nothing" has a chain behind it — browser, proxy, route,
 * credentials, bucket, CDN — and until now the only way to find which link was
 * broken was to attach a real file to a real task and infer from the silence.
 * That is a poor instrument: it needs a willing task, it leaves a row behind,
 * and when it fails it fails without saying where.
 *
 * This walks the same chain deliberately and reports each step. The request is
 * a genuine multipart POST, the same shape an upload is, so it passes through
 * whatever the proxy does to those. What it does not touch is the database:
 * no task, no attachment row, nothing to clean up afterwards. The object it
 * writes is deleted before the response is sent.
 *
 * Admin only. Every message is a step name or a truncated error — never a
 * credential, and never a URL that would outlive the check.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Step = { step: string; ok: boolean; detail: string; ms: number }

export async function POST(request: Request) {
  const guard = await requireAdmin()
  if (guard.error) {
    return NextResponse.json({ error: guard.error }, { status: guard.error === 'not_authenticated' ? 401 : 403 })
  }

  const steps: Step[] = []
  const run = async (step: string, fn: () => Promise<string>) => {
    const t0 = Date.now()
    try {
      const detail = await fn()
      steps.push({ step, ok: true, detail, ms: Date.now() - t0 })
      return true
    } catch (e: unknown) {
      steps.push({ step, ok: false, detail: String(e).slice(0, 200), ms: Date.now() - t0 })
      return false
    }
  }

  // 1. The request itself arrived as multipart. If the proxy strips or caps
  //    bodies, this is where it shows — and it shows before the bucket is
  //    blamed for something it never saw.
  let size = 0
  const received = await run('Request reached the server', async () => {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new Error('no file in the form data')
    size = file.size
    return `${size} bytes of multipart form data`
  })
  if (!received) return NextResponse.json({ steps }, { status: 200 })

  if (!configured()) {
    steps.push({
      step: 'Storage configured', ok: false, ms: 0,
      detail: `missing: ${missingSettings().join(', ')}`,
    })
    return NextResponse.json({ steps }, { status: 200 })
  }
  steps.push({ step: 'Storage configured', ok: true, detail: 'all five settings present', ms: 0 })

  // Written outside tasks/ so nothing mistakes it for an attachment, and
  // removed again below whatever happens after.
  const key = `diagnostics/storage-check-${crypto.randomUUID()}.txt`
  let url = ''

  const wrote = await run('Wrote to the bucket', async () => {
    url = await putObject(key, new TextEncoder().encode('momentum storage check'), 'text/plain')
    return 'the bucket accepted the object'
  })

  if (wrote) {
    // The step nothing else can check. An object can be stored perfectly and
    // still be invisible to a browser, which is the difference between an
    // attachment that works and one that renders as a broken thumbnail.
    await run('Readable at the public URL', async () => {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`the CDN answered ${res.status} — the bucket may not be public`)
      return `${res.status} from ${new URL(url).host}`
    })
    await run('Cleaned up', async () => {
      await deleteObject(key)          // never throws; a leftover costs nothing
      return 'test object removed'
    })
  }

  return NextResponse.json({ steps }, { status: 200 })
}
