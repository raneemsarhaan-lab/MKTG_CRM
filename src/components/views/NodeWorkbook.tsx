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
import { useEffect, useMemo, useState, type ReactNode } from 'react'

/** A view never waits on "Opening the sheet…" longer than this: then it says so, with Try again (user, 25 Nov 2026). */
const OPEN_LIMIT_MS = 10_000
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Workbook } from '@/components/sheets/Workbook'
import { sheetsApi } from '@/components/sheets/api'
import { ensureNodeWorkbook, listFolders, listSheets } from '@/actions/sheets'
import { addRowsTab, deleteTab, duplicateTab, unlinkTab } from '@/actions/sheet-tabs'
import { useRouter } from 'next/navigation'
import type { RowsTabsHost } from '@/components/sheets/Workbook'
import type { FolderSummary, SheetSummary } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import type { BoardData } from './types'

type Loaded = { folder: FolderSummary; folders: FolderSummary[]; sheets: SheetSummary[] }

export function NodeWorkbook({ data, node, folder, linked, brandId = null, spaceId = null, rowsTab }: {
  data: BoardData
  /** A Space › Brand folder: tabs tagged with another brand are left out. */
  brandId?: string | null
  /** 'space:<id>' | 'brand:<id>' | 'me' */
  node?: string
  folder?: 'content' | 'video'
  /** What the linked tab shows: the Tasks sheet, or the Board's Content or Video sheet. */
  linked: ReactNode
  /** Spec 027 (US3): the Space whose board added tabs make tasks on; with `rowsTab`, "+" adds a tab of rows. */
  spaceId?: string | null
  rowsTab?: (sheet: SheetSummary) => ReactNode
}) {
  const router = useRouter()
  const t = useTranslations('spaces')
  // A link to one tab, or to a commented cell (`rowKey:colKey`), from a notification or an old Sheets address.
  const params = useSearchParams()
  const tab = params.get('tab'), cell = params.get('cell')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const mine = useMemo(() => (list: SheetSummary[]) => (brandId ? list.filter(s => !s.brandId || s.brandId === brandId) : list), [brandId])
  // The workbook re-reads its tabs after some changes: the same tabs are left out then.
  const api = useMemo(() => (brandId ? { ...sheetsApi, listSheets: async (id: string) => { const r = await sheetsApi.listSheets(id); return r.success ? { ...r, sheets: mine(r.sheets) } : r } } : sheetsApi), [brandId, mine])

  // Which try this is: Try again starts the load over.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    let step = 'folders'
    const where = node ?? folder
    const give = (why: string, detail?: unknown) => {
      if (!live) return
      live = false
      console.error(`[momentum:sheet] the ${where} sheet didn't open (${why}) at step "${step}"`, detail ?? '')
      setFailed(why)
    }
    // Never stay on the loading line: past the limit, say so and offer Try again.
    const timer = window.setTimeout(() => give('timeout', `no answer within ${OPEN_LIMIT_MS / 1000} s`), OPEN_LIMIT_MS)
    void (async () => {
      try {
        const all = await listFolders()
        const folders = all?.success ? all.folders : []
        if (node) {
          step = 'workbook'
          const r = await ensureNodeWorkbook(node)
          if (!live) return
          if (!r?.success) { give(r?.error ?? 'generic'); return }
          live = false
          setLoaded({ folder: r.folder, folders: [r.folder, ...folders], sheets: mine(r.sheets) })
        } else if (folder) {
          const f = folders.find(x => x.kind === folder)
          if (!f) { give('gone', all?.success ? 'no such folder' : all); return }
          step = 'tabs'
          const s = await listSheets(f.id)
          if (!live) return
          if (!s?.success) { give(s?.error ?? 'generic'); return }
          live = false
          setLoaded({ folder: f, folders, sheets: s.sheets })
        }
      } catch (e) {
        give('error', e)
      } finally {
        window.clearTimeout(timer)
      }
    })()
    return () => { live = false; window.clearTimeout(timer) }
  }, [node, folder, mine, attempt])

  const lead = data.currentUser.access === 'admin' || data.currentUser.access === 'superuser'
  const folderId = loaded?.folder.id ?? null
  const rowsTabs = useMemo<RowsTabsHost | undefined>(() => (rowsTab && folderId ? {
    render: rowsTab,
    add: (after, pattern) => addRowsTab(folderId, { spaceId, brandId, after, pattern }),
    duplicate: (id, pattern) => duplicateTab(id, { pattern }),
    remove: async id => { const r = await deleteTab(id); if (r.success) router.refresh(); return r },
    unlink: async id => { const r = await unlinkTab(id); if (r.success) router.refresh(); return r },
    mayManage: s => s.createdBy === data.currentUser.id || lead,
    refresh: () => router.refresh(),
  } : undefined), [rowsTab, folderId, spaceId, brandId, router, data.currentUser.id, lead])

  if (failed) return (
    <div data-node-workbook-error={failed} role="alert" style={{ padding: '18px 38px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', color: PIPE.textSecondary, fontSize: 13 }}>
      <span>{failed === 'timeout' ? t('workbookSlow') : t('workbookFailed')}</span>
      <button type="button" data-node-workbook-retry="" onClick={() => { setFailed(null); setLoaded(null); setAttempt(a => a + 1) }}
        style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 8, padding: '6px 12px', font: 'inherit', fontWeight: 700, color: PIPE.ink, cursor: 'pointer' }}>
        {t('workbookRetry')}
      </button>
    </div>
  )
  if (!loaded) return <p data-node-workbook-loading style={{ padding: '18px 38px', color: PIPE.textMuted, fontSize: 13 }}>{t('workbookLoading')}</p>
  return (
    <div data-node-workbook={node ?? folder} style={{ minWidth: 0 }}>
      <Workbook
        api={api}
        folder={loaded.folder}
        folders={loaded.folders}
        initialSheets={loaded.sheets}
        me={{ id: data.currentUser.id, admin: data.currentUser.access === 'admin' }}
        names={Object.fromEntries(data.members.map(m => [m.id, m.name]))}
        linked={linked}
        initialSheetId={tab && /^[0-9a-f-]{36}$/i.test(tab) ? tab : null}
        initialCell={cell && cell.length < 200 ? cell : null}
        inPage
        // Spec 027 (US2): a Space's (or brand's) first tab is its Board tab; My tasks keeps its Tasks tab.
        boardTabName={node === 'me' ? undefined : t('boardTab')}
        rowsTabs={rowsTabs}
      />
    </div>
  )
}
