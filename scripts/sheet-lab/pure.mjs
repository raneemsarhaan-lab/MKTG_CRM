// Pure checks for the sheet's helpers, run in Node before the browser scenarios.
export async function runPure(bundle) {
  const h = await import(bundle)
  const results = []
  const check = (id, fn) => { try { fn(); results.push({ id, ok: true }) } catch (e) { results.push({ id, ok: false, error: e.message }) } }
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
  check('pure-smoke', () => eq(h.parseClipFileName('04_IMG_0293_2m20.2s-3m49.0s.mp4')?.clip_no, 4, 'clip number'))
  return results
}
