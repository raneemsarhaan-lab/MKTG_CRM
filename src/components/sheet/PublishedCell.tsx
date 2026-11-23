'use client'

/**
 * The Published cell (spec 008 FR-047, FR-048, research R13): the post's link,
 * "Missing link" on a published clip without one, or nothing. The link prompt
 * after a move to Published is LinkPrompt, shared with the Files cell.
 */
import { useState } from 'react'
import type { useTranslations } from 'next-intl'
import type { Task } from '@/types/index'
import { hostOf } from './FilesCell'
import { LinkPill, linkKind } from './LinkPill'

export function PublishedContent({ task, canEdit, t }: { task: Task; canEdit: boolean; t: ReturnType<typeof useTranslations> }) {
  if (task.published_url) {
    return <LinkPill kind={linkKind(task.published_url)} text={hostOf(task.published_url) || task.published_url} href={task.published_url} />
  }
  if (task.status === 'publish') return <span className="fx-sheet-missing">{t('published.missing')}</span>
  return canEdit ? <span className="fx-sheet-muted">{t('published.add')}</span> : null
}

/** A link field with Save and Skip/Cancel, used inside a SheetPopover. */
export function LinkPrompt({ title, initial, saveLabel, savingLabel, skipLabel, badLink, placeholder, onSave, onSkip }: {
  title: string
  initial?: string
  saveLabel: string
  /** The Save button while the link is on its way ("Saving…"); absent: Save, disabled. */
  savingLabel?: string
  skipLabel: string
  badLink: string
  placeholder: string
  onSave(url: string): Promise<string | null>
  onSkip(): void
}) {
  const [value, setValue] = useState(initial ?? '')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    if (busy) return
    const v = value.trim()
    if (v && !/^https?:\/\/\S+$/i.test(v)) { setNote(badLink); return }
    setBusy(true)
    const err = await onSave(v)
    setBusy(false)
    if (err) setNote(err)
  }
  return (
    <form className="fx-sheet-pop-form" aria-busy={busy || undefined} onSubmit={e => { e.preventDefault(); void save() }}>
      <label className="fx-sheet-pop-title">
        {title}
        <input
          type="text"
          name="link"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          aria-invalid={note ? true : undefined}
          aria-describedby={note ? 'fx-sheet-pop-note' : undefined}
          onChange={e => { setValue(e.target.value); setNote(null) }}
        />
      </label>
      {note && <span className="fx-sheet-note" id="fx-sheet-pop-note" role="alert">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onSkip}>{skipLabel}</button>
        <button type="submit" className="fx-sheet-btn is-primary" disabled={busy}>{busy && savingLabel ? savingLabel : saveLabel}</button>
      </span>
    </form>
  )
}
