'use client'

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { greetingWord } from '@/lib/myboard'

/**
 * Greeting header — developer handoff §4.
 *
 * space-between flex row, align-items flex-start, 26px bottom margin.
 * The greeting word is time-derived and the name is the session user's first
 * name only.
 *
 * The day and hour come from the server, read in the team's time zone, so the
 * server's render and the browser's agree: reading the clock here would give
 * the server's zone on the server and the device's in the browser, and the
 * greeting would flip ("Good morning" → "Good afternoon") as the page loads.
 * A caller that passes neither falls back to the device's clock once mounted.
 */
export function GreetingHeader({
  firstName,
  toggle,
  today,
  hour,
}: {
  firstName: string
  /** Optional control above the date pill — the admin Mine / Team switch. */
  toggle?: React.ReactNode
  /** The team's calendar day, YYYY-MM-DD. */
  today?: string
  /** The team's hour, 0–23. */
  hour?: number
}) {
  const t = useTranslations('greeting')
  const f = useFormatter()
  const [device, setDevice] = useState<{ day: string; hour: number } | null>(null)
  useEffect(() => {
    if (today !== undefined && hour !== undefined) return
    const now = new Date()
    const p2 = (n: number) => String(n).padStart(2, '0')
    setDevice({ day: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`, hour: now.getHours() })
  }, [today, hour])

  const day = today ?? device?.day
  const word = greetingWord(hour ?? device?.hour ?? 9)
  // Noon UTC, formatted in UTC: the calendar day as given, in any zone.
  const pill = day ? f.dateTime(new Date(`${day}T12:00:00Z`), { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''

  return (
    /* The class is the phone's handle on this row: at 390px the greeting and
       the Mine / Team switch beside it come to 417px, and the page scrolls
       sideways. globals.css wraps it there. Everything else is unchanged. */
    <div className="fx-greeting" style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-start', marginBottom: 26, gap: 12,
    }}>
      <div>
        {/* Same treatment as the board's greeting — accent face at 44, the
            purple underline beneath it. Two greetings a click apart should not
            be set in two different typefaces. */}
        <h1 style={{
          fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 44,
          lineHeight: 1, color: 'var(--ink-900)', margin: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {t('hello', { greeting: t(word), name: firstName })} <span aria-hidden="true" style={{ fontSize: 26 }}>👋</span>
        </h1>
        <svg width="222" height="12" viewBox="0 0 222 12" fill="none" aria-hidden="true"
             style={{ display: 'block', margin: '2px 0 0 2px' }}>
          <path d="M4 8C50 3 160 2 218 6" stroke="#8B5CF6" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
        <p style={{ fontSize: 14.5, color: 'var(--ink-500)', margin: '6px 0 0' }}>
          {t.rich('tagline', {
            // Highlighter stroke across the lower 40% of the line box — a
            // gradient, never a solid background (§4).
            hl: chunks => (
              <span style={{
                background: 'linear-gradient(0deg, #E9E45E 40%, transparent 40%)',
                fontWeight: 700,
                color: 'var(--ink-800)',
              }}>
                {chunks}
              </span>
            ),
          })}
        </p>
      </div>

      <div style={{ textAlign: 'end' }}>
        {toggle && <div>{toggle}</div>}

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#fff', border: '1px solid var(--border-input)',
          borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600,
          color: 'var(--ink-900)', whiteSpace: 'nowrap',
          // Holds its size before a device-clock fallback fills it in.
          minHeight: 38, boxSizing: 'border-box',
        }}>
          <span aria-hidden="true">📅</span>
          {pill}
          <span aria-hidden="true" style={{ color: 'var(--date-chevron)' }}>⌄</span>
        </div>

        {/* Purely decorative squiggle + handwriting accent */}
        <div aria-hidden="true" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 6, marginTop: 10,
        }}>
          <svg viewBox="0 0 40 16" style={{ width: 38, height: 15, flexShrink: 0 }}>
            <path d="M2 4 C 8 12, 12 2, 18 8 S 26 13, 32 6" fill="none"
                  stroke="#1C1836" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
          </svg>
          <span style={{
            fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 16,
            color: 'var(--ink-800)', whiteSpace: 'nowrap',
          }}>
            {t('cheer')}
          </span>
        </div>
      </div>
    </div>
  )
}
