/**
 * Sheet lab fixtures (spec 008 T003): the team, one video with the team's real
 * clip file names, a second video with two clips, and a video with none.
 */
import type { Member, StageId, Task, TaskAttachment } from '@/types/index'
import { parseClipFileName } from '@/lib/clip-file-name'

const m = (id: string, name: string, role: string, access: Member['access']): Member => ({
  id, name, email: `${id}@forefront.consulting`, role, access, capacity_hrs_wk: 40, status: 'Available',
})
export const MEMBERS: Member[] = [
  m('raneem', 'Raneem', 'Marketing Manager', 'admin'),
  m('yosra', 'Yosra', 'Brand Director', 'superuser'),
  m('mona', 'Mona', 'Managing Director', 'user'),
  m('lina', 'Lina', 'Video Editor', 'user'),
  m('omar', 'Omar', 'Video Editor', 'user'),
  m('hadi', 'Hadi', 'Motion Designer', 'user'),
  m('sara', 'Sara', 'Content Creator', 'user'),
]
const byId = Object.fromEntries(MEMBERS.map(x => [x.id, x]))

export const DRIVE = 'https://drive.google.com/file/d/1AbCdEf/view'

/** [file name, title, stage, assignee, published link, dropped] */
type Raw = [string, string, StageId, string | null, string | null, boolean?]
export const CLIPS: Raw[] = [
  ['04_IMG_0293_2m20.2s-3m49.0s.mp4', 'Keeping Strategy on Track', 'publish', 'lina', 'https://www.linkedin.com/feed/update/1'],
  ['05_IMG_0293_3m56.1s-5m06.8s.mp4', 'Strategy Deployment: The Missing Link', 'publish', 'lina', null],
  ['08_IMG_0293_8m44.4s-9m44.7s.mp4', 'The Six Cs of Strategy Deployment', 'publish', 'omar', 'https://www.instagram.com/reel/abc'],
  ['09_IMG_0293_9m44.6s-10m58.0s.mp4', 'Connecting Every Team to the Strategy', 'ready-publish', 'omar', null],
  ['11_IMG_0293_13m37.1s-14m50.5s.mp4', 'Tie Rewards to What Matters Most', 'd-check', 'lina', null],
  ['12_IMG_0293_15m08.5s-16m11.6s.mp4', 'Clear Roles Make Strategy Work', 'final-check', 'omar', null],
  ['13_IMG_0293_16m13.2s-17m17.4s.mp4', 'Can Your Team See the Strategy?', 'd-prog', 'lina', null],
  ['13_IMG_0293_16m13.2s-17m20.0s.mp4', 'Can Your Team See the Strategy? (re-cut)', 'r-design', null, null],
  ['14_IMG_0294_0m09.9s-1m23.7s.mp4', '300 Numbers. Where’s the Insight?', 'd-prog', 'omar', null],
  ['18_IMG_0294_8m34.3s-9m41.6s.mp4', 'Political Dynamics: Two Ways to See an Organization', 'c-final', null, null],
  ['22_IMG_0295_6m30.7s-7m32.6s.mp4', 'The Two Anchors of Leadership: Brutal Facts and Ultimate Faith', 'c-prog', 'sara', null],
  ['23_IMG_0295_8m02.1s-9m17.6s.mp4', 'Execution Under Pressure Starts with a Calm Leader', 'todo', null, null],
  ['28_IMG_0296_3m05.9s-3m56.8s.mp4', 'Execution First: Results Don’t Come From Talk Alone', 'd-prog', 'omar', null, true],
]
export const FILE_NAMES = CLIPS.map(c => c[0])

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()

