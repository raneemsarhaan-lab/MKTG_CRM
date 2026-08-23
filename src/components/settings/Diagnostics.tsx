'use client'

import { useState, useTransition } from 'react'
import { COLORS } from '@/lib/tokens'
import { pingServerAction } from '@/actions/diagnostics'

/**
 * Diagnostics — what the deployed server reports about itself.
 *
 * Two checks, because they fail independently:
 *
 *  1. A plain GET to /api/diagnostics. Works even when server actions do not,
 *     so it can report the reason they don't.
 *  2. A server action round trip. Every save in this product is a server
 *     action; if this one cannot get through, none of them can, and the
 *     symptom is buttons that silently do nothing.
 *
 * The build stamp is the answer to "has the deployment picked up the fix yet",
 * which is otherwise unanswerable from outside.
 */

type Report = {
  build: string
  checked_at: string
  env: Record<string, unknown>
  request: Record<string, unknown>
  database: Record<string, unknown>
}

type StorageStep = { step: string; ok: boolean; detail: string; ms: number }

export function Diagnostics() {
  const [report, setReport]   = useState<Report | null>(null)
  const [httpErr, setHttpErr] = useState('')
  const [action, setAction]   = useState<'idle' | 'ok' | 'failed'>('idle')
  const [actionErr, setActionErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [steps, setSteps]     = useState<StorageStep[] | null>(null)
  const [storing, setStoring] = useState(false)

  /**
   * Walk the upload path without uploading anything.
   *
   * A real multipart POST, the same shape an attachment is, so it meets
   * whatever the proxy does to those — but bound for a route that writes to
   * the bucket, reads the object back over the public URL, deletes it, and
   * reports each step. No task, no row, nothing left behind.
   *
   * This is the check that tells a broken bucket apart from a blocked
   * request, which from the task panel look identical.
   */
  async function testStorage() {
    setStoring(true); setSteps(null)
    try {
      const fd = new FormData()
      fd.append('file', new File([new Blob(['momentum storage check'])], 'storage-check.txt', { type: 'text/plain' }))
      // Unique per run, for the same reason uploads are — see the comment on
      // the fetch in TaskModal. A diagnostic answered from cache is worse than
      // no diagnostic.
      const res  = await fetch(`/api/storage-check?u=${crypto.randomUUID()}`, {
        method: 'POST', body: fd, cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.steps) {
        setSteps([{
          step: 'Reaching the upload route', ok: false, ms: 0,
          detail: res.redirected
            ? 'the request was redirected — the session is not being accepted'
            : `the server answered ${res.status}${json?.error ? ` (${json.error})` : ''}`,
        }])
        return
      }
      setSteps(json.steps)
    } catch (e: unknown) {
      setSteps([{ step: 'Reaching the upload route', ok: false, detail: String(e).slice(0, 200), ms: 0 }])
    } finally {
      setStoring(false)
    }
  }

  async function run() {
    setLoading(true); setHttpErr(''); setActionErr(''); setAction('idle')
    try {
      // The page's own origin, which a same-origin GET does not send. The
      // server needs it to check the comparison Next makes before running a
      // server action.
      const res = await fetch('/api/diagnostics', {
        cache: 'no-store',
        headers: { 'x-browser-origin': window.location.origin },
      })
      if (!res.ok) {
        setHttpErr(`The server answered ${res.status}. ${res.status === 401 ? 'The session is not being recognised.' : ''}`)
        setReport(null)
      } else {
        setReport(await res.json())
      }
    } catch (e: unknown) {
      setHttpErr(`Could not reach the server at all: ${String(e).slice(0, 200)}`)
      setReport(null)
    } finally {
      setLoading(false)
    }

    // Separate on purpose — a failed server action must not stop the GET
    // report from being shown, since the report is what explains the failure.
    startTransition(async () => {
      try {
        const r = await pingServerAction()
        setAction(r.ok ? 'ok' : 'failed')
        if (!r.ok) setActionErr(r.error ?? 'refused')
      } catch (e: unknown) {
        setAction('failed')
        setActionErr(String(e).slice(0, 300))
      }
    })
  }

  const noPassword = (report?.database?.accounts as { name: string; can_sign_in: boolean }[] | undefined)
    ?.filter(a => !a.can_sign_in) ?? []

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 18px', maxWidth: 680 }}>
        What the running server reports about itself — which build is live, whether
        it can reach the database, whether saves can get through the proxy, and
        which accounts have a password. Nothing secret is shown, and the report can
        be copied and sent on when something needs looking at.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={run}
          disabled={loading || isPending}
          style={{
            fontSize: '0.78rem', fontWeight: 700, padding: '9px 18px', borderRadius: 9,
            border: 'none', background: 'var(--ink)', color: '#fff', cursor: 'pointer',
            fontFamily: 'inherit', opacity: loading || isPending ? 0.6 : 1,
          }}
        >
          {loading || isPending ? 'Checking…' : 'Run check'}
        </button>

        <button
          onClick={testStorage}
          disabled={storing}
          style={{
            fontSize: '0.78rem', fontWeight: 700, padding: '9px 18px', borderRadius: 9,
            border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)',
            cursor: 'pointer', fontFamily: 'inherit', opacity: storing ? 0.6 : 1,
          }}
        >
          {storing ? 'Testing…' : 'Test file storage'}
        </button>
      </div>

      {steps && (
        <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px',
              background: s.ok ? '#F3FBF5' : '#FDF3F2',
              display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
            }}>
              <span aria-hidden="true">{s.ok ? '✅' : '❌'}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>{s.step}</span>
              <span style={{ fontSize: '0.75rem', color: s.ok ? 'var(--muted)' : COLORS.coral }}>
                {s.detail}
              </span>
              {s.ms > 0 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 'auto' }}>{s.ms}ms</span>
              )}
            </div>
          ))}
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '2px 0 0', lineHeight: 1.5 }}>
            The whole upload path except the file picker: a real multipart request,
            the bucket, and reading the object back the way a browser would. Nothing
            is attached to a task and the test object is deleted.
          </p>
        </div>
      )}

      {httpErr && (
        <p role="alert" style={{ fontSize: '0.8rem', color: COLORS.coral, marginTop: 14 }}>{httpErr}</p>
      )}

      {(report || action !== 'idle') && (
        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>

          {report && (
            <Row label="Live build" value={report.build}
                 note={report.build === 'unknown'
                   ? 'This build predates the stamp — the deployment has not picked up the newest code.'
                   : 'Compare this with the time of the last deploy. If it has not moved, the fixes are not live yet.'} />
          )}

          {action !== 'idle' && (
            <Row
              label="Saving (server action)"
              value={action === 'ok' ? 'Working' : 'Refused'}
              bad={action === 'failed'}
              note={action === 'ok'
                ? 'Buttons that save will reach the server.'
                : `Every save in the product fails this way, silently. ${actionErr}`}
            />
          )}

          {report && (
            <Row
              label="Database"
              value={report.database.reachable ? `Reachable · ${String(report.database.members)} people` : 'Not reachable'}
              bad={!report.database.reachable}
              note={report.database.reachable
                ? `${String(report.database.with_password)} can sign in.`
                : String(report.database.error ?? '')}
            />
          )}

          {report && (
            <Row
              label="Proxy / origin"
              value={
                report.request.server_action_origin_matches === null ? 'Not determined'
                : report.request.server_action_origin_matches ? 'Consistent' : 'Mismatched'
              }
              bad={report.request.server_action_origin_matches === false}
              note={`origin ${String(report.request.origin ?? '–')} · forwarded host ${String(report.request.x_forwarded_host ?? '–')} · host ${String(report.request.host ?? '–')}`}
            />
          )}

          {report && (
            <Row
              label="Auth configuration"
              value={report.env.NEXTAUTH_SECRET ? 'Secret set' : 'NEXTAUTH_SECRET missing'}
              bad={!report.env.NEXTAUTH_SECRET}
              note={`NEXTAUTH_URL ${report.env.NEXTAUTH_URL ? String(report.env.NEXTAUTH_URL) : 'is not set — sessions can fail to stick behind a proxy'}`}
            />
          )}

          {report && noPassword.length > 0 && (
            <Row
              label="Cannot sign in"
              value={`${noPassword.length} ${noPassword.length === 1 ? 'account' : 'accounts'}`}
              bad
              note={`${noPassword.map(a => a.name).join(', ')} — these have no password yet. Set one in Team & Access.`}
            />
          )}

          {report && (
            <button
              onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(report, null, 2)) }}
              style={{
                justifySelf: 'start', fontSize: '0.72rem', fontWeight: 700,
                padding: '7px 14px', borderRadius: 8, border: '1px solid var(--line)',
                background: '#fff', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Copy full report
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, note, bad }: {
  label: string
  value: string
  note?: string
  bad?: boolean
}) {
  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px',
      background: bad ? '#FDF3F2' : '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.06em', color: 'var(--muted)',
        }}>
          {label}
        </span>
        <span style={{
          fontSize: '0.86rem', fontWeight: 700,
          color: bad ? COLORS.coral : 'var(--ink)',
        }}>
          {value}
        </span>
      </div>
      {note && (
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '5px 0 0', lineHeight: 1.5 }}>
          {note}
        </p>
      )}
    </div>
  )
}
