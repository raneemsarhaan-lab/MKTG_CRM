'use client'

import type { Member, StageId, Task } from '@/types/index'
import { STAGE_META, ALL_STAGES } from '@/lib/stage-meta'
import { PIPE } from '@/lib/pipeline-tokens'
import { calDaysBetween } from '@/lib/utils'

/**
 * My tasks — everything you own, and where each one has got to.
 *
 * The board answers "what is in each stage". It does not answer "where has my
 * work got to", which needs reading eleven columns and picking your own name
 * out of each. This column answers it directly: your tasks, grouped by the
 * stage they are sitting in, newest phase first.
 *
 * Hideable, and it stays hidden — it is useful to a producer and noise to
 * someone who owns nothing, and the board is already wide.
 */

interface Props {
  tasks:       Task[]
  currentUser: Member
  today:       Date
  onOpenTask:  (id: string) => void
  onHide:      () => void
}

export function MyTasksColumn({ tasks, currentUser, today, onOpenTask, onHide }: Props) {
  const mine = tasks.filter(t => t.task_owner_id === currentUser.id)
  const open = mine.filter(t => t.status !== 'publish')
  const done = mine.length - open.length

  // Grouped by stage, in board order, so the shape of the column mirrors the
  // shape of the board beside it.
  const byStage = open.reduce<Partial<Record<StageId, Task[]>>>((acc, t) => {
    (acc[t.status] ??= []).push(t)
    return acc
  }, {})
  const stages = ALL_STAGES.filter(id => byStage[id]?.length)

  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${PIPE.border}`, borderRadius: 16,
      padding: '13px 12px 14px', alignSelf: 'start', maxHeight: '100%',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 7, background: '#F4FBD6', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={PIPE.ink}
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <span style={{ fontWeight: 800, fontSize: 13, color: PIPE.ink, flex: 1 }}>My tasks</span>
        <button
          type="button"
          onClick={onHide}
          title="Hide this column"
          aria-label="Hide my tasks column"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 3,
            color: PIPE.textFaint, lineHeight: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p style={{ fontSize: 11, color: PIPE.textMuted, margin: '0 0 11px 29px' }}>
        {open.length} open{done > 0 && ` · ${done} published`}
      </p>

      <div style={{ overflowY: 'auto', minHeight: 0, display: 'grid', gap: 11 }}>
        {open.length === 0 && (
          <p style={{ fontSize: 12, color: PIPE.textMuted, textAlign: 'center', padding: '18px 0' }}>
            Nothing assigned to you.
          </p>
        )}

        {stages.map(stageId => {
          const meta = STAGE_META[stageId]
          return (
            <div key={stageId}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta?.color ?? PIPE.purpleStroke }} />
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: PIPE.textSecondary }}>
                  {meta?.label_en ?? stageId}
                </span>
                <span style={{ fontSize: 10.5, color: PIPE.textFaint }}>{byStage[stageId]!.length}</span>
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                {byStage[stageId]!.map(t => {
                  const days = t.due_date ? calDaysBetween(today, new Date(t.due_date)) : null
                  const late = days !== null && days < 0
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenTask(t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                        border: `1px solid ${late ? '#F6D9DE' : PIPE.border}`,
                        background: late ? '#FDF3F4' : '#FCFCFB',
                        borderRadius: 9, padding: '7px 8px', cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'start',
                      }}
                    >
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: PIPE.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.name}
                      </span>
                      {days !== null && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                          color: late ? '#D22040' : days <= 1 ? '#EA8C0B' : PIPE.textFaint,
                        }}>
                          {late ? `${Math.abs(days)}d late` : days === 0 ? 'today' : `${days}d`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
