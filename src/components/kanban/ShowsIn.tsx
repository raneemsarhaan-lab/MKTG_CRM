'use client'

/**
 * The task panel's "Shows in" row (spec 021 US1, FR-003, FR-032): the team
 * Spaces this task appears in, why each is there, and — for someone who may
 * edit the task — add or remove by hand. Removing a Space changes nothing
 * else about the task.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { TaskSpace, TeamSpace } from '@/types/index'
import { addTaskSpace, removeTaskSpace } from '@/actions/task-spaces'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { PIPE } from '@/lib/pipeline-tokens'

export function ShowsIn({ taskId, spaces, rows, canEdit }: { taskId: string; spaces: TeamSpace[]; rows: TaskSpace[]; canEdit: boolean }) {
  const t = useTranslations('spaces')
  const router = useRouter()
  const [busy, start] = useTransition()
  const [note, setNote] = useState('')
  const mine = rows.filter(r => r.task_id === taskId)
  const shown = spaces.filter(s => mine.some(r => r.space_id === s.id))
  const addable = spaces.filter(s => !mine.some(r => r.space_id === s.id))

  function run(fn: () => Promise<{ success: boolean }>, ok: string) {
    setNote('')
    start(async () => {
      const res = await fn()
      setNote(res.success ? ok : t('error'))
      if (res.success) router.refresh()
    })
  }

  return (
    <div data-shows-in style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {shown.length === 0 && <span style={{ color: PIPE.textMuted, fontWeight: 500 }}>{t('onlyBrand')}</span>}
      {shown.map(s => {
        const via = mine.find(r => r.space_id === s.id)?.added_via
        const label = spaceLabel(s, t)
        return (
          <span key={s.id} data-space-chip={s.key} title={via ? t(`via.${via}`) : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 4px 3px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: PIPE.ink, background: `color-mix(in srgb, ${s.color} 18%, transparent)` }}>
            {label}
            {canEdit && (
              <button type="button" disabled={busy} aria-label={t('removeSpace', { name: label })}
                onClick={() => run(() => removeTaskSpace(taskId, s.id), t('removed', { name: label }))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', width: 20, height: 20, borderRadius: '50%', color: PIPE.textMuted, fontSize: 14, lineHeight: 1 }}>×</button>
            )}
          </span>
        )
      })}
      {canEdit && addable.length > 0 && (
        <select aria-label={t('addSpace')} value="" disabled={busy}
          onChange={e => { const s = addable.find(x => x.id === e.target.value); if (s) run(() => addTaskSpace(taskId, s.id), t('added', { name: spaceLabel(s, t) })) }}
          style={{ border: `1px dashed ${PIPE.borderInput}`, background: '#FFFFFF', borderRadius: 999, padding: '3px 8px', fontFamily: 'inherit', fontSize: 12.5, color: PIPE.textSecondary }}>
          <option value="">+ {t('addSpace')}</option>
          {addable.map(s => <option key={s.id} value={s.id}>{spaceLabel(s, t)}</option>)}
        </select>
      )}
      {note && <span role="status" style={{ fontSize: 12, fontWeight: 500, color: PIPE.textMuted }}>{note}</span>}
    </div>
  )
}
