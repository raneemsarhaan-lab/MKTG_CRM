// Pure checks for the sheet's helpers (spec 008 T014, T020, T040, T042), run in
// Node before the browser scenarios. Imports the bundle build.sh writes to
// out/pure.mjs; `root` is the repository, for the file checks.
import fs from 'node:fs'
import path from 'node:path'

export async function runPure(bundle, root) {
  const h = await import(bundle)
  const results = []
  const check = (id, fn) => { try { fn(); results.push({ id, ok: true }) } catch (e) { results.push({ id, ok: false, error: e.message }) } }
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }

  check('pure-file-names', () => {
    for (const f of h.FILE_NAMES) {
      const p = h.parseClipFileName(f)
      if (!p) throw new Error(`not read: ${f}`)
      if (!(p.out_ms > p.in_ms)) throw new Error(`out before in: ${f}`)
    }
    eq(h.parseClipFileName('04_IMG_0293_2m20.2s-3m49.0s.mp4'), { clip_no: 4, source: 'IMG_0293', in_ms: 140200, out_ms: 229000 }, 'clip 4')
    eq(h.parseClipFileName('30_IMG_0296_6m12.4s-7m20.9s.mp4'), { clip_no: 30, source: 'IMG_0296', in_ms: 372400, out_ms: 440900 }, 'clip 30')
    eq(h.parseClipFileName('7_Cam A_take 2_0m05s-1m00s.MOV'), { clip_no: 7, source: 'Cam A_take 2', in_ms: 5000, out_ms: 60000 }, 'spaces, underscores, capitals')
    eq(h.parseClipFileName('05_IMG_0293_5m06.8s-3m56.1s.mp4'), null, 'out before in is not a clip')
    eq(h.parseClipFileName('05_IMG_0293_3m56.1s-5m06.8s.avi'), null, 'other extensions are not clips')
    eq(h.parseClipFileName('Keeping Strategy on Track'), null, 'a title is not a file name')
    eq(h.fileNameKey(' 04_IMG.MP4 '), '04_img.mp4', 'compared ignoring case and spaces')
  })

  check('pure-allowed-stages', () => {
    // The rule setTaskStage had inline before spec 008, kept here to prove nothing changed.
    const old = (task, member, to) => {
      const path = task.nine_stage ? h.NINE_STAGE : h.EIGHT_STAGE
      if (!path.includes(to) || to === task.status) return false
      const meta = h.STAGE_META[task.status]
      const own = !meta.owner_role ? task.assignee_id === member.id || task.task_owner_id === member.id : meta.owner_role === member.role
      return own || member.access === 'admin' || member.access === 'superuser'
    }
    const stages = Object.keys(h.STAGE_META)
    let n = 0
    for (const nine of [false, true]) {
      const path = nine ? h.NINE_STAGE : h.EIGHT_STAGE
      for (const status of path) {
        for (const member of h.MEMBERS) {
          for (const assignee of [null, 'lina', member.id]) {
            for (const dropped of [null, '2026-11-01T00:00:00Z']) {
              const task = { status, nine_stage: nine, task_owner_id: 'sara', assignee_id: assignee, dropped_at: dropped }
              const got = h.allowedStages(task, member)
              for (const to of stages) {
                n++
                const want = !dropped && old(task, member, to)
                if (got.includes(to) !== want) throw new Error(`${member.id} ${status}→${to} nine=${nine} assignee=${assignee} dropped=${!!dropped}: ${!want}`)
              }
            }
          }
        }
      }
    }
    if (n < 5000) throw new Error(`only ${n} combinations`)
  })

  check('pure-time', () => {
    eq(h.formatClipTime(140200), '2:20.2', 'm:ss.s')
    eq(h.formatClipTime(5000), '0:05.0', 'pads seconds')
    eq(h.formatClipTime(null), '', 'blank')
    eq(h.formatClipTime(59999), '1:00.0', 'rounds up a minute')
    eq(h.parseClipTime('2:20.2'), 140200, 'm:ss.s')
    eq(h.parseClipTime('02:20'), 140000, 'mm:ss')
    eq(h.parseClipTime('2m20.2s'), 140200, 'XmY.Ys')
    eq(h.parseClipTime('140.2'), 140200, 'seconds')
    eq(h.parseClipTime('1:02:03'), 3723000, 'hours')
    eq(h.parseClipTime('2,5'), 2500, 'decimal comma')
    eq(h.parseClipTime(''), undefined, 'empty clears')
    eq(h.parseClipTime('soon'), null, 'unreadable')
    eq(h.parseClipTime('2:75'), null, 'seconds over 59')
    eq(h.formatLength(940000), '15m 40s', 'summary length')
    eq(h.formatLength(3900000), '1h 05m', 'over an hour')
    eq(h.clipLength(1000, 500), null, 'no negative lengths')
  })

  check('pure-rows', () => {
    const tasks = h.makeTasks()
    const rows = h.buildRows(tasks, { videoId: 'v1', mine: false, showDropped: true, me: 'raneem', collapsed: new Set(), drafts: [] })
    eq(rows[0].key, 'v:v1', 'video first')
    const clips = rows.filter(r => r.kind === 'clip')
    eq(clips.length, 14, 'every child of the video, with or without details')
    const nos = clips.map(r => r.task.clip?.clip_no ?? null)
    eq(nos, [4, 5, 8, 9, 11, 12, 13, 13, 14, 18, 22, 23, 28, null], 'clip order, repeats by when added, no number last')
    eq(clips[6].task.id, 'c07', 'the first 13 before its re-cut')
    eq(rows.at(-1).kind, 'add', '+ Clip ends the group')
    eq(rows.map(r => r.n).filter(Boolean), Array.from({ length: 15 }, (_, i) => i + 1), 'row numbers')
    const noDropped = h.buildRows(tasks, { videoId: 'v1', mine: false, showDropped: false, me: 'raneem', collapsed: new Set(), drafts: [] })
    eq(noDropped.filter(r => r.kind === 'clip').length, 13, 'Show dropped off hides the dropped clip')
    const mine = h.buildRows(tasks, { videoId: 'v1', mine: true, showDropped: true, me: 'lina', collapsed: new Set(), drafts: [] })
    eq(mine[0].kind, 'video', 'the video row stays with Mine')
    eq(mine.filter(r => r.kind === 'clip').map(r => r.task.id), ['c01', 'c02', 'c05', 'c07'], "Mine: Lina's clips")
    const collapsed = h.buildRows(tasks, { videoId: 'v1', mine: false, showDropped: true, me: 'raneem', collapsed: new Set(['v1']), drafts: [] })
    eq(collapsed.map(r => r.kind), ['video'], 'collapsed shows the video row only')
    const all = h.videosWithClips(tasks)
    eq(all.map(g => g.video.id), ['v1', 'v2'], 'videos with clips, most recently worked on first; none without clips')
  })

  check('pure-summary', () => {
    const tasks = h.makeTasks()
    const s = h.summarise(h.clipsOf(tasks, 'v1'))
    // Counted by hand from fixtures.ts: 14 children, 1 dropped.
    eq(s.clips, 13, 'clips (dropped excluded)')
    eq(s.dropped, 1, 'dropped')
    eq(s.published, 3, 'published')
    eq(s.noLink, 1, 'published without a link')
    eq(s.editing, 5, 'r-design, d-prog ×2, d-check, final-check')
    const total = h.clipsOf(tasks, 'v1').filter(c => !c.dropped_at && c.clip).reduce((a, c) => a + (c.clip.out_ms - c.clip.in_ms), 0)
    eq(s.totalMs, total, 'total length')
  })

  check('pure-paste', () => {
    const text = [
      '30_IMG_0296_6m12.4s-7m20.9s.mp4\tStrategy Is a Daily Habit\thttps://drive.google.com/file/d/x',
      '04_IMG_0293_2m20.2s-3m49.0s.mp4\tKeeping Strategy on Track\thttps://drive.google.com/file/d/y',
      'Q&A highlight\tWhat leaders ask first\thttps://drive.google.com/file/d/z',
      '\t\t',
      '30_img_0296_6m12.4s-7m20.9s.MP4\tSame clip again\t',
    ].join('\n')
    const p = h.parseClipRows(h.cellsFromText(text), h.FILE_NAMES)
    eq(p.fresh.map(c => c.clip_no), [30], 'one new')
    eq(p.fresh[0].title, 'Strategy Is a Daily Habit', 'title is the longest other text cell')
    eq(p.fresh[0].link, 'https://drive.google.com/file/d/x', 'the row link')
    eq(p.existing.length, 2, 'already in the sheet, and repeated within the paste (any case)')
    eq(p.unmatched.length, 1, 'one without a clip file name')
    eq(p.unmatched[0].title, 'What leaders ask first', 'unmatched keeps its longest text as the title')
    eq(h.looksLikeRows(h.cellsFromText('https://drive.google.com/x')), false, 'a single link is not rows')
    eq(h.looksLikeRows(h.cellsFromText('04_IMG_0293_2m20.2s-3m49.0s.mp4')), true, 'a single file name is a row')
    const many = Array.from({ length: 210 }, (_, i) => `${String(i).padStart(3, '0')}_S_0m01.0s-0m02.0s.mp4\tT${i}`).join('\n')
    const big = h.parseClipRows(h.cellsFromText(many), [])
    eq([big.fresh.length, big.overflow], [h.MAX_PASTE_ROWS, 10], '200 at a time')
  })

  check('pure-column-sets', () => {
    const want = { raneem: 'full', yosra: 'full', mona: 'full', lina: 'editing', omar: 'editing', hadi: 'editing', sara: 'copy' }
    for (const m of h.MEMBERS) eq(h.defaultColumnSet(m.role), want[m.id], m.role)
    eq(h.defaultColumnSet('Copywriter'), 'copy', 'writer roles')
    eq(h.defaultColumnSet('Graphic Designer'), 'editing', 'design roles')
    eq(h.COLUMN_SETS.copy, ['title', 'clipNo', 'type', 'status', 'editor', 'published'], 'Copy set (FR-050)')
    eq(h.COLUMN_SETS.editing, ['title', 'clipNo', 'status', 'editor', 'source', 'fileName', 'in', 'out', 'length', 'files'], 'Editing set (FR-050)')
  })

  check('pure-business-days', () => {
    for (let wd = 0; wd < 7; wd++) {
      const d = new Date(2026, 10, 2 + wd)   // Mon 2 Nov 2026 + wd
      for (let n = 0; n <= 15; n++) {
        const from = h.subtractBusinessDays(d, n)
        const got = h.businessDaysBetween(from, d)
        if (got !== n) throw new Error(`${d.toDateString()} − ${n}: got ${got}`)
      }
    }
  })

  check('tokens-only', () => {
    const dir = path.join(root, 'src/components/sheet')
    const bad = []
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)) bad.push(`${f}: ${m[0]}`)
    }
    if (bad.length) throw new Error(bad.slice(0, 5).join(', '))
  })

  check('messages-parity', () => {
    const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8')).sheet
    const ar = JSON.parse(fs.readFileSync(path.join(root, 'messages/ar.json'), 'utf8')).sheet
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
    const E = Object.fromEntries(flat(en)), A = Object.fromEntries(flat(ar))
    const missing = Object.keys(E).filter(k => !(k in A)), extra = Object.keys(A).filter(k => !(k in E))
    if (missing.length || extra.length) throw new Error(`missing in ar: ${missing.join(', ')}; only in ar: ${extra.join(', ')}`)
    const same = ['stageTitle', 'files.drive', 'paste.fileHint', 'col.clipNo']
    const untranslated = Object.keys(E).filter(k => E[k] === A[k] && !same.includes(k))
    if (untranslated.length) throw new Error(`untranslated: ${untranslated.join(', ')}`)
    const stages = Object.keys(h.STAGE_META)
    for (const s of stages) if (!E[`stage.${s}`]) throw new Error(`no video name for ${s}`)
  })

  return results
}
