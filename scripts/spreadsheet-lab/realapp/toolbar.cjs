/**
 * Spec 018: where a toolbar control lives now. Tools that moved from the strip
 * into the menu bar open through it; the rest are still `[data-fmt="key"]`.
 *   await tool(page, 'clear')   // Edit › Clear ▸ → [data-clear-menu]
 */
const MOVED = {
  paste: ['edit', 'pasteSpecial'], clear: ['edit', 'clear'], fillDn: ['edit', null], freeze: ['view', 'freeze'], fmt: ['view', null],
  cellStyles: ['format', 'cellStyles'], table: ['format', 'table'], cond: ['format', 'cond'], fmtCells: ['format', 'fmtCells'], sort: ['data', null],
}
async function tool(page, key) {
  if (key === 'center' || key === 'left' || key === 'right') { await page.click('[data-fmt="align"]'); await page.click(`[data-align-menu] [data-item="${key}"]`); return }
  const m = MOVED[key]
  if (!m) { await page.click(`[data-fmt="${key}"]`); return }
  await page.click(`[data-mb="${m[0]}"]`)
  if (m[1]) await page.click(`[data-mb-${m[0]}] [data-item="${m[1]}"]`)
}
module.exports = { tool }
