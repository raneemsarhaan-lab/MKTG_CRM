'use client'

/**
 * A Sheet tab as a full workbook (spec 021 T081, user 2026-11-22): the same
 * tabs, toolbar, formatting, comments and blank tabs as /sheets, on a Space,
 * brand or My tasks page.
 *
 * - `folder: 'content' | 'video'`: today's Content or Video folder, its linked
 *   tab showing only this page's rows (the Content and Video Spaces, and a
 *   brand's Content and Video sheets).
 * - `node`: the page's own workbook (ensureNodeWorkbook): a live Tasks tab
 *   first, then any blank tabs the team adds.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Workbook } from '@/components/sheets/Workbook'
import { sheetsApi } from '@/components/sheets/api'
import { ensureNodeWorkbook, listFolders, listSheets } from '@/actions/sheets'
import type { FolderSummary, SheetSummary } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import type { BoardData } from './types'

type Loaded = { folder: FolderSummary; folders: FolderSummary[]; sheets: SheetSummary[] }

export function NodeWorkbook({ data, node, folder, linked }: {
  data: BoardData
  /** 'space:<id>' | 'brand:<id>' | 'me' */
  node?: string
  folder?: 'content' | 'video'
  /** What the linked tab shows: the Tasks sheet, or the Board's Content or Video sheet. */
  linked: ReactNode
}) {
  const t = useTranslations('spaces')
  // A link to one tab, or to a commented cell (`rowKey:colKey`), from a notification or an old Sheets address.
  const params = useSearchParams()
  const tab = params.get('tab'), cell = params.get('cell')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      const all = await listFolders().catch(() => null)
      const folders = all?.success ? all.folders : []
      if (node) {
        const r = await ensureNodeWorkbook(node).catch(() => null)
        if (!live) return
        if (!r?.success) { setFailed(r?.error ?? 'generic'); return }
        setLoaded({ folder: r.folder, folders: [r.folder, ...folders], sheets: r.sheets })
      } else if (folder) {
        const f = folders.find(x => x.kind === folder)
        const s = f ? await listSheets(f.id).catch(() => null) : null
        if (!live) return
        if (!f || !s?.success) { setFailed('gone'); return }
        setLoaded({ folder: f, folders, sheets: s.sheets })
      }
    })()
    return () => { live = false }
  }, [node, folder])

  if (failed) return <p data-node-workbook-error style={{ padding: '18px 38px', color: PIPE.textMuted, fontSize: 13 }}>{t('workbookFailed')}</p>
  if (!loaded) return <p data-node-workbook-loading style={{ padding: '18px 38px', color: PIPE.textMuted, fontSize: 13 }}>{t('workbookLoading')}</p>
  return (
    <div data-node-workbook={node ?? folder} style={{ minWidth: 0 }}>
      <Workbook
        api={sheetsApi}
        folder={loaded.folder}
        folders={loaded.folders}
        initialSheets={loaded.sheets}
        me={{ id: data.currentUser.id, admin: data.currentUser.access === 'admin' }}
        names={Object.fromEntries(data.members.map(m => [m.id, m.name]))}
        linked={linked}
        initialSheetId={tab && /^[0-9a-f-]{36}$/i.test(tab) ? tab : null}
        initialCell={cell && cell.length < 200 ? cell : null}
        inPage
      />
    </div>
  )
}
