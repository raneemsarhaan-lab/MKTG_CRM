'use client'

/**
 * The message for a refused move (spec 022 media rules, spec 023 required
 * fields), the same on the board, the task panel and every sheet:
 * "Caption is required before C-Review."
 */
import { useLocale, useTranslations } from 'next-intl'
import type { StageId } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'

export type MoveRefusal = { error?: string; missing?: string[]; missing_ar?: string[]; requiredStage?: StageId | string } | null | undefined

export const MEDIA_ERRORS = ['waiting_on_media', 'follows_content', 'follows_media'] as const

/** Returns the reader's message for a known refusal, or null so the caller keeps its own wording. */
export function useMoveError(stageName?: (id: StageId) => string) {
  const t = useTranslations('fields')
  const tMedia = useTranslations('media')
  const ar = useLocale().startsWith('ar')
  return (res: MoveRefusal): string | null => {
    if (!res?.error) return null
    if (res.error === 'required_fields' && res.missing?.length) {
      const names = ar && res.missing_ar?.length === res.missing.length ? res.missing_ar : res.missing
      const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(ar ? '، ' : ', ')} ${t('and')} ${names[names.length - 1]}`
      const id = res.requiredStage as StageId
      const stage = stageName && STAGE_META[id] ? stageName(id) : STAGE_META[id] ? (ar ? STAGE_META[id].label_ar : STAGE_META[id].label_en) : String(res.requiredStage ?? '')
      return t(names.length === 1 ? 'requiredOne' : 'requiredMany', { fields: list, stage })
    }
    if ((MEDIA_ERRORS as readonly string[]).includes(res.error)) return tMedia(res.error as 'follows_media')
    return null
  }
}
