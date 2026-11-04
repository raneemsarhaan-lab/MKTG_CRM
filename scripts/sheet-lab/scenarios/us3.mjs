// US3: anyone adds clips by pasting from Google Sheets (FR-030–FR-036, SC-001).
const DRIVE = 'https://drive.google.com/file/d/NEW/view'
const three = t => t.page.evaluate(d => window.__sheet.sheetsHtml([
  ['30_IMG_0296_6m12.4s-7m20.9s.mp4', 'Strategy Is a Daily Habit', d],
  ['04_IMG_0293_2m20.2s-3m49.0s.mp4', 'Keeping Strategy on Track', d],
  ['Q&amp;A highlight', 'What leaders ask first', d],
]), DRIVE)

async function pasteThree(t) {
  await t.focusCell('c:c05', 'title')
  await t.paste({ html: await three(t), text: 'x\ty' })
  await t.page.waitForSelector('[data-paste-preview]')
}

export const us3 = [
  {
    id: 'us3-1',
    hash: 'me=sara',   // "user" level, owns some clips but not the video
    async run(t) {
      await pasteThree(t)
      const row = await t.page.$$eval('[data-paste-new] tbody tr', rs => rs.map(r => [...r.cells].map(c => c.textContent.trim())))
      t.eq(row, [['30', 'Strategy Is a Daily Habit', 'IMG_0296', '6:12.4 → 7:20.9', '1:08.5', 'drive.google.com']], 'read from the file name, title and link')
    },
  },
  {
    id: 'us3-2',
    hash: 'me=sara',
    async run(t) {
      await pasteThree(t)
      t.eq((await t.page.locator('[data-paste-counts]').innerText()).trim(),
        '1 new · 1 already in the sheet · 1 without a clip file name', 'preview counts')
    },
  },
  {
    id: 'us3-3',
    hash: 'me=sara',
    async run(t) {
      await pasteThree(t)
      const rows = t.page.locator('[data-paste-unmatched] tbody tr')
      t.eq(await rows.count(), 1, 'the unmatched row is listed')
      t.assert((await rows.first().innerText()).includes('Q&A highlight'), 'with what was pasted')
      await rows.first().locator('input').nth(1).fill('31_IMG_0296_9m01.0s-10m15.2s.mp4')
      await t.idle()
      t.eq((await t.page.locator('[data-paste-counts]').innerText()).trim(),
        '2 new · 1 already in the sheet · 0 without a clip file name', 'fixed in place: it moves to New')
      t.eq((await t.page.locator('[data-add]').innerText()).trim(), 'Add 2 clips', 'button counts it')
      await rows.first().getByRole('button', { name: 'Leave out' }).click()
      t.eq((await t.page.locator('[data-add]').innerText()).trim(), 'Add 1 clip', 'left out, even when fixed')
      await rows.first().getByRole('button', { name: 'Keep' }).click()
      await rows.first().locator('input').nth(1).fill('')
      t.eq((await t.page.locator('[data-add]').innerText()).trim(), 'Add 1 clip', 'unfixed rows are not added')
    },
  },
  {
    id: 'us3-4',
    hash: 'me=sara',
    async run(t) {
      await pasteThree(t)
      await t.page.locator('[data-add]').click()
      await t.page.waitForSelector('[data-paste-preview]', { state: 'detached' })
      const calls = (await t.lab()).calls.filter(c => c.fn === 'addClips')
      t.eq(calls.length, 1, 'one add')
      t.eq(calls[0].args, ['v1', [{ title: 'Strategy Is a Daily Habit', file_name: '30_IMG_0296_6m12.4s-7m20.9s.mp4', link: DRIVE }]], 'the new row only')
      const added = (await t.tasks()).find(x => x.clip?.file_name === '30_IMG_0296_6m12.4s-7m20.9s.mp4')
      t.eq([added.task_owner_id, added.assignee_id, added.content_type_label, added.status, added.parent_task_id],
        ['sara', null, 'Reel', 'todo', 'v1'], 'owned by the member, Reel, To Do, no assignee, under the video')
      t.eq(added.attachments.map(a => a.content_type), ['text/uri-list'], 'its Drive link attached as a link')
      t.assert((await t.rows()).includes(`c:${added.id}`), 'the row appears')
      t.assert((await t.toast()).includes('1 clip added'), 'says so')
    },
  },
  {
    id: 'us3-5',
    hash: 'me=mona',   // may not edit any clip, may still add
    async run(t) {
      await t.cell('a:v1', 'title').click()
      const input = t.page.locator('[data-row^="d:"] input')
      await input.waitFor()
      t.assert(await input.evaluate(e => e === document.activeElement), 'title cell ready to type in')
      await t.page.keyboard.press('Escape')
      t.eq((await t.rows()).filter(r => r.startsWith('d:')).length, 0, 'Esc on an empty draft adds nothing')
      await t.cell('a:v1', 'title').click()
      await t.page.keyboard.type('A brand new clip')
      await t.page.keyboard.press('Enter')
      await t.idle(250)
      const calls = (await t.lab()).calls.filter(c => c.fn === 'addClips')
      t.eq(calls.map(c => c.args), [['v1', [{ title: 'A brand new clip' }]]], 'created when the title is saved')
      const added = (await t.tasks()).find(x => x.name === 'A brand new clip')
      t.eq([added.task_owner_id, added.status], ['mona', 'todo'], 'owned by Mona, To Do')
    },
  },
  {
    id: 'us3-text',
    async run(t) {
      await t.page.locator('[data-paste-clips]').click()
      const box = t.page.locator('[data-paste-preview] textarea')
      await box.fill('32_IMG_0297_0m01.0s-0m31.5s.mp4\tThirty seconds\thttps://drive.google.com/x\n33_IMG_0297_1m00.0s-1m40.0s.mp4\tForty seconds')
      await t.idle()
      t.eq((await t.page.locator('[data-paste-counts]').innerText()).trim(), '2 new · 0 already in the sheet · 0 without a clip file name', 'plain text rows')
      await t.page.keyboard.press('Escape')
      await t.page.waitForSelector('[data-paste-preview]', { state: 'detached' })
    },
  },
  {
    id: 'paste-13',
    hash: 'video=v3',
    async run(t) {
      const start = Date.now()
      const rows = Array.from({ length: 13 }, (_, i) => [`${String(i + 1).padStart(2, '0')}_FI_${i}m00.0s-${i}m45.5s.mp4`, `Interview clip ${i + 1}`, 'https://drive.google.com/x'])
      const html = await t.page.evaluate(r => window.__sheet.sheetsHtml(r), rows)
      await t.focusCell('v:v3', 'title')
      await t.paste({ html, text: 'x\ty' })
      await t.page.locator('[data-add]').click()
      await t.page.waitForSelector('[data-paste-preview]', { state: 'detached' })
      const clips = (await t.tasks()).filter(x => x.parent_task_id === 'v3')
      t.eq(clips.length, 13, '13 clips')
      t.assert(clips.every(c => c.clip.in_ms != null && c.clip.out_ms - c.clip.in_ms === 45500 && c.attachments.length === 1), 'each with times and its link')
      t.assert(Date.now() - start < 60_000, 'in under a minute (SC-001)')
    },
  },
  {
    id: 'paste-210',
    async run(t) {
      await t.page.locator('[data-paste-clips]').click()
      const text = Array.from({ length: 210 }, (_, i) => `${100 + i}_S_0m01.0s-0m02.0s.mp4\tT${i}`).join('\n')
      await t.page.locator('[data-paste-preview] textarea').fill(text)
      await t.idle(200)
      const counts = await t.page.locator('[data-paste-counts]').innerText()
      t.assert(counts.includes('200 new') && counts.includes('10 more rows left out (200 at a time)'), counts)
    },
  },
]
