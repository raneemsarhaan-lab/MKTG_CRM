import type { Member, Brand, ContentType, Task, TaskComment, TaskAttachment, SLAConfig } from '@/types/index'

function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return ''
  if (typeof d === 'string') return d.split('T')[0]
  return d.toISOString().split('T')[0]
}

function toIsoStr(d: Date | string | null | undefined): string {
  if (!d) return ''
  if (typeof d === 'string') return d
  return d.toISOString()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMember(m: any): Member {
  return {
    id:              m.id,
    name:            m.name,
    email:           m.email,
    role:            m.role,
    access:          m.access,
    capacity_hrs_wk: m.capacity_hrs_wk,
    status:          m.status,
    seniority:       m.seniority ?? 'mid',
    color:           m.color    ?? undefined,
    avatar_url:      m.avatar_url ?? undefined,
    // A boolean, never the hash. Members created by the ClickUp import have
    // no password and cannot sign in until one is set, and nothing in the UI
    // said so — which is how "why can't this person log in?" happens.
    has_password:    m.password_hash != null ? true : m.password_hash === null ? false : undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBrand(b: any): Brand {
  return {
    id:          b.id,
    name:        b.name,
    color:       b.color,
    logo_url:    b.logo_url    ?? undefined,
    description: b.description ?? undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapContentType(ct: any): ContentType {
  return { id: ct.id, label: ct.label }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapComment(c: any): TaskComment & { author?: Member } {
  return {
    id:         c.id,
    task_id:    c.task_id,
    author_id:  c.author_id,
    author:     c.author ? mapMember(c.author) : undefined,
    body:       c.body,
    mentions:   c.mentions ?? [],
    task_refs:  c.task_refs ?? [],
    created_at: toIsoStr(c.created_at),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAttachment(a: any): TaskAttachment {
  return {
    id:          a.id,
    task_id:     a.task_id,
    filename:    a.filename,
    url:         a.url ?? undefined,
    data:        a.data ?? undefined,
    uploaded_by: a.uploaded_by ?? undefined,
    uploaded_at: toIsoStr(a.uploaded_at),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTask(t: any): Task & { brand?: Brand; task_owner?: Member; comments: TaskComment[]; attachments: TaskAttachment[] } {
  return {
    id:                 t.id,
    name:               t.name,
    description:        t.description ?? undefined,
    brand_id:           t.brand_id ?? '',
    brand:              t.brand    ? mapBrand(t.brand)     : undefined,
    content_type_label: t.content_type_label ?? '',
    platform:           t.platform   ?? undefined,
    campaign:           t.campaign   ?? undefined,
    task_owner_id:      t.task_owner_id,
    task_owner:         t.task_owner ? mapMember(t.task_owner) : undefined,
    assignee_id:        t.assignee_id ?? null,
    assignee:           t.assignee ? mapMember(t.assignee) : undefined,
    initiator_role:     t.initiator_role,
    nine_stage:         t.nine_stage,
    status:             t.status,
    stage_date:         toDateStr(t.stage_date),
    due_date:           t.due_date ? toDateStr(t.due_date) : null,
    hours_estimate:     Number(t.hours_estimate),
    cover_image_url:    t.cover_image_url ?? undefined,
    cover_thumb:        t.cover_thumb ?? undefined,
    priority:           t.priority,
    created_by:         t.created_by ?? undefined,
    created_at:         toIsoStr(t.created_at),
    updated_at:         toIsoStr(t.updated_at),
    parent_task_id:     t.parent_task_id ?? null,
    parent:             t.parent ? { id: t.parent.id, name: t.parent.name } : null,
    subtasks:           (t.subtasks ?? []).map((s: any) => ({ id: s.id, name: s.name, status: s.status })),
    comments:           (t.comments    ?? []).map(mapComment),
    attachments:        (t.attachments ?? []).map(mapAttachment),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSlaConfig(rows: any[]): SLAConfig {
  const config: SLAConfig = {}
  rows.forEach(row => {
    if (!config[row.stage_id]) config[row.stage_id] = {}
    config[row.stage_id][row.content_type_label] = row.max_business_days
  })
  return config
}
