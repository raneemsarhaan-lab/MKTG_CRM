'use client'

/**
 * Edit a theme (spec 009 FR-012, US5): name, owner, frequency and audience.
 * And a one-field prompt for naming a pillar or a new theme.
 */
import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AudienceKey, ContentTheme, FrequencyPeriod, Member } from '@/types/index'
import { AUDIENCE_KEYS } from '@/lib/content-plan'
import type { ThemePatch } from './types'

export function ThemeEditor({ theme, members, onSave, onCancel }: {
  theme: ContentTheme
  members: Member[]
  onSave(patch: ThemePatch): Promise<string | null>
  onCancel(): void
}) {
  const t = useTranslations('content')
  const id = useId()
  const [name, setName] = useState(theme.name)
  const [owner, setOwner] = useState(theme.owner_id ?? '')
  const [count, setCount] = useState(theme.frequency_count ? String(theme.frequency_count) : '')
  const [period, setPeriod] = useState<FrequencyPeriod>(theme.frequency_period ?? 'week')
  const [audience, setAudience] = useState<AudienceKey[]>(theme.audience)
  const [note, setNote] = useState<string | null>(null)
  /** A frequency that isn't 1–50: said beside its field, which takes the focus. */
  const [freqNote, setFreqNote] = useState<string | null>(null)
  const countRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    if (busy) return
    const c = count.trim() ? Number(count) : null
    if (c !== null && (!Number.isInteger(c) || c < 1 || c > 50)) { setFreqNote(t('err.bad_frequency')); countRef.current?.focus(); return }
    setBusy(true); setNote(null)
    const err = await onSave({ name: name.trim(), owner_id: owner || null, frequency_count: c, frequency_period: c ? period : null, audience })
    setBusy(false)
    if (err) setNote(err)
  }
  return (
    <form className="fx-sheet-pop-form fx-content-editor" data-theme-editor="" onSubmit={e => { e.preventDefault(); void save() }}>
      <label className="fx-sheet-pop-title">{t('editor.name')}<input name="name" autoComplete="off" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="fx-sheet-pop-title">{t('editor.owner')}
        <select name="owner" value={owner} onChange={e => setOwner(e.target.value)}>
          <option value="">{t('theme.noOwner')}</option>
          {[...members].sort((a, b) => a.name.localeCompare(b.name)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <fieldset className="fx-content-fieldset">
        <legend>{t('editor.frequency')}</legend>
        <span className="fx-content-freq">
          <input ref={countRef} type="number" name="frequency" autoComplete="off" min={1} max={50} inputMode="numeric" aria-label={t('editor.count')}
                 aria-invalid={freqNote ? true : undefined} aria-describedby={freqNote ? `${id}-freq` : undefined}
                 value={count} onChange={e => { setCount(e.target.value); setFreqNote(null) }} />
          <span>{t('editor.period')}</span>
          <select name="period" aria-label={t('editor.period')} value={period} onChange={e => setPeriod(e.target.value as FrequencyPeriod)}>
            <option value="week">{t('editor.week')}</option>
            <option value="month">{t('editor.month')}</option>
          </select>
        </span>
        {freqNote && <span className="fx-sheet-note" id={`${id}-freq`} role="alert">{freqNote}</span>}
      </fieldset>
      <fieldset className="fx-content-fieldset">
        <legend>{t('editor.audience')}</legend>
        {AUDIENCE_KEYS.map(k => (
          <label key={k} className="fx-content-check">
            <input type="checkbox" name="audience" value={k} checked={audience.includes(k)}
                   onChange={e => setAudience(a => (e.target.checked ? AUDIENCE_KEYS.filter(x => x === k || a.includes(x)) : a.filter(x => x !== k)))} />
            {t(`audience.${k}`)}
          </label>
        ))}
      </fieldset>
      {note && <span className="fx-sheet-note" role="alert">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{t('editor.cancel')}</button>
        <button type="submit" className="fx-sheet-btn is-primary" disabled={busy}>{busy ? t('editor.saving') : t('editor.save')}</button>
      </span>
    </form>
  )
}

/** One text field with Save and Cancel: a pillar's or a new theme's name. */
export function NamePrompt({ title, initial, saveLabel, cancelLabel, onSave, onCancel }: {
  title: string; initial?: string; saveLabel: string; cancelLabel: string
  onSave(name: string): Promise<string | null>; onCancel(): void
}) {
  const t = useTranslations('content')
  const id = useId()
  const [value, setValue] = useState(initial ?? '')
  const [note, setNote] = useState<string | null>(null)
  /** Saving: a second Enter or click waits for the first. */
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <form className="fx-sheet-pop-form" onSubmit={async e => {
      e.preventDefault()
      if (busy) return
      // An empty name isn't sent: say why nothing happened.
      if (!value.trim()) { setNote(t('err.emptyName')); inputRef.current?.focus(); return }
      setBusy(true)
      try {
        const err = await onSave(value.trim())
        if (err) setNote(err)
      } finally { setBusy(false) }
    }}>
      <label className="fx-sheet-pop-title">{title}
        <input ref={inputRef} name="name" autoComplete="off" value={value} aria-invalid={note ? true : undefined} aria-describedby={note ? `${id}-note` : undefined}
               onChange={e => { setValue(e.target.value); setNote(null) }} />
      </label>
      {note && <span className="fx-sheet-note" id={`${id}-note`} role="alert">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{cancelLabel}</button>
        <button type="submit" className="fx-sheet-btn is-primary" disabled={busy}>{busy ? t('editor.saving') : saveLabel}</button>
      </span>
    </form>
  )
}
