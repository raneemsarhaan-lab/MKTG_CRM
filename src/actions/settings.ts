'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'

function revalidateAll() {
  revalidatePath('/settings')
  revalidatePath('/board')
  revalidatePath('/overview')
}

// ─── SLA ──────────────────────────────────────────────────────────────────────

export async function updateSLA(
  stageId: string,
  contentTypeLabel: string,
  days: number,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  try {
    await prisma.slaConfig.upsert({
      where:  { stage_id_content_type_label: { stage_id: stageId, content_type_label: contentTypeLabel } },
      update: { max_business_days: days },
      create: { stage_id: stageId, content_type_label: contentTypeLabel, max_business_days: days },
    })
    revalidatePath('/settings')
    revalidatePath('/board')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

// ─── Brands ───────────────────────────────────────────────────────────────────

type BrandInput = { name: string; color: string; logo_url?: string; description?: string }

export async function createBrand(
  input: BrandInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  try {
    const brand = await prisma.brand.create({
      data: {
        name:        input.name.trim(),
        color:       input.color,
        logo_url:    input.logo_url    ?? null,
        description: input.description ?? null,
      },
    })
    revalidateAll()
    return { success: true, id: brand.id }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

/** Rename a brand, recolour it, or change its logo. */
export async function updateBrand(
  brandId: string,
  patch: Partial<{ name: string; color: string; logo_url: string | null; description: string | null }>,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { success: false, error: 'Brand name cannot be empty' }
    data.name = name
  }
  if (patch.color !== undefined)       data.color       = patch.color
  if (patch.logo_url !== undefined)    data.logo_url    = patch.logo_url?.trim() || null
  if (patch.description !== undefined) data.description = patch.description?.trim() || null

  if (Object.keys(data).length === 0) return { success: true }

  try {
    await prisma.brand.update({ where: { id: brandId }, data })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    const msg = String(e)
    if (msg.includes('Unique constraint')) return { success: false, error: 'A brand with that name already exists' }
    return { success: false, error: msg }
  }
}

// ─── Brand assets ─────────────────────────────────────────────────────────────

/**
 * Attach reference material to a brand.
 *
 * URL-based, exactly like task attachments — there is no file upload backend,
 * so this points at artwork hosted elsewhere rather than storing bytes.
 */
export async function addBrandAsset(
  brandId: string,
  input: { filename: string; url: string },
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  const url = input.url.trim()
  if (!url) return { success: false, error: 'A URL is required' }
  const filename = input.filename.trim() || url.split('/').pop() || 'asset'

  try {
    await prisma.brandAsset.create({ data: { brand_id: brandId, filename, url } })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

export async function removeBrandAsset(
  assetId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  try {
    await prisma.brandAsset.delete({ where: { id: assetId } })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

export async function removeBrand(
  brandId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  // Tasks reference the brand; deleting one out from under them would fail on
  // the foreign key, so they are unlinked first and keep their history.
  try {
    await prisma.$transaction([
      prisma.task.updateMany({ where: { brand_id: brandId }, data: { brand_id: null } }),
      prisma.brand.delete({ where: { id: brandId } }),
    ])
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

// ─── Content types ────────────────────────────────────────────────────────────

const SLA_STAGES = ['c-prog', 'c-final', 'c-check', 'd-prog', 'd-check', 'final-check']

export async function createContentType(
  label: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  try {
    await prisma.contentType.create({ data: { label: label.trim() } })

    // Seed default SLA rows (2 days per stage) for the new content type
    await Promise.all(
      SLA_STAGES.map(stage_id =>
        prisma.slaConfig.upsert({
          where:  { stage_id_content_type_label: { stage_id, content_type_label: label.trim() } },
          update: {},
          create: { stage_id, content_type_label: label.trim(), max_business_days: 2 },
        })
      )
    )

    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

export async function removeContentType(
  label: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  try {
    await prisma.contentType.delete({ where: { label } })
    revalidatePath('/settings')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

// ─── Workspace settings ───────────────────────────────────────────────────────

export async function updateWeeklyCapacity(
  hours: number,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  if (hours < 1 || hours > 168) return { success: false, error: 'Invalid value' }
  try {
    await prisma.workspaceSettings.upsert({
      where:  { id: 1 },
      update: { capacity_hrs_per_wk: hours, updated_at: new Date() },
      create: { id: 1, capacity_hrs_per_wk: hours, nine_stage_default: false },
    })
    revalidatePath('/settings')
    revalidatePath('/capacity')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

export async function updateNineStageDefault(
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  try {
    await prisma.workspaceSettings.upsert({
      where:  { id: 1 },
      update: { nine_stage_default: enabled, updated_at: new Date() },
      create: { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: enabled },
    })
    revalidatePath('/settings')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}
