'use client'

import Link from 'next/link'
import type { Member, Task } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import {
  activityItems, attentionItems, quoteOfDay, statCounts, timeAgo, weekMomentum,
} from '@/lib/home-metrics'
import { initials, avatarColor } from '@/lib/utils'

/**
 * The four hero cards — Pipeline handoff §5.
 *
 * Every figure is computed from the tasks already on the board (see
 * lib/home-metrics). Where the mock shows something this product does not
 * record, the card shows the nearest real measure and says so, rather than
 * printing the mock's number.
 */

interface HeroProps {
  tasks:       (Task & {
    task_owner?: { name: string }
    comments?: {
      id: string; body: string; created_at: string; author_id: string
      mentions?: string[]; author?: { name: string }
    }[]
    attachments?: { id: string; filename: string; uploaded_at: string; uploaded_by?: string | null }[]
  })[]
  currentUser: Member
  /** For naming whoever attached a file — the row records an id, not a name. */
  members:     Member[]
  today:       Date
  onOpenTask:  (id: string) => void
}

const CARD: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${PIPE.border}`,
  borderRadius: 18,
  minWidth: 0,
}

function CardTitle({ icon, children, trailing }: {
  icon: React.ReactNode; children: React.ReactNode; trailing?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      {icon}
      <div style={{
        fontWeight: 800, fontSize: 12.5, letterSpacing: '0.06em',
        color: PIPE.textPrimary, textTransform: 'uppercase',
      }}>
        {children}
      </div>
      {trailing && <div style={{ marginInlineStart: 'auto', display: 'flex' }}>{trailing}</div>}
    </div>
  )
}

/** The donut. Filled arc is the week's percentage; the rest stays neutral. */
function Donut({ pct }: { pct: number }) {
  const deg = Math.round((Math.min(100, Math.max(0, pct)) / 100) * 360)
  return (
    <div style={{ width: 148, height: 148, position: 'relative', flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, border: '2px dashed #C9B6F5', borderRadius: '50%',
      }} />
      <div style={{
        position: 'absolute', top: 16, left: 16, width: 116, height: 116, borderRadius: '50%',
        background: `conic-gradient(#D8F45A 0deg ${deg * 0.18}deg, #A855F7 ${deg * 0.18}deg ${deg * 0.62}deg, #E052A0 ${deg * 0.62}deg ${deg}deg, #ECEEF3 ${deg}deg 360deg)`,
      }}>
        <div style={{
          position: 'absolute', top: 17, left: 17, width: 82, height: 82,
          borderRadius: '50%', background: '#FFFFFF',
        }} />
      </div>
    </div>
  )
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      border: `1px solid ${PIPE.border}`, borderRadius: 12,
      padding: '12px 4px', textAlign: 'center', minWidth: 0,
    }}>
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color }}>{value}</div>
      <div style={{ marginTop: 4, fontWeight: 500, fontSize: 11, color: PIPE.textMuted, whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  )
}

