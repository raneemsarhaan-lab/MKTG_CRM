'use client'

/**
 * Sheet 2b dialogs on a sheet of rows: + Theme (a name), where a removed theme's or pillar's rows go, deleting a row (unlink or
 * delete its task; children up a level or deleted), and linking a plain row
 * to an existing task.
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ContentTheme, Member, Task } from '@/types/index'

/** + Theme: a name, and that is all (user, 24 Nov 2026). */
export function ThemeAdd({ onCreate, onCancel }: {
  onCreate(name: string): Promise<string | null>
  onCancel(): void
}) {
  const t = useTranslations('content')
  const [name, setName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form className="fx-sheet-pop-form" data-theme-add=""
          onSubmit={async e => { e.preventDefault(); if (!name.trim() || busy) return; setBusy(true); setNote(await onCreate(name.trim())); setBusy(false) }}>
      <label className="fx-sheet-pop-title">{t('themes.name')}
        <input type="text" id="fx-theme-name" value={name} maxLength={120} data-autofocus="" data-theme-name="" aria-invalid={note ? true : undefined}
               onChange={e => { setName(e.target.value); setNote(null) }} />
      </label>
      {note && <span role="alert" className="fx-sheet-missing">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{t('editor.cancel')}</button>
        <button type="submit" className="fx-sheet-btn is-primary" disabled={!name.trim() || busy} data-theme-add-save="">{t('themes.add')}</button>
      </span>
    </form>
  )
}

export interface Destination { key: string; projectId: string; pillarId: string | null; label: string }

/** Where rows go: other themes (and their pillars), or "No pillar" under the same theme. */
export function destinations(themes: ContentTheme[], from: { themeId: string; pillarId?: string | null }, t: (k: string, v?: Record<string, string>) => string): Destination[] {
  const out: Destination[] = []
  for (const th of themes) {
    if (!from.pillarId && th.id === from.themeId) continue
    if (from.pillarId && th.id === from.themeId) out.push({ key: `${th.id}:`, projectId: th.id, pillarId: null, label: t('rows.noPillarIn', { theme: th.name }) })
    else out.push({ key: `${th.id}:`, projectId: th.id, pillarId: null, label: th.name })
    for (const pl of th.pillars) if (pl.id !== from.pillarId) out.push({ key: `${th.id}:${pl.id}`, projectId: th.id, pillarId: pl.id, label: `${th.name} › ${pl.name}` })
  }
  return out
}

export function DestinationPick({ title, rows, options, onConfirm, onCancel }: {
  title: string; rows: number; options: Destination[]; onConfirm(d: Destination | null): Promise<string | null>; onCancel(): void
}) {
  const t = useTranslations('content')
  const [key, setKey] = useState(options[0]?.key ?? '')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form className="fx-sheet-pop-form" data-destination="" onSubmit={e => {
      e.preventDefault()
      setBusy(true)
      void onConfirm(options.find(o => o.key === key) ?? null).then(err => { setBusy(false); setNote(err) })
    }}>
      <span className="fx-sheet-pop-title">{title}</span>
      {rows > 0 ? <>
        <span>{t('rows.whereTo', { n: String(rows) })}</span>
        <select value={key} onChange={e => setKey(e.target.value)} data-destination-pick="" aria-label={t('rows.whereTo', { n: String(rows) })}>
          {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <span className="fx-sheet-muted">{t('rows.neverDeleted')}</span>
      </> : <span className="fx-sheet-muted">{t('rows.noRows')}</span>}
      {note && <span role="alert" className="fx-sheet-missing">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{t('editor.cancel')}</button>
        <button type="submit" className="fx-sheet-btn is-danger" disabled={busy || (rows > 0 && !options.length)} data-destination-confirm="">{t('rows.remove')}</button>
      </span>
    </form>
  )
}

export function DeleteRowPrompt({ name, linked, children, onConfirm, onCancel }: {
  name: string; linked: boolean; children: number
  onConfirm(o: { task?: 'unlink' | 'delete'; children?: 'up' | 'delete' }): Promise<string | null>; onCancel(): void
}) {
  const t = useTranslations('content')
  const [task, setTask] = useState<'unlink' | 'delete'>('unlink')
  const [kids, setKids] = useState<'up' | 'delete'>('up')
  const [note, setNote] = useState<string | null>(null)
  return (
    <form className="fx-sheet-pop-form" data-delete-row="" onSubmit={e => {
      e.preventDefault()
      void onConfirm({ task: linked || (children && kids === 'delete') ? task : undefined, children: children ? kids : undefined }).then(setNote)
    }}>
      <span className="fx-sheet-pop-title">{t('rows.deleteTitle', { name })}</span>
      {linked && (
        <fieldset className="fx-content-fieldset">
          <legend>{t('rows.linkedAsk')}</legend>
          <label className="fx-content-check"><input type="radio" checked={task === 'unlink'} onChange={() => setTask('unlink')} data-delete-task="unlink" />{t('rows.unlink')}</label>
          <label className="fx-content-check"><input type="radio" checked={task === 'delete'} onChange={() => setTask('delete')} data-delete-task="delete" />{t('rows.deleteBoth')}</label>
        </fieldset>
      )}
      {children > 0 && (
        <fieldset className="fx-content-fieldset">
          <legend>{t('rows.childrenAsk', { n: String(children) })}</legend>
          <label className="fx-content-check"><input type="radio" checked={kids === 'up'} onChange={() => setKids('up')} data-delete-children="up" />{t('rows.childrenUp')}</label>
          <label className="fx-content-check"><input type="radio" checked={kids === 'delete'} onChange={() => setKids('delete')} data-delete-children="delete" />{t('rows.childrenDelete')}</label>
        </fieldset>
      )}
      {note && <span role="alert" className="fx-sheet-missing">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{t('editor.cancel')}</button>
        <button type="submit" className="fx-sheet-btn is-danger" data-delete-row-confirm="">{t('rows.delete')}</button>
      </span>
    </form>
  )
}

/** Link a plain row to a task that isn't on the sheet yet. */
export function LinkTaskPick({ tasks, taken, onPick, onCancel }: {
  tasks: Task[]; taken: Set<string>; onPick(taskId: string): Promise<string | null>; onCancel(): void
}) {
  const t = useTranslations('content')
  const [q, setQ] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return tasks.filter(x => !x.media_board && !x.parent_task_id && !x.dropped_at && !taken.has(x.id) && (!k || x.name.toLowerCase().includes(k))).slice(0, 30)
  }, [tasks, taken, q])
  return (
    <div className="fx-sheet-pop-form" data-link-row-task="">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('rows.findTask')} aria-label={t('rows.findTask')} data-link-row-search="" />
      <div role="listbox" aria-label={t('rows.linkTask')} style={{ maxHeight: 240, overflowY: 'auto', display: 'grid' }}>
        {list.map(x => (
          <button key={x.id} type="button" role="option" aria-selected={false} className="fx-sheet-btn" style={{ justifyContent: 'flex-start', textAlign: 'start' }}
                  data-link-row-option={x.name} onClick={() => void onPick(x.id).then(setNote)}>{x.name}</button>
        ))}
        {!list.length && <span className="fx-sheet-muted">{t('rows.noTasks')}</span>}
      </div>
      {note && <span role="alert" className="fx-sheet-missing">{note}</span>}
      <span className="fx-sheet-pop-row"><button type="button" className="fx-sheet-btn" onClick={onCancel}>{t('editor.cancel')}</button></span>
    </div>
  )
}