function task(p: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
  const owner = p.task_owner_id ?? 'raneem'
  return {
    brand_id: 'brand-1', content_type_label: 'Reel', task_owner_id: owner, task_owner: byId[owner],
    assignee_id: null, initiator_role: 'Marketing Manager', nine_stage: false, status: 'todo',
    stage_date: new Date().toISOString().slice(0, 10), due_date: null, hours_estimate: 0, priority: 'Medium',
    created_at: iso(600), updated_at: iso(600), parent_task_id: null, attachments: [], comments: [],
    published_url: null, dropped_at: null, clip: null, subtasks: [],
    ...p,
    assignee: p.assignee_id ? byId[p.assignee_id] : undefined,
  }
}
const link = (taskId: string, n: number): TaskAttachment => ({
  id: `att-${taskId}-l`, task_id: taskId, filename: 'Google Drive', url: DRIVE, content_type: 'text/uri-list',
  uploaded_by: 'sara', uploaded_at: iso(300 - n),
})

export function makeTasks(): Task[] {
  const v1 = task({ id: 'v1', name: 'Strategy Execution and Leadership', content_type_label: 'Video', status: 'd-prog',
    task_owner_id: 'raneem', assignee_id: 'omar', updated_at: iso(5),
    attachments: [link('v1', 0)] })
  const clips = CLIPS.map(([file, title, status, assignee, pub, dropped], i) => {
    const p = parseClipFileName(file)!
    const id = `c${String(i + 1).padStart(2, '0')}`
    return task({
      id, name: title, status, assignee_id: assignee, task_owner_id: 'sara', parent_task_id: 'v1',
      parent: { id: 'v1', name: v1.name }, published_url: pub, dropped_at: dropped ? iso(60 * 24 * 3) : null,
      created_at: iso(500 - i), updated_at: iso(500 - i),
      clip: { clip_no: p.clip_no, source: p.source, file_name: file, in_ms: p.in_ms, out_ms: p.out_ms, video_id: 'v1', created_at: iso(500 - i) },
      attachments: i === 0
        ? [link(id, i), { id: `att-${id}-f`, task_id: id, filename: '04_final.mp4', content_type: 'video/mp4', size_bytes: 12_000_000, uploaded_by: 'lina', uploaded_at: iso(100) }]
        : [link(id, i)],
    })
  })
  // A subtask without clip details, as "New subtask" makes it (typed Video).
  const bare = task({ id: 'c99', name: 'Behind the scenes', content_type_label: 'Video', parent_task_id: 'v1',
    parent: { id: 'v1', name: v1.name }, task_owner_id: 'raneem', status: 'todo', created_at: iso(10), updated_at: iso(10) })
  const v2 = task({ id: 'v2', name: 'Quarterly Town Hall', content_type_label: 'Video', status: 'c-prog', task_owner_id: 'raneem', updated_at: iso(50) })
  const v2c = ['01_TH_A_0m10.0s-1m02.0s.mp4', '02_TH_A_1m30.0s-2m45.5s.mp4'].map((file, i) => {
    const p = parseClipFileName(file)!
    return task({ id: `t${i + 1}`, name: `Town hall clip ${i + 1}`, parent_task_id: 'v2', parent: { id: 'v2', name: v2.name },
      task_owner_id: 'raneem', status: 'todo', updated_at: iso(60),
      clip: { clip_no: p.clip_no, source: p.source, file_name: file, in_ms: p.in_ms, out_ms: p.out_ms, video_id: 'v2', created_at: iso(60) } })
  })
  const v3 = task({ id: 'v3', name: 'Founder Interview', content_type_label: 'Video', status: 'todo', task_owner_id: 'raneem', updated_at: iso(70) })
  const post = task({ id: 'p1', name: 'Launch post', content_type_label: 'Post', status: 'c-prog', task_owner_id: 'sara' })
  return [v1, ...clips, bare, v2, ...v2c, v3, post]
}

/** Google Sheets' clipboard HTML for rows of [file, title, link]. */
export function sheetsHtml(rows: [string, string, string | null][]): string {
  const tr = rows.map(([f, t, l]) => `<tr><td>${f}</td><td>${t}</td><td>${l ? `<a href="${l}">Open</a>` : ''}</td></tr>`).join('')
  return `<meta charset="utf-8"><google-sheets-html-origin><style>td{}</style><table><tbody>${tr}</tbody></table></google-sheets-html-origin>`
}
