'use client'

/**
 * The composer under a comment thread (spec 012 R4, FR-081,
 * contracts/ui.md §4). Same @ rule as the main composer: typing "@" right
 * after a space opens the people list, picking inserts "@Name", and whoever's
 * "@Name" is still in the text when it's sent is who gets mentioned.
 *
 * Enter sends, Shift+Enter is a new line, Esc cancels.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Member } from '@/types/index'
import { PersonAvatar } from '@/components/sheet/PersonChip'

export function ReplyComposer({ members, meId, replyingTo, onSend, onCancel }: {
  members: Member[]
  meId: string
  replyingTo: string
  onSend(body: string, mentions: string[]): Promise<{ success: boolean; error?: string }>
  onCancel(): void
}) {
  const t = useTranslations('notifications')
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const matches = useMemo(() => {
    if (query === null) return []
    const q = query.trim().toLowerCase()
    return members
      .filter(m => m.id !== meId)
      .filter(m => !q || m.name.toLowerCase().includes(q) || (m.role ?? '').toLowerCase().includes(q))
      .slice(0, 6)
  }, [members, meId, query])
  useEffect(() => { setIndex(0) }, [query])

  function tokenAt(el: HTMLTextAreaElement): { at: number; q: string } | null {
    const upto = el.value.slice(0, el.selectionStart ?? 0)
    const at = upto.lastIndexOf('@')
    if (at === -1 || (at > 0 && !/\s/.test(upto[at - 1]))) return null
    const q = upto.slice(at + 1)
    return q.includes('\n') || q.length > 30 ? null : { at, q }
  }

  function pick(m: Member) {
    const el = ref.current
    if (!el) return
    const token = tokenAt(el)
    if (!token) return
    const caret = el.selectionStart ?? text.length
    const next = `${text.slice(0, token.at)}@${m.name} ${text.slice(caret)}`
    setText(next)
    setPicked(p => (p.includes(m.id) ? p : [...p, m.id]))
    setQuery(null)
    const pos = token.at + m.name.length + 2
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos) })
  }

  async function send() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true); setError('')
    const mentions = members.filter(m => picked.includes(m.id) && body.includes(`@${m.name}`)).map(m => m.id)
    const r = await onSend(body, mentions)
    setBusy(false)
    if (!r.success) { setError(r.error ?? 'Could not post that reply'); return }
    setText(''); setPicked([])
  }

  return (
    <div className="fx-nt-composer" data-reply-composer="">
      {matches.length > 0 && (
        <div className="fx-nt-picker" role="listbox" aria-label="People">
          {matches.map((m, i) => (
            <button key={m.id} type="button" role="option" aria-selected={i === index}
                    onMouseDown={e => e.preventDefault()} onClick={() => pick(m)}>
              <PersonAvatar member={m} /><span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
      <textarea ref={ref} value={text} rows={2} disabled={busy}
                aria-label={t('replyingTo', { name: replyingTo })}
                placeholder={t('replyPlaceholder')}
                onChange={e => { setText(e.target.value); const tk = tokenAt(e.target); setQuery(tk ? tk.q : null) }}
                onKeyDown={e => {
                  if (matches.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    e.preventDefault()
                    setIndex(i => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
                    return
                  }
                  if (matches.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pick(matches[index]); return }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (query !== null) setQuery(null); else onCancel(); return }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
                }} />
      {error && <p className="fx-nt-composer-err" role="alert">{error}</p>}
      <div className="fx-nt-composer-acts">
        <button type="button" className="fx-nt-link" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="fx-nt-go" data-reply-send="" disabled={busy || !text.trim()} onClick={() => void send()}>{t('reply')}</button>
      </div>
    </div>
  )
}
