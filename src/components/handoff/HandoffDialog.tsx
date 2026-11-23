'use client'

/**
 * The hand-off box (spec 021 US6, contracts/handoff.md, design/teams-brands.html):
 * "Where should this task show?" — opened when a move into the design half
 * comes back `needs_handoff`. The member ticks production Spaces, picks who
 * picks it up, and confirms; Cancel changes nothing. Mounted once in AppShell.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import { handOff } from '@/actions/task-spaces'
import { STAGE_META } from '@/lib/stage-meta'
import { PIPE } from '@/lib/pipeline-tokens'
import { useIsPhone } from '@/hooks/useMediaQuery'

export function HandoffDialog() {
  const req = useUIStore(s => s.handoff)
  const close = useUIStore(s => s.closeHandoff)
  const setCelebration = useUIStore(s => s.setCelebration)
  const t = useTranslations('handoff')
  const router = useRouter()
  const phone = useIsPhone()
  const [ticked, setTicked] = useState<string[]>([])
  // Spec 022 (R5): one person per board; empty → that board Space's default assignee.
  const [who, setWho] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!req) return
    setTicked(req.ticked); setError('')
    setWho(Object.fromEntries(req.spaces.map(s => [s.id, req.suggested?.[s.id] ?? ''])))
  }, [req])

  // Focus in, Esc cancels, Tab stays inside.
  useEffect(() => {
    if (!req) return
    box.current?.querySelector<HTMLElement>('input, select, button')?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); cancel() }
      if (e.key !== 'Tab' || !box.current) return
      const f = [...box.current.querySelectorAll<HTMLElement>('input, select, button:not([disabled])')]
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!req) return null
  const stage = STAGE_META[req.target]?.label_en ?? req.target
  const spacesNow = req.shownIn.length ? req.shownIn.join(', ') : t('itsBrand')

  function cancel() { close() }
  function confirm(useDefaults = false) {
    if (!req || !ticked.length) return
    setError('')
    const links = ticked.map(spaceId => ({ spaceId, assigneeId: useDefaults ? null : who[spaceId] || null }))
    start(async () => {
      const res = await handOff(req.taskId, { target: req.target, links }).catch(() => ({ success: false, shouldCelebrate: false, error: 'generic' }))
      if (!res.success) { setError(t('error')); return }
      close()
      router.refresh()
      if (res.shouldCelebrate) setCelebration({ taskName: req.taskName, stageLabel: stage })
    })
  }

  return (
    <div data-handoff-backdrop onClick={e => { if (e.target === e.currentTarget) cancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(10,10,14,.38)', display: 'grid', placeItems: phone ? 'end stretch' : 'center', padding: phone ? 0 : 16 }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="handoff-title" data-handoff
        style={{ background: '#FFFFFF', borderRadius: phone ? '18px 18px 0 0' : 18, padding: 20, width: phone ? '100%' : 'min(440px, 100%)', display: 'grid', gap: 12, boxShadow: '0 18px 50px rgba(20,20,16,.18)' }}>
        <h2 id="handoff-title" style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: PIPE.ink }}>{t('title')}</h2>
        <p style={{ margin: 0, fontSize: 13, color: PIPE.textSecondary }}>{t('body', { name: req.taskName, spaces: spacesNow })}</p>
        {req.spaces.map(s => {
          const on = ticked.includes(s.id)
          const people = req.candidates[s.id] ?? []
          return (
            <div key={s.id} data-handoff-board={s.key}
              style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 10, alignItems: 'center', border: `1px solid ${on ? '#C8F24E' : PIPE.border}`, background: on ? '#F4FBD6' : '#FFFFFF', borderRadius: 12, padding: '10px 12px' }}>
              <label data-handoff-space={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={e => setTicked(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} />
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                <b style={{ fontSize: 14, color: PIPE.ink }}>{s.name}</b>
              </label>
              <select data-handoff-person={s.key} aria-label={t('personFor', { space: s.name })} value={who[s.id] ?? ''} disabled={!on}
                onChange={e => setWho(w => ({ ...w, [s.id]: e.target.value }))}
                style={{ border: `1px solid ${PIPE.border}`, borderRadius: 9, padding: '6px 8px', fontFamily: 'inherit', fontSize: 13, minWidth: 0 }}>
                <option value="">{t('defaultPerson')}</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}{req.suggested?.[s.id] === p.id ? ` (${t('default')})` : ''}</option>)}
              </select>
            </div>
          )
        })}
        {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#D22040', fontWeight: 600 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" data-handoff-cancel onClick={cancel}
            style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 10, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {t('cancel')}
          </button>
          <button type="button" data-handoff-skip onClick={() => confirm(true)} disabled={busy || !ticked.length}
            style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 10, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {t('skip')}
          </button>
          <button type="button" data-handoff-confirm onClick={() => confirm()} disabled={busy || !ticked.length}
            style={{ border: 'none', background: '#C8F24E', color: '#111111', borderRadius: 10, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: busy || !ticked.length ? 'not-allowed' : 'pointer', opacity: busy || !ticked.length ? 0.6 : 1 }}>
            {t('confirm', { stage })}
          </button>
        </div>
      </div>
    </div>
  )
}
