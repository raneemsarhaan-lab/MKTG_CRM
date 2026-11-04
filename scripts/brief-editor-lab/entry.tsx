/**
 * Brief-editor lab: mounts the real BriefEditor with a stub host so
 * scenarios.mjs can drive it in a browser without a database or a login.
 *
 * Host modes come from the URL hash, e.g. `#save=fail&upload=slow&locale=ar&initial=toggle`:
 *   save    ok | fail | throw | hang       what onSave does
 *   upload  ok | fail | slow | absent      what onUploadImages does (absent = prop omitted)
 *   reason  not-created | no-permission | no-storage   (with upload=absent)
 *   locale  en | ar
 *   initial a fixture name from fixtures/ (default: "default")
 *   host    editor | modal | form          editor: mounted directly with onDone
 *                                          modal:  Brief read view, click to edit (like TaskModal)
 *                                          form:   no onDone, no read view (like TaskForm)
 *   view    read                           render the saved Markdown through <Brief> only
 *
 * Everything the scenarios assert on is exposed on `window.__lab`.
 */
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { BriefEditor } from '@/components/kanban/BriefEditor'
import { Brief } from '@/components/shared/Brief'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import { FIXTURES } from './fixtures.gen'
import { anchorFromPoint, type ReadAnchor } from '@/components/kanban/brief-editor/readAnchor'

const params  = new URLSearchParams(location.hash.slice(1))
const locale  = params.get('locale') === 'ar' ? 'ar' : 'en'
const host    = params.get('host') ?? 'editor'
const initial = FIXTURES[params.get('initial') ?? 'default'] ?? ''

type Lab = {
  saves: string[]; md: string; done: number
  save: string; upload: string
  state: string; pending: number
}
declare global { interface Window { __lab: Lab } }
const lab: Lab = window.__lab = {
  saves: [], md: initial, done: 0,
  save: params.get('save') ?? 'ok', upload: params.get('upload') ?? 'ok',
  state: 'saved', pending: 0,
}

document.documentElement.lang = locale
document.documentElement.dir  = locale === 'ar' ? 'rtl' : 'ltr'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The stub save: what TaskModal's applyPatch does, minus the server. */
function onSave(next: string): Promise<boolean> {
  const mode = lab.save
  if (mode === 'hang')  return new Promise(() => {})
  if (mode === 'throw') return wait(150).then(() => { throw new Error('network down') })
  return wait(250).then(() => {
    if (mode === 'fail') return false
    lab.saves.push(next); lab.md = next
    return true
  })
}

const SAMPLE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR42mNk+M9QzwAEjDAGAzYwYBQMKAAAm8ED/W4Hg48AAAAASUVORK5CYII='

async function onUploadImages(file: File) {
  const mode = lab.upload
  await wait(mode === 'slow' ? 3000 : 400)
  if (mode === 'fail') return { ok: false as const, error: 'the upload did not complete' }
  // A real address, like the bucket's CDN URL in production.
  return { ok: true as const, url: `${location.origin}/sample.png?${encodeURIComponent(file.name)}`, filename: file.name }
}

function App() {
  const [editing, setEditing] = useState(host !== 'modal')
  const [md, setMd] = useState(initial)
  const [key, setKey] = useState(0)
  const [cursor, setCursor] = useState<ReadAnchor | undefined>(undefined)

  if (params.get('view') === 'read') return <div className="fx-brief-read"><Brief markdown={lab.md} /></div>

  const save = (next: string) => onSave(next).then(ok => { if (ok) setMd(next); return ok })

  if (!editing) {
    return (
      <div>
        <div id="read" style={{ cursor: 'text', padding: 8, background: '#fff', borderRadius: 12 }}
             onClick={e => {
               // What TaskModal does: links and checkboxes act; anything else starts editing there.
               if ((e.target as HTMLElement).closest('a, input, button, summary, iframe, label')) return
               const root = e.currentTarget.querySelector<HTMLElement>('.fx-brief')
               setCursor(root ? anchorFromPoint(root, e.clientX, e.clientY) ?? undefined : undefined)
               setEditing(true); setKey(k => k + 1)
             }}>
          <Brief markdown={md} />
        </div>
        <button id="reopen" onClick={() => { setCursor(undefined); setEditing(true); setKey(k => k + 1) }}>reopen</button>
      </div>
    )
  }

  return (
    <BriefEditor
      key={key}
      value={md}
      onSave={save}
      onSaveStateChange={(state, pending) => { lab.state = state; lab.pending = pending }}
      onDone={host === 'form' ? undefined : () => { lab.done++; setEditing(false) }}
      initialCursor={cursor}
      attachments={[{ id: 'a1', task_id: 't', filename: 'hero-banner.png', url: SAMPLE_PNG, uploaded_at: '' } as never]}
      onCreateSubtask={async name => { await wait(300); return { name, href: '/board?task=new-123' } }}
      onUploadImages={lab.upload === 'absent' ? undefined : onUploadImages}
      uploadUnavailableReason={(params.get('reason') as 'not-created' | 'no-permission' | 'no-storage' | null) ?? 'not-created'}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en} timeZone="Africa/Cairo">
    <App />
  </NextIntlClientProvider>,
)
