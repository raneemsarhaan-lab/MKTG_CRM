'use client'

/**
 * Spec 025 (§2): "Group by brand" on a Space's Board — inside each stage column
 * the cards sit under their brand's name. Off outside a Space page and inside a
 * Space › Brand folder (one brand).
 */
import { createContext, useContext } from 'react'

const Ctx = createContext(false)
export const BrandGroupProvider = Ctx.Provider
export const useBrandGroup = () => useContext(Ctx)