export function HeroCards({ tasks, currentUser, members, today, onOpenTask }: HeroProps) {
  const momentum  = weekMomentum(tasks, today)
  const stats     = statCounts(tasks, today)
  // One list of everything you own that is still open, worst first. It used to
  // be two — a short urgent list with a "My tasks" block repeating it
  // underneath — which for anyone whose work is mostly late printed the same
  // tasks twice.
  const attention = attentionItems(tasks, currentUser.id, today)
  const overdue   = attention.filter(a => a.due === 'overdue').length
  const published = tasks.filter(t => t.task_owner_id === currentUser.id && t.status === 'publish').length

  const activity  = activityItems(tasks, currentUser.id, 5, members)
  const quote     = quoteOfDay(today)

  const up = momentum.delta >= 0

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.13fr 1.01fr 0.99fr 1.14fr',
      gap: 18, padding: '0 26px 0 38px', alignItems: 'start',
    }}>
      {/* ── Week Momentum ─────────────────────────────────────────────── */}
      <section style={{ ...CARD, padding: '18px 20px 20px' }}>
        <CardTitle icon={
          <svg width="19" height="19" viewBox="0 0 24 24" fill={PIPE.purpleStroke} aria-hidden="true">
            <path d="M12 2l2.1 6.1L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-1.9L12 2z" />
          </svg>
        }>
          Week Momentum
        </CardTitle>
        <div style={{ margin: '5px 0 0 28px', fontWeight: 600, fontSize: 12, color: PIPE.purple }}>
          This week
        </div>

        <div style={{
          marginTop: 16, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 62,
              lineHeight: 0.95, color: PIPE.ink,
            }}>
              {momentum.pct}%
            </div>
            <svg width="104" height="10" viewBox="0 0 104 10" fill="none" aria-hidden="true">
              <path d="M3 7C24 3 74 2.4 101 5" stroke={PIPE.purpleStroke} strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div style={{
              marginTop: 12, display: 'flex', alignItems: 'center', gap: 4,
              fontWeight: 700, fontSize: 13.5, color: up ? '#16A34A' : '#D22040',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                   style={{ transform: up ? 'none' : 'rotate(180deg)' }}>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              {up ? '+' : ''}{momentum.delta}%
            </div>
            <div style={{ marginTop: 3, fontWeight: 500, fontSize: 11.5, color: PIPE.textFaint }}>
              vs last week
            </div>
          </div>
          <Donut pct={momentum.pct} />
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 20,
        }}>
          <StatBox value={stats.completed}  label="Completed"   color="#16A34A" />
          <StatBox value={stats.inProgress} label="In Progress" color={PIPE.purple} />
          <StatBox value={stats.review}     label="Review"      color="#EA8C0B" />
          <StatBox value={stats.published}  label="Published"   color="#2563EB" />
        </div>

        <div style={{ marginTop: 10, fontSize: 10.5, color: PIPE.textFaint, lineHeight: 1.4 }}>
          {momentum.completed} of {momentum.planned} finished this week
        </div>
      </section>

      {/* ── Needs Your Attention ──────────────────────────────────────── */}
      <section style={{ ...CARD, padding: '18px 14px 20px', position: 'relative' }}>
        <CardTitle icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EA8C0B"
               strokeWidth="2" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="2.6" fill="#EA8C0B" stroke="none" />
          </svg>
        }>
          Needs Your Attention
        </CardTitle>

        {attention.length > 0 && (
          <div style={{
            position: 'absolute', right: 14, top: 10, width: 48, height: 48,
            background: '#FF74B1', borderRadius: 3, transform: 'rotate(6deg)',
            boxShadow: '0 4px 10px rgba(255,116,177,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 28, color: PIPE.ink,
          }} aria-hidden="true">
            !
          </div>
        )}

        {/* What the list adds up to, so the count is readable without
            counting the rows — and without a second list to hold it. */}
        <div style={{
          margin: '5px 0 0 28px', display: 'flex', alignItems: 'center', gap: 7,
          fontWeight: 600, fontSize: 12,
        }}>
          <span style={{ color: overdue > 0 ? '#D22040' : PIPE.textMuted }}>
            {attention.length} open{overdue > 0 && ` · ${overdue} late`}
          </span>
          {published > 0 && (
            <span style={{ fontWeight: 500, color: PIPE.textFaint }}>· {published} published</span>
          )}
        </div>

        {/* Capped and scrollable: this card sits in a four-across row, and
            someone with thirty open tasks would otherwise push every card
            beside it down the page. */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14,
          maxHeight: 322, overflowY: 'auto', overflowX: 'hidden', minWidth: 0,
        }}>
          {attention.length === 0 && (
            <div style={{
              minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13.5, fontWeight: 600, color: PIPE.textMuted, textAlign: 'center',
            }}>
              Nothing needs you right now 🎉
            </div>
          )}
          {attention.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpenTask(a.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                border: `1px solid ${PIPE.border}`, borderRadius: 12, padding: '11px 8px',
                background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start',
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: a.due === 'overdue' ? '#FDE7EA' : a.due === 'today' ? '#FFF3E6'
                          : a.due === 'undated' ? '#F1F1F4' : '#F0EBFE',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke={a.due === 'overdue' ? '#D22040' : a.due === 'today' ? '#EA8C0B'
                           : a.due === 'undated' ? '#9A9AA6' : PIPE.purple}
                     strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: 'block', fontWeight: 700, fontSize: 13, color: PIPE.textPrimary,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.title}
                </span>
                <span style={{
                  display: 'block', marginTop: 2, fontSize: 11.5,
                  fontWeight: a.due === 'overdue' || a.due === 'today' ? 600 : 500,
                  color: a.due === 'overdue' ? '#D22040' : a.due === 'today' ? '#E0294B'
                       : a.due === 'undated' ? '#A0A0AC' : '#8A90A0',
                }}>
                  {a.dueText}
                </span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PIPE.textFaint}
                   strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}

        </div>

        {attention.length > 4 && (
          <div style={{
            marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <Link href="/overview" style={{
              display: 'flex', alignItems: 'center', gap: 9,
              fontWeight: 700, fontSize: 13.5, color: PIPE.purple, textDecoration: 'none',
            }}>
              View all ({attention.length})
              <svg width="20" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 12h15M13 6l6 6-6 6" />
              </svg>
            </Link>
            <svg width="118" height="9" viewBox="0 0 118 9" fill="none" aria-hidden="true"
                 style={{ marginTop: 2 }}>
              <path d="M3 6C28 2 84 1.6 115 4.4" stroke={PIPE.purpleStroke} strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </section>

      {/* ── Activity ──────────────────────────────────────────────────── */}
      <section style={{ ...CARD, padding: '18px 18px 20px' }}>
        <CardTitle
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12h4l3 8 4-16 3 8h4" />
            </svg>
          }
          trailing={
            <Link href="/overview" style={{ fontWeight: 700, fontSize: 12, color: PIPE.purple, textDecoration: 'none' }}>
              View all
            </Link>
          }
        >
          Activity Feed
        </CardTitle>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
          {activity.length === 0 && (
            <div style={{ fontSize: 13, color: PIPE.textMuted }}>
              Nothing on your tasks yet.
            </div>
          )}
          {activity.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenTask(item.taskId)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'start',
              }}
            >
              <span style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: avatarColor(item.avatarName), color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13,
              }} aria-hidden="true">
                {initials(item.avatarName)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: PIPE.textSecondary }}>
                  {item.prefix ? `${item.prefix} ` : ''}
                  <strong style={{ fontWeight: 700, color: PIPE.textPrimary }}>{item.bold}</strong>
                  {item.suffix ? ` ${item.suffix}` : ''}
                </span>
                <span style={{
                  display: 'block', marginTop: 3, fontWeight: 500, fontSize: 12.5,
                  color: PIPE.textSecondary, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.target}
                </span>
                <span style={{ display: 'block', marginTop: 4, fontWeight: 500, fontSize: 11, color: PIPE.textFaintest }}>
                  {timeAgo(item.at, today)}
                </span>
              </span>
              <span aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: '50%', background: item.dot,
                marginTop: 6, flexShrink: 0,
              }} />
            </button>
          ))}
        </div>
      </section>

      {/* ── Daily Spark ───────────────────────────────────────────────── */}
      <section style={{ ...CARD, padding: '18px 18px 16px' }}>
        <CardTitle icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2" fill="#F2A93B" />
            <g stroke="#F2A93B" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" />
            </g>
          </svg>
        }>
          Daily Spark
        </CardTitle>

        <div style={{
          marginTop: 18, height: 260, borderRadius: 14, overflow: 'hidden',
          padding: '30px 26px', position: 'relative', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #A855F7 0%, #B15BF0 38%, #E86BB0 72%, #F4A6C0 100%)',
        }}>
          <svg width="34" height="26" viewBox="0 0 34 26" fill="rgba(255,255,255,0.85)" aria-hidden="true">
            <path d="M0 26V13C0 5.8 4.6 1 12 0v5c-3.7.8-5.6 3.2-5.6 6.3H12V26H0zm22 0V13c0-7.2 4.6-12 12-13v5c-3.7.8-5.6 3.2-5.6 6.3H34V26H22z" />
          </svg>
          {/* The reference quote is short; the 30 in rotation are not, so the
              size steps down with length and the block is clipped by a flex
              column rather than spilling past the tile. */}
          <div
            className="fx-spark-quote"
            style={{
              marginTop: 12, flex: 1, minHeight: 0, overflow: 'hidden',
              fontFamily: 'var(--font-heading)', fontWeight: 700,
              // Measured against all 30 quotes at this width: the largest
              // step that never overflows the 260px tile.
              fontSize: quote.text.length > 70 ? 15
                      : quote.text.length > 52 ? 17
                      : quote.text.length > 34 ? 19 : 23,
              lineHeight: 1.28, letterSpacing: '-0.015em',
              color: '#FFFFFF', maxWidth: '66%',
              overflowWrap: 'break-word', hyphens: 'auto',
            }}
          >
            {quote.text}
          </div>
          <div style={{
            flexShrink: 0, marginTop: 10, fontWeight: 500, fontSize: 13.5,
            color: 'rgba(255,255,255,0.92)', maxWidth: '66%',
          }}>
            — {quote.author}
          </div>

          <div aria-hidden="true" style={{
            position: 'absolute', right: 22, top: 26, width: 62, height: 62,
            background: 'linear-gradient(140deg, #C084FC, #7C3AED)', borderRadius: 10,
            transform: 'rotate(-14deg)', boxShadow: '-8px 10px 18px rgba(80,20,140,0.28)',
          }} />
          <svg width="86" height="86" viewBox="0 0 86 86" fill="none" aria-hidden="true"
               style={{ position: 'absolute', right: 20, bottom: 58 }}>
            <circle cx="43" cy="43" r="38" fill="#FFE04A" />
            <circle cx="30" cy="35" r="4.6" fill="#2B2B2B" /><circle cx="55" cy="35" r="4.6" fill="#2B2B2B" />
            <path d="M28 52c5 8 25 8 30 0" stroke="#2B2B2B" strokeWidth="4.6" strokeLinecap="round" />
          </svg>
          <svg width="72" height="30" viewBox="0 0 72 30" fill="none" aria-hidden="true"
               style={{ position: 'absolute', left: 18, bottom: 12 }}>
            <path d="M2 22c10-18 22 10 34-6s24 4 34-4" stroke="rgba(255,255,255,0.75)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>

        {/* One dot per week of the month — the quote advances a step each day */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
          {[0, 1, 2, 3].map(i => (
            <span key={i} aria-hidden="true" style={{
              width: 9, height: 9, borderRadius: '50%',
              background: Math.floor(quote.index / 8) === i ? '#C9D633' : '#E4E4EA',
            }} />
          ))}
        </div>
      </section>
    </div>
  )
}
