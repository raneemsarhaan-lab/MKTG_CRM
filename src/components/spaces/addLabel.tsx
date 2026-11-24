'use client'

/**
 * Spec 024 (§3): a Space's "New task label", for the add rows and buttons of
 * the sheets shown inside that Space. Null outside a Space, or when the Space
 * hasn't set one: the sheet keeps its own words.
 */
import { createContext, useContext } from 'react'

const Ctx = createContext<string | null>(null)
export const AddLabelProvider = Ctx.Provider
/** The Space's label with a leading "+", or the sheet's own text. */
export function useAddLabel(fallback: string): string {
  const label = useContext(Ctx)
  return label ? `+ ${label}` : fallback
}
