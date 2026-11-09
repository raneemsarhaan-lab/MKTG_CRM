/**
 * Who a brief names (spec 012 R11): every member whose "@Name" is in the
 * text, followed by a space, punctuation or the end. The server keeps the
 * list and notifies only people newly added to it.
 */
export function mentionedIn(text: string, members: { id: string; name: string }[]): string[] {
  // Longest names first, so "@Sam Lee" isn't also read as "@Sam".
  const sorted = [...members].filter(m => m.name.trim()).sort((a, b) => b.name.length - a.name.length)
  let rest = text
  const ids: string[] = []
  for (const m of sorted) {
    const esc = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`@${esc}(?![\\p{L}\\p{N}_])`, 'gu')
    if (re.test(rest)) { ids.push(m.id); rest = rest.replace(re, ' ') }
  }
  return ids
}
