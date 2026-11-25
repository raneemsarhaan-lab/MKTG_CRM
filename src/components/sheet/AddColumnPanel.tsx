'use client'

/**
 * Add column (owner's design of 25 Nov 2026, "Add column" screen): a panel next to the ＋ after the
 * headings, not a dialog. Existing fields come first, so nobody types a second "brand":
 *
 *   1. Search fields.
 *   2. Standard · already on every task — Show.
 *   3. Custom · on in <Space> — Show.
 *   4. Custom · off in <Space> — "Turn on in <Space>" (with where it is on).
 *   5. + New field: name, kind, where it lives (on the task, turned on in Spaces; or this sheet only).
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SheetPopover } from './SheetMenu'
import { KIND_GLYPH, type CatalogKind } from '@/lib/field-catalog'
import type { ColumnKind, FieldKind } from '@/types/index'

export interface AddItem { key: string; name: string; kind: CatalogKind | null; where?: string }
export interface NewFieldInput { name: string; kind: FieldKind; place: 'task' | 'sheet'; spaceIds: string[]; choices: string[] }

const KINDS: FieldKind[] = ['text', 'number', 'money', 'date', 'link', 'person', 'choice', 'multi', 'checkbox', 'rating', 'task']
/** The kinds a sheet-only column can be. */
const SHEET_KINDS: Partial<Record<FieldKind, ColumnKind>> = { text: 'text', number: 'number', date: 'date', link: 'link', person: 'person', choice: 'choice', checkbox: 'checkbox', task: 'task' }
export const sheetKindOf = (k: FieldKind): ColumnKind | null => SHEET_KINDS[k] ?? null

export function FieldGlyph({ kind, tone = 'custom' }: { kind: CatalogKind | null; tone?: 'standard' | 'custom' | 'regular' }) {
  return <span aria-hidden="true" className={`fx-ac-glyph is-${tone}`} data-kind={kind ?? 'text'}>{KIND_GLYPH[kind ?? 'text']}</span>
}

