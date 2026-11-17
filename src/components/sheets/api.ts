/**
 * The real SheetsApi: the actions in src/actions/sheets.ts. A thrown error
 * (the network, a deploy) becomes `{ success: false, error: 'network' }`, which
 * the outbox retries; a refusal from the server keeps its own code.
 */
import * as A from '@/actions/sheets'
import * as Lk from '@/actions/sheet-links'
import type { SheetsApi } from './types'

const net = { success: false as const, error: 'network' }
const safe = <T extends unknown[], R>(fn: (...a: T) => Promise<R>) => (...a: T) => fn(...a).catch(() => net)

export const sheetsApi: SheetsApi = {
  listFolders: safe(A.listFolders),
  createFolder: safe(A.createFolder),
  renameFolder: safe(A.renameFolder),
  deleteFolder: safe(A.deleteFolder),
  setPins: safe(A.setPins),
  listSheets: safe(A.listSheets),
  createSheet: safe(A.createSheet),
  loadSheet: safe(A.loadSheet),
  applySheetChanges: safe(A.applySheetChanges),
  renameSheet: safe(A.renameSheet),
  deleteSheets: safe(A.deleteSheets),
  moveSheets: safe(A.moveSheets),
  colorSheets: safe(A.colorSheets),
  protectSheet: safe(A.protectSheet),
  hideSheets: safe(A.hideSheets),
  reorderSheets: safe(A.reorderSheets),
  loadLinkedSheetExtras: safe(A.loadLinkedSheetExtras),
  applyLinkedFormats: safe(A.applyLinkedFormats),
  // spec 016
  linkColumn: safe(Lk.linkColumn),
  resolveTaskCells: safe(Lk.resolveTaskCells),
  writeTaskFields: safe(Lk.writeTaskFields),
  refreshTaskFields: safe(Lk.refreshTaskFields),
  taskValues: safe(Lk.taskValues),
  searchTasks: safe(Lk.searchTasks),
  linkChoices: safe(Lk.linkChoices),
  createTasksForRows: safe(Lk.createTasksForRows),
} as SheetsApi
