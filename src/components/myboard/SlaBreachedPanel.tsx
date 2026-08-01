'use client'

import Link from 'next/link'
import { STAGE_BADGE, longDate, humanDays } from '@/lib/myboard'
import type { StageId } from '@/types/index'

/**
 * SLA Breached panel — developer handoff §7.
 *
 * The prototype draws this with CSS grid; the handoff is explicit that
 * production must use a real semantic table with the same column proportions
 * so screen readers announce the headers (§7, §10).
 *
 * Rules: at most 3 rows, sorted most-breached first, and the whole panel is
 * hidden when empty — never render an empty red table.
 */

export interface BreachRow {
  id:             string
  title:          string
  emoji:          string
  stage:          StageId
  ownerName:      string
  dueDate:        string  // ISO
  slaDays:        number
  breachedByDays: number
}

const COLS = '2fr 1fr 1fr 0.7fr 1fr'

export function SlaBreachedPanel({ rows }: { rows: BreachRow[] }) {
  if (rows.length === 0) return null

  const shown = [...rows]
    .sort((a, b) => b.breachedByDays - a.breachedByDays)
    .slice(0, 3)

  return (
    <section style={{
      background:   'var(--bg-card)',
      borderRadius: 16,
      border:       '1px solid var(--border-card)',
      padding:      '22px 24px',
      marginBottom: 18,
      boxShadow:    '0 1px 3px rgba(28,24,54,.04)',
      position:     'relative',
    }}>
      {/* Three-part header, flex-start aligned */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 16,
      }}>
        <h2 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16,
          color: 'var(--red-label)', display: 'flex', alignItems: 'center',
          gap: 8, whiteSpace: 'nowrap', margin: 0,
        }}>
          <span aria-hidden="true">⚠️</span> SLA Breached
        </h2>

        <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 15,
            color: 'var(--ink-800)', textAlign: 'center', lineHeight: 1.15,
          }}>
            Let&apos;s<br />fix these!
          </div>
          <svg viewBox="0 0 30 26" style={{ width: 26, height: 22, marginTop: 2 }}>
            <path d="M15 2 C 14 12, 10 14, 7 15" fill="none" stroke="#1C1836"
                  strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
            <path d="M4 12 L7 15 L10 10" fill="none" stroke="#1C1836"
                  strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
          </svg>
        </div>

        <Link href="/board" className="fx-panel-link" style={{
          fontSize: 13, fontWeight: 700, color: 'var(--red-label)',
          whiteSpace: 'nowrap', textDecoration: 'none',
        }}>
          View all
        </Link>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption className="sr-only">Tasks that have breached their SLA</caption>
        <thead>
          <tr style={{
            display: 'grid', gridTemplateColumns: COLS,
            fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.05em', color: 'var(--ink-400)',
          }}>
            {['Task / Item', 'Owner', 'Due Date', 'SLA', 'Breached By'].map(h => (
              <th key={h} scope="col" style={{
                textAlign: 'left', fontWeight: 700, paddingBottom: 10, border: 0,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map(b => (
            <tr key={b.id} style={{
              display: 'grid', gridTemplateColumns: COLS, alignItems: 'center',
              padding: '12px 0', borderTop: '1px solid var(--border-row)', fontSize: 13.5,
            }}>
              <td style={{
                display: 'flex', alignItems: 'center', gap: 10, border: 0,
                color: 'var(--ink-800)', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span aria-hidden="true" style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--red-accent-2)', flexShrink: 0,
                }} />
                <span aria-hidden="true">{b.emoji}</span>
                <Link href={`/board?task=${b.id}`} className="fx-row-link"
                      style={{ color: 'inherit', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.title}
                </Link>
                <span style={{ color: 'var(--ink-400)', fontWeight: 500, marginLeft: 4 }}>
                  {STAGE_BADGE[b.stage].label}
                </span>
              </td>
              <td style={{ border: 0 }}>
                <span style={{
                  background: 'var(--violet-badge)', color: 'var(--violet-label)',
                  fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 6,
                }}>
                  {b.ownerName}
                </span>
              </td>
              <td style={{ border: 0, color: 'var(--red-accent-2)', fontWeight: 600 }}>
                {longDate(b.dueDate)}
              </td>
              {/* SLA is the contracted turnaround, not the overrun (§7) */}
              <td style={{ border: 0, color: 'var(--ink-500)' }}>{b.slaDays}d</td>
              <td style={{ border: 0, color: 'var(--red-accent-2)', fontWeight: 700 }}>
                {humanDays(b.breachedByDays)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-end', marginTop: 14,
      }}>
        <Link href="/board" className="fx-panel-link" style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 13.5,
          fontWeight: 700, color: 'var(--red-accent-2)', textDecoration: 'none',
        }}>
          View all breached items →
        </Link>
        <span aria-hidden="true" style={{ fontSize: 22 }}>😣</span>
      </div>
    </section>
  )
}
