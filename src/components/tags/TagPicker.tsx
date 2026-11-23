'use client'

/**
 * Tags on a task (spec 023 US4): coloured chips, × to remove, and "+ Tag" with
 * a search that offers "Create tag ‘Eid’" when no tag has that name. Anyone
 * who may edit the task tags it and may create a tag while tagging.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Tag } from '@/types/index'
import { createTag, setTaskTags } from '@/actions/tags'
import { tagKey } from '@/lib/tags'

export function TagChip({ tag, onRemove, removeLabel, small = false }: { tag: Tag; onRemove?: () => void; removeLabel?: string; small?: boolean }) {
  return (
    <span data-tag={tag.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 180, padding: small ? '1px 7px' : '3px 9px', borderRadius: 999,
      fontSize: small ? 10.5 : 12.5, fontWeight: 600, background: `${tag.color}1F`, color: '#18233F', border: `1px solid ${tag.color}40` }}>
      <span aria-hidden="true" style={{ width: small ? 6 : 7, height: small ? 6 : 7, borderRadius: '50%', background: tag.color, flex: 'none' }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.name}</span>
      {onRemove && <button type="button" aria-label={removeLabel} onClick={onRemove} style={{ border: 'none', background: 'none', padding: 0, color: '#929CB0', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>}
    </span>
  )
}

export function TagPicker({ taskId, value, tags, canEdit }: { taskId: string; value: string[]; tags: Tag[]; canEdit: boolean }) {
  const t = useTranslations('tags')
  const router = useRouter()
  const [ids, setIds] = useState(value)
  const [all, setAll] = useState(tags)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => { setIds(value) }, [value])
  useEffect(() => { setAll(tags) }, [tags])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const save = async (next: string[]) => {
    const before = ids
    setIds(next)
    const r = await setTaskTags(taskId, next)
    if (!r.success) { setIds(before); setErr(t('failed')); return }
    setErr(''); router.refresh()
  }
  const shown = useMemo(() => {
    const k = tagKey(q)
    return all.filter(x => !k || tagKey(x.name).includes(k)).slice(0, 30)
  }, [all, q])
  const exact = all.some(x => tagKey(x.name) === tagKey(q))
  const mine = ids.map(id => all.find(x => x.id === id)).filter((x): x is Tag => !!x)

  async function create() {
    const r = await createTag(q)
    if (!r.success) { setErr(t('failed')); return }
    setAll(a => (a.some(x => x.id === r.tag.id) ? a : [...a, r.tag]))
    setQ('')
    await save([...new Set([...ids, r.tag.id])])
  }

  return (
    <span ref={box} data-tag-picker="" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', position: 'relative' }}>
      {mine.map(x => <TagChip key={x.id} tag={x} onRemove={canEdit ? () => void save(ids.filter(i => i !== x.id)) : undefined} removeLabel={t('remove', { name: x.name })} />)}
      {!mine.length && !canEdit && <span style={{ color: '#929CB0' }}>–</span>}
      {canEdit && (
        <button type="button" data-tag-add="" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
          style={{ border: '1px dashed #D5DAE5', background: 'transparent', borderRadius: 999, padding: '3px 10px', font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#68738D', cursor: 'pointer' }}>
          {t('add')}
        </button>
      )}
      {open && (
        <span style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', insetInlineStart: 0, width: 240, background: '#fff', border: '1px solid #E9EDF4', borderRadius: 10,
          boxShadow: '0 12px 34px rgba(20,20,20,.16)', padding: 6, display: 'grid', gap: 2 }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} maxLength={40} data-tag-search=""
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (q.trim() && !exact) void create(); else if (shown[0]) void save(ids.includes(shown[0].id) ? ids : [...ids, shown[0].id]) } if (e.key === 'Escape') setOpen(false) }}
            style={{ font: 'inherit', fontSize: 13, border: '1px solid #E9EDF4', borderRadius: 7, padding: '6px 8px', marginBottom: 4 }} />
          <span role="listbox" aria-label={t('title')} style={{ display: 'grid', maxHeight: 220, overflowY: 'auto' }}>
            {shown.map(x => {
              const on = ids.includes(x.id)
              return (
                <button key={x.id} type="button" role="option" aria-selected={on} data-tag-option={x.name}
                  onClick={() => void save(on ? ids.filter(i => i !== x.id) : [...ids, x.id])}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: on ? '#F3F6FD' : 'transparent', padding: '6px 8px', borderRadius: 7, font: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'start', color: '#18233F' }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: x.color }} />
                  <span style={{ flex: 1 }}>{x.name}</span>{on && <span aria-hidden="true">✓</span>}
                </button>
              )
            })}
            {q.trim() && !exact && (
              <button type="button" data-tag-create="" onClick={() => void create()}
                style={{ border: 'none', background: 'transparent', padding: '7px 8px', borderRadius: 7, font: 'inherit', fontSize: 13, fontWeight: 700, color: '#3563E9', cursor: 'pointer', textAlign: 'start' }}>
                {t('create', { name: q.trim() })}
              </button>
            )}
          </span>
        </span>
      )}
      {err && <span role="alert" style={{ color: '#D22040', fontSize: 12.5 }}>{err}</span>}
    </span>
  )
}
