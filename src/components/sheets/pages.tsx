'use client'

/**
 * The Sheets pages' client side: the server pages can't hand functions to the
 * client, so these pass the real actions (`sheetsApi`) to the screens. The
 * labs render the screens with a stub instead.
 */
import type { ReactNode } from 'react'
import type { FolderSummary, SheetSummary } from '@/types/index'
import { sheetsApi } from './api'
import { SheetsHome } from './SheetsHome'
import { Workbook } from './Workbook'

export function SheetsHomePage(p: { folders: FolderSummary[]; pins: string[]; now: string }) {
  return <SheetsHome api={sheetsApi} initialFolders={p.folders} initialPins={p.pins} now={p.now} />
}

export function WorkbookPage(p: {
  folder: FolderSummary
  folders: FolderSummary[]
  sheets: SheetSummary[]
  me: { id: string; admin: boolean }
  names: Record<string, string>
  linked?: ReactNode
  sheetId?: string | null
  /** Spec 015: a notification's cell, `rowKey:colKey`. */
  cell?: string | null
}) {
  return (
    <Workbook api={sheetsApi} folder={p.folder} folders={p.folders} initialSheets={p.sheets}
              me={p.me} names={p.names} linked={p.linked} initialSheetId={p.sheetId} initialCell={p.cell ?? null} />
  )
}
