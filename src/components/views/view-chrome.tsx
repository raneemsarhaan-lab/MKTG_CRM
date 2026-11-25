'use client'

/**
 * Sheet look (user, 25 Nov 2026): a page with views (ViewHost) offers two places in its own header,
 * so a sheet doesn't repeat the page's title in a second header:
 *   - status: beside the page's title chip ("• Saved");
 *   - tools:  the right end of the view tabs row (the sheet's Fields and Comments).
 * The workbook renders into them with a portal; anywhere else (the Sheets section) it keeps its own title row.
 */
import { createContext, useContext } from 'react'

export interface ViewChrome { status: HTMLElement | null; tools: HTMLElement | null }

export const ViewChromeContext = createContext<ViewChrome | null>(null)

export const useViewChrome = () => useContext(ViewChromeContext)
