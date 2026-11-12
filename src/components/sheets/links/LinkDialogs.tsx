'use client'

/**
 * Spec 016's dialogs (contracts/ui.md §1, §3–§5; design/sheet-task-links.html):
 * Link to board (Task column, fields, result), Choose a task, Add tasks and
 * the Create tasks for rows preview. They only collect choices; the sheet's
 * hook (useTaskLinks) saves them as one undo step each.
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { SheetTaskMap, TaskField, TaskFieldValues } from '@/types/index'
import { TASK_FIELDS } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { StagePill as BoardStagePill } from '@/components/sheet/StatusCell'
import type { StageId } from '@/types/index'
import { Modal } from '../Dialogs'
import type { TaskHit } from '@/actions/sheet-links'

export const stageLabel = (id: string, lang: string) => {
  const m = STAGE_META[id as keyof typeof STAGE_META]
  return m ? (lang.startsWith('ar') ? m.label_ar : m.label_en) : id
}
/** The board's own stage pill (spec 008), named in the member's language. */
export function StagePill({ stage }: { stage: string }) {
  const locale = useLocale()
  return <BoardStagePill stage={stage as StageId} name={stageLabel(stage, locale)} />
}

export interface ColInfo { id: string; letter: string; name: string; sample: string }
export interface TeamCol { id: string; name: string }

/** Field names, including the team's own columns. */
export function useFieldName(teamCols: TeamCol[]) {
  const t = useTranslations('sheets.links')
  return (f: TaskField) => (f.startsWith('col:') ? t('teamCol', { name: teamCols.find(c => c.id === f.slice(4))?.name ?? '' }) : t(`fields.${f}`))
}

// ─── Link to board ───────────────────────────────────────────────────────────

