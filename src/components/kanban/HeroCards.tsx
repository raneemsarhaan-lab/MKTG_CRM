'use client'

import type { Task } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { quoteOfDay, statCounts, weekMomentum } from '@/lib/home-metrics'

/**
 * Your week: Week Momentum and Daily Spark — Pipeline handoff §5.
 *
 * Spec 006 moved Needs your attention and the Activity feed into the Inbox,
 * so only these two remain, and the Board mounts them only when the member
 * turns on "Show your week" in the View menu (FR-002).
 *
 * Every figure is computed from the tasks already on the board (see
 * lib/home-metrics). Where the mock shows something this product does not
 * record, the card shows the nearest real measure and says so, rather than
 * printing the mock's number.
 */

interface HeroProps {
  tasks: Task[]
  today: Date
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

/** The four counts. Each carries the mark its stage already uses elsewhere. */
const STAT_ICON: Record<string, React.ReactNode> = {
  check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-4.9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" /></>,
  eye:   <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /></>,
  send:  <path d="M21 4 3 11l7 3 3 7 8-17z" />,
}

function StatBox({ value, label, color, icon }: {
  value: number; label: string; color: string; icon: keyof typeof STAT_ICON
}) {
  return (
    <div style={{
      border: `1px solid ${PIPE.border}`, borderRadius: 12,
      padding: '11px 6px 12px', textAlign: 'center', minWidth: 0,
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color}
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {STAT_ICON[icon]}
      </svg>
      <div style={{ marginTop: 3, fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color }}>
        {value}
      </div>
      <div style={{ marginTop: 3, fontWeight: 500, fontSize: 11, color: PIPE.textMuted, whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  )
}

export function HeroCards({ tasks, today }: HeroProps) {
  const momentum  = weekMomentum(tasks, today)
  const stats     = statCounts(tasks, today)
  const quote     = quoteOfDay(today)

  const up = momentum.delta >= 0

  const doneRatio = momentum.planned > 0
    ? Math.min(1, momentum.completed / momentum.planned)
    : 0

  return (
    <div style={{
      padding: '0 26px 0 38px', display: 'flex', flexDirection: 'column', gap: 14,
    }}>
        <div className="fx-hero-split fx-week" style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 2.5fr) minmax(0, 1fr)',
          /* .fx-hero-split — stacks on a phone; a 1fr of 390px is 110px, and
             the Daily Spark card set one letter per line inside it. */
          gap: 18, alignItems: 'stretch',
        }}>
      {/* ── Week Momentum ─────────────────────────────────────────────── */}
      <section style={{ ...CARD, padding: '18px 24px 18px', display: 'flex', flexDirection: 'column' }}>
        <CardTitle icon={
          <svg width="19" height="19" viewBox="0 0 24 24" fill={PIPE.purpleStroke} aria-hidden="true">
            <path d="M12 2l2.1 6.1L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-1.9L12 2z" />
          </svg>
        }>
          Your Week
        </CardTitle>
        <div style={{
          margin: '6px 0 0 28px', fontFamily: 'var(--font-heading)',
          fontWeight: 800, fontSize: 20, letterSpacing: '-0.01em', color: PIPE.textPrimary,
        }}>
          Week Momentum
        </div>

        {/* Across, not down: the card is two and a half columns wide now, so
            the figure, the dial and the four counts sit on one line. */}
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 22,
          flexWrap: 'wrap', flex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
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
              <div style={{ marginTop: 4, fontWeight: 500, fontSize: 11.5, color: PIPE.textFaint }}>
                This week
              </div>
            </div>

            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
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
            display: 'grid', gridTemplateColumns: 'repeat(4, minmax(78px, 1fr))',
            gap: 10, flex: 1, minWidth: 320,
          }}>
            <StatBox value={stats.completed}  label="Completed"   color="#16A34A" icon="check" />
            <StatBox value={stats.inProgress} label="In Progress" color={PIPE.purple} icon="clock" />
            <StatBox value={stats.review}     label="Review"      color="#EA8C0B" icon="eye" />
            <StatBox value={stats.published}  label="Published"   color="#2563EB" icon="send" />
          </div>
        </div>

        {/* How far through the week's own work, as a line rather than a
            sentence to be read twice. */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11.5, color: PIPE.textFaint, whiteSpace: 'nowrap' }}>
            {momentum.completed} of {momentum.planned} finished this week
          </span>
          <span style={{
            flex: 1, height: 4, borderRadius: 99, background: '#ECEEF3', overflow: 'hidden',
          }} aria-hidden="true">
            <span style={{
              display: 'block', height: '100%', width: `${Math.round(doneRatio * 100)}%`,
              background: PIPE.purple, borderRadius: 99,
            }} />
          </span>
        </div>
      </section>

      {/* ── Daily Spark ───────────────────────────────────────────────── */}
      {/* The gradient is the card now rather than a tile inside a white one:
          beside a card two and a half times its width, a frame around a frame
          reads as an inset picture instead of a panel of its own. */}
      <section style={{ ...CARD, padding: 0, overflow: 'hidden', display: 'flex' }}>
        <div style={{
          flex: 1, minHeight: 262, borderRadius: 17, overflow: 'hidden',
          padding: '18px 24px 22px', position: 'relative', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #A855F7 0%, #B15BF0 38%, #E86BB0 72%, #F4A6C0 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" fill="#FFD764" />
              <g stroke="#FFD764" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" />
              </g>
            </svg>
            <span style={{
              fontWeight: 800, fontSize: 12.5, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: '#FFFFFF',
            }}>
              Daily Spark
            </span>
          </div>

          <svg width="34" height="26" viewBox="0 0 34 26" fill="rgba(255,255,255,0.85)" aria-hidden="true"
               style={{ marginTop: 18 }}>
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
            position: 'relative', zIndex: 1,
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
               style={{ position: 'absolute', left: 22, bottom: 6 }}>
            <path d="M2 22c10-18 22 10 34-6s24 4 34-4" stroke="rgba(255,255,255,0.75)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          {/* One dot per week of the month — the quote advances a step each day */}
          <div style={{
            position: 'absolute', insetInlineEnd: 22, bottom: 14,
            display: 'flex', gap: 7,
          }}>
            {[0, 1, 2, 3].map(i => (
              <span key={i} aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: '50%',
                background: Math.floor(quote.index / 8) === i ? '#FFFFFF' : 'rgba(255,255,255,0.42)',
              }} />
            ))}
          </div>
        </div>
      </section>
        </div>

    </div>
  )
}
