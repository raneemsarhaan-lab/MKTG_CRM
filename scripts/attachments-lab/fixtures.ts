/**
 * Lab fixtures (spec 007 T003): the files from the analysis screenshot, drawn
 * in the browser so the lab carries no binary assets, plus helpers for files of
 * any reported size.
 */
import type { TaskAttachment } from '@/types/index'

export const ME = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Raneem Sarhaan' }
export const YE = { id: '00000000-0000-4000-8000-0000000000bb', name: 'yosra eltopgy' }
export const MEMBERS = [ME, YE]
export const TASK_ID = '00000000-0000-4000-8000-00000000dead'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
let n = 0
export const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

/** A portrait "post": three bars and the headline, at the top or the bottom. */
export function poster(variant: 1 | 2 | 3, w = 400, h = 500): string {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#F7F7F8'; g.fillRect(0, 0, w, h)
  const top = variant === 3
  const base = top ? 430 : 322
  const bars: [number, number, string, string][] = [[46, top ? 250 : 215, '#1B2A6B', '88%'], [150, top ? 185 : 158, '#E4E6EC', '67%'], [246, top ? 70 : 60, '#F59E0B', '6%']]
  for (const [x, ht, col, label] of bars) {
    g.fillStyle = col; g.fillRect(x + (variant === 2 ? 14 : 0), base - ht, 70, ht)
    g.fillStyle = col === '#1B2A6B' ? '#fff' : '#1B2A6B'; g.font = 'bold 22px Arial'; g.fillText(label, x + 8 + (variant === 2 ? 14 : 0), base - ht + 28)
  }
  g.fillStyle = '#1B2A6B'; g.font = 'bold 22px Arial'
  g.fillText('THE GAP IS NOT TECHNICAL.', 30, top ? 80 : 390)
  g.fillStyle = '#F59E0B'; g.fillText(`IT IS STRUCTURAL. v${variant}`, 30, top ? 108 : 418)
  return c.toDataURL('image/png')
}

/** A data URL as a File, so uploads and pastes carry real bytes. */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const [meta, b64] = dataUrl.split(',')
  const type = meta.slice(5).split(';')[0]
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type })
}

/** A small file that reports any size (7 MB, 210 MB…) without allocating it. */
export function sizedFile(name: string, size: number, type = 'application/octet-stream'): File {
  const f = new File([new Uint8Array(16)], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const OCTET = 'data:application/octet-stream;base64,AAAA'
// A one-page PDF ("Brief"), small enough to inline.
const PDF = 'data:application/pdf;base64,JVBERi0xLjEKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMzAwIDE0NF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G'

/** The four files of the analysis screenshot, plus the brief. */
export function defaultFiles(): TaskAttachment[] {
  return [
    { id: uuid(), task_id: TASK_ID, filename: 'Brief - AI adoption figures.pdf', data: PDF, uploaded_by: ME.id, uploaded_at: ago(5760), size_bytes: 225_280, content_type: 'application/pdf' },
    { id: uuid(), task_id: TASK_ID, filename: 'The Structural Gap - Post v1.png', data: poster(1), uploaded_by: YE.id, uploaded_at: ago(4320), size_bytes: 1_258_291, content_type: 'image/png' },
    { id: uuid(), task_id: TASK_ID, filename: 'AI Adoption Gap - Post v2.png', data: poster(2), uploaded_by: YE.id, uploaded_at: ago(1500), size_bytes: 1_468_006, content_type: 'image/png' },
    { id: uuid(), task_id: TASK_ID, filename: 'Forefront Consulting - AI Gap Post v3 FINAL.png', data: poster(3), uploaded_by: YE.id, uploaded_at: ago(120), size_bytes: 1_363_148, content_type: 'image/png' },
  ]
}

/** 15 files: the four above plus eleven older ones of mixed kinds. */
export function manyFiles(): TaskAttachment[] {
  const extra: [string, string][] = [
    ['Script - CEO guide v2.docx', OCTET], ['Media plan Q4.xlsx', OCTET], ['Brand pack.zip', OCTET],
    ['Subtitles EN.srt', OCTET], ['Hook ideas.png', ''], ['Old brief - v0.pdf', PDF],
    ['Reference - competitor post.png', ''], ['Mood board.png', ''], ['Notes.txt', OCTET],
    ['Cover draft.png', ''], ['Interview raw - CEO.mp4', OCTET],
  ]
  return [
    ...defaultFiles(),
    ...extra.map(([filename, data], i) => ({
      id: uuid(), task_id: TASK_ID, filename, data: data || poster(((i % 3) + 1) as 1 | 2 | 3),
      uploaded_by: i % 2 ? YE.id : ME.id, uploaded_at: ago(6000 + i * 300), size_bytes: 100_000 + i * 1000, content_type: null,
    })),
  ]
}
