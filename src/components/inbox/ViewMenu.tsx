'use client'

/**
 * The Board's View menu (spec 006 FR-002, FR-003, US7): "Show your week" and
 * "Columns before design" (the old "Hide what's upstream" button), in one
 * place at the end of the filters row.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

export function ViewMenu({ showWeek, onShowWeek, upstream, onUpstream }: {
  showWeek: boolean
  onShowWeek(v: boolean): void
  upstream: boolean
  onUpstream(v: boolean): void
}) {
  const t = useTranslations('inbox')
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.focus())
    function onDown(e: MouseEvent) { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function onKey(e: React.KeyboardEvent) {
    const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus() }
    else if (e.key === 'Tab') setOpen(false)
  }

  const item = (key: 'week' | 'upstream', on: boolean, set: (v: boolean) => void) => (
    <button type="button" role="menuitemcheckbox" aria-checked={on} className="fx-view-item" data-view={key}
            onClick={() => set(!on)}>
      <span>{t(`view.${key}`)}</span>
      <span className={`fx-view-switch${on ? ' is-on' : ''}`} aria-hidden="true"><i /></span>
    </button>
  )

  return (
    <div ref={wrap} className="fx-view" data-view-menu="" onKeyDown={onKey}>
      <button ref={btn} type="button" className="fx-view-btn" aria-haspopup="menu" aria-expanded={open}
              onClick={() => setOpen(v => !v)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
        </svg>
        {t('view.button')}
      </button>
      {open && (
        <div className="fx-view-menu" role="menu" aria-label={t('view.menu')}>
          {item('week', showWeek, onShowWeek)}
          {item('upstream', upstream, onUpstream)}
        </div>
      )}
    </div>
  )
}
