'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * Stat card row — developer handoff §5.
 *
 * Four equal cards. Each is a link to its filtered view. Micro-charts are
 * static decorative SVGs, copied verbatim from the reference file — they are
 * not data visualisations and are aria-hidden. Emoji are decorative too: the
 * accessible name of each card comes from its text label and numeral.
 */

interface StatCardsProps {
  today:             number
  week:              number
  breached:          number
  completedThisWeek: number
  /** Team view: the numbers cover everyone, so the first card is not "My Day". */
  teamView?:         boolean
}

/** Count-up 0→value over 400ms, first paint only. Skipped under reduced motion. */
function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || value === 0) { setDisplay(value); return }

    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - start) / 400, 1)
      setDisplay(Math.round(value * p))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    setDisplay(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // First paint only — deliberately not re-running when value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return display
}

interface CardProps {
  href:     string
  surface:  string
  label:    string
  labelCol: string
  emoji:    string
  value:    number
  accent:   string
  caption:  string
  children: React.ReactNode
}

function StatCard({ href, surface, label, labelCol, emoji, value, accent, caption, children }: CardProps) {
  const shown = useCountUp(value)

  return (
    <Link
      href={href}
      className="fx-stat-card"
      style={{
        background:     surface,
        borderRadius:   16,
        padding:        '18px 20px',
        position:       'relative',
        overflow:       'hidden',
        minHeight:      148,
        boxSizing:      'border-box',
        display:        'block',
        textDecoration: 'none',
        cursor:         'pointer',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 13.5, fontWeight: 700, color: labelCol,
      }}>
        <span aria-hidden="true">{emoji}</span>
        <span>{label}</span>
      </div>
      <div style={{
        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 38,
        color: accent, margin: '14px 0 2px',
      }}>
        {shown}
      </div>
      <div style={{ fontSize: 13, color: labelCol, marginBottom: 24 }}>{caption}</div>
      {children}
    </Link>
  )
}

export function StatCards({ today, week, breached, completedThisWeek, teamView = false }: StatCardsProps) {
  // Keep the scope when following a card — a link that quietly drops ?view=team
  // sends an admin from the team's numbers back to their own.
  const href = (filter: string) =>
    `/overview?${teamView ? 'view=team&' : ''}filter=${filter}`

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
      gap: 16,
      marginBottom: 22,
    }}>
      {/* My Day — violet */}
      <StatCard
        href={href('today')}
        surface="var(--violet-surface)" labelCol="var(--violet-label)" accent="var(--violet-accent)"
        emoji="☀️" label={teamView ? 'Team Today' : 'My Day'} value={today} caption="Tasks"
      >
        <svg viewBox="0 0 150 40" aria-hidden="true"
             style={{ position: 'absolute', left: 16, bottom: 12, width: 108, height: 28, overflow: 'visible' }}>
          <path d="M2 26 C 18 34, 26 10, 42 18 S 62 34, 78 14 92 2 108 10" fill="none"
                stroke="#4A3BB0" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
          <circle cx="42" cy="18" r="2" fill="#4A3BB0" opacity="0.85" />
          <circle cx="78" cy="14" r="2" fill="#4A3BB0" opacity="0.85" />
          <circle cx="108" cy="10" r="2" fill="#4A3BB0" opacity="0.85" />
        </svg>
      </StatCard>

      {/* This Week — amber */}
      <StatCard
        href={href('week')}
        surface="var(--amber-surface)" labelCol="var(--amber-label)" accent="var(--amber-accent)"
        emoji="📅" label="This Week" value={week} caption="Tasks"
      >
        <svg viewBox="0 0 130 40" aria-hidden="true"
             style={{ position: 'absolute', left: 16, bottom: 12, width: 92, height: 28, overflow: 'visible' }}>
          <rect x="0"  y="28" width="10" height="10" rx="1.5" fill="#F0B03A" />
          <rect x="16" y="22" width="10" height="16" rx="1.5" fill="#EDA52B" />
          <rect x="32" y="16" width="10" height="22" rx="1.5" fill="#E8A422" />
          <rect x="48" y="24" width="10" height="14" rx="1.5" fill="#EDA52B" />
          <rect x="64" y="6"  width="10" height="32" rx="1.5" fill="#E8A422" />
        </svg>
        <svg viewBox="0 0 30 30" aria-hidden="true"
             style={{ position: 'absolute', right: 14, top: '44%', width: 30, height: 30, opacity: 0.55 }}>
          <g stroke="#E8A422" strokeWidth="1.6" strokeLinecap="round">
            <line x1="15" y1="15" x2="15" y2="3" /><line x1="15" y1="15" x2="24" y2="8" />
            <line x1="15" y1="15" x2="26" y2="16" /><line x1="15" y1="15" x2="6" y2="6" />
          </g>
        </svg>
      </StatCard>

      {/* SLA Breached — red */}
      <StatCard
        href={href('breached')}
        surface="var(--red-surface)" labelCol="var(--red-label)" accent="var(--red-accent)"
        emoji="⚠️" label="SLA Breached" value={breached} caption="Items"
      >
        <svg viewBox="0 0 150 40" aria-hidden="true"
             style={{ position: 'absolute', left: 16, bottom: 12, width: 108, height: 28, overflow: 'visible' }}>
          <path d="M2 30 C 20 36, 30 18, 46 22 S 66 30, 80 12" fill="none"
                stroke="#D6362C" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
        </svg>
        <svg viewBox="0 0 30 30" aria-hidden="true"
             style={{ position: 'absolute', right: 16, top: '42%', width: 28, height: 28, opacity: 0.55 }}>
          <g stroke="#D6362C" strokeWidth="1.6" strokeLinecap="round">
            <line x1="15" y1="15" x2="15" y2="3" /><line x1="15" y1="15" x2="24" y2="8" />
            <line x1="15" y1="15" x2="26" y2="16" /><line x1="15" y1="15" x2="6" y2="6" />
          </g>
        </svg>
      </StatCard>

      {/* Completed — green */}
      <StatCard
        href={href('completed')}
        surface="var(--green-surface)" labelCol="var(--green-label)" accent="var(--green-accent)"
        emoji="✅" label="Completed" value={completedThisWeek} caption="This Week"
      >
        <svg viewBox="0 0 150 40" aria-hidden="true"
             style={{ position: 'absolute', left: 16, bottom: 12, width: 108, height: 28, overflow: 'visible' }}>
          <path d="M2 26 C 18 34, 26 10, 42 18 S 62 34, 78 14 92 2 108 10" fill="none"
                stroke="#279247" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
          <circle cx="42" cy="18" r="2" fill="#279247" opacity="0.85" />
          <circle cx="78" cy="14" r="2" fill="#279247" opacity="0.85" />
        </svg>
        <svg viewBox="0 0 24 24" aria-hidden="true"
             style={{ position: 'absolute', right: 14, top: 42, width: 22, height: 22 }}>
          <path d="M12 2 L14.5 9 L22 9.5 L16 14.5 L18 22 L12 17.5 L6 22 L8 14.5 L2 9.5 L9.5 9 Z"
                fill="none" stroke="#D9CB3B" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </StatCard>
    </div>
  )
}
