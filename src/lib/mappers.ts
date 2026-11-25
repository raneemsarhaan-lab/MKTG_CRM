import { resolveSettings } from '@/lib/space-settings'
import { orderPillars } from '@/lib/content-rows'
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
    celebrations:    m.celebrations === true,
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
    features:    (b.features && typeof b.features === 'object' ? b.features : {}) as import('@/types/index').BrandFeatures,
    nine_stage_default: b.nine_stage_default ?? null,
    short_name: b.short_name ?? null,
    default_priority: b.default_priority ?? null,
  }
}

/** Spec 021: a team Space row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSpace(s: any): import('@/types/index').TeamSpace {
  return {
    id:            s.id,
    key:           s.key,
    name:          s.name,
    color:         s.color,
    is_production: !!s.is_production,
    default_kind:  s.default_kind === 'simple' ? 'simple' : 'pipeline',
    words:         (s.words && typeof s.words === 'object' ? s.words : {}) as Record<string, string[]>,
    sort_order:    s.sort_order ?? 0,
    archived_at:   s.archived_at ? toIsoStr(s.archived_at) : null,
    default_assignee_role: s.default_assignee_role ?? null,
    media_board:   s.media_board === 'design' || s.media_board === 'video' ? s.media_board : null,
    // Spec 024: the stored settings over the Space's defaults.
    settings:      resolveSettings(s.key, s.settings),
  }
}

/** Spec 022: a Space stage row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSpaceStage(r: any): import('@/types/index').SpaceStage {
  return { id: r.id, space_id: r.space_id, stage_id: r.stage_id, name: r.name ?? null, position: r.position ?? 0, aliases: Array.isArray(r.aliases) ? r.aliases : [] }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapContentType(ct: any): ContentType {
  return {
    id: ct.id, label: ct.label, media_boards: ct.media_boards,
    name_ar: ct.name_ar ?? null, icon: ct.icon ?? 'doc', color: ct.color ?? '#6B7280',
    default_priority: ct.default_priority ?? null, default_tag_ids: ct.default_tag_ids ?? [],
    default_template_id: ct.default_template_id ?? null, position: ct.position ?? 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTaskField(f: any): import('@/types/index').TaskFieldDef {
  const o = (f.options && typeof f.options === 'object' ? f.options : {}) as import('@/types/index').TaskFieldDef['options']
  return { id: f.id, name_en: f.name_en, name_ar: f.name_ar ?? null, kind: f.kind, options: o, on_card: !!f.on_card, switchable: !!f.switchable, position: f.position ?? 0, retired: !!f.retired_at }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTypeField(x: any): import('@/types/index').TaskTypeFieldLink {
  return { type_label: x.type_label, field_id: x.field_id, required_from: x.required_from ?? null, default_value: x.default_value ?? null, position: x.position ?? 0 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTemplate(t: any): import('@/types/index').TaskTemplate {
  const values = t.values && typeof t.values === 'object' && !Array.isArray(t.values) ? t.values : {}
  return {
    id: t.id, type_label: t.type_label, name: t.name, name_pattern: t.name_pattern, brief: t.brief ?? null,
    values, subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    updated_at: t.updated_at instanceof Date ? t.updated_at.toISOString() : String(t.updated_at ?? ''),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMilestone(m: any): import('@/types/index').Milestone {
  const d = m.day instanceof Date ? m.day.toISOString().slice(0, 10) : String(m.day).slice(0, 10)
  return { id: m.id, brand_id: m.brand_id, name: m.name, day: d }
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
    // Spec 023 (R9): every assignee, the lead first; and hours set per person.
    assignee_ids:       assigneeIds(t.assignee_id ?? null, t.assignees),
    tag_ids:            (t.tags ?? []).map((x: { tag_id: string }) => x.tag_id) as string[],
    assignee_hours:     Object.fromEntries((t.assignees ?? []).filter((r: { hours: number | null }) => r.hours != null).map((r: { member_id: string; hours: number }) => [r.member_id, r.hours])) as Record<string, number>,
    initiator_role:     t.initiator_role,
    nine_stage:         t.nine_stage,
    status:             t.status,
    stage_date:         toDateStr(t.stage_date),
    due_date:           t.due_date ? toDateStr(t.due_date) : null,
    start_date:         t.start_date ? toDateStr(t.start_date) : null,
    repeat_rule_id:     t.repeat_rule_id ?? null,
    publish_date:       t.publish_date ? toDateStr(t.publish_date) : null,
    due_manual:         t.due_manual === true,
    media_board:        t.media_board === 'design' || t.media_board === 'video' ? t.media_board : null,
    content_task_id:    t.content_task_id ?? null,
    entry_stage:        t.entry_stage ?? 'todo',
    auto_linked_at:     t.auto_linked_at ? toIsoStr(t.auto_linked_at) : null,
    migrated_simple:    t.migrated_simple === true,
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
    kind:               t.kind === 'simple' ? 'simple' : 'pipeline',
    simple_status:      t.simple_status ?? null,
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
    // Sheet 2b: the sheet's own pillar order first, then the project's.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pillars: orderPillars((p.pillars ?? []).map((x: any) => ({ id: x.id, name: x.name, sort_order: x.sort_order })), p.pillar_order ?? []),
    sheet_theme_id: p.sheet_theme_id ?? null,
    position: typeof p.position === 'number' ? p.position : 0,
    space_id: p.space_id ?? null,
    ...(p.sheet_id ? { sheet_id: p.sheet_id as string } : {}),
  }
}

/** Sheet 2b: a Content sheet row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapContentRow(r: any): import('@/lib/content-rows').ContentRowRec {
  const values = r.values && typeof r.values === 'object' && !Array.isArray(r.values) ? r.values as Record<string, string> : {}
  return {
    id: r.id, project_id: r.project_id, pillar_id: r.pillar_id ?? null, parent_id: r.parent_id ?? null, position: Number(r.position) || 0,
    title: r.title ?? '', date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date ? String(r.date).slice(0, 10) : null,
    values, task_id: r.task_id ?? null, created_by: r.created_by ?? null, space_id: r.space_id ?? null,
    sheet_id: r.sheet_id ?? null, last_task_id: r.last_task_id ?? null,
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

/** Every assignee of a task: the lead (tasks.assignee_id) first, then the others by position. */
export function assigneeIds(lead: string | null, rows: { member_id: string; position: number }[] | undefined): string[] {
  const others = (rows ?? []).filter(r => r.member_id !== lead).sort((a, b) => a.position - b.position).map(r => r.member_id)
  return lead ? [lead, ...others] : others
}
