'use client'

/**
 * A brand's Assets tab (spec 025 §3): a sheet-style table of its files —
 * logos, templates, photos and finished designs. Columns: Name, Preview, Type,
 * Linked task, Added by, Date added. Sort by a column heading, filter by type,
 * search by name; upload with the button or by dragging files onto the table.
 *
 * Files on the brand's finished tasks are listed with them, read-only: they
 * belong to their task, which the Linked task cell opens.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { PIPE } from '@/lib/pipeline-tokens'
import { ASSET_KINDS, DEFAULT_QUERY, queryAssets, type AssetKind, type AssetQuery, type AssetRow, type AssetSort } from '@/lib/brand-assets'
import { addBrandAsset, deleteBrandAsset, listBrandAssets, updateBrandAsset } from '@/actions/brand-assets'
import { readAsDataUrl, shrinkImage } from '@/lib/attachment-upload'
import { MAX_INLINE_BYTES } from '@/lib/attachments'

const COLS: { key: AssetSort | 'preview'; sortable: boolean }[] = [
  { key: 'name', sortable: true }, { key: 'preview', sortable: false }, { key: 'kind', sortable: true },
  { key: 'task', sortable: true }, { key: 'added_by', sortable: true }, { key: 'added_at', sortable: true },
]
/** With a bucket, a file may be this large; without one, the database's own limit applies. */
const MAX_BUCKET_BYTES = 25 * 1024 * 1024

