'use client'

/**
 * Add or edit a custom column (spec 010 FR-020, FR-042, FR-043; contracts/columns-ui.md §5):
 * a name, one of seven kinds, and for Choice its options. Changing the kind of
 * a column that holds values first shows which would be cleared. Removing an
 * option in use asks what those rows should get.
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ChoiceOption, ColumnKind, Member } from '@/types/index'
import { COLUMN_KINDS, convertValues, formatValue, nextChoiceColor } from '@/lib/sheet-columns'
import { CHOICE_COLORS } from '@/lib/tokens'
import type { ColumnPatch } from './types'

const ICON: Record<ColumnKind, string> = { text: 'Aa', number: '#', date: '▦', link: '↗', person: '☺', choice: '◉', checkbox: '☑' }

export function ColumnEditor({ initial, values, members, heading, nameError, onSave, onCancel }: {
  /** Editing this column; absent when adding. */
  initial?: { name: string; kind: ColumnKind; options: ChoiceOption[] }
  /** The column's values, task id → value (for the kind-change review and options in use). */
  values: Record<string, string>
  members: Member[]
  heading: string
  nameError(name: string): string | null
  onSave(patch: ColumnPatch & { name: string; kind: ColumnKind }): Promise<string | null>
  onCancel(): void
}) {
  const t = useTranslations('sheet.columns')
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<ColumnKind>(initial?.kind ?? 'text')
  const [options, setOptions] = useState<ChoiceOption[]>(() =>
    initial?.options.length ? initial.options.map(o => ({ ...o })) : [{ id: `new-${Date.now()}`, name: t('optionN', { n: 1 }), color: CHOICE_COLORS[0] }])
  const [replace, setReplace] = useState<Record<string, string | null>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const used = (id: string) => Object.values(values).filter(v => v === id).length
  const removed = (initial?.options ?? []).filter(o => kind === 'choice' && initial?.kind === 'choice' && !options.some(x => x.id === o.id) && used(o.id) > 0)
  const unresolved = removed.filter(o => !(o.id in replace))

  const review = initial && initial.kind !== kind
    ? (() => {
        const { cleared } = convertValues(initial.kind, kind, values, { members, options: initial.options }, { members, options })
        const n = Object.keys(values).length
        if (!cleared.length) return t('reviewFit', { n, kind: t(`kinds.${kind}`) })
        const ex = cleared.slice(0, 2).map(id => `“${formatValue(initial.kind, values[id], { members, options: initial.options }).slice(0, 24)}”`).join(', ')
        return t('reviewClear', { bad: cleared.length, n, kind: t(`kinds.${kind}`), examples: cleared.length > 2 ? `${ex}…` : ex })
      })()
    : null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const bad = nameError(name)
    if (bad) { setErr(bad); return }
    if (kind === 'choice' && !options.some(o => o.name.trim())) { setErr(t('err.no_options')); return }
    if (unresolved.length) { setErr(t('err.option_in_use')); return }
    setBusy(true)
    const fail = await onSave({
      name, kind,
      options: kind === 'choice' ? options.map(o => ({ ...o, id: o.id.startsWith('new-') ? undefined : o.id })) : undefined,
      replace: Object.keys(replace).length ? replace : undefined,
    })
    setBusy(false)
    if (fail) setErr(fail)
  }

  const moveOpt = (i: number, d: number) => setOptions(os => { const n = [...os]; const [o] = n.splice(i, 1); n.splice(i + d, 0, o); return n })

  return (
    <form className="fx-col-form" data-column-editor="" onSubmit={save}>
      <span className="fx-col-sub">{heading}</span>
      <label className="fx-col-label">
        {t('name')}
        <input type="text" value={name} maxLength={40} placeholder={t('namePlaceholder')} data-autofocus=""
               onChange={e => { setName(e.target.value); setErr(null) }} />
      </label>
      <span className="fx-col-sub" id="fx-col-kind">{t('kind')}</span>
      <div className="fx-col-kinds" role="radiogroup" aria-labelledby="fx-col-kind"
           onKeyDown={e => {
             const i = COLUMN_KINDS.indexOf(kind)
             const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
             if (!d) return
             e.preventDefault()
             const next = COLUMN_KINDS[(i + d + COLUMN_KINDS.length) % COLUMN_KINDS.length]
             setKind(next)
             requestAnimationFrame(() => (e.currentTarget.querySelector(`[data-kind="${next}"]`) as HTMLElement | null)?.focus())
           }}>
        {COLUMN_KINDS.map(k => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} tabIndex={kind === k ? 0 : -1} data-kind={k}
                  className="fx-col-kind" onClick={() => setKind(k)}>
            <span className="fx-col-kind-ico" aria-hidden="true">{ICON[k]}</span>
            <span><b>{t(`kinds.${k}`)}</b><span>{t(`kindHelp.${k}`)}</span></span>
          </button>
        ))}
      </div>
      {kind === 'choice' && (
        <>
          <span className="fx-col-sub">{t('options')}</span>
          {options.map((o, i) => (
            <div key={o.id} className="fx-col-opt">
              <button type="button" className="fx-col-swatch" style={{ background: o.color }} aria-label={t('optionColor', { name: o.name })}
                      onClick={() => setOptions(os => os.map(x => (x.id === o.id ? { ...x, color: CHOICE_COLORS[(CHOICE_COLORS.indexOf(x.color as typeof CHOICE_COLORS[number]) + 1) % CHOICE_COLORS.length] } : x)))} />
              <input type="text" value={o.name} aria-label={t('optionN', { n: i + 1 })} maxLength={40}
                     onChange={e => setOptions(os => os.map(x => (x.id === o.id ? { ...x, name: e.target.value } : x)))} />
              <button type="button" className="fx-col-ib" aria-label={t('optionUp', { name: o.name })} disabled={i === 0} onClick={() => moveOpt(i, -1)}>↑</button>
              <button type="button" className="fx-col-ib" aria-label={t('optionDown', { name: o.name })} disabled={i === options.length - 1} onClick={() => moveOpt(i, 1)}>↓</button>
              <button type="button" className="fx-col-ib" aria-label={t('removeOption', { name: o.name })} data-remove-option={o.name}
                      onClick={() => setOptions(os => os.filter(x => x.id !== o.id))}>×</button>
            </div>
          ))}
          <span><button type="button" className="fx-sheet-btn" data-add-option=""
                        onClick={() => setOptions(os => [...os, { id: `new-${Date.now()}`, name: t('optionN', { n: os.length + 1 }), color: nextChoiceColor(os) }])}>{t('addOption')}</button></span>
          {removed.map(o => (
            <div key={o.id} className="fx-col-review" role="group" aria-label={o.name}>
              {t('optionInUse', { n: used(o.id), name: o.name })}{' '}
              <span className="fx-sheet-pop-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginTop: 4 }}>
                <button type="button" className="fx-sheet-btn" aria-pressed={replace[o.id] === null} onClick={() => setReplace(r => ({ ...r, [o.id]: null }))}>{t('clearThem')}</button>
                {options.filter(x => !x.id.startsWith('new-')).map(x => (
                  <button key={x.id} type="button" className="fx-sheet-btn" aria-pressed={replace[o.id] === x.id} onClick={() => setReplace(r => ({ ...r, [o.id]: x.id }))}>{t('replaceWith', { name: x.name })}</button>
                ))}
              </span>
            </div>
          ))}
        </>
      )}
      {review && <div className="fx-col-review" role="status" data-kind-review="">{review}</div>}
      <span className="fx-col-err" role="alert">{err}</span>
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{t('cancel')}</button>
        <button type="submit" className="fx-sheet-btn is-primary" disabled={busy}>{initial ? t('save') : t('addColumn')}</button>
      </span>
    </form>
  )
}
