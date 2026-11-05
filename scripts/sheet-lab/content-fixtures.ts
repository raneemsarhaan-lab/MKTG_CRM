/**
 * Content sheet lab fixtures (spec 009 T002): the team's Content Library
 * "Plan (Organized)" rows, as Google Sheets copies them (HTML with merged
 * cells as rowspan) and as plain text, plus the board's existing tasks those
 * rows link to.
 */
import type { ContentTheme, Member, Task } from '@/types/index'
import { MEMBERS, makeTasks } from './fixtures'

const m = (id: string, name: string, role: string, access: Member['access']): Member => ({
  id, name, email: `${id}@forefront.consulting`, role, access, capacity_hrs_wk: 40, status: 'Available',
})
export const CONTENT_MEMBERS: Member[] = [
  ...MEMBERS,
  m('samaa', 'Samaa', 'Content Creator', 'user'),
  m('noran', 'Noran', 'Content Creator', 'user'),
]

const BOARD = 'https://mktg-crm-ef1r6x.cranl.net/board?task='
/** The seven Task Links in the reference, and the board tasks they point to. */
export const LINKED: Record<string, { name: string; status: Task['status'] }> = {
  'f51f43c9-069d-46af-95c0-04cba2f72efa': { name: 'AI Pillar SM Campaign - Post 1', status: 'publish' },
  '3be798dc-ba7a-4742-a1df-d48722c2b039': { name: 'AI Pillar SM Campaign - Post 2', status: 'ready-publish' },
  '495e46ab-6dc7-4faf-89c8-fb6c1c8a0765': { name: 'AI Pillar SM Campaign - Post 3', status: 'ready-publish' },
  '855bc9a3-f72e-48d9-bc4b-f5cb37a9c755': { name: 'AI Pillar SM Campaign - Post 4', status: 'ready-publish' },
  '76fd7193-0db7-4564-946d-1fcf2bc72e13': { name: 'Suez Canal Report', status: 'd-check' },
  '3e5270b5-5238-443a-850b-428d880cb97f': { name: 'Egypt, Saudi, Iran War Report', status: 'd-check' },
  '3ed98208-b736-4ebe-b4b2-851fe4bed875': { name: 'EGX Halt Report', status: 'publish' },
}
const L = Object.keys(LINKED)

