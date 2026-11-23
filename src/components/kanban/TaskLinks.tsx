'use client'

/**
 * A task's Task link fields in its panel (spec 021, design/spaces-stage-c.html
 * §4 "Board card and task panel"): "Part of ↗ Ramadan launch plan ⇄ ×".
 * Clicking the name opens that task; ⇄ Change picks another (or creates one);
 * × Unlink removes the link at once, with Undo. Neither touches either task.
 */
import { createContext, useContext, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SheetColumnRecord } from '@/types/index'
import { LinkTaskPicker, type TaskLinkCtx } from '@/components/sheet/LinkTaskPicker'
import { SheetPopover } from '@/components/sheet/SheetMenu'

export interface TaskLinkField { id: string; name: string }

/** The Task link fields that hold a value for this task, by name, once each. */
export function taskLinkFields(records: SheetColumnRecord[], values: Record<string, Record<string, string>>, taskId: string): (TaskLinkField & { value: string })[] {
  return records
    .filter(r => r.kind === 'task' && !!values[r.id]?.[taskId])
    .map(r => ({ id: r.id, name: r.name ?? '', value: values[r.id][taskId] }))
}

export function TaskLinksSection({ taskId, brandId, fields, ctx, set }: {
  taskId: string
  brandId?: string | null
  fields: (TaskLinkField & { value: string })[]
  ctx: TaskLinkCtx
  /** Saves a field's value for this task ('' unlinks). */
  set(columnId: string, value: string): Promise<boolean>
}) {
  const t = useTranslations('sheet.columns.taskLink')
  const [over, setOver] = useState<Record<string, string>>({})
  const [picking, setPicking] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [note, setNote] = useState<{ text: string; undo?: () => void } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = (text: string, undo?: () => void) => {
    if (timer.current) clearTimeout(timer.current)
    setNote({ text, undo })
    timer.current = setTimeout(() => setNote(null), 10000)
  }
  const valueOf = (f: TaskLinkField & { value: string }) => (f.id in over ? over[f.id] : f.value)
  const nameOf = (id: string) => ctx.tasks.find(x => x.id === id)?.name ?? null
  const shown = fields.filter(f => valueOf(f) || f.id in over)
  if (!shown.length && !note) return null

  async function change(f: TaskLinkField, value: string) {
    const before = valueOf(f as TaskLinkField & { value: string })
    setOver(o => ({ ...o, [f.id]: value }))
    const ok = await set(f.id, value)
    if (!ok) { setOver(o => ({ ...o, [f.id]: before })); return false }
    return true
  }

  return (
    <div data-task-links="" style={{ display: 'grid', gap: 6, margin: '6px 0' }}>
      {shown.map(f => {
        const v = valueOf(f)
        const name = v ? nameOf(v) : null
        return (
          <div key={f.id} data-task-link-field={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, fontSize: 14 }}>
            <span style={{ width: 130, flex: 'none', color: '#6B7280', fontSize: 13 }}>{f.name}</span>
            {v ? (
              <span className="fx-tasklink">
                <button type="button" className={`fx-tasklink-name${name ? '' : ' is-missing'}`} data-tasklink-open=""
                        title={name ? t('open', { name }) : undefined} onClick={() => { if (name) ctx.openTask(v) }}>
                  <span>{name ? `↗ ${name}` : t('missing')}</span>
                </button>
                <button type="button" className="fx-tasklink-ib" data-tasklink-change="" aria-label={t('change')} title={t('change')}
                        onClick={e => setPicking({ id: f.id, anchor: e.currentTarget })}>⇄</button>
                <button type="button" className="fx-tasklink-ib" data-tasklink-unlink="" aria-label={t('unlink')} title={t('unlink')}
                        onClick={async () => {
                          if (await change(f, '')) say(t('unlinked', { name: name ?? t('missing') }), () => void change(f, v))
                        }}>×</button>
              </span>
            ) : (
              <button type="button" className="fx-tasklink-ib" style={{ width: 'auto', padding: '0 6px', opacity: .8 }} data-tasklink-change=""
                      onClick={e => setPicking({ id: f.id, anchor: e.currentTarget })}>＋ {t('linkTask')}</button>
            )}
          </div>
        )
      })}
      {note && (
        <p role="status" style={{ margin: 0, fontSize: 12.5, color: '#6B7280', display: 'flex', gap: 8, alignItems: 'center' }}>
          {note.text}
          {note.undo && <button type="button" className="fx-sheet-btn" data-task-links-undo="" onClick={() => { const u = note.undo; setNote(null); u?.() }}>{t('undo')}</button>}
        </p>
      )}
      {picking && (() => {
        const f = fields.find(x => x.id === picking.id)!
        return (
          <SheetPopover anchor={picking.anchor} label={t('dialog', { name: f.name })} onClose={() => setPicking(null)}>
            <LinkTaskPicker ctx={ctx} typed="" current={valueOf(f) || null} exclude={taskId} brandId={brandId}
                            onClose={() => setPicking(null)}
                            onPick={async (id, name) => {
                              setPicking(null)
                              const prev = valueOf(f)
                              if (await change(f, id)) say(t('linked', { name }), () => void change(f, prev))
                            }} />
          </SheetPopover>
        )
      })()}
    </div>
  )
}


/** Spec 021: the tasks each task links to through Task link fields, for Board cards (names, in field order). */
export const TaskLinkNames = createContext<Map<string, string[]>>(new Map())
export const useTaskLinkNames = (taskId: string) => useContext(TaskLinkNames).get(taskId) ?? []

/** taskId → the names of the tasks it links to. */
export function linkNamesByTask(records: SheetColumnRecord[], values: Record<string, Record<string, string>>, names: Map<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const r of records) {
    if (r.kind !== 'task') continue
    for (const [taskId, target] of Object.entries(values[r.id] ?? {})) {
      const n = names.get(target)
      if (!n) continue
      const list = out.get(taskId) ?? []
      if (!list.includes(n)) list.push(n)
      out.set(taskId, list)
    }
  }
  return out
}
