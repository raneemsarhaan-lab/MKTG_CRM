/**
 * Sheet lab column fixtures (spec 010 T002), loaded with `#cols=1`:
 * renamed, moved and hidden built-ins, and one custom column of every kind,
 * with values on a few rows. Without the flag the sheets start bare.
 */
import type { SheetColumnRecord, SheetValues } from '@/types/index'
import { referenceText } from './content-fixtures'

const POST1 = 'f51f43c9-069d-46af-95c0-04cba2f72efa'
const POST2 = '3be798dc-ba7a-4742-a1df-d48722c2b039'
const at = '2026-11-05T08:00:00.000Z'
const rec = (sheet: 'content' | 'video', key: string, position: number, more: Partial<SheetColumnRecord> = {}): SheetColumnRecord => ({
  id: key.startsWith('c:') ? key.slice(2) : `${sheet}-${key}`, sheet, key, name: null, position, width: null, shownDefault: true, shownIn: [],
  kind: null, options: [], updatedBy: 'samaa', updatedByName: 'Samaa', updatedAt: at, ...more,
})

const CONTENT_ORDER = ['title', 'type', 'status', 'assignee', 'c:hook', 'c:platform', 'doc', 'design', 'c:reviewer', 'c:approved',
  'c:words', 'c:golive', 'c:brief', 'task', 'post', 'published', 'pillar', 'date', 'archive']
const VIDEO_ORDER = ['title', 'clipNo', 'type', 'status', 'editor', 'c:vhook', 'source', 'fileName', 'in', 'out', 'length', 'c:music', 'files', 'published', 'drop']

export function columnFixtures(): { records: SheetColumnRecord[]; values: SheetValues } {
  const c = (key: string, more: Partial<SheetColumnRecord> = {}) => rec('content', key, CONTENT_ORDER.indexOf(key), more)
  const v = (key: string, more: Partial<SheetColumnRecord> = {}) => rec('video', key, VIDEO_ORDER.indexOf(key), more)
  const records: SheetColumnRecord[] = [
    ...CONTENT_ORDER.filter(k => !k.startsWith('c:')).map(k => c(k)),
    c('status', { name: 'Copy status' }),
    c('pillar', { shownDefault: false, shownIn: [] }),
    c('c:hook', { name: 'Hook', kind: 'text' }),
    c('c:platform', { name: 'Platform', kind: 'choice', options: [
      { id: 'li', name: 'LinkedIn', color: '#1D4ED8' }, { id: 'ig', name: 'Instagram', color: '#BE185D' }, { id: 'x', name: 'X', color: '#334155' },
    ] }),
    c('c:reviewer', { name: 'Reviewer', kind: 'person' }),
    c('c:approved', { name: 'Approved', kind: 'checkbox' }),
    c('c:words', { name: 'Words', kind: 'number' }),
    c('c:golive', { name: 'Go-live', kind: 'date' }),
    c('c:brief', { name: 'Brief', kind: 'link' }),
    ...VIDEO_ORDER.filter(k => !k.startsWith('c:')).map(k => v(k)),
    v('c:vhook', { name: 'Hook', kind: 'text', shownDefault: false, shownIn: ['full', 'editing'] }),
    v('c:music', { name: 'Music cleared', kind: 'checkbox', shownDefault: false, shownIn: ['full', 'editing'] }),
  ]
  // The built-in duplicates above (status, pillar) replace their plain records.
  const seen = new Map<string, SheetColumnRecord>()
  for (const r of records) seen.set(`${r.sheet}|${r.key}`, r)
  return {
    records: [...seen.values()],
    values: {
      hook: { [POST1]: 'AI is a strategy question, not a tooling one', [POST2]: 'Three questions before any AI pilot' },
      platform: { [POST1]: 'li', [POST2]: 'li' },
      reviewer: { [POST1]: 'samaa' },
      approved: { [POST1]: '1' },
      words: { [POST1]: '184', [POST2]: '152' },
      golive: { [POST1]: '2026-11-03' },
      vhook: { c09: 'Strategy fails in the calendar' },
      music: { c09: '1' },
    },
  }
}

/**
 * The reference plan (18 pieces) with three custom columns added on the
 * right: Hook (text), Words (number), Go-live (date), so 54 values (SC-006).
 * `bad` makes row 1's Words "many"; `notes` adds a Notes column no sheet has.
 */
export function customPlanText(o: { bad?: boolean; notes?: boolean } = {}): string {
  return referenceText().split('\n').map((line, i) => {
    const extra = i === 0
      ? ['Hook', 'Words', 'Go-live', ...(o.notes ? ['Notes'] : [])]
      : [`Hook ${i}`, o.bad && i === 1 ? 'many' : String(100 + i), `${String(i).padStart(2, '0')}/12/2026`, ...(o.notes ? [`Note ${i}`] : [])]
    return [line, ...extra].join('\t')
  }).join('\n')
}

/**
 * Clips with a heading row and the Video sheet's Hook and Music cleared
 * columns, plus Notes. Three new clips; `existing` adds one already in v1.
 * `bad` makes the second clip's Music cleared "maybe".
 */
export function customClipText(o: { bad?: boolean; existing?: string } = {}): string {
  const rows = [['File Name', 'Suggested Title', 'Hook', 'Music cleared', 'Notes']]
  for (let i = 1; i <= 3; i++) {
    rows.push([`4${i}_IMG_0300_0m0${i}.0s-0m1${i}.0s.mp4`, `Pasted clip ${i}`, `Clip hook ${i}`, o.bad && i === 2 ? 'maybe' : 'yes', `note ${i}`])
  }
  if (o.existing) rows.push([o.existing, 'Already here', 'Hook for an existing clip', 'yes', ''])
  return rows.map(r => r.join('\t')).join('\n')
}
