'use client'

import type { PersonLoad } from '@/lib/workload'
import { UI, TILE, font, card } from '@/lib/board-ui'
import { initials } from '@/lib/utils'
import { personColor } from '@/lib/board-ui'

/**
 * One person's load, month by month.
 *
 * Presentational only — every figure arrives already computed, so this and the
 * capacity table cannot produce different numbers for the same person.
 *
 * Two things here exist because the data demanded them rather than because the
 * reference design showed them: undated work is reported on its own line
 * rather than assigned to a month it does not belong to, and a month with no
 * working days shows its days without a percentage instead of a made-up one.
 */

interface Props {
  load: PersonLoad
  hoursPerStepDay: number
  compact?: boolean
  onClose?: () => void
}

const nd = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const n0 = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${+d} ${MONTHS[+m - 1]}`
}

export function PersonWorkloadCard({ load, hoursPerStepDay, compact, onClose }: Props) {
  const color = personColor(load.name)
  const adjusted = Math.abs(load.effortDays - load.planDays) > 0.05

  if (load.steps === 0) {
    return (
      <section style={{ ...card, borderRadius: 18, padding: '22px 24px' }}>
        <Header load={load} color={color} onClose={onClose} />
        <p style={{ margin: '14px 0 0', fontSize: 13.5, color: UI.soft }}>
          Nothing in the plan is assigned to {load.name} yet.
        </p>
      </section>
    )
  }

  return (
    <section style={{ ...card, borderRadius: 18, padding: compact ? '18px 20px' : '22px 24px' }}
             aria-label={`Workload for ${load.name}`}>
      <Header load={load} color={color} onClose={onClose} />

      <div style={{
        display: 'grid', gap: 12, marginTop: 18,
        gridTemplateColumns: `repeat(${compact ? 2 : 4}, 1fr)`,
      }}>
        <Tile tile={TILE.purple} label="Steps" value={String(load.steps)}
              caption={`${load.stepsOpen} still open`} />
        <Tile tile={TILE.indigo} label="Days of work" value={nd(load.planDays)}
              caption={adjusted ? `${nd(load.effortDays)}d of effort` : `${nd(load.daysOpen)}d still open`} />
        <Tile tile={TILE.lime} label="Hours" value={n0(load.hours)}
              caption={`at ${nd(hoursPerStepDay)}h per day`} />
        <Tile tile={load.overdueCount ? TILE.red : TILE.teal}
              label="Overdue" value={String(load.overdueCount)}
              caption={load.overdueCount
                ? `oldest ${fmtDate(load.oldestOverdue!)}`
                : 'nothing late'}
              tone={load.overdueCount ? UI.redStrong : UI.green} />
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        {load.months.map(m => {
          const pct = m.utilisationPct
          return (
            <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{
                width: 34, fontWeight: 800, fontSize: 13, color: UI.textPrimary, flexShrink: 0,
              }}>{m.label}</span>

              <span style={{
                flex: 1, minWidth: 60, height: 8, borderRadius: 999,
                background: UI.track, overflow: 'hidden',
              }}>
                <span style={{
                  display: 'block', height: '100%', borderRadius: 999,
                  width: `${Math.min(100, Math.max(0, pct ?? 0))}%`,
                  background: m.over ? UI.redStrong : color,
                }} />
              </span>

              <span style={{
                width: 132, textAlign: 'right', fontSize: 12.5, flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
                color: m.over ? UI.redStrong : UI.soft,
                fontWeight: m.over ? 700 : 500,
              }}>
                {nd(m.planDays)}d / {m.workingDays}d
                {pct === null
                  // No working days in the window — a percentage here would be
                  // invented, so the days stand on their own.
                  ? <span style={{ color: UI.faintest }}> · —</span>
                  : <> · {pct}%</>}
              </span>
            </div>
          )
        })}

        {load.undatedPlanDays > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, marginTop: 2,
            padding: '9px 12px', borderRadius: 10, background: UI.groupBg,
          }}>
            <span style={{ fontSize: 12.5, color: UI.soft, fontWeight: 600 }}>
              <strong style={{ color: UI.textPrimary }}>{nd(load.undatedPlanDays)}d</strong> on steps
              with no due date — they belong to no month, and are counted in the total above but not below.
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

function Header({ load, color, onClose }: { load: PersonLoad; color: string; onClose?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{
        width: 40, height: 40, borderRadius: '50%', background: color, color: '#FFFFFF',
        fontWeight: 800, fontSize: 14, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{initials(load.name)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...font.cardTitle, fontSize: 20 }}>{load.name}</div>
        <div style={{ fontSize: 13, color: UI.soft, marginTop: 2 }}>
          {load.role}
          {load.seniority && load.seniority !== 'mid' && (
            <span style={{
              marginLeft: 8, padding: '2px 7px', borderRadius: 5,
              background: TILE.amber, color: UI.amberDeep, fontWeight: 700, fontSize: 10,
            }}>{load.seniority}</span>
          )}
        </div>
      </div>
      {onClose && (
        <button onClick={onClose} aria-label={`Close ${load.name}'s card`}
                style={{
                  border: 'none', background: 'transparent', color: UI.muted,
                  cursor: 'pointer', fontSize: 15, padding: 4, lineHeight: 1,
                }}>✕</button>
      )}
    </div>
  )
}

function Tile({ tile, label, value, caption, tone }: {
  tile: string; label: string; value: string; caption: string; tone?: string
}) {
  return (
    <div style={{ border: `1px solid ${UI.border}`, borderRadius: 14, padding: '13px 14px', background: tile }}>
      <div style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em',
        textTransform: 'uppercase', color: UI.textPrimary,
      }}>{label}</div>
      <div style={{
        fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', marginTop: 8,
        color: tone ?? UI.ink, fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{ marginTop: 5, fontSize: 11.5, color: UI.soft, fontWeight: 500 }}>{caption}</div>
    </div>
  )
}
