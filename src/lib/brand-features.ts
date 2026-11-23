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

/** Every switch resolved to on or off: the brand's own value, else the workspace default, else on. */
export function resolveFeatures(own: BrandFeatures | null | undefined, defaults?: BrandFeatures | null): Required<BrandFeatures> {
  const out = {} as Required<BrandFeatures>
  for (const k of BRAND_FEATURES) out[k] = featureOn({ features: own }, k, defaults)
  return out
}

/**
 * A loaded brand with its switches resolved (`features`) and its own
 * overrides kept apart (`own_features`) for the switches panel. Loaders call
 * this once, so every view can ask `featureOn(task.brand, key)` without the
 * workspace defaults.
 */
export function withResolvedFeatures<T extends { features?: BrandFeatures | null }>(brand: T, defaults?: BrandFeatures | null): T & { features: Required<BrandFeatures>; own_features: BrandFeatures } {
  const own = cleanFeatures(brand.features)
  return { ...brand, own_features: own, features: resolveFeatures(own, defaults) }
}

/** True when a feature is on for at least one of these brands (or there are none to ask). */
export function featureOnAny(brands: ({ features?: BrandFeatures | null } | null | undefined)[], key: BrandFeatureKey): boolean {
  return brands.length === 0 || brands.some(b => featureOn(b, key))
}

/** The sheet column each switch hides, where a sheet has one. */
export const COLUMN_FEATURE: Record<string, BrandFeatureKey> = {
  type: 'type', priority: 'priorities', platform: 'platform', pillar: 'pillars', hours: 'hours', clips: 'clips',
}

/** A switched-off field in a mixed view: a hatched, empty cell (design/spaces-stage-c.html). */
export const FEATURE_OFF_CELL = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(120, 126, 140, .18) 0 3px, transparent 3px 8px)',
} as const

/** The switch a sheet column follows when it's off for this brand, or null when the cell shows normally. */
export function offFeatureFor(brand: { features?: BrandFeatures | null } | null | undefined, col: string): BrandFeatureKey | null {
  const k = COLUMN_FEATURE[col]
  return k && !featureOn(brand, k) ? k : null
}
