'use client'

/**
 * Settings › Sheets (spec 020 tip 17, task T029): the workspace's own lists
 * that the fill handle continues (Custom Lists). Admins only, as the page;
 * the same dialog as Data › Custom Lists… in a sheet.
 */
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { loadFillLists, saveFillLists } from '@/actions/settings'
import { CustomListsDialog } from '@/components/sheets/format/TipsDialogs'
import type { FillList } from '@/lib/sheet-fill'

export function FillLists() {
  const t = useTranslations('sheets.tips')
  const [lists, setLists] = useState<FillList[] | null>(null)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => { void loadFillLists().then(r => setLists(r.success ? r.lists : [])) }, [])
  return (
    <section data-settings-lists="" style={{ background: '#fff', border: '1px solid #ECECF1', borderRadius: 14, padding: '18px 20px', display: 'grid', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--ink)' }}>{t('lists.title')}</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#5A5F6C' }}>{t('lists.sub')}</p>
      </div>
      {lists === null ? <p style={{ margin: 0, color: '#5A5F6C', fontSize: '0.85rem' }}>…</p> : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {lists.length === 0 && <li style={{ color: '#5A5F6C', fontSize: '0.85rem' }}>{t('lists.none')}</li>}
          {lists.map(l => (
            <li key={l.id} dir="auto" style={{ fontSize: '0.88rem', color: 'var(--ink)', background: '#F7F7F9', borderRadius: 8, padding: '7px 10px' }}>
              {l.items.slice(0, 6).join(', ')}{l.items.length > 6 ? ', …' : ''} <span style={{ color: '#5A5F6C' }}>· {t('lists.count', { n: l.items.length })}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="button" data-settings-lists-edit="" onClick={() => setOpen(true)} disabled={lists === null}
                style={{ border: 0, background: 'var(--inbox-lime, #C8F24E)', color: '#14131A', borderRadius: 999, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t('lists.edit')}
        </button>
        {note && <span role="status" style={{ fontSize: '0.85rem', color: '#2B7A37' }}>{note}</span>}
      </div>
      {open && lists && (
        <CustomListsDialog lists={lists} canEdit fromCells={[]} onCancel={() => setOpen(false)}
          onSave={async next => {
            setOpen(false)
            const r = await saveFillLists(next)
            if (r.success) { setLists(r.lists); setNote(t('lists.saved')) } else setNote(r.error)
          }} />
      )}
    </section>
  )
}
