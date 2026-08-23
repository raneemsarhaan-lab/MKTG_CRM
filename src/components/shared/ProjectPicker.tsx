'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  listPickerProjects, listProjectContents,
  type PickerProject, type PickerContents,
} from '@/actions/projects'
import { STAGE_META } from '@/lib/stage-meta'
import type { StageId } from '@/types/index'

/**
 * Choosing the project a task belongs to.
 *
 * Two levels, because one was unusable: the picker this replaces listed every
 * free plan step in every project, flat — three hundred and eleven rows, the
 * project name repeated on each because it was the only context there was.
 * Thirty-eight projects fit; what is inside one is fetched when it is opened.
 *
 * Search runs across both levels at once. At the top it filters projects, and
 * a project matches on its own name, its brand, or anything inside it; once
 * inside, it filters that project's contents.
 */

const UI = {
  ground:  '#FFFFFF',
  surface: '#F7F8FA',
  hover:   '#F1F2F5',
  line:    '#E8EAED',
  ink:     '#1A1A1A',
  text:    '#292D34',
  label:   '#7C828D',
  faint:   '#A5AAB3',
  purple:  '#7C3AED',
  purpleIn:'#6D28D9',
  purpleBg:'#F3EEFF',
  lime:    '#C9D633',
  limeInk: '#3F4A08',
} as const

export interface ProjectPickerProps {
  /** Called with the project chosen, or null when the task is detached. */
  onPick: (project: { id: string; name: string } | null) => void
  onClose: () => void
  /** Shown as chosen, and offered as "remove" when set. */
  current?: { id: string; name: string } | null
  /** Creating a task inside a project — omitted where that makes no sense. */
  onCreateTask?: (projectId: string, name: string) => Promise<void>
}

