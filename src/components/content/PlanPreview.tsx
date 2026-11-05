'use client'

/**
 * Paste plan (spec 009 US2, FR-030–FR-035): rows copied from the Content
 * Library become a preview of themes and pillars to create or match, and
 * pieces that are new, matched by their Task Link, already in the sheet, or
 * have problems to fix in place or leave out. Nothing that isn't a web address
 * is ever sent as a link.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { StageId } from '@/types/index'
import { CONTENT_STAGE_WORDS, isWebLink, norm, readStatus } from '@/lib/content-plan'
import { cellsFromText, type PastedCell } from '@/components/sheet/parse-clips'
import {
  classifyPlan, gridFromHtml, readPlan, LINK_COLUMNS,
  type Classified, type LinkColumn, type PlanContext, type PlanRow, type ProblemCode,
} from './parse-plan'
import type { AddPlanResult, PlanRowInput } from './types'

interface Fix { title?: string; status?: string; links: Partial<Record<LinkColumn, string>>; leftOut?: boolean; move?: boolean; asNew?: boolean }

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
  }
}

export function PlanPreview({ ctx, onAdd, onClose, initialCells }: {
  ctx: PlanContext
  /** Rows already pasted into the grid, or null to start with an empty box. */
  initialCells?: PastedCell[][] | null
  onAdd(rows: PlanRowInput[], opts: { useSheetTitleStatus: boolean }): Promise<AddPlanResult>
  /** With a message when something was added. */
  onClose(message?: string): void
}) {
  const t = useTranslations('content')
  const [cells, setCells] = useState<PastedCell[][]>(initialCells ?? [])
  const [text, setText] = useState('')
  const [fixes, setFixes] = useState<Record<number, Fix>>({})
  const [useSheet, setUseSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => { boxRef.current?.focus() }, [])

  const read = useMemo(() => readPlan(cells), [cells])
  useEffect(() => { setFixes({}) }, [read])
  const rows = useMemo(
    () => classifyPlan(read.rows.map(r => applyFix(r, fixes[r.index])), ctx),
    [read, fixes, ctx],
  )
  const fix = (i: number, patch: Partial<Fix>) => setFixes(f => ({ ...f, [i]: { ...f[i], ...patch, links: { ...(f[i]?.links ?? {}), ...(patch.links ?? {}) } } }))

  const fresh = rows.filter(r => r.kind === 'fresh' && !fixes[r.index]?.leftOut)
  const linked = rows.filter(r => r.kind === 'linked' && !fixes[r.index]?.leftOut)
  const existing = rows.filter(r => r.kind === 'existing')
  const problems = rows.filter(r => r.kind === 'problem')
  // Rows that will be added, but with a cell left empty: shown so they can be fixed.
  const warnings = rows.filter(r => r.kind !== 'problem' && r.kind !== 'existing' && r.problems.some(p => p.code === 'badLink'))
  const sending = [...fresh, ...linked.filter(r => !r.otherTheme || fixes[r.index]?.move)]
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
    }
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

  async function add() {
    if (!sending.length || busy) return
    setBusy(true); setError(null)
    const res = await onAdd(sending.map(r => toInput(r, !!fixes[r.index]?.move)), { useSheetTitleStatus: useSheet })
    setBusy(false)
    if (!res.success) { setError(res.error ?? t('err.generic')); return }
    const skipped = (res.skipped?.length ?? 0) + (res.problems?.length ?? 0)
    onClose([t('paste.done', { created: res.created?.length ?? 0, updated: res.updated?.length ?? 0 }),
      skipped ? t('paste.skipped', { count: skipped }) : ''].filter(Boolean).join(' · '))
  }

  return (
    <div className="fx-sheet-dlg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={dialogRef}
        className="fx-sheet-dlg-in fx-content-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-plan-title"
        data-plan-preview=""
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
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
          <textarea ref={boxRef} value={text} aria-label={t('paste.box')} placeholder={t('paste.placeholder')}
                    onPaste={onPaste} onChange={e => { setText(e.target.value); setCells(cellsFromText(e.target.value)) }} />
          {cells.length > 0 && !rows.length && <p className="fx-sheet-counts">{t('paste.none')}</p>}
          {rows.length > 0 && (
            <>
              <div className="fx-content-pills" aria-label={t('paste.themes')} data-plan-themes="">
                <span className="fx-sheet-sect">{t('paste.themes')}</span>
                {themes.map(th => <span key={th.name} className={`fx-content-pill${th.isNew ? ' is-new' : ''}`}>{th.name} · {th.isNew ? t('paste.isNew') : t('paste.isExisting')}</span>)}
              </div>
              {pillars.length > 0 && (
                <div className="fx-content-pills" aria-label={t('paste.pillars')} data-plan-pillars="">
                  <span className="fx-sheet-sect">{t('paste.pillars')}</span>
                  {pillars.map(p => <span key={p.name} className={`fx-content-pill${p.isNew ? ' is-new' : ''}`}>{p.name} · {p.isNew ? t('paste.isNew') : t('paste.isExisting')}</span>)}
                </div>
              )}
              <p className="fx-sheet-counts" role="status" data-plan-counts="">
                {t('paste.counts', { fresh: fresh.length, linked: linked.length, existing: existing.length, problems: problems.filter(r => !fixes[r.index]?.leftOut).length })}
              </p>
            </>
          )}

          {problems.length > 0 && (
            <section aria-label={t('paste.problemSection')}>
              <div className="fx-sheet-sect">{t('paste.problemSection')}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-plan-problems="">
                  <thead><tr><th>{t('paste.piece')}</th><th>{t('paste.problem')}</th><th /><th /></tr></thead>
                  <tbody>
                    {problems.map(r => {
                      const f = fixes[r.index]
                      return (
                        <tr key={r.index} className={f?.leftOut ? 'is-out' : undefined} data-plan-row={r.index}>
                          <td>{r.title || <span className="fx-sheet-muted">#{r.index}</span>}</td>
                          <td className="fx-content-problem">{r.problems.map(problemText).join(' · ')}</td>
                          <td className="fx-content-fixes">
                            {r.problems.map(p => {
                              if (p.code === 'noTitle') return <input key="t" aria-label={t('paste.piece')} disabled={f?.leftOut} onChange={e => fix(r.index, { title: e.target.value })} />
                              if (p.code === 'badLink') return <input key={p.column} aria-label={t(`links.${p.column}`)} placeholder="https://…" disabled={f?.leftOut} defaultValue="" onChange={e => fix(r.index, { links: { [p.column]: e.target.value } })} />
                              if (p.code === 'badStatus') return (
                                <select key="s" aria-label={t('paste.status')} disabled={f?.leftOut} defaultValue="" onChange={e => fix(r.index, { status: e.target.value })}>
                                  <option value="" disabled>{p.status || '—'}</option>
                                  {Object.values(CONTENT_STAGE_WORDS).map(w => <option key={w} value={w}>{w}</option>)}
                                  <option value="Archived">Archived</option>
                                </select>
                              )
                              if (p.code === 'missingTask') return <button key="n" type="button" className="fx-sheet-btn" onClick={() => fix(r.index, { asNew: true })}>{t('paste.newSection')}</button>
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
            </section>
          )}

          {warnings.length > 0 && (
            <section aria-label={t('paste.warnSection')}>
              <div className="fx-sheet-sect">{t('paste.warnSection')}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-plan-warnings="">
                  <thead><tr><th>{t('paste.piece')}</th><th>{t('paste.problem')}</th><th /></tr></thead>
                  <tbody>
                    {warnings.map(r => (
                      <tr key={r.index} data-plan-row={r.index}>
                        <td>{r.title}</td>
                        <td className="fx-content-problem">{r.problems.filter(p => p.code === 'badLink').map(p => `${problemText(p)}: "${r.badLinks[(p as { column: LinkColumn }).column]}"`).join(' · ')}</td>
                        <td className="fx-content-fixes">
                          {r.problems.map(p => p.code === 'badLink' && (
                            <input key={p.column} aria-label={t(`links.${p.column}`)} placeholder="https://…" defaultValue=""
                                   onChange={e => fix(r.index, { links: { [p.column]: e.target.value } })} />
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {[['newSection', fresh], ['linkedSection', linked]].map(([label, list]) => (list as Classified[]).length > 0 && (
            <section key={label as string} aria-label={t(`paste.${label as string}`)}>
              <div className="fx-sheet-sect">{t(`paste.${label as string}`)}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-plan-section={label as string}>
                  <thead><tr><th>{t('paste.piece')}</th><th>{t('paste.theme')}</th><th>{t('paste.type')}</th><th>{t('paste.status')}</th><th>{t('paste.owner')}</th><th>{t('paste.links')}</th><th /></tr></thead>
                  <tbody>
                    {(list as Classified[]).map(r => (
                      <tr key={r.index} data-plan-row={r.index}>
                        <td>{r.title}</td>
                        <td>{r.pillar ? `${r.theme} · ${r.pillar}` : r.theme}</td>
                        <td>{r.type ?? '—'}</td>
                        <td>{r.status ? (r.status.archived ? 'Archived' : t(`stage.${r.status.stage}`)) : ''}</td>
                        <td>{r.owner}{r.problems.some(p => p.code === 'unknownOwner') && <span className="fx-sheet-muted"> ({t('problem.unknownOwner', { name: r.owner })})</span>}</td>
                        <td>{LINK_COLUMNS.filter(k => r.links[k]).length}</td>
                        <td>{r.otherTheme && (
                          <label className="fx-content-check">
                            <input type="checkbox" checked={!!fixes[r.index]?.move} onChange={e => fix(r.index, { move: e.target.checked })} />
                            {t('paste.inTheme', { theme: r.otherTheme })} · {t('paste.moveHere')}
                          </label>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {existing.length > 0 && <p className="fx-sheet-muted">{t('paste.existingSection')}: {existing.map(r => r.title).join(' · ')}</p>}
        </div>
        <div className="fx-sheet-dlg-foot">
          {error && <span className="fx-sheet-note" role="alert">{error}</span>}
          <label className="fx-content-check fx-content-usesheet">
            <input type="checkbox" checked={useSheet} onChange={e => setUseSheet(e.target.checked)} data-use-sheet="" />
            {t('paste.useSheet')}
          </label>
          <button type="button" className="fx-sheet-btn" onClick={() => onClose()}>{t('paste.close')}</button>
          <button type="button" className="fx-sheet-btn is-primary" data-plan-add="" disabled={!sending.length || busy} onClick={() => void add()}>
            {busy ? t('paste.adding') : t('paste.add', { count: sending.length })}
          </button>
        </div>
      </div>
    </div>
  )
}
