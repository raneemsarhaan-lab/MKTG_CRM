'use client'

/**
 * Paste plan (spec 009 US2, FR-030–FR-035): rows copied from the Content
 * Library become a preview of themes and pillars to create or match, and
 * pieces that are new, matched by their Task Link, already in the sheet, or
 * have problems to fix in place or leave out. Nothing that isn't a web address
 * is ever sent as a link.
 *
 * Spec 010 (FR-050–FR-052): a pasted column whose heading matches a column's
 * current name fills that column. Values that don't fit are listed and left
 * empty, and headings no column has are listed as Not imported, each with
 * "Add as a column". Rows already in the sheet are sent too when they carry
 * values, to fill their empty cells.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { StageId } from '@/types/index'
import { CONTENT_STAGE_WORDS, isWebLink, norm, readStatus } from '@/lib/content-plan'
import { cellsFromText, type PastedCell } from '@/components/sheet/parse-clips'
import {
  classifyPlan, gridFromHtml, readPlan, LINK_COLUMNS, MAX_PLAN_ROWS,
  type Classified, type LinkColumn, type PlanContext, type PlanRow, type ProblemCode,
} from './parse-plan'
import type { PasteColumns } from '@/components/sheet/types'
import type { AddPlanResult, PlanRowInput } from './types'
import { errorText } from './errors'

/** Rows shown per table; the rest are counted (New and Matched rows are all still added). */
const SHOWN_ROWS = 200

/**
 * A person's fixes to one pasted row. `of` is the row's title as pasted: when
 * the box is edited and read again, a fix stays with the row at the same place
 * with the same title, and is set aside otherwise.
 */
interface Fix { of: string; title?: string; status?: string; links: Partial<Record<LinkColumn, string>>; leftOut?: boolean; move?: boolean; asNew?: boolean }

/** A pasted row with the person's fixes applied, and its own problems checked again. */
function applyFix(row: PlanRow, fix: Fix | undefined): PlanRow {
  if (!fix) return row
  const title = fix.title !== undefined ? fix.title.trim() : row.title
  const statusText = fix.status !== undefined ? fix.status : row.statusText
  const status = fix.status !== undefined ? readStatus(fix.status) : row.status
  const links = { ...row.links }
  const badLinks = { ...row.badLinks }
  for (const k of LINK_COLUMNS) {
    const v = fix.links[k]
    if (v === undefined) continue
    if (!v.trim()) { links[k] = null; delete badLinks[k] }
    else if (isWebLink(v)) { links[k] = v.trim(); delete badLinks[k] }
    else badLinks[k] = v
  }
  const problems: ProblemCode[] = []
  if (!title) problems.push({ code: 'noTitle' })
  for (const k of LINK_COLUMNS) if (badLinks[k]) problems.push({ code: 'badLink', column: k })
  if (!status) problems.push({ code: 'badStatus', status: statusText })
  return { ...row, title, statusText, status, links, badLinks, taskId: fix.asNew ? null : row.taskId, problems }
}

function toInput(r: Classified, move: boolean): PlanRowInput {
  const statusWord = !r.status ? '' : r.status.archived ? 'Archived' : CONTENT_STAGE_WORDS[r.status.stage as StageId]
  return {
    theme: r.theme, owner: r.owner, pillar: r.pillar, title: r.title, type: r.type ?? undefined, status: statusWord,
    frequency: r.frequency ? `${r.frequency.count} per ${r.frequency.period}` : undefined,
    audience: r.audience.join(', '),
    working_doc: r.links.doc ?? undefined, design: r.links.design ?? undefined,
    post: r.links.post ?? undefined, published: r.links.published ?? undefined,
    task_link: r.taskId ?? undefined, move,
    custom: Object.keys(r.values).length ? r.values : undefined,
  }
}