export function ProjectPicker({ onPick, onClose, current, onCreateTask }: ProjectPickerProps) {
  const [projects, setProjects] = useState<PickerProject[] | null>(null)
  const [open, setOpen]         = useState<PickerProject | null>(null)
  const [inside, setInside]     = useState<PickerContents | null>(null)
  const [query, setQuery]       = useState('')
  const [newName, setNewName]   = useState('')
  const [busy, startTransition] = useTransition()
  const boxRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void listPickerProjects().then(setProjects)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // Click-away and Escape, the way every other panel here closes.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); open ? setOpen(null) : onClose() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, open])

  function enter(p: PickerProject) {
    setOpen(p); setInside(null); setQuery('')
    void listProjectContents(p.id).then(setInside)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const q = query.trim().toLowerCase()

  const shown = useMemo(() => {
    if (!projects) return []
    if (!q) return projects
    return projects.filter(p =>
      p.name.toLowerCase().includes(q) || (p.brandName ?? '').toLowerCase().includes(q))
  }, [projects, q])

  const insideTasks = (inside?.tasks ?? []).filter(t => !q || t.name.toLowerCase().includes(q))
  const insideSteps = (inside?.steps ?? []).filter(s => !q || s.name.toLowerCase().includes(q))

  function createHere() {
    const name = newName.trim()
    if (!name || !open || !onCreateTask) return
    startTransition(async () => {
      await onCreateTask(open.id, name)
      setNewName('')
      const fresh = await listProjectContents(open.id)
      setInside(fresh)
    })
  }

  return (
    <div ref={boxRef} style={{
      position: 'absolute', zIndex: 40, insetInlineStart: 0, top: 'calc(100% + 6px)',
      width: 420, maxWidth: '92vw', background: UI.ground,
      border: `1px solid ${UI.line}`, borderRadius: 12,
      boxShadow: '0 14px 40px rgba(28,24,54,.18)', overflow: 'hidden',
    }}>
      {/* header: where you are, and the way back */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px',
        borderBottom: `1px solid ${UI.line}`, background: UI.surface,
      }}>
        {open ? (
          <>
            <button type="button" onClick={() => { setOpen(null); setQuery('') }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      border: `1px solid ${UI.line}`, background: UI.ground,
                      borderRadius: 8, padding: '4px 9px 4px 7px', cursor: 'pointer',
                      font: 'inherit', fontSize: 12.5, fontWeight: 600, color: UI.text,
                    }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Projects
            </button>
            <span style={{
              fontSize: 13.5, fontWeight: 600, color: UI.ink, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {open.name}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 13.5, color: UI.label }}>Put this task under…</span>
        )}
      </div>

      {/* search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
        borderBottom: `1px solid ${UI.line}`,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={UI.faint}
             strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7.5" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={open ? 'Search in this project…' : 'Search projects…'}
          aria-label={open ? 'Search in this project' : 'Search projects'}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none',
            font: 'inherit', fontSize: 14.5, color: UI.text,
          }}
        />
        <span style={{ fontSize: 11.5, color: UI.faint, whiteSpace: 'nowrap' }}>
          {!projects ? 'Loading…'
            : open   ? `${insideTasks.length} tasks`
            : q      ? `${shown.length} of ${projects.length}`
                     : `${projects.length} projects`}
        </span>
      </div>

      {/* rows */}
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
        {/* Detaching is a row rather than a stray ✕: it belongs with the other
            choices, and reads as one. */}
        {!open && current && (
          <Row onClick={() => onPick(null)}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: UI.label }}>
              Remove from <b style={{ color: UI.text }}>{current.name}</b>
            </span>
          </Row>
        )}

        {!projects && <Empty>Loading projects…</Empty>}

        {projects && !open && shown.map(p => (
          <Row key={p.id} onClick={() => enter(p)}>
            <span aria-hidden="true" style={{
              width: 9, height: 9, borderRadius: 3, flexShrink: 0,
              background: p.brandColor || UI.faint,
            }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 14, fontWeight: 600, color: UI.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.name}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: UI.label }}>
                {p.brandName ?? 'No brand'}{p.standing ? ' · standing' : ''}
              </span>
            </span>
            {p.focus && <span title="Focus" style={{ color: '#EA8C0B', fontSize: 12 }}>★</span>}
            <Pill>{p.taskCount} tasks</Pill>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={UI.faint}
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Row>
        ))}

        {projects && !open && !shown.length && <Empty>Nothing matches “{query}”.</Empty>}

        {/* inside a project */}
        {open && (
          <>
            <Row onClick={() => onPick({ id: open.id, name: open.name })} accent>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: UI.purpleIn }}>
                Put the task under {open.name}
              </span>
            </Row>

            {!inside && <Empty>Loading…</Empty>}

            {inside && insideTasks.length > 0 && <Label>Tasks already here</Label>}
            {inside && insideTasks.map(t => (
              <Row key={t.id} plain>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 13.5, color: UI.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: UI.label }}>
                    {t.assigneeName ?? 'Unassigned'}
                  </span>
                </span>
                <Pill>{STAGE_META[t.status as StageId]?.label_en ?? t.status}</Pill>
              </Row>
            ))}

            {inside && insideSteps.length > 0 && <Label>Plan steps</Label>}
            {inside && insideSteps.map(s => (
              <Row key={s.id} plain>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 13.5,
                  color: s.done ? UI.faint : UI.text,
                  textDecoration: s.done ? 'line-through' : 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.name}
                </span>
                {s.taskId && <Pill>on the board</Pill>}
              </Row>
            ))}

            {inside && !insideTasks.length && !insideSteps.length && (
              <Empty>{q ? 'Nothing here matches.' : 'Nothing under this project yet.'}</Empty>
            )}
          </>
        )}
      </div>

      {/* create, inside a project */}
      {open && onCreateTask && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: 10,
          borderTop: `1px solid ${UI.line}`, background: UI.surface,
        }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createHere() } }}
            placeholder="New task in this project…"
            aria-label="New task in this project"
            style={{
              flex: 1, minWidth: 0, border: `1px solid ${UI.line}`, borderRadius: 8,
              padding: '7px 10px', font: 'inherit', fontSize: 13.5,
              background: UI.ground, color: UI.text, outline: 'none',
            }}
          />
          <button type="button" onClick={createHere} disabled={!newName.trim() || busy}
                  style={{
                    border: 'none', borderRadius: 8, padding: '7px 13px',
                    cursor: newName.trim() ? 'pointer' : 'default',
                    font: 'inherit', fontSize: 13, fontWeight: 700,
                    background: UI.lime, color: UI.limeInk,
                    opacity: newName.trim() && !busy ? 1 : 0.45,
                  }}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── the small parts ──────────────────────────────────────────────────── */

function Row({ children, onClick, accent, plain }: {
  children: React.ReactNode
  onClick?: () => void
  accent?: boolean
  plain?: boolean
}) {
  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    border: 'none', borderRadius: 8, padding: '8px 9px', textAlign: 'start',
    font: 'inherit', color: UI.text,
    background: accent ? UI.purpleBg : 'transparent',
    cursor: onClick ? 'pointer' : 'default',
  }
  if (plain) return <div style={style}>{children}</div>
  return (
    <button type="button" onClick={onClick} style={style}
            onMouseEnter={e => { if (!accent) e.currentTarget.style.background = UI.hover }}
            onMouseLeave={e => { if (!accent) e.currentTarget.style.background = 'transparent' }}>
      {children}
    </button>
  )
}

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span style={{
    flexShrink: 0, fontSize: 11, fontWeight: 700, borderRadius: 999,
    padding: '2px 8px', background: UI.surface, color: UI.label, whiteSpace: 'nowrap',
  }}>
    {children}
  </span>
)

const Label = ({ children }: { children: React.ReactNode }) => (
  <p style={{
    margin: '10px 0 3px', padding: '0 9px', fontSize: 10.5, fontWeight: 800,
    letterSpacing: '.08em', textTransform: 'uppercase', color: UI.faint,
  }}>
    {children}
  </p>
)

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: 0, padding: '22px 10px', textAlign: 'center', fontSize: 13.5, color: UI.faint }}>
    {children}
  </p>
)
