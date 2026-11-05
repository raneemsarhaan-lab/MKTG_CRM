// Pure checks for the attachments helpers (spec 007 T008), run in Node before
// the browser scenarios. Imports the bundle build.sh writes to out/pure.mjs.
export async function runPure(bundle) {
  const h = await import(bundle)
  const results = []
  const check = (id, fn) => {
    try { fn(); results.push({ id, ok: true }) } catch (e) { results.push({ id, ok: false, error: e.message }) }
  }
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }

  check('pure-splitName', () => {
    eq(h.splitName('AI Adoption Gap - Post v2.png'), { head: 'AI Adoption ', tail: 'Gap - Post v2.png' }, 'tail starts at a word')
    const long = h.splitName('Forefront Consulting - AI Gap Post v3 FINAL.png')
    eq(long.tail, 'Post v3 FINAL.png', 'the ending is kept whole')
    eq(long.head + long.tail, 'Forefront Consulting - AI Gap Post v3 FINAL.png', 'nothing lost')
    eq(h.splitName('Brief - AI figures.pdf'), { whole: 'Brief - AI figures.pdf' }, 'short names are whole')
    eq(h.splitName('123456789012345678901234'), { whole: '123456789012345678901234' }, '24 characters is still whole')
    const arabic = h.splitName('منشور فجوة الذكاء الاصطناعي - النسخة النهائية.png')
    if (!('tail' in arabic) || !arabic.tail.endsWith('.png')) throw new Error('Arabic name keeps its ending')
  })
  check('pure-names', () => {
    eq(h.nextFreeName('post v2.png', ['post v2.png']), 'post v2 (2).png', 'first free')
    eq(h.nextFreeName('post v2.png', ['POST V2 (2).PNG', 'post v2.png']), 'post v2 (3).png', 'ignores capitals')
    eq(h.sameName(' Post.PNG ', 'post.png'), true, 'same name ignoring capitals and spaces')
    eq(h.renamedTo('New name', 'old.png'), 'New name.png', 'keeps the extension')
    eq(h.renamedTo('New name.png', 'old.png'), 'New name.png', 'never doubles it')
    eq(h.renamedTo('   ', 'old.png'), null, 'empty keeps the old name')
    eq(h.renamedTo('old', 'old.png'), null, 'unchanged is no rename')
    eq(h.screenshotName(new Date(2026, 10, 4, 9, 5)), 'Screenshot 09.05.png', 'screenshot name')
    eq(h.isGenericClipboardName('image.png'), true, 'clipboard name')
    eq(h.isGenericClipboardName('cover.png'), false, 'a real name')
  })
  check('pure-order', () => {
    const rows = [
      { id: 'a', filename: 'v1.png', uploaded_at: '2026-11-01T10:00:00Z' },
      { id: 'b', filename: 'brief.pdf', uploaded_at: '2026-11-04T10:00:00Z' },
      { id: 'c', filename: 'v2.png', uploaded_at: '2026-11-03T10:00:00Z' },
      { id: 'd', filename: 'v2b.png', uploaded_at: '2026-11-03T10:00:00Z' },
    ]
    eq(h.newestFirst(rows).map(r => r.id), ['b', 'c', 'd', 'a'], 'newest first, ties by id')
    eq(h.latestImageId(rows), 'c', 'a newer PDF never takes Latest')
    const now = new Date('2026-11-04T12:00:00Z')
    eq(h.ageLabel('2026-11-04T11:59:50Z', now), { key: 'justNow' }, 'just now')
    eq(h.ageLabel('2026-11-04T10:00:00Z', now), { key: 'hoursAgo', n: 2 }, '2h')
    eq(h.ageLabel('2026-11-03T10:00:00Z', now), { key: 'yesterday' }, 'yesterday')
    eq(h.ageLabel('2026-11-01T10:00:00Z', now), { key: 'daysAgo', n: 3 }, '3d')
  })
  check('pure-limits', () => {
    eq(h.limitFor(true), 200 * 1024 * 1024, '200 MB with storage')
    eq(h.limitFor(false), h.MAX_INLINE_BYTES, 'inline limit without')
    if (h.MAX_INLINE_BYTES < 5_000_000 || h.MAX_INLINE_BYTES > 5_400_000) throw new Error('inline limit is about 5 MB')
    eq(h.limitLabelKey(false), 'limitInline', 'never printed as 5.2 MB')
    eq(h.formatBytes(225_280), '220 KB', 'KB')
    eq(h.formatBytes(13_002_342), '12.4 MB', 'MB with one decimal')
  })
  check('pure-comment-token', () => {
    const id = '0d9f7c1e-1111-4222-8333-444455556666'
    for (const name of ['v3 FINAL.png', 'a]b.png', '🎉 launch.png', 'منشور نهائي.png']) {
      const body = `Looks good\n${h.formatFileToken(name, id)}`
      const [tk] = h.parseFileTokens(body)
      eq(tk.id, id, `id for ${name}`)
      eq(tk.name, name.replace(/\]/g, ')'), `name for ${name}`)
      eq(h.withoutFileTokens(body), 'Looks good', 'text without tokens')
    }
    eq(h.parseFileTokens('[📎 x](attachment:not-a-uuid)').length, 0, 'only real ids')
  })
  // Constitution §I: no colour literals in the new UI code (T042).
  const fs = await import('node:fs'), path = await import('node:path')
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
  check('tokens-only', () => {
    const dir = path.join(root, 'src/components/kanban/attachments')
    const files = [...fs.readdirSync(dir).map(f => path.join(dir, f)), path.join(root, 'src/components/shared/PendingDeleteMessage.tsx')]
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      const hit = text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
      if (hit) throw new Error(`${path.relative(root, f)}: colour literal "${hit[0]}"`)
    }
  })
  // Every attachments string exists in Arabic, translated (T041).
  check('messages-parity', () => {
    const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8')).attachments
    const ar = JSON.parse(fs.readFileSync(path.join(root, 'messages/ar.json'), 'utf8')).attachments
    eq(Object.keys(ar), Object.keys(en), 'the same keys in the same order')
    const same = Object.keys(en).filter(k => en[k] === ar[k])
    eq(same, [], 'no English left in Arabic')
    const latin = Object.entries(ar).filter(([, v]) => /[A-Za-z]{4,}/.test(v.replace(/\{[^}]*\}/g, '').replace(/plural|one|two|few|many|other/g, '')))
    eq(latin.map(([k]) => k), [], 'no English words in Arabic strings')
  })
  return results
}
