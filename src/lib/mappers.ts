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
    locale:          m.locale === 'ar' ? 'ar' : m.locale === 'en' ? 'en' : undefined,
    gender:          m.gender === 'f' || m.gender === 'm' ? m.gender : undefined,
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
    // Spec 012 R4: which comment this replies to, so the panel threads it.
    parent_id:  c.parent_id ?? null,
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
    size_bytes:  a.size_bytes ?? null,
    content_type: a.content_type ?? null,
    link_role:   a.link_role ?? null,
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
    project_id:         t.project_id ?? null,
    project:            t.project ? { id: t.project.id, name: t.project.name } : null,
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
    plan_step:          t.project_step
      ? {
          id:          t.project_step.id,
          name:        t.project_step.name,
          projectId:   t.project_step.project.id,
          projectName: t.project_step.project.name,
        }
      : null,
    parent_task_id:     t.parent_task_id ?? null,
    parent:             t.parent ? { id: t.parent.id, name: t.parent.name } : null,
    subtasks:           (t.subtasks ?? []).map((s: any) => ({
      id: s.id, name: s.name, status: s.status, dropped_at: s.dropped_at ? toIsoStr(s.dropped_at) : null,
    })),
    published_url:      t.published_url ?? null,
    post_url:           t.post_url ?? null,
    pillar_id:          t.pillar_id ?? null,
    dropped_at:         t.dropped_at ? toIsoStr(t.dropped_at) : null,
    clip:               t.clip
      ? {
          clip_no:    t.clip.clip_no ?? null,
          source:     t.clip.source ?? null,
          file_name:  t.clip.file_name ?? null,
          in_ms:      t.clip.in_ms ?? null,
          out_ms:     t.clip.out_ms ?? null,
          video_id:   t.clip.video_id ?? null,
          created_at: t.clip.created_at ? toIsoStr(t.clip.created_at) : undefined,
        }
      : null,
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

/** A theme project for the Content sheet (spec 009). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTheme(p: any): import('@/types/index').ContentTheme {
  return {
    id: p.id,
    name: p.name,
    brand_id: p.brand_id ?? null,
    owner_id: p.owner_id ?? null,
    frequency_count: p.frequency_count ?? null,
    frequency_period: p.frequency_period === 'week' || p.frequency_period === 'month' ? p.frequency_period : null,
    audience: (p.audience ?? []) as import('@/types/index').AudienceKey[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pillars: (p.pillars ?? []).map((x: any) => ({ id: x.id, name: x.name, sort_order: x.sort_order }))
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
  }
}

/** A sheet column record (spec 010), with the name of whoever changed it last. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSheetColumn(c: any): import('@/types/index').SheetColumnRecord {
  return {
    id:            c.id,
    sheet:         c.sheet,
    key:           c.key,
    name:          c.name ?? null,
    position:      c.position,
    width:         c.width ?? null,
    shownDefault:  c.shown_default,
    shownIn:       c.shown_in ?? [],
    kind:          c.kind ?? null,
    options:       Array.isArray(c.options) ? c.options : [],
    updatedBy:     c.updated_by ?? null,
    updatedByName: c.updater?.name ?? null,
    updatedAt:     (c.updated_at instanceof Date ? c.updated_at : new Date(c.updated_at)).toISOString(),
  }
}
