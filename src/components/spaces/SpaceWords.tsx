'use client'

/**
 * "Status words" (spec 021 US3, design/spaces-stage-c.html §1): a team's own
 * names for the 11 stages and the 3 simple statuses. Opened from the Space
 * header by admins and superusers. The first word is shown in the Space's
 * List, Sheet and Calendar; any of them can be typed in its Sheet. Boards,
 * brands and Everything keep the board names.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { TeamSpace } from '@/types/index'
import { ALL_STAGES, STAGE_META } from '@/lib/stage-meta'
import { STAGE_COLORS } from '@/lib/tokens'
import { PIPE } from '@/lib/pipeline-tokens'
import { cleanSpaceWords, findClash, SIMPLE_KEYS } from '@/lib/space-words'
import { setSpaceWords } from '@/actions/spaces'
import { Modal } from '@/components/sheets/Dialogs'

export function SpaceWordsButton({ space }: { space: TeamSpace }) {
  const t = useTranslations('spaces.words')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-space-words-open onClick={() => setOpen(true)}
        style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 9, padding: '6px 11px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PIPE.ink }}>
        {t('open')}
      </button>
      {open && <SpaceWordsPanel space={space} onClose={() => setOpen(false)} />}
    </>
  )
}

function SpaceWordsPanel({ space, onClose }: { space: TeamSpace; onClose(): void }) {
  const t = useTranslations('spaces.words')
  const ts = useTranslations('taskSheet')
  const locale = useLocale()
  const router = useRouter()
  const [busy, start] = useTransition()
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries([...ALL_STAGES, ...SIMPLE_KEYS].map(k => [k, (space.words[k] ?? []).join(', ')])))
  const [error, setError] = useState<string | null>(null)
  const linked = space.key === 'content' || space.key === 'video'

  const nameOf = (k: string) => {
    if (k.startsWith('s-')) return ts(`simple.${k as 's-todo'}`)
    const m = STAGE_META[k as keyof typeof STAGE_META]
    return locale === 'ar' ? m.label_ar : m.label_en
  }
  const hintOf = (k: string) => {
    if (k.startsWith('s-')) return null
    const m = STAGE_META[k as keyof typeof STAGE_META]
    return locale === 'ar' ? m.label_en : m.label_ar
  }

  const words = useMemo(() => cleanSpaceWords(text), [text])
  const clash = useMemo(() => findClash(words), [words])
  const clashMsg = clash ? t('clash', { word: clash.word, a: nameOf(clash.a), b: nameOf(clash.b) }) : null
  const clashed = new Set(clash ? [clash.a, clash.b] : [])

  function save() {
    if (clash) return
    setError(null)
    start(async () => {
      const r = await setSpaceWords(space.id, words).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) { router.refresh(); onClose(); return }
      setError(r.error === 'not_authorized' ? t('notAllowed') : t('failed'))
    })
  }

  const row = (k: string) => (
    <div key={k} data-word-row={k} data-clash={clashed.has(k) || undefined}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 150px) minmax(0, 1fr)', gap: 10, alignItems: 'center', padding: '5px 4px', borderRadius: 8,
        background: clashed.has(k) ? 'color-mix(in srgb, #E5484D 12%, transparent)' : undefined }}>
      <label htmlFor={`w-${k}`} style={{ display: 'grid', fontSize: 12, fontWeight: 700, color: PIPE.ink }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: k.startsWith('s-') ? 'transparent' : STAGE_COLORS[k], border: k.startsWith('s-') ? `1.5px dashed ${PIPE.textMuted}` : undefined }} />
          {nameOf(k)}
        </span>
        {hintOf(k) && <span lang={locale === 'ar' ? 'en' : 'ar'} style={{ fontSize: 11, fontWeight: 400, color: PIPE.textMuted }}>{hintOf(k)}</span>}
      </label>
      <input id={`w-${k}`} data-word-input={k} value={text[k]} placeholder={nameOf(k)} autoComplete="off"
        onChange={e => setText(x => ({ ...x, [k]: e.target.value }))}
        style={{ width: '100%', border: `1px solid ${PIPE.border}`, borderRadius: 8, padding: '6px 9px', fontFamily: 'inherit', fontSize: 13, background: '#FFFFFF', color: PIPE.ink }} />
    </div>
  )

  return (
    <Modal title={t('title', { space: space.name })} body={t('help')} onCancel={onClose} attr="data-space-words" width={580}>
      <div style={{ display: 'grid', gap: 2, maxHeight: 'min(58vh, 620px)', overflowY: 'auto', paddingInlineEnd: 4 }}>
        {ALL_STAGES.map(row)}
        {!linked && <>
          <p style={{ margin: '10px 4px 2px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: PIPE.textMuted }}>{t('simpleHead')}</p>
          {SIMPLE_KEYS.map(row)}
        </>}
      </div>
      <p data-space-words-msg role="status" aria-live="polite" style={{ minHeight: 18, margin: '8px 0 0', fontSize: 12.5, fontWeight: 600, color: '#C2353A' }}>{clashMsg ?? error ?? ''}</p>
      {linked && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: PIPE.textMuted, borderInlineStart: `3px solid ${PIPE.border}`, paddingInlineStart: 10 }}>{t('linkedNote', { space: space.name })}</p>}
      <div className="fx-sh-dialog-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button type="button" data-space-words-reset onClick={() => setText(x => Object.fromEntries(Object.keys(x).map(k => [k, ''])))}>{t('reset')}</button>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="is-go" data-space-words-save disabled={!!clash || busy} onClick={save}>{busy ? t('saving') : t('save')}</button>
        </span>
      </div>
    </Modal>
  )
}
