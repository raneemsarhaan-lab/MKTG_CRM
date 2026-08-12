/**
 * Turning a pasted list into task names.
 *
 * People write their lists somewhere else — a Claude reply, Apple Notes, a
 * message — and then want them in the tool. What arrives on the clipboard is
 * never a clean list of names: it is bullets, numbers, checkboxes, markdown
 * bold, and blank lines between sections.
 *
 * This strips the decoration and keeps the words. It deliberately does not try
 * to be clever about which lines are "really" tasks — a heading like
 * "Week 1:" comes through as a line the person can delete, because guessing
 * wrong and silently dropping a task is much worse than showing one too many.
 *
 * Pure, and no React or Prisma, so the same parse runs in the paste handler
 * and in any test.
 */

/** Markers a list item can start with, stripped in this order. */
const HEADING  = /^#{1,6}\s+/
const BULLET   = /^[-*+•·‣▪◦–—]\s+/
const NUMBER   = /^\d+\s*[.)\]]\s+/
const CHECKBOX = /^\[[ xX✓]?\]\s*/
const BOX_CHAR = /^[☐☑☒✅✔✗✘]\s*/

/**
 * A paste of more than this many lines is almost certainly not a task list —
 * a whole document, or the wrong thing on the clipboard. Better to cap it and
 * say so than to create four hundred tasks nobody asked for.
 */
export const MAX_PASTED = 200

export interface ParsedList {
  names: string[]
  /** Lines found beyond MAX_PASTED, so the UI can say what it left out. */
  dropped: number
}

/** Strip one line's list decoration. Returns '' for a line that was only decoration. */
export function cleanLine(raw: string): string {
  let s = raw.replace(/ /g, ' ').trim()
  if (!s) return ''

  s = s.replace(HEADING, '')
  // A bullet can carry a checkbox: "- [ ] Write the copy".
  s = s.replace(BULLET, '').replace(NUMBER, '')
  s = s.replace(CHECKBOX, '').replace(BOX_CHAR, '')
  s = s.trim()

  // Markdown emphasis, but only when it wraps the whole line — "**Write the
  // copy**" is a heading someone bolded, while "Write the **hero** copy" is a
  // name with emphasis inside it and must keep its asterisks rather than lose
  // a word boundary.
  const wrapped = /^(\*\*|__|\*|_)([\s\S]+)\1$/.exec(s)
  if (wrapped) s = wrapped[2].trim()

  // A trailing colon is how headings are written; the words before it are
  // still the best name we have, so keep them and drop the punctuation.
  s = s.replace(/\s*:\s*$/, '').trim()

  // Nothing but punctuation left is not a name. This catches a bare bullet
  // with no text after it, and — the case that actually bites — the `---`,
  // `***` and `===` rules that a pasted Claude reply is full of. Without it,
  // every horizontal rule in the paste becomes a task called "---".
  if (!/[\p{L}\p{N}]/u.test(s)) return ''

  return s
}

/**
 * Parse pasted text into task names.
 *
 * Duplicates are kept. A list that genuinely repeats a name is rare, and
 * removing one silently is the kind of "help" that loses work — the caller
 * shows every line and lets a person delete what they do not want.
 */
export function parsePastedList(text: string): ParsedList {
  const lines = text.split(/\r\n|\r|\n/)
  const names: string[] = []
  let dropped = 0

  for (const line of lines) {
    const name = cleanLine(line)
    if (!name) continue
    if (names.length >= MAX_PASTED) { dropped++; continue }
    names.push(name)
  }

  return { names, dropped }
}

/**
 * Does this clipboard text hold a list, rather than one name?
 *
 * Two or more usable lines. A single line with a trailing newline is still one
 * task, and pasting a name into a name field must keep behaving exactly as it
 * always has.
 */
export function looksLikeList(text: string): boolean {
  return parsePastedList(text).names.length > 1
}
