/**
 * Inbox lab fixtures (spec 006 quickstart §1). Dates are relative to the lab's
 * "now" so every scenario reads the same on any day.
 *
 * Raneem is the Marketing Manager (admin), so C-Review and Final check are
 * hers to approve. Her Inbox at the start:
 *   reviews  r1 (C-Review, 2 days, due tomorrow), r2 (Final check, due today)
 *   yours    y1 (2 days late), y2 (due today, assigned), y3 (no date)
 *   mentions m1 (Yosra, 1 day ago), m2 (Sara, 3h ago); m0 is 20 days old → read
 *   total    7, urgent
 */
import type { InboxState, Member, StageId, Task, TaskAttachment } from '@/types/index'
import { localDay } from '@/lib/inbox'

const member = (id: string, name: string, role: string, access: Member['access']): Member => ({
  id, name, role, access, email: `${id}@forefront.consulting`, capacity_hrs_wk: 40, status: 'Available',
})

export const MEMBERS: Member[] = [
  member('raneem', 'Raneem Sarhaan', 'Marketing Manager', 'admin'),
  member('yosra', 'Yosra Eltopgy', 'Brand Director', 'superuser'),
  member('mona', 'Mona Adel', 'Managing Director', 'admin'),
  member('lina', 'Lina Fawzy', 'Video Editor', 'user'),
  member('sara', 'Sara Nabil', 'Content Creator', 'user'),
]

export function makeLab(now: Date) {
  const day = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return localDay(d) }
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()
  const by = (id: string) => MEMBERS.find(m => m.id === id)!

  const task = (id: string, name: string, status: StageId, o: Partial<Task> = {}): Task => ({
    id, name, status, brand_id: 'b1', content_type_label: 'Post', task_owner_id: 'sara', assignee_id: null,
    initiator_role: 'Content Creator', nine_stage: false, stage_date: day(0), due_date: null,
    hours_estimate: 1, priority: 'Medium', created_at: ago(400), updated_at: ago(1),
    comments: [], attachments: [], ...o,
  })
  const comment = (id: string, task_id: string, author: string, body: string, hours: number, mentions: string[] = []) =>
    ({ id, task_id, author_id: author, author: by(author), body, mentions, created_at: ago(hours) })

  const tasks: Task[] = [
    task('r1', 'Newsjacking SM Post - Suez Canal Report', 'c-final', {
      stage_date: day(-2), due_date: day(1),
      comments: [comment('m1', 'r1', 'yosra', '@Raneem can you check the headline before 3pm? Two versions in the doc.', 24, ['raneem'])],
    }),
    task('r2', 'AI Pillar SM Campaign - Post 3', 'final-check', { stage_date: day(0), due_date: day(0), task_owner_id: 'lina', assignee_id: 'lina' }),
    task('r3', 'Eid campaign banners', 'd-check', { stage_date: day(-1) }),
    task('r4', 'CEO letter', 'c-check', { stage_date: day(-1), nine_stage: true }),
    task('y1', 'Sept W2 - CEO Guide to Say No', 'c-prog', {
      task_owner_id: 'raneem', due_date: day(-2),
      comments: [
        comment('m2', 'y1', 'sara', '@Raneem numbers updated per your note. OK to send to design?', 3, ['raneem']),
        comment('c1', 'y1', 'sara', 'Sources added at the end.', 5),
        comment('c2', 'y1', 'raneem', 'Thanks, reading now.', 2),
      ],
      attachments: [{ id: 'a0', task_id: 'y1', filename: 'my-own-upload.pdf', uploaded_at: ago(1), uploaded_by: 'raneem' } as unknown as TaskAttachment],
    }),
    task('y2', 'FFNT - Company Profile', 'd-prog', {
      task_owner_id: 'sara', assignee_id: 'raneem', due_date: day(0), stage_date: day(-1),
      attachments: [{ id: 'a1', task_id: 'y2', filename: 'cover_v3.png', uploaded_at: ago(5), uploaded_by: 'sara' } as unknown as TaskAttachment],
    }),
    task('y3', 'Q4 Newsletter intro', 'todo', { task_owner_id: 'raneem', stage_date: day(-6) }),
    task('y4', 'Retreat agenda', 'c-prog', { task_owner_id: 'raneem', due_date: day(5) }),
    task('d1', 'Retreat 26 - Envelope', 'publish', { task_owner_id: 'raneem', stage_date: day(0) }),
    task('d2', 'Sugar Tax Report', 'publish', {
      task_owner_id: 'raneem', stage_date: day(-40),
      comments: [comment('m0', 'd2', 'yosra', '@Raneem old note from last month.', 24 * 20, ['raneem'])],
    }),
    task('x1', 'Dropped clip', 'c-prog', { task_owner_id: 'raneem', due_date: day(-3), dropped_at: ago(10) }),
  ]

  const state: InboxState = { readIds: [], snoozes: {}, since: now.toISOString(), pinned: false, showWeek: false }
  return { members: MEMBERS, tasks, state }
}