export function BrandAssetsTable({ brandId, tasks, hasStorage, onOpenTask }: {
  brandId: string
  /** The brand's tasks, to link a file to. */
  tasks: { id: string; name: string }[]
  hasStorage: boolean
  onOpenTask(id: string): void
}) {
  const t = useTranslations('assets')
  const locale = useLocale()
  const [rows, setRows] = useState<AssetRow[] | null>(null)
  const [who, setWho] = useState<{ lead: boolean; me: string }>({ lead: false, me: '' })
  const [q, setQ] = useState<AssetQuery>(DEFAULT_QUERY)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(0)
  const [over, setOver] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await listBrandAssets(brandId).catch(() => null)
    if (r?.success) { setRows(r.rows); setWho({ lead: r.lead, me: r.me }) } else setRows([])
  }, [brandId])
  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => queryAssets(rows ?? [], q), [rows, q])
  const mayEdit = (r: AssetRow) => r.source === 'asset' && (who.lead || r.added_by?.id === who.me)
  const fail = (e?: string) => setNote({ ok: false, text: e === 'too_large' ? t('tooLarge') : e === 'not_authorized' ? t('notAllowed') : t('failed') })

  async function upload(files: File[]) {
    if (!files.length) return
    setNote(null)
    setBusy(n => n + files.length)
    let added = 0
    for (const file of files) {
      try {
        if (file.size > (hasStorage ? MAX_BUCKET_BYTES : MAX_INLINE_BYTES)) { setNote({ ok: false, text: t('tooLargeNamed', { name: file.name }) }); continue }
        const data = await readAsDataUrl(file)
        const thumb = file.type.startsWith('image/') && file.type !== 'image/svg+xml' ? await shrinkImage(file, 360, 0.62).catch(() => null) : null
        const r = await addBrandAsset(brandId, { filename: file.name, data, content_type: file.type || null, size_bytes: file.size, thumb })
        if (r.success) added++; else fail(r.error)
      } catch { fail() } finally { setBusy(n => n - 1) }
    }
    if (added) { setNote({ ok: true, text: t('added', { n: added }) }); await load() }
  }
  async function addLink(url: string, name: string) {
    const r = await addBrandAsset(brandId, { filename: name || url.split('/').pop() || url, url }).catch(() => null)
    if (r?.success) { setLinking(false); setNote({ ok: true, text: t('added', { n: 1 }) }); await load() } else fail(r && !r.success ? r.error : undefined)
  }
  async function patch(r: AssetRow, p: Parameters<typeof updateBrandAsset>[1]) {
    setNote(null)
    const res = await updateBrandAsset(r.id, p).catch(() => null)
    if (res?.success) await load(); else fail(res && !res.success ? res.error : undefined)
  }
  async function remove(r: AssetRow) {
    if (!window.confirm(t('confirmDelete', { name: r.name }))) return
    const res = await deleteBrandAsset(r.id).catch(() => null)
    if (res?.success) { setNote({ ok: true, text: t('deleted', { name: r.name }) }); await load() } else fail(res && !res.success ? res.error : undefined)
  }

  const sortBy = (k: AssetSort) => setQ(x => (x.sort === k ? { ...x, dir: x.dir === 'asc' ? 'desc' : 'asc' } : { ...x, sort: k, dir: k === 'added_at' ? 'desc' : 'asc' }))
  const date = (iso: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' }).format(new Date(iso))
  const ext = (r: AssetRow) => (r.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (r.href?.startsWith('http') && !r.content_type ? 'link' : 'file')).toUpperCase()

  const cell: React.CSSProperties = { padding: '6px 10px', borderBottom: `1px solid ${PIPE.border}`, borderInlineEnd: `1px solid ${PIPE.border}`, fontSize: 13, verticalAlign: 'middle', textAlign: 'start' }
  const head: React.CSSProperties = { ...cell, position: 'sticky', top: 0, background: '#F6F7F9', fontSize: 12, fontWeight: 700, color: PIPE.textSecondary, whiteSpace: 'nowrap', zIndex: 1 }
  const btn: React.CSSProperties = { border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 9, padding: '6px 11px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PIPE.ink }
  const field: React.CSSProperties = { border: `1px solid ${PIPE.border}`, borderRadius: 8, padding: '5px 8px', fontFamily: 'inherit', fontSize: 13, background: '#FFFFFF', color: PIPE.ink, maxWidth: '100%' }
  const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? PIPE.ink : PIPE.border}`, background: on ? PIPE.ink : '#FFFFFF', color: on ? '#FFFFFF' : PIPE.ink, borderRadius: 999, padding: '3px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' })

  return (
    <div data-brand-assets="" style={{ padding: '14px 26px 30px 38px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input type="search" value={q.search} onChange={e => setQ(x => ({ ...x, search: e.target.value }))} placeholder={t('search')} aria-label={t('search')} data-assets-search="" style={{ ...field, width: 220 }} />
        <span role="group" aria-label={t('filterType')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" aria-pressed={!q.kinds.length} data-assets-kind="all" onClick={() => setQ(x => ({ ...x, kinds: [] }))} style={chip(!q.kinds.length)}>{t('allTypes')}</button>
          {ASSET_KINDS.map(k => {
            const on = q.kinds.includes(k)
            return <button key={k} type="button" aria-pressed={on} data-assets-kind={k} onClick={() => setQ(x => ({ ...x, kinds: on ? x.kinds.filter(y => y !== k) : [...x.kinds, k] }))} style={chip(on)}>{t(`kind.${k}`)}</button>
          })}
        </span>
        <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" data-assets-link="" style={btn} onClick={() => setLinking(v => !v)}>{t('addLink')}</button>
          <button type="button" data-assets-upload="" style={{ ...btn, background: '#14131A', color: '#FFFFFF', border: 'none' }} onClick={() => input.current?.click()}>{t('upload')}</button>
          <input ref={input} type="file" multiple hidden data-assets-input="" onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void upload(f) }} />
        </span>
      </div>
      {linking && (
        <form data-assets-link-form="" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
          onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void addLink(String(f.get('url') ?? '').trim(), String(f.get('name') ?? '').trim()) }}>
          <input name="url" type="url" required placeholder="https://" aria-label={t('linkUrl')} style={{ ...field, width: 320 }} autoFocus />
          <input name="name" placeholder={t('linkName')} aria-label={t('linkName')} style={{ ...field, width: 200 }} />
          <button type="submit" style={btn}>{t('add')}</button>
        </form>
      )}
      <p role="status" aria-live="polite" data-assets-msg="" style={{ minHeight: 18, margin: 0, fontSize: 12.5, fontWeight: 600, color: note?.ok === false ? '#C2353A' : PIPE.textMuted }}>
        {busy > 0 ? t('uploading', { n: busy }) : note?.text ?? ''}
      </p>
      <div data-assets-drop="" data-over={over || undefined}
        onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setOver(true) } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false) }}
        onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); void upload(Array.from(e.dataTransfer.files)) }}
        style={{ border: `1px solid ${over ? PIPE.ink : PIPE.border}`, outline: over ? `2px dashed ${PIPE.ink}` : 'none', outlineOffset: 2, borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 300px)', background: '#FFFFFF' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 860 }}>
          <thead>
            <tr>
              {COLS.map(c => (
                <th key={c.key} scope="col" style={{ ...head, width: c.key === 'preview' ? 76 : c.key === 'name' ? '30%' : undefined }}
                  aria-sort={c.sortable && q.sort === c.key ? (q.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortable
                    ? <button type="button" data-assets-sort={c.key} onClick={() => sortBy(c.key as AssetSort)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'inline-flex', gap: 4 }}>
                        {t(`col.${c.key}`)}<span aria-hidden="true">{q.sort === c.key ? (q.dir === 'asc' ? '↑' : '↓') : ''}</span>
                      </button>
                    : t(`col.${c.key}`)}
                </th>
              ))}
              <th scope="col" style={{ ...head, width: 44, borderInlineEnd: 'none' }}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('col.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.key} data-asset-row={r.name} data-asset-source={r.source}>
                <td style={{ ...cell, fontWeight: 600 }}>
                  {renaming === r.key
                    ? <input autoFocus defaultValue={r.name} aria-label={t('rename')} style={{ ...field, width: '100%' }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }}
                        onBlur={e => { const v = e.target.value.trim(); setRenaming(null); if (v && v !== r.name) void patch(r, { filename: v }) }} />
                    : <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                        {r.href
                          ? <a href={r.href} target="_blank" rel="noreferrer" data-asset-open="" style={{ color: PIPE.ink, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</a>
                          : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>}
                        {mayEdit(r) && <button type="button" data-asset-rename="" aria-label={t('renameNamed', { name: r.name })} title={t('rename')} onClick={() => setRenaming(r.key)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: PIPE.textMuted, padding: 0, fontFamily: 'inherit' }}>✎</button>}
                      </span>}
                </td>
                <td style={cell}>
                  {r.preview
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r.preview} alt="" loading="lazy" data-asset-preview="" style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block', background: '#F1F2F4' }} />
                    : <span aria-hidden="true" style={{ width: 56, height: 40, borderRadius: 6, display: 'grid', placeItems: 'center', background: '#F1F2F4', color: PIPE.textMuted, fontSize: 10.5, fontWeight: 800 }}>{ext(r)}</span>}
                </td>
                <td style={cell}>
                  {mayEdit(r)
                    ? <select value={r.kind} aria-label={t('typeOf', { name: r.name })} data-asset-kind="" style={field} onChange={e => void patch(r, { kind: e.target.value as AssetKind })}>
                        {ASSET_KINDS.map(k => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
                      </select>
                    : t(`kind.${r.kind}`)}
                </td>
                <td style={cell}>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                    {r.task && <button type="button" data-asset-task={r.task.id} onClick={() => onOpenTask(r.task!.id)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: '#2F5BD7', cursor: 'pointer', textAlign: 'start', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↗ {r.task.name}</button>}
                    {mayEdit(r) && (
                      <select value={r.task?.id ?? ''} aria-label={t('linkTaskOf', { name: r.name })} data-asset-link-task="" style={{ ...field, width: r.task ? 30 : 150, flexShrink: 0 }} onChange={e => void patch(r, { task_id: e.target.value || null })}>
                        <option value="">{r.task ? t('unlinkTask') : t('linkTask')}</option>
                        {tasks.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    )}
                    {!r.task && !mayEdit(r) && <span style={{ color: PIPE.textMuted }}>—</span>}
                  </span>
                </td>
                <td style={cell}>{r.added_by?.name ?? <span style={{ color: PIPE.textMuted }}>—</span>}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}><time dateTime={r.added_at}>{date(r.added_at)}</time></td>
                <td style={{ ...cell, borderInlineEnd: 'none', textAlign: 'center' }}>
                  {mayEdit(r) && <button type="button" data-asset-delete="" aria-label={t('deleteNamed', { name: r.name })} title={t('delete')} onClick={() => void remove(r)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: PIPE.textMuted, fontFamily: 'inherit', fontSize: 15 }}>×</button>}
                </td>
              </tr>
            ))}
            {rows && !shown.length && (
              <tr><td colSpan={7} data-assets-empty="" style={{ ...cell, borderInlineEnd: 'none', borderBottom: 'none', color: PIPE.textMuted, padding: '26px 10px', textAlign: 'center' }}>{rows.length ? t('noMatch') : t('empty')}</td></tr>
            )}
            {!rows && <tr><td colSpan={7} style={{ ...cell, borderInlineEnd: 'none', borderBottom: 'none', color: PIPE.textMuted, padding: '26px 10px', textAlign: 'center' }}>{t('loading')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: PIPE.textMuted }}>{t('dropHint')}{rows ? ` ${t('count', { n: shown.length, total: rows.length })}` : ''}</p>
    </div>
  )
}
