'use client'

/**
 * Space stages (spec 022 US4, design/task-methodology.html §5): a Space's own
 * names for the 11 original stages, and splits of one stage into several.
 * Opened from the Space header by admins and superusers. Every original stage
 * keeps at least one; a Space stage maps to one original stage. The main
 * board and brand pages keep the original names.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { SpaceStage, TeamSpace } from '@/types/index'
import { ALL_STAGES } from '@/lib/stage-meta'
import { STAGE_COLORS } from '@/lib/tokens'
import { PIPE } from '@/lib/pipeline-tokens'
import { MAX_SPLIT, MAX_STAGE_NAME, originalName, validateStages } from '@/lib/space-stages'
import { saveSpaceStages } from '@/actions/space-stages'
import { Modal } from '@/components/sheets/Dialogs'

interface Draft { id: string | null; name: string; aliases: string[] }

export function SpaceStagesButton({ space, rows }: { space: TeamSpace; rows: SpaceStage[] }) {
  const t = useTranslations('spaces.stages')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-space-stages-open onClick={() => setOpen(true)}
        style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 9, padding: '6px 11px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PIPE.ink }}>
        {t('open')}
      </button>
      {open && <SpaceStagesPanel space={space} rows={rows.filter(r => r.space_id === space.id)} onClose={() => setOpen(false)} />}
    </>
  )
}

export function SpaceStagesPanel({ space, rows, onClose }: { space: TeamSpace; rows: SpaceStage[]; onClose(): void }) {
  const t = useTranslations('spaces.stages')
  const locale = useLocale()
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, Draft[]>>(() => Object.fromEntries(ALL_STAGES.map(s => {
    const list = rows.filter(r => r.stage_id === s).sort((a, b) => a.position - b.position)
    return [s, list.length ? list.map(r => ({ id: r.id, name: r.name ?? '', aliases: r.aliases ?? [] })) : [{ id: null, name: '', aliases: [] }]]
  })))

  const payload = useMemo(() => ALL_STAGES.flatMap(s => draft[s].map((d, i) => ({ id: d.id, stage_id: s, name: d.name, position: i, aliases: d.aliases }))), [draft])
  const problems = useMemo(() => validateStages(payload), [payload])
  const bad = new Set(problems.map(p => p.stage))
  const problemText = problems[0]
    ? problems[0].kind === 'duplicate' ? t('duplicate', { name: problems[0].name ?? '' })
      : problems[0].kind === 'original' ? t('original', { name: problems[0].name ?? '' })
      : problems[0].kind === 'too_many' ? t('tooMany', { n: MAX_SPLIT })
      : t('missing')
    : null

  const edit = (s: string, fn: (list: Draft[]) => Draft[]) => setDraft(d => ({ ...d, [s]: fn(d[s]) }))
  const move = (list: Draft[], i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= list.length) return list
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next
  }

  function save() {
    if (problems.length) return
    setError(null)
    start(async () => {
      const r = await saveSpaceStages(space.id, payload).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) { router.refresh(); onClose(); return }
      setError(r.error === 'not_authorized' ? t('notAllowed') : r.error === 'invalid' ? t('missing') : t('failed'))
    })
  }

  const input: React.CSSProperties = { width: 128, border: `1px solid ${PIPE.border}`, borderRadius: 8, padding: '5px 8px', fontFamily: 'inherit', fontSize: 13, background: '#FFFFFF', color: PIPE.ink }
  const ib: React.CSSProperties = { border: 'none', background: 'transparent', color: PIPE.textMuted, cursor: 'pointer', fontSize: 13, padding: '0 3px', fontFamily: 'inherit' }

  return (
    <Modal title={t('title', { space: space.name })} body={t('help')} onCancel={onClose} attr="data-space-stages" width={720}>
      <div style={{ display: 'grid', gap: 4, maxHeight: 'min(60vh, 640px)', overflowY: 'auto', paddingInlineEnd: 4 }}>
        {ALL_STAGES.map(s => (
          <div key={s} data-space-stage-row={s} data-problem={bad.has(s) || undefined}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 150px) minmax(0, 1fr)', gap: 10, alignItems: 'center', padding: '5px 4px', borderRadius: 8,
              background: bad.has(s) ? 'color-mix(in srgb, #E5484D 10%, transparent)' : undefined }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: PIPE.ink }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: STAGE_COLORS[s] }} />
              {originalName(s, locale)}
            </span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {draft[s].map((d, i) => (
                <span key={i} data-space-stage-sub={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: `1px solid ${PIPE.border}`, borderRadius: 9, padding: 2, background: PIPE.surface }}>
                  {draft[s].length > 1 && <button type="button" style={ib} aria-label={t('earlier')} disabled={i === 0} onClick={() => edit(s, l => move(l, i, -1))}>‹</button>}
                  <input data-space-stage-name={`${s}:${i}`} value={d.name} maxLength={MAX_STAGE_NAME} placeholder={originalName(s, locale)}
                    aria-label={t('nameFor', { stage: originalName(s, locale), n: i + 1 })} autoComplete="off"
                    title={d.aliases.length ? t('also', { words: d.aliases.join(', ') }) : undefined}
                    onChange={e => { const v = e.target.value; edit(s, l => l.map((x, j) => (j === i ? { ...x, name: v } : x))) }} style={input} />
                  {draft[s].length > 1 && <button type="button" style={ib} aria-label={t('later')} disabled={i === draft[s].length - 1} onClick={() => edit(s, l => move(l, i, 1))}>›</button>}
                  {draft[s].length > 1 && <button type="button" style={ib} data-space-stage-remove={`${s}:${i}`} aria-label={t('remove')} title={t('remove')} onClick={() => edit(s, l => l.filter((_, j) => j !== i))}>×</button>}
                </span>
              ))}
              {draft[s].length < MAX_SPLIT && (
                <button type="button" data-space-stage-add={s} onClick={() => edit(s, l => [...l, { id: null, name: '', aliases: [] }])}
                  style={{ border: `1px dashed ${PIPE.border}`, background: '#FFFFFF', borderRadius: 9, padding: '5px 9px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: PIPE.textMuted }}>
                  ＋ {t('split')}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <p data-space-stages-msg role="status" aria-live="polite" style={{ minHeight: 18, margin: '8px 0 0', fontSize: 12.5, fontWeight: 600, color: '#C2353A' }}>{problemText ?? error ?? ''}</p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: PIPE.textMuted, borderInlineStart: `3px solid ${PIPE.border}`, paddingInlineStart: 10 }}>{t('rule')}</p>
      <div className="fx-sh-dialog-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button type="button" data-space-stages-reset onClick={() => setDraft(Object.fromEntries(ALL_STAGES.map(s => [s, [{ id: null, name: '', aliases: [] }]])))}>{t('reset')}</button>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="is-go" data-space-stages-save disabled={problems.length > 0 || busy} onClick={save}>{busy ? t('saving') : t('save')}</button>
        </span>
      </div>
    </Modal>
  )
}
