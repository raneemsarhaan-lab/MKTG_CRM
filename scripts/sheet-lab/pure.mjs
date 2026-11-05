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

  // ── spec 010: sheet columns ─────────────────────────────────────────────
  const C = h.cols
  check('cols-layout', () => {
    const def = C.applyLayout('content', [], 'all')
    eq(def.map(c => c.key), C.BUILT_INS.content.map(b => b.key), 'no records: built-in defaults')
    eq(def.every(c => c.shown), true, 'all shown on the Content sheet')
    const vid = C.applyLayout('video', [], 'copy')
    eq(vid.filter(c => c.shown).map(c => c.key), ['title', 'clipNo', 'type', 'status', 'editor', 'published'], 'Copy set defaults')
    const fx = h.columnFixtures()
    const laid = C.applyLayout('content', fx.records, 'all')
    eq(laid[0].key, 'title', 'Title first')
    eq(laid.find(c => c.key === 'pillar').shown, false, 'a hidden built-in')
    eq(laid.find(c => c.key === 'status').name, 'Copy status', 'a renamed built-in')
    eq(laid.find(c => c.key === 'c:platform').kind, 'choice', 'a custom column')
    // A built-in added to the code later lands after its default predecessor.
    const missing = fx.records.filter(r => !(r.sheet === 'content' && r.key === 'design'))
    const l2 = C.applyLayout('content', missing, 'all').map(c => c.key)
    eq(l2.indexOf('design'), l2.indexOf('doc') + 1, 'new built-in slotted after its predecessor')
    // Only custom records: built-ins keep their default order first.
    const only = [{ ...fx.records.find(r => r.key === 'c:hook'), position: 0 }]
    const l3 = C.applyLayout('content', only, 'all').map(c => c.key)
    eq(l3.slice(0, 2), ['title', 'type'], 'built-ins first')
    eq(l3.at(-1), 'c:hook', 'custom after')
    const v = C.applyLayout('video', fx.records, 'copy')
    eq(v.find(c => c.key === 'c:music').shown, false, 'custom hidden in Copy')
    eq(C.applyLayout('video', fx.records, 'editing').find(c => c.key === 'c:music').shown, true, 'shown in Editing')
  })
  check('cols-ops', () => {
    const who = { id: 'samaa', name: 'Samaa' }
    let r = C.applyOp('content', [], { op: 'rename', key: 'status', name: 'Stage' }, who)
    eq(r.filter(x => x.sheet === 'content').length, C.BUILT_INS.content.length, 'first change writes every built-in')
    eq(C.applyLayout('content', r, 'all').find(c => c.key === 'status').name, 'Stage', 'renamed')
    r = C.applyOp('content', r, { op: 'move', key: 'assignee', before: 'type' }, who)
    eq(C.applyLayout('content', r, 'all').map(c => c.key).slice(0, 3), ['title', 'assignee', 'type'], 'moved')
    eq(C.applyOp('content', r, { op: 'move', key: 'type', before: 'title' }, who), r, 'nothing before Title')
    r = C.applyOp('video', [], { op: 'shown', key: 'source', set: 'editing', shown: false }, who)
    eq(C.applyLayout('video', r, 'editing').find(c => c.key === 'source').shown, false, 'hidden in Editing')
    eq(C.applyLayout('video', r, 'full').find(c => c.key === 'source').shown, true, 'still in Full')
    r = C.applyOp('content', r, { op: 'width', key: 'type', width: 9999 }, who)
    eq(C.applyLayout('content', r, 'all').find(c => c.key === 'type').width, 600, 'width clamped')
  })
  check('cols-parse', () => {
    const m = [{ id: 'samaa', name: 'Samaa Ali' }, { id: 'noran', name: 'Noran' }]
    const o = [{ id: 'li', name: 'LinkedIn', color: '#1D4ED8' }]
    eq(C.parseValue('number', '1,240'), { ok: true, value: '1240' }, 'number')
    eq(C.parseValue('number', 'abc'), { ok: false, code: 'number' }, 'not a number')
    eq(C.parseValue('date', '20/11/2026'), { ok: true, value: '2026-11-20' }, 'DD/MM/YYYY')
    eq(C.parseValue('date', '2026-02-30'), { ok: false, code: 'date' }, 'no 30 February')
    eq(C.parseValue('link', 'docs.google.com/x'), { ok: false, code: 'link' }, 'a link needs https')
    eq(C.parseValue('person', 'samaa', { members: m }), { ok: true, value: 'samaa' }, 'person by first name')
    eq(C.parseValue('choice', 'linkedin', { options: o }), { ok: true, value: 'li' }, 'choice by name, any case')
    eq(C.parseValue('checkbox', 'Yes'), { ok: true, value: '1' }, 'yes')
    eq(C.parseValue('checkbox', 'no'), { ok: true, value: '' }, 'no clears')
    eq(C.parseValue('text', ''), { ok: true, value: '' }, 'empty clears')
    const conv = C.convertValues('text', 'number', { a: '12', b: 'twelve' }, {}, {})
    eq([conv.kept, conv.cleared], [{ a: '12' }, ['b']], 'kind change keeps what fits')
  })
  check('cols-names', () => {
    const others = [['Copy status', 'Status'], ['Hook']]
    eq(C.checkName('  ', others), 'empty', 'empty')
    eq(C.checkName('x'.repeat(41), others), 'long', 'too long')
    eq(C.checkName('status', others), 'taken', 'a default name stays its column’s')
    eq(C.checkName('hook ', others), 'taken', 'case and spaces ignored')
    eq(C.checkName('Angle', others), null, 'free')
    eq(C.headingKey('copy  status', [{ key: 'status', names: ['Copy status', 'Status'] }]), 'status', 'paste heading by current name')
    eq(C.cleanOptions([{ name: 'A' }, { name: 'a' }, { name: '' }], () => 'id').length, 1, 'options unique and named')
  })

  check('tokens-only', () => {
    const bad = []
    for (const d of ['src/components/sheet', 'src/components/content']) {
      const dir = path.join(root, d)
      for (const f of fs.readdirSync(dir)) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
        for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)) bad.push(`${f}: ${m[0]}`)
      }
    }
    if (bad.length) throw new Error(bad.slice(0, 5).join(', '))
  })

  check('messages-parity', () => {
    for (const ns of ['sheet', 'content']) {
    const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8'))[ns]
    const ar = JSON.parse(fs.readFileSync(path.join(root, 'messages/ar.json'), 'utf8'))[ns]
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
    const E = Object.fromEntries(flat(en)), A = Object.fromEntries(flat(ar))
    const missing = Object.keys(E).filter(k => !(k in A)), extra = Object.keys(A).filter(k => !(k in E))
    if (missing.length || extra.length) throw new Error(`missing in ar: ${missing.join(', ')}; only in ar: ${extra.join(', ')}`)
    const same = ['stageTitle', 'files.drive', 'paste.fileHint', 'col.clipNo']
    const untranslated = Object.keys(E).filter(k => E[k] === A[k] && !same.includes(k))
    if (untranslated.length) throw new Error(`${ns} untranslated: ${untranslated.join(', ')}`)
    const stages = Object.keys(h.STAGE_META)
    for (const s of stages) if (!E[`stage.${s}`]) throw new Error(`${ns}: no stage name for ${s}`)
    }
  })


  // ── Content sheet (spec 009) ─────────────────────────────────────────────
  check('content-readers', () => {
    eq(h.readStatus('Initial Design'), { stage: 'd-prog', archived: false }, 'Initial Design')
    eq(h.readStatus(' final design '), { stage: 'd-check', archived: false }, 'Final Design, any case')
    eq(h.readStatus('Ready to publish'), { stage: 'ready-publish', archived: false }, 'Ready to Publish')
    eq(h.readStatus('D-Check'), { stage: 'd-check', archived: false }, 'real stage name')
    eq(h.readStatus('Editing'), { stage: 'd-prog', archived: false }, 'video name')
    eq(h.readStatus(''), { stage: 'todo', archived: false }, 'blank is To Do')
    eq(h.readStatus('Archived'), { stage: 'todo', archived: true }, 'Archived')
    eq(h.readStatus('Waiting on legal'), null, 'unknown')
    eq(h.readType('Social Media'), 'Post', 'Social Media is a Post')
    eq(h.readType('Framework/Model'), 'Framework/Model', 'framework')
    eq(h.readType('report'), 'Report', 'report')
    eq(h.readType('Podcast'), 'Other', 'unknown type')
    eq(h.readFrequency('2 per week'), { count: 2, period: 'week' }, '2 per week')
    eq(h.readFrequency('1/month'), { count: 1, period: 'month' }, '1/month')
    eq(h.readFrequency('often'), null, 'unreadable')
    eq(h.readAudience('C-Level of large companies, Strategy Heads, Top Management "Heads, Directors.."'), ['c-level', 'strategy-heads', 'top-management'], 'audience')
    eq(h.readAudience('Strategy Heads, Top Management, 2nd Line manager, CEO Med Size companies'), ['strategy-heads', 'top-management', 'second-line', 'ceo-mid'], 'audience 2')
    eq(h.taskIdFromLink('https://mktg-crm-ef1r6x.cranl.net/board?task=3BE798DC-ba7a-4742-a1df-d48722c2b039'), '3be798dc-ba7a-4742-a1df-d48722c2b039', 'task link')
    eq(h.taskIdFromLink('AI Pillar Funnel'), null, 'not a task link')
    eq(h.isWebLink('Link error'), false, 'Link error is not a link')
    eq(h.isWebLink('Egypt Businesses Face Prolonged Uncertainty | Forefront'), false, 'a post title is not a link')
    eq(h.isWebLink('https://www.linkedin.com/posts/x'), true, 'a link')
    eq(h.siteName('https://docs.google.com/document/d/1'), 'Google Docs', 'site name')
  })
  check('content-parse-tsv', () => {
    const { rows } = h.readPlan(h.cellsFromText(h.referenceText()))
    eq(rows.length, 18, '18 pieces')
    eq(rows.filter(r => r.theme === 'Strategy').length, 8, 'Strategy carried down')
    eq([...new Set(rows.map(r => `${r.theme}|${r.owner}|${r.frequency?.count}/${r.frequency?.period}`))], ['Strategy|Samaa|2/week', 'Newsjacking|Noran|1/week'], 'owner and frequency carried down')
    eq(rows.filter(r => r.pillar === 'AI').length, 6, 'pillar AI carried down')
    eq(rows.filter(r => r.pillar === 'Decision Making').length, 2, 'pillar Decision Making')
    eq(rows.filter(r => r.theme === 'Newsjacking' && r.pillar).length, 0, 'no pillar carried into the next theme')
    eq(rows.filter(r => r.taskId).length, 7, 'seven Task Links')
    eq(rows.find(r => r.title === 'iPhone 18 Report').status, { stage: 'todo', archived: true }, 'archived')
    eq(rows.find(r => r.title === 'Suez Canal Report').status.stage, 'd-check', 'Final Design')
    eq(rows.find(r => r.title === 'A CEO Guide to Say No').status.stage, 'todo', 'blank status')
    const fifa = rows.find(r => r.title === 'FIFA World Cup Movement Report')
    eq([fifa.links.published, fifa.badLinks.published], [null, 'Link error'], '"Link error" is never a link')
    const fed = rows.find(r => r.title === 'Federal Reserve Decision Report')
    eq(fed.links.post, null, 'a post title is never a link')
    eq(rows.filter(r => r.links.doc).length, 0, 'working-doc names are not links')
    eq(rows.find(r => r.title === 'AI Pillar Article').type, 'Article', 'type')
    eq(rows.find(r => r.title === 'AI Pillar SM Campaign - Post 2').type, 'Post', 'Social Media → Post')
  })
  check('content-classify', () => {
    const { rows } = h.readPlan(h.cellsFromText(h.referenceText()))
    const { tasks, themes } = h.makeContent()
    const admin = h.CONTENT_MEMBERS.find(m => m.id === 'raneem')
    const c = h.classifyPlan(rows, { tasks, themes, members: h.CONTENT_MEMBERS, me: admin })
    const count = k => c.filter(r => r.kind === k).length
    eq([count('fresh'), count('linked'), count('existing'), count('problem')], [11, 7, 0, 0], 'SC-001: 11 new, 7 matched')
    eq(c.filter(r => r.themeIsNew).map(r => r.theme).filter((v, i, a) => a.indexOf(v) === i), ['Newsjacking'], 'Newsjacking is new')
    eq(c.filter(r => r.problems.some(p => p.code === 'badLink')).length > 0, true, 'non-links are flagged')
    eq(c.filter(r => r.ownerId === 'samaa').length, 8, 'owner matched by name')
    const samaa = h.CONTENT_MEMBERS.find(m => m.id === 'samaa')
    const cs = h.classifyPlan(rows, { tasks, themes, members: h.CONTENT_MEMBERS, me: samaa })
    eq(cs.filter(r => r.theme === 'Newsjacking').every(r => r.kind === 'problem'), true, 'a user can\'t add a new theme')
    eq(cs.filter(r => r.theme === 'Strategy' && r.kind === 'problem').length, 0, 'but can add to the theme she owns')
  })
  check('content-cadence-summary', () => {
    const now = new Date(2026, 10, 4, 12)      // Wednesday 4 Nov 2026
    eq(h.periodStart('week', now).getDate(), 2, 'week starts Monday')
    eq(h.periodStart('month', now).getDate(), 1, 'month starts on the 1st')
    const th = { frequency_count: 2, frequency_period: 'week' }
    const p = (s, d, dropped = null) => ({ status: s, stage_date: d, dropped_at: dropped })
    eq(h.cadence(th, [p('publish', '2026-11-03'), p('publish', '2026-10-30'), p('d-prog', '2026-11-04')], now), { done: 1, target: 2, met: false, period: 'week' }, '1 of 2')
    eq(h.cadence(th, [p('publish', '2026-11-03'), p('publish', '2026-11-04')], now).met, true, '2 of 2 ✓')
    eq(h.cadence(th, [p('publish', '2026-11-03', 'x'), p('publish', '2026-11-04')], now).done, 1, 'archived pieces don\'t count')
    eq(h.cadence({ frequency_count: null, frequency_period: null }, [], now), null, 'no frequency')
    const s = h.summariseContent([{ status: 'publish', published_url: null }, { status: 'publish', published_url: 'x' }, { status: 'd-prog' }, { status: 'todo', dropped_at: 'x' }])
    eq(s, { pieces: 3, published: 2, design: 1, noLink: 1, archived: 1 }, 'summary')
    const { tasks, themes } = h.makeContent()
    eq(h.piecesOf(tasks, 'th-strategy').map(t => t.id).sort(), ['f51f43c9-069d-46af-95c0-04cba2f72efa', 'v1'], 'clips are not pieces')
  })
  return results
}
