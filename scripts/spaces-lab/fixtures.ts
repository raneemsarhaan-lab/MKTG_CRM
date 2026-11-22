/**
 * Spaces lab fixtures (spec 021): 4 brands, the 4 seeded Spaces, the 7 seeded
 * roles, and 30 tasks across stages and types.
 */
import type { Brand, Member, StageId, Task, TeamSpace, TaskSpace } from '@/types/index'
import { NINE_STAGE } from '@/lib/stage-meta'
import { startingSpaces, membersBySpace, ROLE_SPACES } from '@/lib/spaces'

export const BRANDS: Brand[] = [
  { id: 'b-ff', name: 'Forefront Consulting', color: '#B4322F', features: {} },
  { id: 'b-om', name: 'Omnisight', color: '#0E7C7B', features: {} },
  { id: 'b-tsc', name: 'The Strategy Community', color: '#7A5A2E', features: { platform: false } },
  { id: 'b-ipb', name: 'Islam Personal Branding', color: '#1E293B', features: {} },
]

const m = (id: string, name: string, role: string, access: Member['access']): Member =>
  ({ id, name, role, access, email: `${id}@example.test`, capacity_hrs_wk: 40, status: 'Available' } as Member)

export const MEMBERS: Member[] = [
  m('raneem', 'Raneem', 'Marketing Manager', 'admin'),
  m('islam', 'Islam', 'Managing Director', 'superuser'),
  m('brand', 'Brand Director', 'Brand Director', 'superuser'),
  m('noran', 'Noran', 'Digital Marketing Specialist', 'superuser'),
  m('samaa', 'Samaa', 'Content Creator', 'user'),
  m('omar', 'Omar', 'Graphic Designer', 'user'),
  m('karim', 'Karim', 'Video Editor', 'user'),
]

export const SPACES: TeamSpace[] = [
  { id: 's-content', key: 'content', name: 'Content', color: '#3B82F6', is_production: false, default_kind: 'pipeline', words: {}, sort_order: 0, archived_at: null },
  { id: 's-design', key: 'design', name: 'Design', color: '#7C3AED', is_production: true, default_kind: 'pipeline', words: {}, sort_order: 1, archived_at: null },
  { id: 's-video', key: 'video', name: 'Video', color: '#0E9F9A', is_production: true, default_kind: 'pipeline', words: {}, sort_order: 2, archived_at: null },
  { id: 's-planning', key: 'planning', name: 'Planning', color: '#0EA5E9', is_production: false, default_kind: 'simple', words: {}, sort_order: 3, archived_at: null },
]

export function makeLab() {
  const spaceMembers = MEMBERS.flatMap(mem => (ROLE_SPACES[mem.role] ?? []).map(k => ({ space_id: SPACES.find(s => s.key === k)!.id, member_id: mem.id })))
  const bySpace = membersBySpace(spaceMembers)
  const types = ['Post', 'Video', 'Reel', 'Design', 'Article']
  const people = ['samaa', 'noran', 'omar', 'karim']
  const tasks: Task[] = Array.from({ length: 30 }, (_, i) => {
    const status = NINE_STAGE[i % NINE_STAGE.length] as StageId
    const type = types[i % types.length]
    const brand = BRANDS[i % BRANDS.length]
    const assignee = people[i % people.length]
    return {
      id: `t${i}`, name: `${type} ${i}`, brand_id: brand.id, brand, content_type_label: type,
      task_owner_id: 'samaa', assignee_id: assignee, initiator_role: 'Content Creator',
      nine_stage: i % 3 !== 0, status, stage_date: '2026-11-20', due_date: `2026-12-${String((i % 28) + 1).padStart(2, '0')}`,
      hours_estimate: 2, priority: 'Medium', created_at: '2026-11-01', updated_at: '2026-11-01', kind: 'pipeline', simple_status: null,
    } as Task
  })
  tasks.push({ ...tasks[0], id: 'simple1', name: 'Plan Q1', kind: 'simple', simple_status: 's-doing', status: 'todo', assignee_id: 'noran', task_owner_id: 'noran' })
  const taskSpaces: TaskSpace[] = tasks.flatMap(t => startingSpaces(t, SPACES, bySpace).map(space_id => ({ task_id: t.id, space_id, added_via: 'migration' as const })))
  return { brands: BRANDS, members: MEMBERS, spaces: SPACES, spaceMembers, bySpace, tasks, taskSpaces }
}