export function PlanPreview({ ctx: baseCtx, columns, onAdd, onClose, initialCells }: {
  ctx: PlanContext
  columns?: PasteColumns
  /** Rows already pasted into the grid, or null to start with an empty box. */
  initialCells?: PastedCell[][] | null
  onAdd(rows: PlanRowInput[], opts: { useSheetTitleStatus: boolean }): Promise<AddPlanResult>
  /** With a message when something was added. */
  onClose(message?: string): void
}) {
  const t = useTranslations('content')
  const tc = useTranslations('sheet.columns')
  const [cells, setCells] = useState<PastedCell[][]>(initialCells ?? [])
  const [text, setText] = useState('')
  const [fixes, setFixes] = useState<Record<number, Fix>>({})
  const [useSheet, setUseSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => { boxRef.current?.focus() }, [])
  /** Esc or a click outside with rows or fixes in the box: asked first, in the footer. */
  const [asking, setAsking] = useState(false)
  const keepRef = useRef<HTMLButtonElement>(null)
  const askedFrom = useRef<HTMLElement | null>(null)
  useEffect(() => { if (asking) keepRef.current?.focus() }, [asking])

  // Keyed by content: the host rebuilds these lists on every render.
  const targetsKey = JSON.stringify(columns?.targets ?? [])
  const valuesKey = JSON.stringify(columns?.values ?? [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const read = useMemo(() => readPlan(cells, columns?.targets ?? []), [cells, targetsKey])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ ...baseCtx, columns: columns?.values ?? [] }), [baseCtx, valuesKey])
  const [adding, setAdding] = useState<string | null>(null)
  /** The fixes that still belong to a pasted row (same place, same title): typing in the box never wipes the rest. */
  const kept = useMemo(() => {
    const out: Record<number, Fix> = {}
    for (const r of read.rows) { const f = fixes[r.index]; if (f && f.of === r.title) out[r.index] = f }
    return out
  }, [fixes, read])
  const rows = useMemo(
    () => classifyPlan(read.rows.map(r => applyFix(r, kept[r.index])), ctx),
    [read, kept, ctx],
  )
  /**
   * The rows as pasted, before any fix: which table each row is listed in. A
   * row stays in its table while it's fixed (marked Fixed), so the field being
   * typed in never moves or goes away.
   */
  const asPasted = useMemo(() => classifyPlan(read.rows, ctx), [read, ctx])
  const now = new Map(rows.map(r => [r.index, r]))
  const fix = (i: number, patch: Partial<Fix>) => {
    const of = read.rows.find(r => r.index === i)?.title ?? ''
    setFixes(f => {
      const prev = f[i]?.of === of ? f[i] : undefined
      return { ...f, [i]: { ...prev, ...patch, of, links: { ...(prev?.links ?? {}), ...(patch.links ?? {}) } } }
    })
  }
  /** A web address typed over a cell that wasn't one; kept as typed (not just once it parses). */
  const linkInput = (i: number, column: LinkColumn) => ({
    type: 'url', inputMode: 'url' as const, name: `link-${column}-${i}`, autoComplete: 'off', spellCheck: false, dir: 'ltr',
    'aria-label': t(`links.${column}`), placeholder: 'https://…', value: kept[i]?.links[column] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => fix(i, { links: { [column]: e.target.value } }),
  })

  const fresh = rows.filter(r => r.kind === 'fresh' && !kept[r.index]?.leftOut)
  const linked = rows.filter(r => r.kind === 'linked' && !kept[r.index]?.leftOut)
  const existing = rows.filter(r => r.kind === 'existing')
  const problems = rows.filter(r => r.kind === 'problem')
  // Listed as pasted (see asPasted): rows with problems to fix or leave out…
  const problemRows = asPasted.filter(r => r.kind === 'problem')
  // …and rows that will be added, but with a cell left empty: shown so they can be fixed.
  const warnings = asPasted.filter(r => r.kind !== 'problem' && r.kind !== 'existing' && r.problems.some(p => p.code === 'badLink'))
  const badValues = rows.filter(r => r.kind !== 'problem' && !kept[r.index]?.leftOut && r.problems.some(p => p.code === 'badValue'))
  const pieces = [...fresh, ...linked.filter(r => !r.otherTheme || kept[r.index]?.move)]
  // Pieces already in the sheet go too when they bring values: their empty cells are filled.
  // Only pieces this member may still edit: an archived one, or someone else's, takes none.
  const admin = ctx.me.access === 'admin' || ctx.me.access === 'superuser'
  const editable = (r: Classified) => {
    const theme = ctx.themes.find(x => norm(x.name) === norm(r.theme))
    const task = ctx.tasks.find(x => x.project_id === theme?.id && norm(x.name) === norm(r.title))
    return !!task && !task.dropped_at && (admin || task.task_owner_id === ctx.me.id || task.assignee_id === ctx.me.id)
  }
  const filling = existing.filter(r => Object.keys(r.values).length && editable(r))
  const sending = [...pieces, ...filling]
  const valueCount = sending.reduce((n, r) => n + Object.keys(r.values).length, 0)
  /** More rows than one Add takes (the paste reads up to MAX_PLAN_ROWS): said before Add, which waits. */
  const total = read.rows.length + read.overflow
  const tooMany = read.overflow > 0 || sending.length > MAX_PLAN_ROWS
  const limitId = 'fx-plan-limit'
  const matchedNames = read.matched.map(k => columns?.values.find(c => c.key === k)?.name).filter(Boolean) as string[]
  const themes = [...new Map(rows.filter(r => r.theme).map(r => [norm(r.theme), { name: r.theme, isNew: r.themeIsNew }])).values()]
  const pillars = [...new Map(rows.filter(r => r.pillar).map(r => {
    const th = ctx.themes.find(x => norm(x.name) === norm(r.theme))
    const isNew = !th?.pillars.some(p => norm(p.name) === norm(r.pillar))
    return [`${norm(r.theme)}|${norm(r.pillar)}`, { name: `${r.theme} · ${r.pillar}`, isNew }]
  })).values()]

  const problemText = (p: ProblemCode) => {
    switch (p.code) {
      case 'noTitle': return t('problem.noTitle')
      case 'badLink': return t('problem.badLink', { column: t(`links.${p.column}`) })
      case 'badStatus': return t('problem.badStatus', { status: p.status })
      case 'missingTask': return t('problem.missingTask')
      case 'unknownOwner': return t('problem.unknownOwner', { name: p.name })
      case 'newThemeAdmin': return t('problem.newThemeAdmin', { name: p.name })
      case 'mayNotAdd': return t('problem.mayNotAdd', { theme: p.theme })
      case 'badValue': return tc('paste.problem', { column: p.column, reason: tc(`invalid.${p.reason}` as 'invalid.number') })
    }
  }

  async function addColumn(name: string) {
    if (!columns || adding) return
    setAdding(name); setError(null)
    const fail = await columns.addColumn(name)
    setAdding(null)
    if (fail) setError(fail)
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    if (html && /<t[rd][\s>]/i.test(html)) {
      e.preventDefault()
      setText(plain)
      setCells(gridFromHtml(html, new DOMParser()))
    }
  }

  /** Closing by Esc or the backdrop: straight away when there's nothing to lose, otherwise asked first. */
  function tryClose() {
    if (asking) return
    if (!rows.length && !Object.keys(kept).length) { onClose(); return }
    askedFrom.current = document.activeElement as HTMLElement | null
    setAsking(true)
  }
  function keepEditing() {
    setAsking(false)
    const back = askedFrom.current
    requestAnimationFrame(() => (back?.isConnected ? back : boxRef.current)?.focus())
  }

  async function add() {
    if (!sending.length || busy || tooMany) return
    setBusy(true); setError(null)
    const res = await onAdd(sending.map(r => toInput(r, !!kept[r.index]?.move)), { useSheetTitleStatus: useSheet })
    setBusy(false)
    if (!res.success) { setError(errorText(t, res.error)); return }
    const skipped = (res.skipped?.length ?? 0) + (res.problems?.length ?? 0)
    onClose([t('paste.done', { created: res.created?.length ?? 0, updated: res.updated?.length ?? 0 }),
      res.values ? tc('paste.filled', { n: res.values }) : '',
      skipped ? t('paste.skipped', { count: skipped }) : ''].filter(Boolean).join(' · '))
  }

  return (
    <div className="fx-sheet-dlg" onMouseDown={e => { if (e.target === e.currentTarget) tryClose() }}>
      <div
        ref={dialogRef}
        className="fx-sheet-dlg-in fx-content-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-plan-title"
        data-plan-preview=""
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (asking) keepEditing(); else tryClose() }
          if (e.key === 'Tab') {
            const els = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('textarea, input, select, button:not([disabled])') ?? [])
            const i = els.indexOf(document.activeElement as HTMLElement)
            if (e.shiftKey && i <= 0) { e.preventDefault(); els[els.length - 1]?.focus() }
            else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0]?.focus() }
          }
        }}
      >
        <div className="fx-sheet-dlg-head">
          <h2 id="fx-plan-title">{t('paste.title')}</h2>
          <p>{t('paste.intro')}</p>
        </div>
        <div className="fx-sheet-dlg-body">
          <textarea ref={boxRef} name="plan" autoComplete="off" spellCheck={false} value={text} aria-label={t('paste.box')} placeholder={t('paste.placeholder')}
                    onPaste={onPaste} onChange={e => { setText(e.target.value); setCells(cellsFromText(e.target.value)) }} />
          {rows.length > 0 && (
            <>
              <div className="fx-content-pills" role="group" aria-label={t('paste.themes')} data-plan-themes="">
                <span className="fx-sheet-sect">{t('paste.themes')}</span>
                {themes.map(th => <span key={th.name} className={`fx-content-pill${th.isNew ? ' is-new' : ''}`}>{th.name} · {th.isNew ? t('paste.isNew') : t('paste.isExisting')}</span>)}
              </div>
              {pillars.length > 0 && (
                <div className="fx-content-pills" role="group" aria-label={t('paste.pillars')} data-plan-pillars="">
                  <span className="fx-sheet-sect">{t('paste.pillars')}</span>
                  {pillars.map(p => <span key={p.name} className={`fx-content-pill${p.isNew ? ' is-new' : ''}`}>{p.name} · {p.isNew ? t('paste.isNew') : t('paste.isExisting')}</span>)}
                </div>
              )}
            </>
          )}
          {/* Mounted from the start, so what the paste found (or didn't) is announced. */}
          <div className="fx-cs-plan-status" role="status">
            {cells.length > 0 && !rows.length && <p className="fx-sheet-counts">{t('paste.none')}</p>}
            {rows.length > 0 && (
              <p className="fx-sheet-counts" data-plan-counts="">
                {t('paste.counts', { fresh: fresh.length, linked: linked.length, existing: existing.length, problems: problems.filter(r => !kept[r.index]?.leftOut).length })}
                {valueCount > 0 && <> · {tc('paste.values', { n: valueCount })}</>}
                {tooMany && <span className="fx-sheet-sr"> · {t('paste.tooMany', { n: total, max: MAX_PLAN_ROWS })}</span>}
              </p>
            )}
          </div>
          {rows.length > 0 && matchedNames.length > 0 && <p className="fx-sheet-muted" data-plan-matched="">{tc('paste.fills', { names: matchedNames.join(', ') })}</p>}
          {rows.length > 0 && filling.length > 0 && <p className="fx-sheet-muted" data-plan-filling="">{tc('paste.fillExisting', { n: filling.length })}</p>}

          {read.unknown.length > 0 && (
            <section aria-label={tc('paste.notImported')} data-not-imported="">
              <div className="fx-sheet-sect">{tc('paste.notImported')}</div>
              <ul className="fx-col-unknown">
                {read.unknown.map(h => (
                  <li key={h}>
                    <span>{h}</span>
                    {columns && (
                      <button type="button" className="fx-sheet-btn" data-add-as-column={h} disabled={!!adding}
                              onClick={() => void addColumn(h)}>
                        {adding === h ? t('paste.adding') : tc('paste.addAsColumn')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {badValues.length > 0 && (
            <section aria-label={tc('paste.badSection')}>
              <div className="fx-sheet-sect">{tc('paste.badSection')}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-plan-bad-values="">
                  <thead><tr><th>{t('paste.piece')}</th><th>{t('paste.problem')}</th></tr></thead>
                  <tbody>
                    {badValues.map(r => (
                      <tr key={r.index} data-plan-row={r.index}>
                        <td>{r.title}</td>
                        <td className="fx-content-problem">
                          {r.problems.filter(p => p.code === 'badValue').map(p => `${problemText(p)}: “${(p as { text: string }).text}”`).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {problemRows.length > 0 && (
            <section aria-label={t('paste.problemSection')}>
              <div className="fx-sheet-sect">{t('paste.problemSection')}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-plan-problems="">
                  <thead><tr>
                    <th>{t('paste.piece')}</th><th>{t('paste.problem')}</th>
                    <th><span className="fx-sheet-sr">{t('paste.fixCol')}</span></th><th><span className="fx-sheet-sr">{t('paste.leaveCol')}</span></th>
                  </tr></thead>
                  <tbody>
                    {problemRows.slice(0, SHOWN_ROWS).map(r => {
                      const f = kept[r.index]
                      const cur = now.get(r.index) ?? r
                      const fixed = cur.kind !== 'problem'
                      // The fields are the row's problems as pasted, each kept (and controlled) until the dialog closes.
                      return (
                        <tr key={r.index} className={f?.leftOut ? 'is-out' : fixed ? 'is-fixed' : undefined} data-plan-row={r.index} data-fixed={fixed ? '' : undefined}>
                          <td>{r.title || <span className="fx-sheet-muted">#{r.index}</span>}</td>
                          <td className={fixed ? 'fx-content-fixed' : 'fx-content-problem'}>{fixed ? t('paste.fixed') : cur.problems.map(problemText).join(' · ')}</td>
                          <td className="fx-content-fixes">
                            {r.problems.map(p => {
                              if (p.code === 'noTitle') return <input key="t" name={`title-${r.index}`} autoComplete="off" aria-label={t('paste.piece')} disabled={f?.leftOut} value={f?.title ?? ''} onChange={e => fix(r.index, { title: e.target.value })} />
                              if (p.code === 'badLink') return <input key={p.column} {...linkInput(r.index, p.column)} disabled={f?.leftOut} />
                              // The sheet's own words are what's sent (readStatus reads them); each is shown in the reader's language.
                              if (p.code === 'badStatus') return (
                                <select key="s" name={`status-${r.index}`} aria-label={t('paste.status')} disabled={f?.leftOut} value={f?.status ?? ''} onChange={e => fix(r.index, { status: e.target.value })}>
                                  <option value="" disabled>{p.status || '—'}</option>
                                  {(Object.entries(CONTENT_STAGE_WORDS) as [StageId, string][]).map(([id, w]) => <option key={w} value={w}>{t(`stage.${id}`)}</option>)}
                                  <option value="Archived">{t('paste.archived')}</option>
                                </select>
                              )
                              if (p.code === 'missingTask') return (
                                <button key="n" type="button" className="fx-sheet-btn" aria-pressed={!!f?.asNew} disabled={f?.leftOut}
                                        onClick={() => fix(r.index, { asNew: !f?.asNew })}>{t('paste.newSection')}</button>
                              )
                              return null
                            })}
                          </td>
                          <td><button type="button" className="fx-sheet-btn" onClick={() => fix(r.index, { leftOut: !f?.leftOut })}>{f?.leftOut ? t('paste.keep') : t('paste.leaveOut')}</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {problemRows.length > SHOWN_ROWS && <p className="fx-sheet-muted" data-plan-more="">{t('paste.moreProblems', { shown: SHOWN_ROWS, n: problemRows.length })}</p>}
            </section>
          )}

          {warnings.length > 0 && (
            <section aria-label={t('paste.warnSection')}>
              <div className="fx-sheet-sect">{t('paste.warnSection')}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-plan-warnings="">
                  <thead><tr><th>{t('paste.piece')}</th><th>{t('paste.problem')}</th><th><span className="fx-sheet-sr">{t('paste.fixCol')}</span></th></tr></thead>
                  <tbody>
                    {warnings.slice(0, SHOWN_ROWS).map(r => {
                      const cur = now.get(r.index) ?? r
                      const left = cur.problems.filter(p => p.code === 'badLink')
                      return (
                        <tr key={r.index} className={left.length ? undefined : 'is-fixed'} data-plan-row={r.index}>
                          <td>{r.title}</td>
                          <td className={left.length ? 'fx-content-problem' : 'fx-content-fixed'}>
                            {left.length ? left.map(p => `${problemText(p)}: “${cur.badLinks[(p as { column: LinkColumn }).column]}”`).join(' · ') : t('paste.fixed')}
                          </td>
                          <td className="fx-content-fixes">
                            {r.problems.map(p => p.code === 'badLink' && <input key={p.column} {...linkInput(r.index, p.column)} />)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {warnings.length > SHOWN_ROWS && <p className="fx-sheet-muted">{t('paste.moreWarnings', { shown: SHOWN_ROWS, n: warnings.length })}</p>}
            </section>
          )}

          {[['newSection', fresh], ['linkedSection', linked]].map(([label, list]) => (list as Classified[]).length > 0 && (
            <section key={label as string} aria-label={t(`paste.${label as string}`)}>
              <div className="fx-sheet-sect">{t(`paste.${label as string}`)}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-plan-section={label as string}>
                  <thead><tr><th>{t('paste.piece')}</th><th>{t('paste.theme')}</th><th>{t('paste.type')}</th><th>{t('paste.status')}</th><th>{t('paste.owner')}</th><th>{t('paste.links')}</th><th><span className="fx-sheet-sr">{t('paste.moveCol')}</span></th></tr></thead>
                  <tbody>
                    {(list as Classified[]).slice(0, SHOWN_ROWS).map(r => (
                      <tr key={r.index} data-plan-row={r.index}>
                        <td>{r.title}</td>
                        <td>{r.pillar ? `${r.theme} · ${r.pillar}` : r.theme}</td>
                        <td>{r.type ?? '—'}</td>
                        <td>{r.status ? (r.status.archived ? t('paste.archived') : t(`stage.${r.status.stage}`)) : ''}</td>
                        <td>{r.owner}{r.problems.some(p => p.code === 'unknownOwner') && <span className="fx-sheet-muted"> ({t('problem.unknownOwner', { name: r.owner })})</span>}</td>
                        <td className="fx-cs-tnum">{LINK_COLUMNS.filter(k => r.links[k]).length}</td>
                        <td>{r.otherTheme && (
                          <label className="fx-content-check">
                            <input type="checkbox" name={`move-${r.index}`} checked={!!kept[r.index]?.move} onChange={e => fix(r.index, { move: e.target.checked })} />
                            {t('paste.inTheme', { theme: r.otherTheme })} · {t('paste.moveHere')}
                          </label>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(list as Classified[]).length > SHOWN_ROWS && (
                <p className="fx-sheet-muted" data-plan-more="">{t('paste.more', { shown: SHOWN_ROWS, n: (list as Classified[]).length })}</p>
              )}
            </section>
          ))}
          {existing.length > 0 && <p className="fx-sheet-muted">{t('paste.existingSection')}: {existing.map(r => r.title).join(' · ')}</p>}
        </div>
        <div className="fx-sheet-dlg-foot">
          {asking ? <>
            <span className="fx-sheet-note" role="alert" data-plan-discard="">{t('paste.discardAsk')}</span>
            <button ref={keepRef} type="button" className="fx-sheet-btn" onClick={keepEditing}>{t('paste.keepEditing')}</button>
            <button type="button" className="fx-sheet-btn is-danger" data-plan-discard-ok="" onClick={() => onClose()}>{t('paste.discard')}</button>
          </> : <>
          {error && <span className="fx-sheet-note" role="alert">{error}</span>}
          <label className="fx-content-check fx-content-usesheet">
            <input type="checkbox" name="useSheet" checked={useSheet} onChange={e => setUseSheet(e.target.checked)} data-use-sheet="" />
            {t('paste.useSheet')}
          </label>
          {tooMany && <span className="fx-sheet-note" id={limitId} data-plan-limit="">{t('paste.tooMany', { n: total, max: MAX_PLAN_ROWS })}</span>}
          {/* Close asks first too, as Esc and the backdrop do, when there's something to lose. */}
          <button type="button" className="fx-sheet-btn" onClick={tryClose}>{t('paste.close')}</button>
          <button type="button" className="fx-sheet-btn is-primary" data-plan-add="" disabled={!sending.length || busy || tooMany}
                  aria-describedby={tooMany ? limitId : undefined} onClick={() => void add()}>
            {busy ? t('paste.adding') : pieces.length || !valueCount ? t('paste.add', { count: pieces.length }) : tc('paste.fill', { n: valueCount })}
          </button>
          </>}
        </div>
      </div>
    </div>
  )
}
