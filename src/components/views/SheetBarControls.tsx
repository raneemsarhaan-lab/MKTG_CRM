'use client'

/**
 * Simple sheet header (user, 25 Nov 2026, "Simple sheet header" board): the toolbar's Search and Mine.
 *   - Search: an icon that opens a small box; typing narrows the rows by title (the Board's own search).
 *   - Mine: my avatar; pressed, only my tasks show (the Board's Mine / Everyone, shared with the Board view).
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

export function SheetBarSearch({ value, onChange }: { value: string; onChange(v: string): void }) {
  const t = useTranslations('views.simple')
  const [open, setOpen] = useState(!!value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) ref.current?.focus() }, [open])
  return (
    <span className={`fx-sheetbar-search${open ? ' is-open' : ''}`}>
      <button type="button" className="fx-sheetbar-icon" data-sheet-search="" aria-expanded={open} aria-label={t('search')} title={t('search')}
        onClick={() => { if (open && value) onChange(''); setOpen(o => !o) }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      </button>
      {open && (
        <input ref={ref} type="search" value={value} data-sheet-search-input="" aria-label={t('search')} placeholder={t('searchPlaceholder')}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onChange(''); setOpen(false) } }} />
      )}
    </span>
  )
}

export function SheetBarMine({ me, on, onToggle }: { me: { name: string; color?: string; avatar_url?: string }; on: boolean; onToggle(): void }) {
  const t = useTranslations('views.simple')
  return (
    <button type="button" className={`fx-sheetbar-mine${on ? ' is-on' : ''}`} data-scope-mine="" aria-pressed={on}
      aria-label={t('mine')} title={t('mine')} onClick={onToggle}>
      {me.avatar_url
        ? <img src={me.avatar_url} alt="" className="fx-sheetbar-avatar" />
        : <span aria-hidden="true" className="fx-sheetbar-avatar" style={{ background: me.color || '#1E8F6A' }}>{(me.name || '?').trim()[0]?.toUpperCase()}</span>}
      {on && <span>{t('mineOn')}</span>}
    </button>
  )
}