export function AddColumnPanel(p: {
  anchor: HTMLElement
  onClose(): void
  /** The Space this sheet is (null on a brand's or My tasks' sheet: no "on in" sections). */
  space: { id: string; name: string } | null
  standard: AddItem[]
  customOn: AddItem[]
  customOff: AddItem[]
  /** Spaces a new custom field can be turned on in. */
  spaces: { id: string; name: string }[]
  onShow(key: string): void
  onTurnOn(key: string): void
  onCreate(input: NewFieldInput): Promise<string | null>
}) {
  const t = useTranslations('fieldSystem')
  const tk = (k: string) => t(`kinds.${k}` as 'kinds.text')
  const [q, setQ] = useState('')
  const [view, setView] = useState<'list' | 'new'>('list')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FieldKind>('text')
  const [place, setPlace] = useState<'task' | 'sheet'>(p.space ? 'task' : 'sheet')
  const [on, setOn] = useState<string[]>(p.space ? [p.space.id] : [])
  const [choices, setChoices] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const match = (x: AddItem) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase())
  const sections = useMemo(() => [
    { id: 'standard', title: t('standardTitle'), note: t('standardNote'), tone: 'standard' as const, items: p.standard.filter(match), action: t('show'), run: p.onShow },
    ...(p.space ? [
      { id: 'on', title: t('onTitle', { space: p.space.name }), note: t('onNote'), tone: 'custom' as const, items: p.customOn.filter(match), action: t('show'), run: p.onShow },
      { id: 'off', title: t('offTitle', { space: p.space.name }), note: t('offNote', { space: p.space.name }), tone: 'custom' as const, items: p.customOff.filter(match), action: t('turnOn', { space: p.space.name }), run: p.onTurnOn },
    ] : [
      { id: 'on', title: t('customTitle'), note: '', tone: 'custom' as const, items: p.customOn.filter(match), action: t('show'), run: p.onShow },
    ]),
  ].filter(s => s.items.length), [p, q, t]) // eslint-disable-line react-hooks/exhaustive-deps
  const sheetOnly = place === 'sheet'
  const kindOk = !sheetOnly || !!sheetKindOf(kind)

  async function create() {
    if (!name.trim()) { setError(t('nameEmpty')); return }
    if (!kindOk) { setError(t('kindSheetOnly')); return }
    if (place === 'task' && !on.length) { setError(t('pickSpace')); return }
    setBusy(true); setError(null)
    const err = await p.onCreate({ name: name.trim(), kind, place, spaceIds: on, choices: choices.split(',').map(x => x.trim()).filter(Boolean) })
    setBusy(false)
    if (err) setError(err); else p.onClose()
  }

  return (
    <SheetPopover anchor={p.anchor} label={t('title')} onClose={() => p.onClose()} width={480}>
      <div className="fx-ac" data-add-column-panel="">
        {view === 'list' ? (
          <>
            <div className="fx-ac-head">
              <h2 className="fx-ac-h">{t('title')}</h2>
              <label className="fx-ac-label">{t('search')}
                <input type="text" className="fx-ac-input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('searchHint')} data-add-search="" />
              </label>
            </div>
            <div className="fx-ac-list">
              {sections.map(s => (
                <section key={s.id} className="fx-ac-sec" data-add-section={s.id} aria-label={s.title}>
                  <span className="fx-ac-sec-title">{s.title}</span>
                  {s.note && <span className="fx-ac-sec-note">{s.note}</span>}
                  {s.items.map(x => (
                    <div key={x.key} className="fx-ac-row" data-add-item={x.key}>
                      <FieldGlyph kind={x.kind} tone={s.tone} />
                      <span className="fx-ac-name">
                        <span className="fx-ac-n">{x.name}</span>
                        <span className="fx-ac-k">{[x.kind ? tk(x.kind) : '', x.where ? t('onIn', { spaces: x.where }) : ''].filter(Boolean).join(' · ')}</span>
                      </span>
                      <button type="button" className={`fx-ac-btn${s.id === 'off' ? ' is-on' : ''}`} data-add-do={s.id}
                              onClick={() => { s.run(x.key); p.onClose() }}>{s.action}</button>
                    </div>
                  ))}
                </section>
              ))}
              {!sections.length && <p className="fx-ac-none">{q ? t('noMatch', { q }) : t('allShown')}</p>}
            </div>
            <button type="button" className="fx-ac-new" data-add-new="" onClick={() => { setName(q); setView('new') }}>{t('newField')}</button>
          </>
        ) : (
          <div className="fx-ac-form" data-new-field="">
            <div className="fx-ac-formhead">
              <button type="button" className="fx-ac-back" aria-label={t('back')} onClick={() => setView('list')}>←</button>
              <h2 className="fx-ac-h">{t('newTitle')}</h2>
            </div>
            <label className="fx-ac-label">{t('name')}
              <input type="text" className="fx-ac-input" value={name} maxLength={60} onChange={e => setName(e.target.value)} data-new-name="" data-autofocus="" />
            </label>
            <div className="fx-ac-group" role="group" aria-label={t('kind')}>
              <span className="fx-ac-label">{t('kind')}</span>
              <div className="fx-ac-chips">
                {KINDS.map(k => (
                  <button key={k} type="button" className="fx-ac-chip" aria-pressed={kind === k} data-new-kind={k}
                          disabled={sheetOnly && !sheetKindOf(k)} onClick={() => setKind(k)}>{tk(k)}</button>
                ))}
              </div>
            </div>
            {(kind === 'choice' || kind === 'multi') && (
              <label className="fx-ac-label">{t('choices')}
                <input type="text" className="fx-ac-input" value={choices} onChange={e => setChoices(e.target.value)} placeholder={t('choicesHint')} data-new-choices="" />
              </label>
            )}
            <div className="fx-ac-group" role="group" aria-label={t('where')}>
              <span className="fx-ac-label">{t('where')}</span>
              <div className="fx-ac-places">
                <button type="button" className="fx-ac-place" aria-pressed={place === 'task'} data-new-place="task" disabled={!p.spaces.length}
                        onClick={() => { setPlace('task') }}>
                  <span className="fx-ac-pt">{t('onTask')}</span><span className="fx-ac-pd">{t('onTaskHint')}</span>
                </button>
                <button type="button" className="fx-ac-place" aria-pressed={place === 'sheet'} data-new-place="sheet"
                        onClick={() => { setPlace('sheet'); if (!sheetKindOf(kind)) setKind('text') }}>
                  <span className="fx-ac-pt">{t('sheetOnly')}</span><span className="fx-ac-pd">{t('sheetOnlyHint')}</span>
                </button>
              </div>
            </div>
            {place === 'task' && (
              <div className="fx-ac-group" role="group" aria-label={t('turnOnIn')}>
                <span className="fx-ac-label">{t('turnOnIn')}</span>
                <div className="fx-ac-chips">
                  {p.spaces.map(s => (
                    <button key={s.id} type="button" className="fx-ac-chip" aria-pressed={on.includes(s.id)} data-new-space={s.id}
                            onClick={() => setOn(o => (o.includes(s.id) ? o.filter(x => x !== s.id) : [...o, s.id]))}>
                      {s.id === p.space?.id ? t('thisSpace', { space: s.name }) : s.name}
                    </button>
                  ))}
                </div>
                <span className="fx-ac-sec-note">{t('turnOnNote')}</span>
              </div>
            )}
            {error && <p className="fx-ac-error" role="alert">{error}</p>}
            <div className="fx-ac-actions">
              <button type="button" className="fx-ac-cancel" onClick={() => setView('list')}>{t('cancel')}</button>
              <button type="button" className="fx-ac-add" data-new-add="" disabled={busy} onClick={() => void create()}>{busy ? t('adding') : t('add')}</button>
            </div>
          </div>
        )}
      </div>
    </SheetPopover>
  )
}
