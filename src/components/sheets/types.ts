/**
 * What the Sheets screens need from the server (spec 013 contracts/server.md),
 * as one object. The app passes the real actions (`api.ts`); the lab passes a
 * stub, so every screen can be checked without a database.
 */
import type { FolderSummary, FormatWrite, SheetChanges, SheetDoc, SheetExtras, SheetSummary, TabColor } from '@/types/index'

export type Fail = { success: false; error: string }
export type Ok<T = object> = ({ success: true } & T) | Fail

export interface SheetsApi {
  listFolders(): Promise<Ok<{ folders: FolderSummary[]; pins: string[] }>>
  createFolder(name: string, opts?: { sheetPattern?: string }): Promise<Ok<{ folderId: string; sheetId: string }>>
  renameFolder(id: string, name: string): Promise<Ok<{ name: string }>>
  deleteFolder(id: string): Promise<Ok>
  setPins(ids: string[]): Promise<Ok<{ pins: string[] }>>
  listSheets(folderId: string): Promise<Ok<{ sheets: SheetSummary[] }>>
  createSheet(folderId: string, opts?: { before?: string | null; after?: string | null; pattern?: string }): Promise<Ok<{ sheet: SheetSummary }>>
  loadSheet(id: string): Promise<Ok<{ doc: SheetDoc; sheet: SheetSummary }>>
  applySheetChanges(id: string, changes: SheetChanges): Promise<Ok<{ updatedAt: string; skipped: { rowId?: string; colId?: string; reason: string }[]; positions?: { rows?: { id: string; position: number }[]; cols?: { id: string; position: number }[] } }>>
  renameSheet(id: string, name: string): Promise<Ok<{ name: string }>>
  deleteSheets(ids: string[]): Promise<Ok<{ deleted: string[] }>>
  moveSheets(ids: string[], folderId: string, beforeId: string | null, copy: boolean, opts?: { pattern?: string }): Promise<Ok<{ sheets: SheetSummary[] }>>
  colorSheets(ids: string[], color: TabColor | null): Promise<Ok>
  protectSheet(id: string, on: boolean): Promise<Ok<{ protectedBy: string | null }>>
  hideSheets(ids: string[], hidden: boolean): Promise<Ok>
  reorderSheets(folderId: string, ids: string[]): Promise<Ok>
  // ── spec 015 ──
  loadLinkedSheetExtras(sheetId: string): Promise<Ok<{ extras: SheetExtras; sheetId: string }>>
  applyLinkedFormats(sheetId: string, changes: { formats?: FormatWrite[] }): Promise<Ok<{ updatedAt: string }>>
}
