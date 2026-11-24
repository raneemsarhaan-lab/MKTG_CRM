/**
 * The Content sheet's error codes, as the reader's words. Server actions and
 * the board send codes ("may_not_add", "too_many_rows"); a code this sheet
 * has no words for reads as the generic message, never as the code itself.
 */
import type { useTranslations } from 'next-intl'
import { MAX_PLAN_ROWS } from './parse-plan'

export const KNOWN_ERRORS = ['may_not_add', 'may_not_edit_theme', 'not_a_theme', 'bad_frequency', 'bad_audience', 'duplicate_pillar',
  'not_authorized', 'bad_link', 'not_found', 'dropped', 'not_authenticated', 'bad_date', 'stage_not_in_pipeline', 'terminal',
  'too_many_rows', 'nothing_to_add', 'empty_title', 'generic']

/** `t` is the `content` namespace. */
export function errorText(t: ReturnType<typeof useTranslations>, code?: string | null): string {
  return code && KNOWN_ERRORS.includes(code) ? t(`err.${code}`, { max: MAX_PLAN_ROWS }) : t('err.generic')
}
