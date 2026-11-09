/**
 * Sheet and folder names (spec 013 FR-051, FR-055–FR-058, FR-073). Pure.
 *
 * Sheet names follow Excel's rules so they survive a copy into Excel: 1–50
 * characters, none of \ / ? * [ ] :, and unique in the folder, ignoring case
 * and surrounding spaces.
 */

export const SHEET_NAME_MAX = 50
export const FOLDER_NAME_MAX = 60
export const FORBIDDEN = /[\\/?*[\]:]/

export type NameError = 'name_empty' | 'name_long' | 'name_chars' | 'name_taken'

const key = (s: string) => s.trim().toLowerCase()

/** A sheet name, checked against the folder's other names; ok with the cleaned name, or the reason. */
export function validateSheetName(raw: string, others: string[]): { ok: true; name: string } | { ok: false; error: NameError } {
  const name = raw.trim()
  if (!name) return { ok: false, error: 'name_empty' }
  if (name.length > SHEET_NAME_MAX) return { ok: false, error: 'name_long' }
  if (FORBIDDEN.test(name)) return { ok: false, error: 'name_chars' }
  if (others.some(o => key(o) === key(name))) return { ok: false, error: 'name_taken' }
  return { ok: true, name }
}

/** A folder name: 1–60 characters, unique among folders. */
export function validateFolderName(raw: string, others: string[]): { ok: true; name: string } | { ok: false; error: Exclude<NameError, 'name_chars'> } {
  const name = raw.trim()
  if (!name) return { ok: false, error: 'name_empty' }
  if (name.length > FOLDER_NAME_MAX) return { ok: false, error: 'name_long' }
  if (others.some(o => key(o) === key(name))) return { ok: false, error: 'name_taken' }
  return { ok: true, name }
}

/**
 * "Sheet N" with the lowest N not used (FR-051). `pattern` is the
 * translated name with {n}, e.g. "Sheet {n}" or "ورقة {n}".
 */
export function nextSheetName(existing: string[], pattern = 'Sheet {n}'): string {
  const used = new Set(existing.map(key))
  let n = 1
  while (used.has(key(pattern.replace('{n}', String(n))))) n++
  return pattern.replace('{n}', String(n))
}

/**
 * A copied or moved sheet's name at its destination (FR-058): the same name
 * when it's free, otherwise "<name> (2)", "(3)"…, cut so it stays within 50.
 */
export function uniqueName(name: string, existing: string[]): string {
  const used = new Set(existing.map(key))
  if (!used.has(key(name))) return name
  const base = name.replace(/\s\(\d+\)$/, '')
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const candidate = base.slice(0, SHEET_NAME_MAX - suffix.length) + suffix
    if (!used.has(key(candidate))) return candidate
  }
}
