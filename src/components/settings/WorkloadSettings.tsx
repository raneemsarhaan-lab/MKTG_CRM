'use client'

import { useState, useTransition } from 'react'
import { COLORS } from '@/lib/tokens'
import { updateWorkloadAssumptions, updateSeniorityLevel } from '@/actions/settings'

/**
 * The assumptions behind every workload figure.
 *
 * These are the only numbers in the product that are not read from stored
 * work — they are a judgement about how long work takes and who absorbs the
 * review. So every control here states its unit and its effect: a rate shown
 * without its meaning is how a dashboard ends up with figures nobody can
 * account for.
 */

interface Props {
  settings: {
    hoursPerStepDay: number
    capacityPeriodEnd: string | null
    complexityThresholdDays: number
    supervisingRole: string
  }
  levels: { key: string; label: string; effortFactor: number; supervisionRate: number }[]
  roles: string[]
}

export function WorkloadSettings({ settings, levels, roles }: Props) {
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [isPending, start] = useTransition()

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setErr(''); setMsg('')
    start(async () => {
      const r = await fn()
      if (r.success) { setMsg('Saved'); setTimeout(() => setMsg(''), 3000) }
      else setErr(r.error ?? 'Could not save that')
    })
  }

  const field: React.CSSProperties = {
    fontSize: '0.8rem', padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--line)', background: '#F6F6F4',
    color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
  }

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 18px', maxWidth: 680 }}>
        What the Workload tab assumes. These change every hours and utilisation
        figure on that panel, and nothing else in the tool.
      </p>

      <Card title="Turning the plan into hours">
        <Row label="Effort per step-day"
             help="One planned day of work, in hours. The plan is written in days; this is what prices it.">
          <select defaultValue={String(settings.hoursPerStepDay)} disabled={isPending}
                  aria-label="Hours per step-day"
                  onChange={e => run(() => updateWorkloadAssumptions({ hoursPerStepDay: Number(e.target.value) }))}
                  style={{ ...field, width: 90, cursor: 'pointer' }}>
            {[4, 5, 6, 7, 8, 10, 12].map(h => <option key={h} value={h}>{h}h</option>)}
          </select>
        </Row>

        <Row label="Complex above"
             help="A step longer than this counts as complex, unless the step itself says otherwise. Only complex steps carry the seniority premium.">
          <select defaultValue={String(settings.complexityThresholdDays)} disabled={isPending}
                  aria-label="Complexity threshold in days"
                  onChange={e => run(() => updateWorkloadAssumptions({ complexityThresholdDays: Number(e.target.value) }))}
                  style={{ ...field, width: 90, cursor: 'pointer' }}>
            {[1, 2, 3, 4, 5, 8, 10].map(d => <option key={d} value={d}>{d}d</option>)}
          </select>
        </Row>

        <Row label="Capacity period ends"
             help="Leave empty to run to the last dated step in the plan. The period always starts today.">
          <input type="date" defaultValue={settings.capacityPeriodEnd ?? ''} disabled={isPending}
                 aria-label="Capacity period end date"
                 onChange={e => run(() => updateWorkloadAssumptions({ capacityPeriodEnd: e.target.value || null }))}
                 style={{ ...field, width: 160 }} />
        </Row>

        <Row label="Supervision goes to"
             help="Whose row carries the overhead for reviewing junior work. A role, not a person — so it survives someone changing job.">
          <select defaultValue={settings.supervisingRole} disabled={isPending}
                  aria-label="Supervising role"
                  onChange={e => run(() => updateWorkloadAssumptions({ supervisingRole: e.target.value }))}
                  style={{ ...field, width: 220, cursor: 'pointer' }}>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Row>
      </Card>

      <Card title="What each seniority level costs">
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0 0 14px' }}>
          The factor multiplies <strong>complex</strong> steps only — a simple step costs its planned
          duration whoever holds it. Supervision is a share of the <em>adjusted</em> figure, so it
          compounds with the factor rather than sitting beside it.
        </p>
        {levels.map(l => (
          <div key={l.key} style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 0', borderTop: '1px solid #F6F6F4',
          }}>
            <span style={{ width: 90, fontWeight: 700, fontSize: '0.85rem', color: 'var(--ink)' }}>
              {l.label}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.75rem', color: 'var(--muted)' }}>
              Effort factor
              <input type="number" min={0.1} max={5} step={0.05} defaultValue={l.effortFactor}
                     disabled={isPending}
                     aria-label={`Effort factor for ${l.label}`}
                     onBlur={e => {
                       const v = parseFloat(e.target.value)
                       if (Number.isFinite(v) && v !== l.effortFactor) {
                         run(() => updateSeniorityLevel(l.key, { effortFactor: v }))
                       }
                     }}
                     style={{ ...field, width: 80, textAlign: 'center' }} />
              ×
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.75rem', color: 'var(--muted)' }}>
              Supervision
              <input type="number" min={0} max={200} step={5}
                     defaultValue={Math.round(l.supervisionRate * 100)}
                     disabled={isPending}
                     aria-label={`Supervision rate for ${l.label} as a percentage`}
                     onBlur={e => {
                       const v = parseFloat(e.target.value)
                       if (Number.isFinite(v) && v / 100 !== l.supervisionRate) {
                         run(() => updateSeniorityLevel(l.key, { supervisionRate: v / 100 }))
                       }
                     }}
                     style={{ ...field, width: 80, textAlign: 'center' }} />
              % of their adjusted time
            </label>
          </div>
        ))}
      </Card>

      {(msg || err) && (
        <p role={err ? 'alert' : undefined}
           style={{ marginTop: 12, fontSize: '0.78rem', fontWeight: 700,
                    color: err ? COLORS.coral : '#4B7A12' }}>
          {err || `✓ ${msg}`}
        </p>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 14, padding: 20, background: '#fff',
      border: '1px solid var(--line)', boxShadow: '0 1px 3px rgba(16,16,11,.05)',
      marginBottom: 14,
    }}>
      <div style={{
        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 14,
      }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 16,
      padding: '10px 0', borderTop: '1px solid #F6F6F4', flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--ink)' }}>{label}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>{help}</div>
      </div>
      {children}
    </div>
  )
}
