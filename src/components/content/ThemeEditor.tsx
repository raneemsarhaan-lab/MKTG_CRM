'use client'

/**
 * Edit a theme (spec 009 FR-012, US5): name, owner, frequency and audience.
 * And a one-field prompt for naming a pillar or a new theme.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { AudienceKey, ContentTheme, FrequencyPeriod, Member } from '@/types/index'
import { AUDIENCE_KEYS } from '@/lib/content-plan'
import { intlLocale } from '@/lib/sheet-format'
import { errorText } from './errors'
import type { ThemePatch } from './types'

export function ThemeEditor({ theme, members, onSave, onCancel, ask = 0, onDirty }: {
  theme: ContentTheme
  members: Member[]
  /** Saves; an error code when it wasn't (said beside the field it's about). */
  onSave(patch: ThemePatch): Promise<string | null>
  onCancel(): void
  /** Counts the host's asks to close (a click outside): each new one asks whether to drop the changes. */
  ask?: number
  /** Whether there are changes to lose, as they come and go. */
  onDirty?(dirty: boolean): void
}) {
  const t = useTranslations('content')
  const locale = useLocale()
  const id = useId()
  const [name, setName] = useState(theme.name)
  const [owner, setOwner] = useState(theme.owner_id ?? '')
  const [count, setCount] = useState(theme.frequency_count ? String(theme.frequency_count) : '')
  const [period, setPeriod] = useState<FrequencyPeriod>(theme.frequency_period ?? 'week')
  const [audience, setAudience] = useState<AudienceKey[]>(theme.audience)
  /** What went wrong saving, or an empty name: said beside the name, which takes the focus. */
  const [note, setNote] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  /** A frequency that isn't 1–50: said beside its field, which takes the focus. */
  const [freqNote, setFreqNote] = useState<string | null>(null)
  const countRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const dirty = name !== theme.name || owner !== (theme.owner_id ?? '') || count !== (theme.frequency_count ? String(theme.frequency_count) : '')
    || (!!count.trim() && period !== (theme.frequency_period ?? 'week')) || audience.join() !== theme.audience.join()
  useEffect(() => { onDirty?.(dirty) }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirty?.(false), []) // eslint-disable-line react-hooks/exhaustive-deps
  /** Asked whether to drop the changes (after a click outside), in the footer. */
  const [asking, setAsking] = useState(false)
  const firstAsk = useRef(ask)
  const keepRef = useRef<HTMLButtonElement>(null)
  // Once the click outside has moved focus where it landed: to Keep editing (each time it's asked).
  useEffect(() => { if (ask !== firstAsk.current) { setAsking(true); requestAnimationFrame(() => keepRef.current?.focus()) } }, [ask])
  useEffect(() => { if (asking) keepRef.current?.focus() }, [asking])
  function keepEditing() {
    setAsking(false)
    requestAnimationFrame(() => nameRef.current?.focus())
  }

  /** Members by name in the reader's language. */
  const byName = useMemo(() => {
    const coll = new Intl.Collator(intlLocale(locale))
    return [...members].sort((a, b) => coll.compare(a.name, b.name))
  }, [members, locale])

  async function save() {
    if (busy) return
    if (!name.trim()) { setNote(t('err.emptyName')); nameRef.current?.focus(); return }
    const c = count.trim() ? Number(count) : null
    if (c !== null && (!Number.isInteger(c) || c < 1 || c > 50)) { setFreqNote(t('err.bad_frequency')); countRef.current?.focus(); return }
    setBusy(true); setNote(null)
    const err = await onSave({ name: name.trim(), owner_id: owner || null, frequency_count: c, frequency_period: c ? period : null, audience })
    setBusy(false)
    if (!err) return
    if (err === 'bad_frequency') { setFreqNote(errorText(t, err)); countRef.current?.focus(); return }
    setNote(errorText(t, err))
    nameRef.current?.focus()
  }
  return (
    <form className="fx-sheet-pop-form fx-content-editor" data-theme-editor="" onSubmit={e => { e.preventDefault(); void save() }}
          // Esc while asked keeps editing, as in Paste plan; otherwise the popover closes.
          onKeyDown={e => { if (e.key === 'Escape' && asking) { e.preventDefault(); e.stopPropagation(); keepEditing() } }}>
      <label className="fx-sheet-pop-title">{t('editor.name')}
        <input ref={nameRef} name="name" autoComplete="off" value={name}
               aria-invalid={note ? true : undefined} aria-describedby={note ? `${id}-name` : undefined}
               onChange={e => { setName(e.target.value); setNote(null) }} />
      </label>
      {note && <span className="fx-sheet-note" id={`${id}-name`} role="alert">{note}</span>}
      <label className="fx-sheet-pop-title">{t('editor.owner')}
        <select name="owner" value={owner} onChange={e => setOwner(e.target.value)}>
          <option value="">{t('theme.noOwner')}</option>
          {byName.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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
      {asking ? <>
        <span className="fx-sheet-note" role="alert" data-theme-discard="">{t('editor.discardAsk')}</span>
        <span className="fx-sheet-pop-row">
          <button ref={keepRef} type="button" className="fx-sheet-btn" onClick={keepEditing}>{t('editor.keepEditing')}</button>
          <button type="button" className="fx-sheet-btn is-danger" data-theme-discard-ok="" onClick={onCancel}>{t('editor.discard')}</button>
        </span>
      </> : (
        <span className="fx-sheet-pop-row">
          <button type="button" className="fx-sheet-btn" onClick={onCancel}>{t('editor.cancel')}</button>
          <button type="submit" className="fx-sheet-btn is-primary" disabled={busy}>{busy ? t('editor.saving') : t('editor.save')}</button>
        </span>
      )}
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
