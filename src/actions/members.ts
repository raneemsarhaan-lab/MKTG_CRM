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

type AddMemberInput = {
  name: string
  email: string
  role: string
  access: 'admin' | 'superuser' | 'user'
  capacity_hrs_wk?: number
}

function revalidateAll() {
  revalidatePath('/settings')
  revalidatePath('/capacity')
  revalidatePath('/overview')
  revalidatePath('/board')
}

export async function updateMember(
  memberId: string,
  patch: MemberPatch,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('members').update(patch).eq('id', memberId)
  if (error) return { success: false, error: error.message }
  revalidateAll()
  return { success: true }
}

export async function addMember(
  input: AddMemberInput,
): Promise<{ success: boolean; error?: string }> {
  if (!input.email.endsWith('@forefront.consulting')) {
    return { success: false, error: 'Email must be a @forefront.consulting address' }
  }

  const supabase = await createServerClient()
  const { error } = await supabase.from('members').insert({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role.trim() || 'Team Member',
    access: input.access,
    capacity_hrs_wk: input.capacity_hrs_wk ?? 40,
    status: 'Available',
  })
  if (error) return { success: false, error: error.message }
  revalidateAll()
  return { success: true }
}

export async function removeMember(
  memberId: string,
): Promise<{ success: boolean; activeTasks?: number; error?: string }> {
  const supabase = await createServerClient()

  const { count, error: countError } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('task_owner_id', memberId)
    .neq('status', 'publish')

  if (countError) return { success: false, error: countError.message }
  if (count && count > 0) return { success: false, activeTasks: count }

  const { error } = await supabase.from('members').delete().eq('id', memberId)
  if (error) return { success: false, error: error.message }
  revalidateAll()
  return { success: true }
}
