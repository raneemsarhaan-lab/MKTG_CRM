'use client'

/**
 * The server calls the Content and Video sheets' formatting needs (spec 015
 * FR-070–FR-075), handed down by the Sheets workbook. The linked grids are
 * rendered inside the workbook's tree, so they get it from context; elsewhere
 * (and in the labs) there is none, and the grids show no formatting tools.
 */
import { createContext } from 'react'
import type { SheetsApi } from '../types'

export type LinkedFormatsApi = Pick<SheetsApi, 'loadLinkedSheetExtras' | 'applyLinkedFormats'>
export const LinkedFormatsContext = createContext<LinkedFormatsApi | null>(null)
