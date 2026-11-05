/**
 * Files shown as chips on a comment (spec 007 FR-073, FR-074; research R10;
 * contracts/server.md §4).
 *
 * The reference lives inside the comment's own text as
 *
 *   [📎 <file name>](attachment:<attachment uuid>)
 *
 * so no table or column is needed, and anywhere the body is shown raw it still
 * reads as a file name. A "]" in the name becomes ")" and a line break a space,
 * so the token always parses back.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const TOKEN_RE = new RegExp(`\\[📎 ([^\\]\\n]+)\\]\\(attachment:(${UUID})\\)`, 'gi')

export type FileToken = { start: number; end: number; name: string; id: string }

export function formatFileToken(name: string, id: string): string {
  const safe = name.replace(/\]/g, ')').replace(/[\r\n]+/g, ' ').trim() || 'file'
  return `[📎 ${safe}](attachment:${id})`
}

export function parseFileTokens(body: string): FileToken[] {
  const out: FileToken[] = []
  for (const m of body.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0
    out.push({ start, end: start + m[0].length, name: m[1], id: m[2].toLowerCase() })
  }
  return out
}

/** The comment text with file tokens taken out, for checks such as "is there any text?". */
export function withoutFileTokens(body: string): string {
  return body.replace(TOKEN_RE, '').trim()
}