/**
 * Make task (spec 026 §4–§5): a plain row becomes a linked row — a new task in
 * the chosen Space, or an existing task there. A child row makes a subtask of
 * its parent row's task, so it has no Space to choose.
 */
export function MakeTaskDialog({ title, spaces, defaultSpaceId, tasks, taken, parentTask, taskSpaces, onMake, onCancel }: {
  title: string
  spaces: { id: string; name: string }[]
  defaultSpaceId: string | null
  tasks: Task[]
  /** Tasks already on this sheet. */
  taken: Set<string>
  /** A child row: the parent row's task. */
  parentTask: Task | null
  /** Which tasks show in which Space, for "an existing task there". */
  taskSpaces: { task_id: string; space_id: string }[]
  onMake(o: { spaceId?: string | null; taskId?: string | null }): Promise<string | null>
  onCancel(): void
}) {
  const t = useTranslations('content')
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id ?? '')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [q, setQ] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inSpace = useMemo(() => new Set(taskSpaces.filter(r => r.space_id === spaceId).map(r => r.task_id)), [taskSpaces, spaceId])
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return tasks.filter(x => !x.dropped_at && !taken.has(x.id)
      && (parentTask ? x.parent_task_id === parentTask.id : !x.parent_task_id && (inSpace.has(x.id) || (x as { home_space_id?: string | null }).home_space_id === spaceId))
      && (!k || x.name.toLowerCase().includes(k))).slice(0, 30)
  }, [tasks, taken, q, parentTask, inSpace, spaceId])
  const go = (o: { spaceId?: string | null; taskId?: string | null }) => { setBusy(true); setNote(null); void onMake(o).then(err => { setBusy(false); setNote(err) }) }
  return (
    <form className="fx-sheet-pop-form" data-make-task-dialog="" onSubmit={e => { e.preventDefault(); if (mode === 'new') go({ spaceId: parentTask ? null : spaceId }) }}>
      <span className="fx-sheet-pop-title">{t('rows.makeTaskTitle', { name: title })}</span>
      {parentTask
        ? <span className="fx-sheet-muted" data-make-subtask="">{t('rows.subtaskOf', { name: parentTask.name })}</span>
        : (
          <label className="fx-sheet-pop-title" style={{ fontWeight: 600 }}>{t('rows.inSpace')}
            <select value={spaceId} onChange={e => setSpaceId(e.target.value)} data-make-space="">
              {spaces.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
          </label>
        )}
      <span role="radiogroup" aria-label={t('rows.makeTask')} className="fx-sheet-pop-row">
        <label className="fx-content-check"><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} data-make-mode="new" />{t('rows.newTask')}</label>
        <label className="fx-content-check"><input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} data-make-mode="existing" />{t('rows.existingTask')}</label>
      </span>
      {mode === 'existing' && (
        <>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('rows.findTask')} aria-label={t('rows.findTask')} data-make-search="" />
          <div role="listbox" aria-label={t('rows.existingTask')} style={{ maxHeight: 220, overflowY: 'auto', display: 'grid' }}>
            {list.map(x => (
              <button key={x.id} type="button" role="option" aria-selected={false} className="fx-sheet-btn" style={{ justifyContent: 'flex-start', textAlign: 'start' }} disabled={busy}
                      data-make-existing={x.name} onClick={() => go({ spaceId: parentTask ? null : spaceId, taskId: x.id })}>{x.name}</button>
            ))}
            {!list.length && <span className="fx-sheet-muted">{t('rows.noTasks')}</span>}
          </div>
          <span className="fx-sheet-muted">{t('rows.taskWins')}</span>
        </>
      )}
      {note && <span role="alert" className="fx-sheet-missing">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{t('editor.cancel')}</button>
        {mode === 'new' && <button type="submit" className="fx-sheet-btn is-primary" disabled={busy || (!parentTask && !spaceId)} data-make-task-go="">{t('rows.makeTask')}</button>}
      </span>
    </form>
  )
}