type Piece = [title: string, type: string, status: string, doc: string, design: string, task: string, post: string, published: string]
/** Strategy · Samaa · 2 per week · C-Level, Strategy Heads, Top Management. */
export const STRATEGY: { pillar: string; pieces: Piece[] }[] = [
  { pillar: 'AI', pieces: [
    ['AI Pillar Article', 'Article', 'Published', 'AI Pillar Funnel', '', '', '', 'https://www.forefront.consulting/en/insights/ai-adoption'],
    ['AI Pillar Canvas', 'Framework/Model', 'Published', 'AI Pillar Funnel', '', '', '', 'https://www.forefront.consulting/en/insights/Forefront-AI-Canvas'],
    ['AI Pillar SM Campaign - Post 1', 'Social Media', 'Published', 'AI Pillar Funnel', '', BOARD + L[0], '', ''],
    ['AI Pillar SM Campaign - Post 2', 'Social Media', 'Ready to Publish', 'AI Pillar Funnel', '', BOARD + L[1], '', ''],
    ['AI Pillar SM Campaign - Post 3', 'Social Media', 'Ready to Publish', 'AI Pillar Funnel', '', BOARD + L[2], '', ''],
    ['AI Pillar SM Campaign - Post 4', 'Social Media', 'Ready to Publish', 'AI Pillar Funnel', '', BOARD + L[3], '', ''],
  ] },
  { pillar: 'Decision Making', pieces: [
    ['A CEO Guide to Say No', 'Article', '', 'A CEO Guide to Saying No to Good Opportunities', '', '', '', ''],
    ['A CEO Guide to a Missed Opportunity', 'Article', '', 'A CEO Guide to Saying No to Good Opportunities', '', '', '', ''],
  ] },
]
/** Newsjacking · Noran · 1 per week · Strategy Heads, Top Management, 2nd Line Management; no pillar. */
export const NEWSJACKING: Piece[] = [
  ['Federal Reserve Decision Report', 'Report', 'Published', 'News - Fed', '', '', 'Egypt Businesses Face Prolonged Uncertainty with Fed Rate Decision | Forefront Consulting posted on the top', 'https://www.linkedin.com/posts/forefrontcons_ffnt-strategicalert-activity-7460255115082440704-oLQe'],
  ['FIFA World Cup Movement Report', 'Report', 'Published', 'worldcup - Generic - 5 moves V2', '', '', 'https://www.linkedin.com/posts/forefrontcons_the-playbook-the-5-moves-brands-make-during-activity-748450698', 'Link error'],
  ['Sugar Tax Report', 'Report', 'Published', 'SUGAR TAXES -NJ - V2', '', '', 'https://www.linkedin.com/posts/forefrontcons_ffnt-news-activity-7499760539590455296-ynEN', 'https://www.forefront.consulting/pdf/Sugar%20Tax%20Report-1.pdf'],
  ['Salah Trabzonspor Deal Report', 'Report', 'Published', 'Arabic - NJ - Salah', 'https://claude.ai/design/p/ea538c41-845a-4ccb-9fe2-39c2672540ea?file=Salah+Trabzonspor+Report.dc.html', '', 'https://www.linkedin.com/posts/forefrontcons_salah', 'https://claude.ai/artifact/9rYZq2hs28WNWKvkzQpiHk'],
  ['Egypt China 0% Taxes Report', 'Report', 'Published', 'ChinaEgypt Tariffs - Newsjacking', 'https://claude.ai/design/p/005127e3-70e5-4507-ba4e-b3ee8686ed52', '', 'https://www.linkedin.com/posts/forefrontcons_ffnt-news-activity-7502682758989729792-haEo', 'https://claude.ai/artifact/6fACZNHYPTLQBFqsYq2Hpn'],
  ['iPhone 18 Report', 'Report', 'Archived', 'NJ - IPhone 18 Price in egypt', 'https://claude.ai/design/p/f68e16c7-80b3-4c05-b7c9-ad93403407ab', '', '', ''],
  ['Egypt Price Cuts Report', 'Report', 'Initial Design', 'NJ - Egypt Price Cuts', 'https://claude.ai/design/p/dabc0852-e8a7-4c5d-a8ae-c916dbdccff6', '', '', ''],
  ['Suez Canal Report', 'Report', 'Final Design', 'NJ - Suez Canal', 'https://claude.ai/design/p/e17cf400-9b99-47a7-a316-264cec99173b', BOARD + L[4], '', ''],
  ['Egypt, Saudi, Iran War Report', 'Report', 'Final Design', 'NJ - Egypt, Saudi, Iran War', 'https://claude.ai/design/p/d8602385-40bd-4386-b001-e1aab4f0aea2', BOARD + L[5], '', 'https://www.forefront.consulting/pdf/Egypt-Saudi-Military-Support.pdf'],
  ['EGX Halt Report', 'Report', 'Published', 'NJ- EGX Halt', 'https://claude.ai/design/p/e50d75c4-2a9d-47b8-8911-9ff179530065', BOARD + L[6], '', 'https://www.forefront.consulting/pdf/EGX-Halt-2.pdf'],
]

const HEAD = ['Theme', 'Owner', 'Frequency', 'Target Audience', 'Pillar', 'Piece Title', 'Type', 'Status', 'Working Doc', 'Design Link', 'Task Link', 'LinkedIn Link', 'Published Link']
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const cell = (v: string, rowspan = 1) => {
  const rs = rowspan > 1 ? ` rowspan="${rowspan}"` : ''
  return /^https?:/.test(v) ? `<td${rs}><a href="${esc(v)}">${esc(v)}</a></td>` : `<td${rs}>${esc(v)}</td>`
}

