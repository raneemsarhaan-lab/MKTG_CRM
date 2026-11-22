'use client'

/**
 * The hand-off box (spec 021 US6, contracts/handoff.md, design/teams-brands.html):
 * "Where should this task show?" — opened when a move into the design half
 * comes back `needs_handoff`. The member ticks production Spaces, picks who
 * picks it up, and confirms; Cancel changes nothing. Mounted once in AppShell.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
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
  const [who, setWho] = useState<string>('')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { if (req) { setTicked(req.ticked); setError(''); setWho('') } }, [req])

  const people = useMemo(() => {
    if (!req) return []
    const seen = new Map<string, { id: string; name: string; role: string }>()
    for (const sid of ticked) for (const m of req.candidates[sid] ?? []) seen.set(m.id, m)
    return [...seen.values()]
  }, [req, ticked])
  useEffect(() => { if (!people.some(p => p.id === who)) setWho(people[0]?.id ?? '') }, [people, who])

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
  function confirm() {
    if (!req || !ticked.length || !who) return
    setError('')
    start(async () => {
      const res = await handOff(req.taskId, { target: req.target, spaceIds: ticked, assigneeId: who }).catch(() => ({ success: false, shouldCelebrate: false, error: 'generic' }))
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
          return (
            <label key={s.id} data-handoff-space={s.key}
              style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${on ? '#C8F24E' : PIPE.border}`, background: on ? '#F4FBD6' : '#FFFFFF', borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={on} onChange={e => setTicked(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} />
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
              <b style={{ fontSize: 14, color: PIPE.ink }}>{s.name}</b>
              <small style={{ marginInlineStart: 'auto', color: PIPE.textMuted, fontSize: 12 }}>{(req.candidates[s.id] ?? []).map(m => m.name).join(', ')}</small>
            </label>
          )
        })}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13.5, fontWeight: 700, color: PIPE.ink }}>
          {t('assignTo')}
          <select data-handoff-assignee value={who} disabled={!people.length} onChange={e => setWho(e.target.value)}
            style={{ border: `1px solid ${PIPE.border}`, borderRadius: 9, padding: '6px 8px', fontFamily: 'inherit', fontSize: 13, minWidth: 180 }}>
            {people.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
          </select>
        </label>
        {!people.length && ticked.length > 0 && <p style={{ margin: 0, fontSize: 12.5, color: PIPE.textMuted }}>{t('noMembers')}</p>}
        {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#D22040', fontWeight: 600 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" data-handoff-cancel onClick={cancel}
            style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 10, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {t('cancel')}
          </button>
          <button type="button" data-handoff-confirm onClick={confirm} disabled={busy || !ticked.length || !who}
            style={{ border: 'none', background: '#C8F24E', color: '#111111', borderRadius: 10, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: busy || !ticked.length || !who ? 'not-allowed' : 'pointer', opacity: busy || !ticked.length || !who ? 0.6 : 1 }}>
            {t('confirm', { stage })}
          </button>
        </div>
      </div>
    </div>
  )
}
