/**
 * Open work per person (spec 021 Workload view). Pure.
 * Counts open tasks' hour estimates per assignee, split by brand — published
 * pipeline tasks, done simple tasks and dropped clips are left out.
 */
import { featureOn } from '@/lib/brand-features'
import type { BrandFeatures } from '@/types/index'
import { hoursSplit } from '@/lib/assignees'
import { spreadHours } from '@/lib/start-dates'

export interface LoadTask {
  assignee_id?: string | null
  brand_id?: string | null
  hours_estimate: number | string
  status: string
  kind?: string | null
  simple_status?: string | null
  dropped_at?: string | null
  /** Spec 021 (US4): the task's brand, whose Hour estimates switch decides if its hours count. */
  brand?: { features?: BrandFeatures | null } | null
}

export interface PersonLoad { memberId: string; hours: number; tasks: number; byBrand: Record<string, number> }

export const isOpen = (t: LoadTask) =>
  !t.dropped_at && (t.kind === 'simple' ? t.simple_status !== 's-done' : t.status !== 'publish')

export function taskLoad(tasks: LoadTask[]): PersonLoad[] {
  const by = new Map<string, PersonLoad>()
  for (const t of tasks) {
    if (!isOpen(t)) continue
    // Spec 023 (R9): hours split among the assignees — each person's own hours, else an even share.
    const split = hoursSplit({ ...t, hours_estimate: featureOn(t.brand, 'hours') ? Number(t.hours_estimate) || 0 : 0 })
    for (const [id, h] of Object.entries(split)) {
      const p = by.get(id) ?? { memberId: id, hours: 0, tasks: 0, byBrand: {} }
      p.hours += h; p.tasks += 1
      const b = t.brand_id ?? 'none'
      p.byBrand[b] = (p.byBrand[b] ?? 0) + h
      by.set(id, p)
    }
  }
  return [...by.values()].sort((a, b) => b.hours - a.hours)
}

/**
 * Spec 023 (US6, D14): hours per person per day. Each person's share is spread
 * over the working days from the task's start to its due date (the Settings
 * weekend skipped); without a start it sits on the due day. Undated tasks are
 * left out. Only the days asked for are returned.
 */
export function dayLoad(
  tasks: (LoadTask & { start_date?: string | null; due_date?: string | null })[],
  days: string[],
  weekend: number[],
): Record<string, Record<string, number>> {
  const want = new Set(days)
  const out: Record<string, Record<string, number>> = {}
  for (const t of tasks) {
    if (!isOpen(t) || !t.due_date) continue
    const split = hoursSplit({ ...t, hours_estimate: featureOn(t.brand, 'hours') ? Number(t.hours_estimate) || 0 : 0 })
    for (const [id, h] of Object.entries(split)) {
      for (const [day, v] of Object.entries(spreadHours(h, t.start_date?.slice(0, 10), t.due_date.slice(0, 10), weekend))) {
        if (!want.has(day)) continue
        const row = (out[id] ??= {})
        row[day] = Math.round(((row[day] ?? 0) + v) * 100) / 100
      }
    }
  }
  return out
}