/** The tab as Google Sheets puts it on the clipboard: merged cells are rowspans. */
export function referenceHtml(): string {
  const strat = STRATEGY.flatMap(g => g.pieces)
  const rows: string[] = [`<tr>${HEAD.map(h => `<td>${h}</td>`).join('')}</tr>`]
  let first = true
  for (const g of STRATEGY) {
    g.pieces.forEach((p, i) => {
      const lead = first
        ? cell('Strategy', strat.length) + cell('Samaa', strat.length) + cell('2 per week', strat.length) + cell('C-Level, Strategy Heads, Top Management', strat.length)
        : ''
      first = false
      rows.push(`<tr>${lead}${i === 0 ? cell(g.pillar, g.pieces.length) : ''}${p.map(v => cell(v)).join('')}</tr>`)
    })
  }
  NEWSJACKING.forEach((p, i) => {
    const lead = i === 0
      ? cell('Newsjacking', NEWSJACKING.length) + cell('Noran', NEWSJACKING.length) + cell('1 per week', NEWSJACKING.length) + cell('Strategy Heads, Top Management, 2nd Line Management', NEWSJACKING.length) + cell('', NEWSJACKING.length)
      : ''
    rows.push(`<tr>${lead}${p.map(v => cell(v)).join('')}</tr>`)
  })
  return `<meta charset="utf-8"><google-sheets-html-origin><style>td{}</style><table><tbody>${rows.join('')}</tbody></table></google-sheets-html-origin>`
}

/** The same tab as plain text: merged cells leave blanks below their first row. */
export function referenceText(): string {
  const lines = [HEAD.join('\t')]
  let first = true
  for (const g of STRATEGY) g.pieces.forEach((p, i) => {
    lines.push([first ? 'Strategy' : '', first ? 'Samaa' : '', first ? '2 per week' : '', first ? 'C-Level, Strategy Heads, Top Management' : '', i === 0 ? g.pillar : '', ...p].join('\t'))
    first = false
  })
  NEWSJACKING.forEach((p, i) => lines.push([i === 0 ? 'Newsjacking' : '', i === 0 ? 'Noran' : '', i === 0 ? '1 per week' : '', i === 0 ? 'Strategy Heads, Top Management, 2nd Line Management' : '', '', ...p].join('\t')))
  return lines.join('\n')
}

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()
const today = () => new Date().toISOString().slice(0, 10)

/** The board before the paste: the linked tasks exist; one theme (Strategy) already has a video with clips. */
export function makeContent(): { tasks: Task[]; themes: ContentTheme[] } {
  const base = makeTasks()
  const strategy: ContentTheme = { id: 'th-strategy', name: 'Strategy', brand_id: 'brand-1', owner_id: 'samaa', frequency_count: 2, frequency_period: 'week', audience: ['c-level', 'strategy-heads', 'top-management'], pillars: [{ id: 'pl-ai', name: 'AI', sort_order: 0 }] }
  const tasks: Task[] = base.map(t => (t.id === 'v1' ? { ...t, project_id: 'th-strategy' } : t))
  const linked: Task[] = Object.entries(LINKED).map(([id, v], i) => ({
    ...base.find(t => t.id === 'p1')!, id, name: v.name, status: v.status, content_type_label: i < 4 ? 'Post' : 'Report',
    task_owner_id: i < 4 ? 'samaa' : 'noran', assignee_id: 'hadi', project_id: null, pillar_id: null,
    stage_date: today(), created_at: iso(900 - i), updated_at: iso(900 - i), attachments: [], published_url: null, post_url: null,
  }))
  // A piece published this week, so Strategy shows "this week 1 of 2".
  const post1 = linked[0]
  post1.project_id = 'th-strategy'; post1.pillar_id = 'pl-ai'
  return { tasks: [...tasks, ...linked], themes: [strategy] }
}
