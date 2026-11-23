'use client'

/**
 * Several assignees (spec 023 US5): the first is the lead, marked "Lead".
 * Add people from a list, remove with ×, make someone lead, and set each
 * person's hours (empty = an even share of the estimate).
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Member } from '@/types/index'
import { setAssignees } from '@/actions/assignees'
import { hoursSplit } from '@/lib/assignees'
import { initials, avatarColor } from '@/lib/utils'

type Row = { member_id: string; hours: number | null }

export function Avatar({ name, size = 24, title }: { name: string; size?: number; title?: string }) {
  return (
    <span title={title ?? name} aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: avatarColor(name), color: '#fff', display: 'inline-grid', placeItems: 'center',
      fontSize: Math.round(size * 0.4), fontWeight: 800, flex: 'none', boxShadow: '0 0 0 2px #fff' }}>{initials(name)}</span>
  )
}

export function AssigneesPicker({ taskId, ids, hours, estimate, members, canEdit }: {
  taskId: string; ids: string[]; hours: Record<string, number>; estimate: number; members: Member[]; canEdit: boolean
}) {
  const t = useTranslations('assignees')
  const router = useRouter()
  const toRows = () => ids.map(id => ({ member_id: id, hours: typeof hours[id] === 'number' ? hours[id] : null }))
  const [rows, setRows] = useState<Row[]>(toRows)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { setRows(toRows()) }, [ids.join(','), JSON.stringify(hours)]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const save = async (next: Row[]) => {
    const before = rows
    setRows(next)
    const r = await setAssignees(taskId, next)
    if (!r.success) { setRows(before); setErr(t('failed')); return }
    setErr(''); router.refresh()
  }
  const byId = new Map(members.map(m => [m.id, m]))
  const split = hoursSplit({ hours_estimate: estimate, assignee_ids: rows.map(r => r.member_id), assignee_hours: Object.fromEntries(rows.filter(r => r.hours != null).map(r => [r.member_id, r.hours as number])) })
  const rest = members.filter(m => !rows.some(r => r.member_id === m.id))

  return (
    <div ref={box} data-assignees="" style={{ display: 'grid', gap: 4, position: 'relative' }}>
      {!rows.length && <span style={{ color: '#929CB0' }}>{t('nobody')}</span>}
      {rows.map((r, i) => {
        const m = byId.get(r.member_id)
        if (!m) return null
        return (
          <div key={r.member_id} data-assignee={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
            <Avatar name={m.name} size={24} />
            <span style={{ fontSize: 14.5, color: '#18233F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
            {i === 0
              ? <span data-assignee-lead="" style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#EEF3FF', color: '#3563E9' }}>{t('lead')}</span>
              : canEdit && <button type="button" data-make-lead={m.name} onClick={() => void save([r, ...rows.filter(x => x.member_id !== r.member_id)])}
                  style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#68738D', cursor: 'pointer', textDecoration: 'underline' }}>{t('makeLead')}</button>}
            {rows.length > 1 && (
              canEdit
                ? <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#68738D' }}>
                    <input type="number" min={0} step={0.5} inputMode="decimal" aria-label={t('hoursFor', { name: m.name })} data-assignee-hours={m.name}
                      defaultValue={r.hours ?? ''} placeholder={String(split[r.member_id] ?? 0)}
                      onBlur={e => {
                        const v = e.target.value.trim() === '' ? null : Number(e.target.value)
                        if (v === r.hours || (v !== null && (!Number.isFinite(v) || v < 0))) return
                        void save(rows.map(x => (x.member_id === r.member_id ? { ...x, hours: v } : x)))
                      }}
                      style={{ width: 54, font: 'inherit', fontSize: 12.5, border: '1px solid #E9EDF4', borderRadius: 6, padding: '2px 6px' }} />
                    {t('h')}
                  </label>
                : <span style={{ fontSize: 12, color: '#68738D' }}>{split[r.member_id] ?? 0} {t('h')}</span>
            )}
            {canEdit && <button type="button" aria-label={t('remove', { name: m.name })} data-assignee-remove={m.name} onClick={() => void save(rows.filter(x => x.member_id !== r.member_id))}
              style={{ border: 'none', background: 'none', padding: 0, color: '#929CB0', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
          </div>
        )
      })}
      {canEdit && rest.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button type="button" data-assignee-add="" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
            style={{ border: '1px dashed #D5DAE5', background: 'transparent', borderRadius: 999, padding: '3px 10px', font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#68738D', cursor: 'pointer' }}>
            {t('add')}
          </button>
          {open && (
            <div role="listbox" aria-label={t('add')} style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', insetInlineStart: 0, width: 220, maxHeight: 260, overflowY: 'auto',
              background: '#fff', border: '1px solid #E9EDF4', borderRadius: 10, boxShadow: '0 12px 34px rgba(20,20,20,.16)', padding: 4, display: 'grid' }}>
              {rest.map(m => (
                <button key={m.id} type="button" role="option" aria-selected={false} data-assignee-option={m.name}
                  onClick={() => { setOpen(false); void save([...rows, { member_id: m.id, hours: null }]) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: '6px 8px', borderRadius: 7, font: 'inherit', fontSize: 13.5, cursor: 'pointer', textAlign: 'start', color: '#18233F' }}>
                  <Avatar name={m.name} size={20} />{m.name}<span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: '#929CB0' }}>{m.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {err && <span role="alert" style={{ color: '#D22040', fontSize: 12.5 }}>{err}</span>}
    </div>
  )
}
