'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'

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
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('sla_configs')
    .upsert(
      { stage_id: stageId, content_type_label: contentTypeLabel, days },
      { onConflict: 'stage_id,content_type_label' },
    )
  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  revalidatePath('/board')
  return { success: true }
}

// ─── Brands ───────────────────────────────────────────────────────────────────

type BrandInput = {
  name: string
  color: string
  logo_url?: string
  description?: string
}

export async function createBrand(
  input: BrandInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('brands')
    .insert({ name: input.name.trim(), color: input.color, logo_url: input.logo_url, description: input.description })
    .select('id')
    .single()
  if (error) return { success: false, error: error.message }
  revalidateAll()
  return { success: true, id: data.id }
}

export async function removeBrand(
  brandId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  // tasks.brand_id references brands with ON DELETE SET NULL per data-model.md
  const { error } = await supabase.from('brands').delete().eq('id', brandId)
  if (error) return { success: false, error: error.message }
  revalidateAll()
  return { success: true }
}

// ─── Content types ────────────────────────────────────────────────────────────

const SLA_STAGES = ['c-prog', 'c-final', 'c-check', 'd-prog', 'd-check', 'final-check']

export async function createContentType(
  label: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { error: insertError } = await supabase
    .from('content_types')
    .insert({ label: label.trim() })
  if (insertError) return { success: false, error: insertError.message }

  // Seed default SLA rows (2 days per stage) for the new content type
  const slaRows = SLA_STAGES.map(stage_id => ({
    stage_id,
    content_type_label: label.trim(),
    days: 2,
  }))
  await supabase.from('sla_configs').upsert(slaRows, { onConflict: 'stage_id,content_type_label' })

  revalidateAll()
  return { success: true }
}

export async function removeContentType(
  label: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('content_types').delete().eq('label', label)
  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  return { success: true }
}
