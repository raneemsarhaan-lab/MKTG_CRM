/**
 * Per-brand feature switches (spec 021 US4, research R11). Pure.
 *
 * A brand stores overrides only. A missing key falls back to the workspace
 * default, and a missing default means on — so an untouched brand behaves
 * exactly as before this spec. Switching a feature off hides it; it never
 * clears a value (FR-020).
 */
import type { BrandFeatureKey, BrandFeatures } from '@/types/index'

export const BRAND_FEATURES: BrandFeatureKey[] = ['priorities', 'platform', 'type', 'pillars', 'hours', 'covers', 'clips', 'sla']

export function featureOn(
  brand: { features?: BrandFeatures | null } | null | undefined,
  key: BrandFeatureKey,
  defaults?: BrandFeatures | null,
): boolean {
  const own = brand?.features?.[key]
  if (typeof own === 'boolean') return own
  const dflt = defaults?.[key]
  return typeof dflt === 'boolean' ? dflt : true
}

/** Only the keys this spec knows, as booleans — for saving. */
export function cleanFeatures(input: unknown): BrandFeatures {
  const out: BrandFeatures = {}
  if (!input || typeof input !== 'object') return out
  for (const k of BRAND_FEATURES) {
    const v = (input as Record<string, unknown>)[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}
