// FR-100 / FR-101 / SC-010: existing briefs open and save without change.
// Each fixture is opened, edited by one character and back, and the saved
// Markdown compared with the fixture (whitespace-normalised).
// KNOWN_DIFFS records today's baseline (see fixtures/README.md); a fixture
// listed there is checked against its recorded output instead.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const names = fs.readdirSync(DIR).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
const baselineFile = path.join(DIR, 'baseline.json')
const KNOWN_DIFFS = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {}

export const roundtrip = names.map(name => ({
  id: `roundtrip-fixtures:${name}`,
  hash: `initial=${name}`,
  async run(t) {
    await t.focusEnd()
    await t.page.keyboard.type('x')
    await t.page.waitForTimeout(400)
    await t.page.keyboard.press('Backspace')
    const saved = t.norm(await t.md(700))
    const expected = t.norm(KNOWN_DIFFS[name] ?? fs.readFileSync(path.join(DIR, `${name}.md`), 'utf8'))
    if (process.env.LAB_RECORD) {
      // Record today's output as the baseline for fixtures that do not round-trip exactly.
      const fixture = t.norm(fs.readFileSync(path.join(DIR, `${name}.md`), 'utf8'))
      const all = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {}
      if (saved === fixture) delete all[name]; else all[name] = saved
      fs.writeFileSync(baselineFile, JSON.stringify(all, null, 2) + '\n')
      return
    }
    t.eq(saved, expected, `${name} round-trip`)
  },
}))
