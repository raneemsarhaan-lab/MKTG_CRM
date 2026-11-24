'use server'

/**
 * Per-brand feature switches (spec 021 US4, FR-019–FR-021, research R11).
 *
 * A brand stores overrides only: `null` for a key puts it back on the
 * workspace default. Switching a feature off hides it; no task value is ever
 * touched, so switching it back on brings everything back unchanged (FR-020).
 * Admins only.
 */
import { asPriority } from '@/lib/priorities'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'
import { BRAND_FEATURES, FIELD_SWITCH, cleanFeatures } from '@/lib/brand-features'
import type { BrandFeatureKey, BrandFeatures } from '@/types/index'

type Result = { success: true } | { success: false; error: string }

function revalidateEverywhere() {
  // Every view shows brand fields, so refresh the whole app shell.
  revalidatePath('/', 'layout')
}

/** Change some of a brand's switches. `true`/`false` overrides; `null` follows the workspace default. */
export async function setBrandFeatures(brandId: string, patch: Partial<Record<BrandFeatureKey | `f:${string}`, boolean | null>>): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  if (typeof brandId !== 'string' || !brandId) return { success: false, error: 'not_found' }
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { features: true } })
  if (!brand) return { success: false, error: 'not_found' }

  const next: BrandFeatures = cleanFeatures(brand.features)
  for (const k of BRAND_FEATURES) {
    if (!patch || !(k in patch)) continue
    const v = patch[k]
    if (v === null) delete next[k]
    else if (typeof v === 'boolean') next[k] = v
  }
  // Spec 023: switchable task fields, by `f:<field id>`.
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!FIELD_SWITCH.test(k)) continue
    const key = k as `f:${string}`
    if (v === null || v === true) delete next[key]
    else if (v === false) next[key] = false
  }
  await prisma.brand.update({ where: { id: brandId }, data: { features: next as Prisma.InputJsonValue } })
  revalidateEverywhere()
  return { success: true }
}

/** The switches a brand starts with when it has no override (FR-021). */
export async function setBrandFeatureDefaults(defaults: BrandFeatures): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const clean = cleanFeatures(defaults)
  await prisma.workspaceSettings.upsert({
    where:  { id: 1 },
    update: { brand_feature_defaults: clean as Prisma.InputJsonValue, updated_at: new Date() },
    create: { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false, brand_feature_defaults: clean as Prisma.InputJsonValue },
  })
  revalidateEverywhere()
  return { success: true }
}

/**
 * The brand's Islam Check (C-Check) default for tasks created from now on.
 * `null` follows the workspace default. Existing tasks keep their own stages.
 */
export async function setBrandNineStage(brandId: string, value: boolean | null): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  if (value !== null && typeof value !== 'boolean') return { success: false, error: 'invalid' }
  const found = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } })
  if (!found) return { success: false, error: 'not_found' }
  await prisma.brand.update({ where: { id: brandId }, data: { nine_stage_default: value } })
  revalidateEverywhere()
  return { success: true }
}

/**
 * Spec 025 (brand Settings tab): the brand's short sidebar name and the priority
 * its new tasks start with. `null` clears either (the full name; the Space's or
 * the task type's priority). Existing tasks keep their priority.
 */
export async function setBrandBasics(brandId: string, patch: { short_name?: string | null; default_priority?: string | null }): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const found = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } })
  if (!found) return { success: false, error: 'not_found' }
  const data: { short_name?: string | null; default_priority?: string | null } = {}
  if (patch.short_name !== undefined) {
    const n = typeof patch.short_name === 'string' ? patch.short_name.replace(/\s+/g, ' ').trim().slice(0, 24) : ''
    data.short_name = n || null
  }
  if (patch.default_priority !== undefined) {
    if (patch.default_priority !== null && !asPriority(patch.default_priority)) return { success: false, error: 'invalid' }
    data.default_priority = patch.default_priority
  }
  await prisma.brand.update({ where: { id: brandId }, data })
  revalidateEverywhere()
  return { success: true }
}
