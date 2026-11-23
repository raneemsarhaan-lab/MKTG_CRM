'use client'

/**
 * The task's Type, as the task panel shows it (spec 023 US1): a chip with the
 * type's icon, colour and name; clicking opens a menu of every type, and
 * admins get "+ Type" at the bottom to add one and pick it in one go.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { ContentType } from '@/types/index'
import { typeName } from '@/lib/task-types'
import { createContentType } from '@/actions/settings'
import { TypeIcon } from './TypeIcon'

export function TypeChip({ type, label, size = 13 }: { type?: ContentType | null; label: string; size?: number }) {
  const locale = useLocale()
  const color = type?.color ?? '#6B7280'
  return (
    <span data-type-chip={label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', maxWidth: '100%',
      borderRadius: 8, background: `${color}1A`, color, fontWeight: 700, fontSize: size,
    }}>
      <TypeIcon icon={type?.icon} color={color} size={size} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{type ? typeName(type, locale) : label}</span>
    </span>
  )
}

export function TypePicker({ value, types, canEdit, canAdd, onPick }: {
  value: string | null | undefined
  types: ContentType[]
  canEdit: boolean
  /** Admins: "+ Type" at the bottom of the menu. */
  canAdd: boolean
  onPick: (label: string) => void
}) {
  const t = useTranslations('types')
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)
  const current = types.find(x => x.label === value)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setAdding(false) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const empty = <span style={{ color: '#8A8A85', fontWeight: 400 }}>–</span>
  if (!canEdit) return <div style={{ padding: '3px 6px' }}>{value ? <TypeChip type={current} label={value} /> : empty}</div>

  function add() {
    const label = name.trim().replace(/\s+/g, ' ')
    if (!label) return
    const taken = types.find(x => x.label.toLowerCase() === label.toLowerCase())
    if (taken) { onPick(taken.label); setOpen(false); setAdding(false); setName(''); return }
    start(async () => {
      const r = await createContentType(label)
      if (!r.success) { setErr(r.error === 'not_authorized' ? t('adminsOnly') : t('err.exists')); return }
      onPick(label); setOpen(false); setAdding(false); setName(''); setErr('')
      router.refresh()
    })
  }

  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', borderRadius: 7, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--ink)', textAlign: 'start' }
  return (
    <div ref={box} style={{ position: 'relative' }} data-type-picker>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)} data-type-picker-open
        style={{ border: 'none', background: 'transparent', padding: '3px 6px', cursor: 'pointer', borderRadius: 6, maxWidth: '100%', font: 'inherit' }}>
        {value ? <TypeChip type={current} label={value} /> : empty}
      </button>
      {open && (
        <div role="listbox" aria-label={t('label')} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setAdding(false) } }}
          style={{ position: 'absolute', zIndex: 60, top: 'calc(100% + 4px)', insetInlineStart: 0, minWidth: 220, maxHeight: 320, overflowY: 'auto',
            background: '#fff', border: '1px solid #E4E4DF', borderRadius: 10, padding: 5, boxShadow: '0 10px 28px rgba(0,0,0,.12)' }}>
          {types.map(x => (
            <button key={x.label} type="button" role="option" aria-selected={x.label === value} data-type-option={x.label}
              onClick={() => { setOpen(false); if (x.label !== value) onPick(x.label) }}
              style={{ ...item, background: x.label === value ? '#F1F1EE' : 'transparent' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, background: `${x.color ?? '#6B7280'}1A` }}>
                <TypeIcon icon={x.icon} color={x.color} size={13} />
              </span>
              <span style={{ flex: 1 }}>{typeName(x, locale)}</span>
              {x.label === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          {canAdd && (
            <div style={{ borderTop: '1px solid #EEE', marginTop: 4, paddingTop: 4 }}>
              {adding ? (
                <form onSubmit={e => { e.preventDefault(); add() }} style={{ display: 'flex', gap: 6, padding: 4 }}>
                  <input autoFocus aria-label={t('newTypePlaceholder')} placeholder={t('newTypePlaceholder')} value={name} maxLength={40}
                    onChange={e => setName(e.target.value)} data-type-add-name
                    style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 7, border: '1px solid #D9D9D3' }} />
                  <button type="submit" disabled={pending || !name.trim()} data-type-add-save
                    style={{ font: 'inherit', fontSize: 12, fontWeight: 800, padding: '6px 10px', borderRadius: 7, border: 'none', background: '#C8F24E', cursor: 'pointer' }}>{t('create')}</button>
                </form>
              ) : (
                <button type="button" style={{ ...item, color: '#4A5061', fontWeight: 700 }} onClick={() => setAdding(true)} data-type-add>{t('newType')}</button>
              )}
              {err && <p role="alert" style={{ margin: '2px 8px 6px', fontSize: 12, color: '#B42318' }}>{err}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
