'use client'

import { pillDate, greetingWord } from '@/lib/myboard'

/**
 * Greeting header — developer handoff §4.
 *
 * space-between flex row, align-items flex-start, 26px bottom margin.
 * The greeting word is time-derived and the name is the session user's first
 * name only.
 */
export function GreetingHeader({ firstName }: { firstName: string }) {
  const now  = new Date()
  const word = greetingWord(now.getHours())

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-start', marginBottom: 26,
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
          Good {word}, {firstName} <span aria-hidden="true" style={{ fontSize: 26 }}>👋</span>
        </h1>
        <svg width="222" height="12" viewBox="0 0 222 12" fill="none" aria-hidden="true"
             style={{ display: 'block', margin: '2px 0 0 2px' }}>
          <path d="M4 8C50 3 160 2 218 6" stroke="#8B5CF6" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
        <p style={{ fontSize: 14.5, color: 'var(--ink-500)', margin: '6px 0 0' }}>
          Let&apos;s make{' '}
          {/* Highlighter stroke across the lower 40% of the line box — a
              gradient, never a solid background (§4). */}
          <span style={{
            background: 'linear-gradient(0deg, #E9E45E 40%, transparent 40%)',
            fontWeight: 700,
            color: 'var(--ink-800)',
          }}>
            today
          </span>{' '}
          count.
        </p>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#fff', border: '1px solid var(--border-input)',
          borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600,
          color: 'var(--ink-900)', whiteSpace: 'nowrap',
        }}>
          <span aria-hidden="true">📅</span>
          {pillDate(now)}
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
            you got this! 💜
          </span>
        </div>
      </div>
    </div>
  )
}
