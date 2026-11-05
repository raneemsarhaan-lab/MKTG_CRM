/**
 * Sheet lab column fixtures (spec 010 T002), loaded with `#cols=1`:
 * renamed, moved and hidden built-ins, and one custom column of every kind,
 * with values on a few rows. Without the flag the sheets start bare.
 */
import type { SheetColumnRecord, SheetValues } from '@/types/index'

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
