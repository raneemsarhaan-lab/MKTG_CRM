'use client'

/**
 * Link to board (spec 027, US3; FR-018–FR-021): before anything is created, the tab's columns are
 * matched to task fields by name (change any, or keep it on the sheet only) and the dialog says what
 * linking will do: "This will create N tasks on the [Space] board", "Reconnects N rows to their tasks.
 * No duplicates.", and which rows have no title and stay plain.
 */
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Modal } from './Dialogs'
import { linkTab, tabLinkPreview, type TabLinkPreview } from '@/actions/sheet-tabs'
import type { LinkField } from '@/lib/tab-link'

type Field = LinkField | 'sheet'

export function LinkTabDialog({ sheetId, name, onDone, onCancel }: {
  sheetId: string
  name: string
  /** Linked: the counts of what happened. */
  onDone(r: { created: number; reconnected: number; problems: string[] }): void
  onCancel(): void
}) {
  const t = useTranslations('sheets.linkTab')
  const [preview, setPreview] = useState<TabLinkPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [match, setMatch] = useState<Record<string, Field>>({})
  /** A Brand page's tab: the Space whose board it links to. */
  const [spaceId, setSpaceId] = useState('')

  useEffect(() => {
    let live = true
    void tabLinkPreview(sheetId).then(r => {
      if (!live) return
      if (!r.success) { setError(r.error); return }
      setPreview(r)
      setSpaceId(r.spaces[0]?.id ?? '')
      setMatch(Object.fromEntries(r.columns.map(c => [c.column, c.field])))
    }).catch(() => live && setError('generic'))
    return () => { live = false }
  }, [sheetId])

  async function go() {
    if (!preview) return
    setBusy(true)
    const r = await linkTab(sheetId, Object.entries(match).map(([column, field]) => ({ column, field })), preview.space ? null : spaceId).catch(() => ({ success: false as const, error: 'generic' }))
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    onDone(r)
  }

  const label = (k: string) => {
    const std = ['title', 'brand', 'type', 'status', 'owner', 'assignee', 'publish', 'due']
    return std.includes(k) ? t(`field.${k}`) : preview?.fields.find(f => f.key === k)?.name ?? k
  }
  // A field is matched once: the other columns can't pick it too.
  const taken = new Set(Object.values(match).filter(f => f !== 'sheet'))

  return (
    <Modal title={t('title', { name })} onCancel={onCancel} attr="data-link-tab-dialog" width={520}>
      {!preview && !error && <p role="status">{t('loading')}</p>}
      {error && <p role="alert" data-link-tab-error={error}>{t.has(`error.${error}`) ? t(`error.${error}`) : t('error.generic')}</p>}
      {preview && (
        <div className="fx-linktab">
          {!preview.space && (
            <label className="fx-linktab-col" data-link-space="">
              <span>{t('space')}</span>
              <span aria-hidden="true">→</span>
              <select value={spaceId} onChange={e => setSpaceId(e.target.value)} data-link-space-pick="">
                {preview.spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          {preview.columns.length > 0 && (
            <fieldset className="fx-linktab-cols">
              <legend>{t('columns')}</legend>
              {preview.columns.map(c => (
                <label key={c.column} className="fx-linktab-col" data-link-col={c.name}>
                  <span>{c.name}</span>
                  <span aria-hidden="true">→</span>
                  <select value={match[c.column] ?? 'sheet'} onChange={e => setMatch(m => ({ ...m, [c.column]: e.target.value as Field }))}>
                    <option value="sheet">{t('sheetOnly')}</option>
                    {preview.fields.filter(f => f.key !== 'title').map(f => (
                      <option key={f.key} value={f.key} disabled={taken.has(f.key) && match[c.column] !== f.key}>{label(f.key)}</option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
          )}
          <ul className="fx-linktab-counts">
            <li data-link-create={preview.create}>{t('create', { n: preview.create, space: preview.space?.name ?? preview.spaces.find(s => s.id === spaceId)?.name ?? '' })}</li>
            {preview.reconnect > 0 && <li data-link-reconnect={preview.reconnect}>{t('reconnect', { n: preview.reconnect })}</li>}
            {preview.linked > 0 && <li>{t('already', { n: preview.linked })}</li>}
            {preview.untitled.length > 0 && <li data-link-untitled={preview.untitled.length}>{t('untitled', { n: preview.untitled.length, rows: preview.untitled.join(', ') })}</li>}
            {preview.conflicts > 0 && <li>{t('conflicts', { n: preview.conflicts })}</li>}
          </ul>
        </div>
      )}
      <div className="fx-sh-dialog-row">
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-go" data-ok="" data-link-tab-go="" disabled={!preview || busy || (!preview.space && !spaceId)} onClick={() => void go()}>{t('go')}</button>
      </div>
    </Modal>
  )
}
