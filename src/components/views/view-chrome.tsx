'use client'

/**
 * Sheet look (user, 25 Nov 2026): a page with views (ViewHost) offers two places in its own header,
 * so a sheet doesn't repeat the page's title in a second header:
 *   - status: beside the page's title chip ("• Saved");
 *   - tools:  the right end of the view tabs row (the sheet's Fields and Comments).
 * The workbook renders into them with a portal; anywhere else (the Sheets section) it keeps its own title row.
 *
 * Simple sheet header (user, 25 Nov 2026, "Simple sheet header" board): on a Space, folder or brand page
 * the Sheet view's header is three rows — breadcrumb, views, and one toolbar. `simple` says so; `add` is
 * the page's own "+ Post" (its label follows the Space's New task label). The workbook draws the toolbar
 * and lends two places in it (SheetBarContext): `tools` (Search, Filters, Mine) and `add` ("+ Post ▾").
 */
import { createContext, useContext, type ReactNode } from 'react'

/** The page's own add action: a click, or a node that is its own button (a media board's create). */
export interface PageAdd { label: string; onClick?: () => void; node?: ReactNode }

export interface ViewChrome {
  status: HTMLElement | null
  tools: HTMLElement | null
  /** The simple sheet header is on: the workbook draws the one toolbar row. */
  simple?: boolean
  add?: PageAdd | null
}

export const ViewChromeContext = createContext<ViewChrome | null>(null)

export const useViewChrome = () => useContext(ViewChromeContext)

/** The simple toolbar's places, lent by the workbook to the sheet inside it. */
export interface SheetBar { tools: HTMLElement | null; add: HTMLElement | null }

export const SheetBarContext = createContext<SheetBar | null>(null)

export const useSheetBar = () => useContext(SheetBarContext)
