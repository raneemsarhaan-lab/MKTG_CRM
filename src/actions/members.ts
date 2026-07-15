'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'

type MemberPatch = Partial<{
  name: string
  role: string
  access: 'admin' | 'superuser' | 'user'
  capacity_hrs_wk: number
  status: string
  avatar_url: string
}>

export async function updateMember(
  memberId: string,
  patch: MemberPatch,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('members').update(patch).eq('id', memberId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  revalidatePath('/capacity')
  revalidatePath('/overview')
  return { success: true }
}
