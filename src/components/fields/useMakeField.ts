'use client'

/**
 * "Make it a task field" (spec 023 D5) for a sheet whose rows are tasks: the
 * team column becomes a task field with its name, kind and options, its values
 * move onto the tasks, and the field shows where the column was. Admins and
 * superusers only (the action checks again).
 */
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { makeTaskField } from '@/actions/task-fields'

export function useMakeField(sheet: string, access: string, say: (text: string) => void) {
  const t = useTranslations('fields')
  const router = useRouter()
  if (access === 'user') return undefined
  return {
    label: t('makeField'),
    run: (key: string) => {
      void makeTaskField(sheet, key).then(r => {
        if (!r.success) { say(t(r.error === 'not_authorized' ? 'err.notAllowed' : 'makeFieldFailed')); return }
        say(t('madeField', { n: r.moved }))
        router.refresh()
      })
    },
  }
}