export function LinkDialog({ cols, map, teamCols, onSave, onUnlink, onReview, onClose }: {
  cols: ColInfo[]
  map: SheetTaskMap | null
  teamCols: TeamCol[]
  /** Save the Task column and fields; resolves with the counts for step 3. */
  onSave(map: SheetTaskMap): Promise<{ linked: number; notFound: number; toChoose: number } | null>
  onUnlink(): void
  onReview(): void
  onClose(): void
}) {
  const t = useTranslations('sheets.links')
  const name = useFieldName(teamCols)
  const [step, setStep] = useState(map ? 2 : 1)
  const [taskCol, setTaskCol] = useState(map?.taskCol ?? cols[0]?.id ?? '')
  const [fields, setFields] = useState<Record<string, TaskField>>(map?.fields ?? {})
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ linked: number; notFound: number; toChoose: number } | null>(null)
  const [unlinkAsk, setUnlinkAsk] = useState(false)
  const all = [...TASK_FIELDS, ...teamCols.map(c => `col:${c.id}` as TaskField)]
  const letter = (id: string) => cols.find(c => c.id === id)?.letter ?? ''
  function pick(col: string, f: string) {
    setFields(cur => {
      const next = { ...cur }
      for (const [k, v] of Object.entries(next)) if (v === f) delete next[k]
      if (f) next[col] = f as TaskField; else delete next[col]
      return next
    })
  }
  async function save() {
    setBusy(true)
    const fl = { ...fields }
    delete fl[taskCol]
    const r = await onSave({ taskCol, fields: fl })
    setBusy(false)
    if (r) { setRes(r); setStep(3) }
  }
  if (unlinkAsk) {
    return (
      <Modal title={t('dialog.unlinkTitle')} body={t('dialog.unlinkBody')} onCancel={() => setUnlinkAsk(false)} attr="data-unlink-ask">
        <div className="fx-sh-dialog-row">
          <button type="button" onClick={() => setUnlinkAsk(false)}>{t('dialog.cancel')}</button>
          <button type="button" className="is-danger" data-ok="" onClick={() => { onUnlink(); onClose() }}>{t('dialog.unlink')}</button>
        </div>
      </Modal>
    )
  }
  const steps = [t('dialog.step1'), t('dialog.step2'), t('dialog.step3')]
  return (
    <Modal title={t('dialog.title')} onCancel={onClose} attr="data-link-board">
      <ol className="fx-lk-steps">
        {steps.map((s, i) => <li key={s} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'is-on' : ''}><i>{i + 1}</i>{s}</li>)}
      </ol>
      {step === 1 && (
        <>
          <p className="fx-fc-hint">{t('dialog.s1')}</p>
          <div className="fx-lk-cols" role="radiogroup" aria-label={t('dialog.step1')}>
            {cols.map(c => (
              <label key={c.id} className={`fx-lk-col${taskCol === c.id ? ' is-on' : ''}`}>
                <input type="radio" name="fx-taskcol" checked={taskCol === c.id} data-task-col={c.letter} onChange={() => setTaskCol(c.id)} />
                <b>{c.letter}</b>
                <span>{c.name || '—'}<small dir="auto">{c.sample ? t('dialog.eg', { value: c.sample }) : t('dialog.empty')}</small></span>
              </label>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <p className="fx-fc-hint">{t('dialog.s2')}</p>
          <div className="fx-lk-map">
            {cols.filter(c => c.id !== taskCol).map(c => {
              const cur = fields[c.id] ?? ''
              return (
                <label key={c.id} className="fx-lk-maprow">
                  <b>{c.letter}</b><span>{c.name || '—'}</span>
                  <select value={cur} data-map-col={c.letter} className={cur ? 'is-set' : ''} onChange={e => pick(c.id, e.target.value)}>
                    <option value="">{t('fields.none')}</option>
                    {all.map(f => {
                      const by = Object.entries(fields).find(([k, v]) => v === f && k !== c.id)
                      return <option key={f} value={f}>{name(f)}{by ? ` · ${t('dialog.usedBy', { col: letter(by[0]) })}` : ''}</option>
                    })}
                  </select>
                </label>
              )
            })}
          </div>
        </>
      )}
      {step === 3 && res && (
        <>
          <p className="fx-fc-hint">{t('dialog.s3')}</p>
          <div className="fx-lk-result" data-link-result="">
            <div><b>{res.linked}</b><small>{t('dialog.linked')}</small></div>
            <div className={res.toChoose ? 'is-warn' : ''}><b>{res.toChoose}</b><small>{t('dialog.toChoose')}</small></div>
            <div className={res.notFound ? 'is-warn' : ''}><b>{res.notFound}</b><small>{t('dialog.notFound')}</small></div>
          </div>
        </>
      )}
      <div className="fx-sh-dialog-row">
        {map && step !== 3 && <button type="button" className="is-start" data-unlink="" onClick={() => setUnlinkAsk(true)}>{t('menu.unlink')}</button>}
        {step === 1 && <><button type="button" onClick={onClose}>{t('dialog.cancel')}</button><button type="button" className="is-go" data-next="" disabled={!taskCol} onClick={() => setStep(2)}>{t('dialog.next')}</button></>}
        {step === 2 && <><button type="button" onClick={() => setStep(1)}>{t('dialog.back')}</button><button type="button" className="is-go" data-save-fields="" disabled={busy} onClick={() => void save()}>{busy ? t('dialog.linking') : t('dialog.save')}</button></>}
        {step === 3 && <>{res && res.toChoose + res.notFound > 0 && <button type="button" onClick={() => { onClose(); onReview() }}>{t('dialog.review')}</button>}<button type="button" className="is-go" data-ok="" onClick={onClose}>{t('dialog.done')}</button></>}
      </div>
    </Modal>
  )
}

// ─── Choose a task / Add tasks ───────────────────────────────────────────────

function TaskRow({ x, kind, on, onToggle }: { x: TaskHit; kind: 'radio' | 'tick'; on: boolean; onToggle(): void }) {
  const t = useTranslations('sheets.links')
  return (
    <button type="button" role={kind === 'radio' ? 'radio' : 'checkbox'} aria-checked={on} className={`fx-lk-trow${on ? ' is-on' : ''}`} data-task-hit={x.id} onClick={onToggle}>
      <span className={kind === 'radio' ? 'fx-lk-radio' : 'fx-lk-tick'} aria-hidden="true">{kind === 'tick' ? '✓' : ''}</span>
      <span className="fx-lk-tt"><b dir="auto">{x.name}</b><small dir="auto">{[x.project, x.assignee, x.dropped ? t('add.dropped') : ''].filter(Boolean).join(' · ')}</small></span>
      <StagePill stage={x.stage} />
    </button>
  )
}

export function ChooseTask({ text, row, choices, search, onPick, onClose }: {
  text: string
  row: number
  choices: TaskHit[]
  search(q: string): Promise<TaskHit[]>
  onPick(taskId: string): void
  onClose(): void
}) {
  const t = useTranslations('sheets.links')
  const [q, setQ] = useState(text)
  const [list, setList] = useState<TaskHit[]>(choices)
  const [sel, setSel] = useState<string | null>(choices[0]?.id ?? null)
  useEffect(() => {
    if (q === text && choices.length) { setList(choices); return }
    const id = window.setTimeout(() => { void search(q).then(setList) }, 250)
    return () => window.clearTimeout(id)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={t('choose.title')} onCancel={onClose} attr="data-choose-task">
      <p className="fx-fc-hint">{t('choose.body', { text, n: choices.length || list.length, row })}</p>
      <input type="search" className="fx-flt-in" value={q} data-autofocus="" aria-label={t('choose.search')} placeholder={t('choose.search')} onChange={e => setQ(e.target.value)} />
      <div className="fx-lk-list" role="radiogroup" aria-label={t('choose.title')}>
        {list.length ? list.map(x => <TaskRow key={x.id} x={x} kind="radio" on={sel === x.id} onToggle={() => setSel(x.id)} />) : <p className="fx-fc-hint">{t('choose.none')}</p>}
      </div>
      <div className="fx-sh-dialog-row">
        <button type="button" onClick={onClose}>{t('dialog.cancel')}</button>
        <button type="button" className="is-go" data-ok="" disabled={!sel} onClick={() => { if (sel) { onPick(sel); onClose() } }}>{t('choose.pick', { row })}</button>
      </div>
    </Modal>
  )
}

export function AddTasks({ below, people, projects, search, onAdd, onClose }: {
  below: number
  people: { id: string; name: string }[]
  projects: { id: string; name: string }[]
  search(q: string, f: { stage?: string; personId?: string; projectId?: string }): Promise<TaskHit[]>
  onAdd(ids: string[]): void
  onClose(): void
}) {
  const t = useTranslations('sheets.links')
  const locale = useLocale()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState(''), [person, setPerson] = useState(''), [project, setProject] = useState('')
  const [list, setList] = useState<TaskHit[]>([])
  const [ticks, setTicks] = useState<string[]>([])
  useEffect(() => {
    const id = window.setTimeout(() => { void search(q, { stage: stage || undefined, personId: person || undefined, projectId: project || undefined }).then(setList) }, 200)
    return () => window.clearTimeout(id)
  }, [q, stage, person, project]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setTicks(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]))
  return (
    <Modal title={t('add.title')} onCancel={onClose} attr="data-add-tasks">
      <p className="fx-fc-hint">{t('add.body', { row: below })}</p>
      <div className="fx-lk-search">
        <input type="search" className="fx-flt-in" value={q} data-autofocus="" data-add-q="" aria-label={t('choose.search')} placeholder={t('choose.search')} onChange={e => setQ(e.target.value)} />
        <select value={stage} aria-label={t('add.anyStage')} onChange={e => setStage(e.target.value)}>
          <option value="">{t('add.anyStage')}</option>
          {Object.keys(STAGE_META).map(id => <option key={id} value={id}>{stageLabel(id, locale)}</option>)}
        </select>
        <select value={person} aria-label={t('add.anyone')} onChange={e => setPerson(e.target.value)}>
          <option value="">{t('add.anyone')}</option>{people.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={project} aria-label={t('add.anyProject')} onChange={e => setProject(e.target.value)}>
          <option value="">{t('add.anyProject')}</option>{projects.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="fx-lk-list" role="group" aria-label={t('add.title')}>
        {list.length ? list.map(x => <TaskRow key={x.id} x={x} kind="tick" on={ticks.includes(x.id)} onToggle={() => toggle(x.id)} />) : <p className="fx-fc-hint">{t('add.none')}</p>}
      </div>
      <div className="fx-sh-dialog-row is-split">
        <span className="fx-fc-hint">{t('add.selected', { n: ticks.length })}</span>
        <span>
          <button type="button" onClick={onClose}>{t('dialog.cancel')}</button>
          <button type="button" className="is-go" data-ok="" disabled={!ticks.length} onClick={() => { onAdd(ticks); onClose() }}>{t('add.go', { n: ticks.length })}</button>
        </span>
      </div>
    </Modal>
  )
}

// ─── Create tasks for rows ───────────────────────────────────────────────────

export interface CreateRow { rowId: string; n: number; values: TaskFieldValues }
export function CreateTasksPreview({ rows, people, onCreate, onClose }: {
  rows: CreateRow[]
  people: { id: string; name: string }[]
  onCreate(rows: { rowId: string; values: TaskFieldValues }[], due: string): Promise<void>
  onClose(): void
}) {
  const t = useTranslations('sheets.links')
  const [fix, setFix] = useState<Record<string, TaskFieldValues>>({})
  const [out, setOut] = useState<Set<string>>(new Set())
  const [due, setDue] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })
  const [busy, setBusy] = useState(false)
  const names = useMemo(() => new Set(people.map(p => p.name.trim().toLowerCase())), [people])
  const firstNames = useMemo(() => people.map(p => p.name.trim().toLowerCase().split(' ')[0]), [people])
  const knows = (n: string) => { const x = n.trim().toLowerCase(); return !x || names.has(x) || firstNames.filter(f => f === x).length === 1 }
  const val = (r: CreateRow) => ({ ...r.values, ...(fix[r.rowId] ?? {}) })
  const problem = (r: CreateRow) => {
    const v = val(r)
    if (!(v.title ?? '').trim()) return 'noTitle'
    if (v.assignee && !knows(v.assignee)) return 'unknown'
    if (v.due && !/^\d{4}-\d{2}-\d{2}$/.test(v.due.trim()) && Number.isNaN(Date.parse(v.due))) return 'badDate'
    return null
  }
  const live = rows.filter(r => !out.has(r.rowId))
  const bad = live.filter(r => problem(r))
  const ready = live.filter(r => !problem(r))
  const set = (rowId: string, k: keyof TaskFieldValues, v: string) => setFix(f => ({ ...f, [rowId]: { ...(f[rowId] ?? {}), [k]: v } }))
  return (
    <Modal title={t('create.title')} onCancel={onClose} attr="data-create-tasks">
      <p className="fx-fc-hint">{t('create.body')}</p>
      {!rows.length ? <p className="fx-fc-hint">{t('create.none')}</p> : (
        <>
          <div className="fx-lk-result">
            <div><b>{ready.length}</b><small>{t('create.toCreate')}</small></div>
            <div className={bad.length ? 'is-warn' : ''}><b>{bad.length}</b><small>{t('create.problems')}</small></div>
            <div><b>{out.size}</b><small>{t('create.leftOut')}</small></div>
          </div>
          <div className="fx-rules-wrap">
            <table className="fx-lk-prev">
              <thead><tr><th scope="col">#</th><th scope="col">{t('create.colTitle')}</th><th scope="col">{t('create.colDue')}</th><th scope="col">{t('create.colAssignee')}</th><th scope="col">{t('create.colStage')}</th><th scope="col"><span className="sr-only">{t('create.leave')}</span></th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const v = val(r), p = out.has(r.rowId) ? null : problem(r), gone = out.has(r.rowId)
                  return (
                    <tr key={r.rowId} className={gone ? 'is-out' : ''} data-create-row={r.n}>
                      <td>{r.n}</td>
                      <td>
                        {p === 'noTitle' || fix[r.rowId]?.title !== undefined
                          ? <input type="text" value={v.title ?? ''} aria-invalid={p === 'noTitle'} aria-label={`${t('create.colTitle')} ${r.n}`} data-fix-title={r.n} onChange={e => set(r.rowId, 'title', e.target.value)} />
                          : <span dir="auto">{v.title}</span>}
                        {p === 'noTitle' && <span className="fx-lk-err">{t('create.noTitle')}</span>}
                      </td>
                      <td className="is-num">{v.due || `${due} *`}{p === 'badDate' && <span className="fx-lk-err">{t('create.badDate')}</span>}</td>
                      <td>
                        {p === 'unknown' || fix[r.rowId]?.assignee !== undefined
                          ? <select value={knows(v.assignee ?? '') ? v.assignee ?? '' : ''} aria-label={`${t('create.colAssignee')} ${r.n}`} data-fix-who={r.n} onChange={e => set(r.rowId, 'assignee', e.target.value)}>
                              <option value="">{t('create.pick')}</option>{people.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                            </select>
                          : <span dir="auto">{v.assignee}</span>}
                        {p === 'unknown' && <span className="fx-lk-err">{t('create.unknown', { name: r.values.assignee ?? '' })}</span>}
                      </td>
                      <td><StagePill stage="todo" /></td>
                      <td><button type="button" className="fx-lk-lnk" data-leave={r.n} onClick={() => setOut(s => { const n = new Set(s); if (n.has(r.rowId)) n.delete(r.rowId); else n.add(r.rowId); return n })}>{gone ? t('create.back') : t('create.leave')}</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <label className="fx-lk-due"><span>* {t('create.sharedDue')}</span><input type="date" value={due} data-shared-due="" onChange={e => setDue(e.target.value)} /></label>
          <p className="fx-fc-hint">{t('create.undoNote')}</p>
        </>
      )}
      <div className="fx-sh-dialog-row">
        <button type="button" onClick={onClose}>{t('dialog.cancel')}</button>
        <button type="button" className="is-go" data-ok="" disabled={busy || !ready.length || bad.length > 0}
                onClick={async () => { setBusy(true); await onCreate(ready.map(r => ({ rowId: r.rowId, values: val(r) })), due); setBusy(false); onClose() }}>
          {t('create.go', { n: ready.length })}
        </button>
      </div>
    </Modal>
  )
}
