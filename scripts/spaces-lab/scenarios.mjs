// Spaces lab runner (spec 021): the Node checks, then — once the UI entry
// exists — one browser scenario per acceptance scenario. Exits non-zero on any
// failure. Run all:  npm run lab:spaces   Run some:  npm run lab:spaces -- handoff rtl
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const filters = process.argv.slice(2)
let failed = 0

if (!filters.length || filters.some(f => 'pure'.includes(f))) {
  try { process.stdout.write(execFileSync('node', [path.join(LAB, 'pure.mjs')], { encoding: 'utf8' })) }
  catch (e) { process.stdout.write(e.stdout ?? ''); failed++ }
}

if (fs.existsSync(path.join(LAB, 'out', 'bundle.js')) && fs.existsSync(path.join(LAB, 'ui-runner.mjs'))) {
  try { execFileSync('node', [path.join(LAB, 'ui-runner.mjs'), ...filters], { stdio: 'inherit' }) }
  catch { failed++ }
}
process.exit(failed ? 1 : 0)
