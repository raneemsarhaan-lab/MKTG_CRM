'use client'

import type { Member, Task } from '@/types/index'
import { COLORS } from '@/lib/tokens'
import { MemberCapacityCard } from './MemberCapacityCard'

type TaskWithBrand = Task & { brand?: { id: string; name: string; color: string } }

interface CapacityDashboardProps {
  members: Member[]
  tasks: TaskWithBrand[]
}

export function CapacityDashboard({ members, tasks }: CapacityDashboardProps) {
  const activeTasks = tasks.filter(t => t.status !== 'publish')
  const totalHours  = activeTasks.reduce((s, t) => s + (t.hours_estimate ?? 0), 0)

  // Per-member active tasks. Keyed on the assignee: capacity is about who
  // is doing the work, not who is answerable for it.
  const tasksByMember = (memberId: string) =>
    activeTasks.filter(t => (t.assignee_id ?? t.task_owner_id) === memberId)

  // Brand-level breakdown for the summary header
  const brandTotals: Record<string, { name: string; color: string; hours: number; count: number }> = {}
  activeTasks.forEach(t => {
    const b = t.brand
    if (!b) return
    if (!brandTotals[b.id]) brandTotals[b.id] = { name: b.name, color: b.color, hours: 0, count: 0 }
    brandTotals[b.id].hours += t.hours_estimate ?? 0
    brandTotals[b.id].count++
  })
  const brandRows = Object.values(brandTotals).sort((a, b) => b.hours - a.hours)

  // Priority distribution
  const priorityCounts = {
    High:   activeTasks.filter(t => t.priority === 'High').length,
    Medium: activeTasks.filter(t => t.priority === 'Medium').length,
    Low:    activeTasks.filter(t => t.priority === 'Low').length,
  }

  const PRIORITY_COLOR: Record<string, string> = {
    High: COLORS.coral, Medium: '#F59E0B', Low: COLORS.muted,
  }

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 40px 48px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--ink)', margin: 0 }}>
            Capacity Dashboard
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '6px 0 0' }}>
            Active workload — {activeTasks.length} tasks · {totalHours}h total
          </p>
        </div>

        {/* Summary cards row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          {/* Hours by brand */}
          <div style={{
            background: '#fff', border: '1px solid var(--line)',
            borderRadius: 14, padding: '16px 18px',
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }}>
              Hours by Brand
            </div>
            {brandRows.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>No active tasks</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {brandRows.map(b => (
                  <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 500 }}>
                      {b.name.split(' ')[0]}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {b.hours}h · {b.count} tasks
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Priority distribution */}
          <div style={{
            background: '#fff', border: '1px solid var(--line)',
            borderRadius: 14, padding: '16px 18px',
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }}>
              Priority Distribution
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(['High', 'Medium', 'Low'] as const).map(p => {
                const count = priorityCounts[p]
                const pct   = activeTasks.length > 0 ? Math.round((count / activeTasks.length) * 100) : 0
                return (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[p], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)', width: 52 }}>{p}</span>
                    <div style={{ flex: 1, height: 5, background: '#EBEBEB', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: PRIORITY_COLOR[p], borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink)', width: 28, textAlign: 'right' }}>
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Member capacity cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {members.map(m => (
            <MemberCapacityCard
              key={m.id}
              member={m}
              activeTasks={tasksByMember(m.id)}
            />
          ))}
        </div>

      </div>
    </div>
  )
}
