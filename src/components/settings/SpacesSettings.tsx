'use client'

/**
 * Settings → Spaces (spec 021 US1, FR-004, FR-005, FR-033): admins create,
 * rename, recolour and reorder team Spaces, say which are production Spaces
 * and what kind of task each creates, pick members, and archive or delete.
 * Deleting needs the Space archived and its name typed back; tasks stay in
 * their brands either way.
 */
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Member } from '@/types/index'
import {
  archiveSpace, createSpace, deleteSpace, listSpacesForSettings, restoreSpace, setSpaceMembers, updateSpace,
} from '@/actions/spaces'

type Row = { id: string; key: string; name: string; color: string; is_production: boolean; default_kind: string; archived: boolean; memberIds: string[] }

const card: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 3px rgba(16,16,11,.06)', display: 'grid', gap: 12 }
const input: React.CSSProperties = { border: '1px solid #E1E1E0', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13.5 }
const btn = (primary = false): React.CSSProperties => ({ border: primary ? 'none' : '1px solid #E1E1E0', background: primary ? 'var(--lime)' : '#fff', color: 'var(--ink)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' })

export function SpacesSettings({ members }: { members: Member[] }) {
  const t = useTranslations('spaces.settings')
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [note, setNote] = useState('')
  const [busy, start] = useTransition()
  const [draft, setDraft] = useState({ name: '', color: '#5B93F5' })
  const [confirm, setConfirm] = useState<Record<string, string>>({})

  async function load() {
    const res = await listSpacesForSettings()
    if (res.success) setRows(res.spaces)
  }
  useEffect(() => { void load() }, [])

  function run(fn: () => Promise<{ success: boolean }>) {
    setNote('')
    start(async () => {
      const res = await fn()
      setNote(res.success ? t('saved') : t('error'))
      if (res.success) { await load(); router.refresh() }
    })
  }

  if (!rows) return null
  return (
    <div data-spaces-settings style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>{t('title')}</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 0' }}>{t('lede')}</p>
      </div>
      {rows.map(r => (
        <div key={r.id} data-space-row={r.key} style={{ ...card, opacity: r.archived ? 0.7 : 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input aria-label={t('color')} type="color" defaultValue={r.color} onBlur={e => e.target.value !== r.color && run(() => updateSpace(r.id, { color: e.target.value }))} style={{ width: 34, height: 30, border: 'none', background: 'none' }} />
            <input aria-label={t('name')} defaultValue={r.name} onBlur={e => e.target.value.trim() && e.target.value !== r.name && run(() => updateSpace(r.id, { name: e.target.value }))} style={{ ...input, flex: 1, minWidth: 160, fontWeight: 700 }} />
            {r.archived && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{t('archived')}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 13 }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} title={t('productionHint')}>
              <input type="checkbox" checked={r.is_production} onChange={e => run(() => updateSpace(r.id, { is_production: e.target.checked }))} />
              {t('production')}
            </label>
            {/* No default kind (user, 2026-11-23): every task starts simple; a Task link makes it a pipeline task. */}
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{t('members')} · {r.memberIds.length}</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6, marginTop: 8 }}>
              {members.map(m => (
                <label key={m.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={r.memberIds.includes(m.id)}
                    onChange={e => run(() => setSpaceMembers(r.id, e.target.checked ? [...r.memberIds, m.id] : r.memberIds.filter(x => x !== m.id)))} />
                  {m.name} <span style={{ color: 'var(--muted)', fontSize: 12 }}>{m.role}</span>
                </label>
              ))}
            </div>
          </details>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {r.archived
              ? <button type="button" style={btn()} disabled={busy} onClick={() => run(() => restoreSpace(r.id))}>{t('restore')}</button>
              : <button type="button" style={btn()} disabled={busy} onClick={() => run(() => archiveSpace(r.id))}>{t('archive')}</button>}
            {r.archived && (
              <>
                <input aria-label={t('deleteConfirm')} placeholder={r.name} value={confirm[r.id] ?? ''} onChange={e => setConfirm(c => ({ ...c, [r.id]: e.target.value }))} style={input} />
                <button type="button" style={{ ...btn(), color: 'var(--coral)' }} disabled={busy || (confirm[r.id] ?? '') !== r.name} onClick={() => run(() => deleteSpace(r.id, confirm[r.id] ?? ''))}>{t('delete')}</button>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('deleteConfirm')}</span>
              </>
            )}
          </div>
        </div>
      ))}
      <form style={{ ...card, gridTemplateColumns: 'auto 1fr auto', alignItems: 'center' }}
        onSubmit={e => { e.preventDefault(); if (draft.name.trim()) run(async () => { const r = await createSpace({ name: draft.name, color: draft.color, is_production: false, default_kind: 'pipeline' }); if (r.success) setDraft({ name: '', color: '#5B93F5' }); return r }) }}>
        <input aria-label={t('color')} type="color" value={draft.color} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} style={{ width: 34, height: 30, border: 'none', background: 'none' }} />
        <input aria-label={t('name')} placeholder={t('name')} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={input} />
        <button type="submit" style={btn(true)} disabled={busy || !draft.name.trim()}>{t('add')}</button>
      </form>
      {note && <p role="status" style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{note}</p>}
    </div>
  )
}
