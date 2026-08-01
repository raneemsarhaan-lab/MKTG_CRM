'use client'

import Link from 'next/link'
import { STAGE_BADGE, dueStatus, shortDate } from '@/lib/myboard'
import type { StageId } from '@/types/index'

/**
 * Task panel — developer handoff §6.
 *
 * "Two identical panels ... Build ONE component parameterised by accent
 * colour, title, badge palette and item list." My Day and This Week are the
 * same component with different props.
 */

export interface PanelTask {
  id:      string
  title:   string
  emoji:   string
  stage:   StageId
  dueDate: string | null   // ISO yyyy-mm-dd; null for imported history
}

interface BoardTaskPanelProps {
  title:      string
  emoji:      string
  accent:     string        // "View all" + "Add task" link colour
  badgeBg:    string        // stage badge surface, tinted in the panel family
  badgeText:  string
  tasks:      PanelTask[]
  emptyCopy:  string        // e.g. "Nothing due today 🎉"
  ornament?:  React.ReactNode
}

export function BoardTaskPanel({
  title, emoji, accent, badgeBg, badgeText, tasks, emptyCopy, ornament,
}: BoardTaskPanelProps) {
  return (
    <section
      style={{
        background:   'var(--bg-card)',
        borderRadius: 16,
        border:       '1px solid var(--border-card)',
        padding:      '20px 22px',
        boxShadow:    '0 1px 3px rgba(28,24,54,.04)',
        position:     'relative',
        overflow:     'hidden',
      }}
    >
      {/* Header — space-between, 12px bottom margin */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 12,
      }}>
        <h2 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16,
          color: 'var(--ink-800)', display: 'flex', alignItems: 'center',
          gap: 8, whiteSpace: 'nowrap', margin: 0,
        }}>
          <span aria-hidden="true">{emoji}</span> {title}
        </h2>
        <Link href="/board" className="fx-panel-link"
              style={{ fontSize: 13, fontWeight: 700, color: accent, textDecoration: 'none' }}>
          View all
        </Link>
      </div>

      {tasks.length === 0 ? (
        /* Empty state — centred 72px-tall block, action kept (§6) */
        <div style={{
          minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 600, color: 'var(--ink-500)', textAlign: 'center',
        }}>
          {emptyCopy}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {tasks.map(t => {
            const badge  = STAGE_BADGE[t.stage]
            const status = t.dueDate ? dueStatus(t.dueDate) : null
            return (
              <li key={t.id}>
                {/* border-top, not bottom: a divider sits under the header and
                    no trailing rule appears above "Add task" */}
                <Link
                  href={`/board?task=${t.id}`}
                  className="fx-row-link"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 0', borderTop: '1px solid var(--border-row)',
                    textDecoration: 'none',
                  }}
                >
                  <span aria-hidden="true" style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: badge.dot, flexShrink: 0,
                  }} />
                  <span aria-hidden="true" style={{ fontSize: 17 }}>{t.emoji}</span>

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontWeight: 700, fontSize: 14,
                      color: 'var(--ink-800)', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {t.title}
                    </span>
                    <span style={{
                      display: 'inline-block', marginTop: 4, fontSize: 11.5,
                      fontWeight: 700, color: badgeText, background: badgeBg,
                      padding: '2px 9px', borderRadius: 6,
                    }}>
                      {badge.label}
                    </span>
                  </span>

                  <span style={{ textAlign: 'right', flexShrink: 0, width: 64 }}>
                    <span style={{
                      display: 'block', fontSize: 13, fontWeight: 700,
                      /* Overdue is never carried by colour alone — the label
                         itself reads "Nd late" (§10). */
                      color: status?.overdue ? 'var(--late-text)' : 'var(--ink-900)',
                    }}>
                      {status?.label ?? 'No date'}
                    </span>
                    <span style={{
                      display: 'block', fontSize: 12,
                      color: 'var(--ink-400)', marginTop: 2,
                    }}>
                      {t.dueDate ? shortDate(t.dueDate) : '—'}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <Link href="/board?new=1" className="fx-panel-link"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 16,
              fontSize: 13.5, fontWeight: 700, color: accent, textDecoration: 'none',
            }}>
        + Add task
      </Link>

      {ornament}
    </section>
  )
}
