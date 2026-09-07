'use client'

import { useRef, useState } from 'react'
import { COLORS } from '@/lib/tokens'
import { Brief } from '@/components/shared/Brief'
import { imageAttachments } from '@/lib/attachments'
import type { TaskAttachment } from '@/types/index'

/**
 * Brief editor — formatting toolbar plus an Insert menu.
 *
 * Briefs are stored as Markdown, which is what the ClickUp import produces and
 * what the panel renders, so the toolbar edits Markdown source rather than
 * running a contenteditable surface. Every button is a text transform on the
 * current selection, which keeps the stored value round-trippable: what the
 * import wrote, the editor can re-emit unchanged.
 *
 * Preview reuses the panel's own renderer, so what you see while writing is
 * exactly what the task will show.
 */

interface BriefEditorProps {
  value:    string
  saving:   boolean
  onSave:   (next: string) => void
  onCancel: () => void
  /** Offered as one-click choices when inserting an image. */
  attachments?: TaskAttachment[]
  /** Creates a real child task and returns a link to it, or null if cancelled. */
  onCreateSubtask?: (name: string) => Promise<{ name: string; href: string } | null>
}

type Cmd =
  | { kind: 'wrap';    before: string; after: string }
  | { kind: 'heading'; level: 1 | 2 | 3 }
  | { kind: 'prefix';  prefix: string }
  | { kind: 'ordered' }
  | { kind: 'link' }
  | { kind: 'block';   text: string; caretBack?: number }

interface ToolbarItem {
  id:     string
  label:  React.ReactNode
  title:  string
  cmd:    Cmd
  style?: React.CSSProperties
}

const TOOLS: ToolbarItem[][] = [
  [
    { id: 'h1', label: 'H1', title: 'Heading 1 (Ctrl+Alt+1)', cmd: { kind: 'heading', level: 1 }, style: { fontSize: '0.78rem', fontWeight: 800 } },
    { id: 'h2', label: 'H2', title: 'Heading 2 (Ctrl+Alt+2)', cmd: { kind: 'heading', level: 2 }, style: { fontSize: '0.72rem', fontWeight: 800 } },
    { id: 'h3', label: 'H3', title: 'Heading 3 (Ctrl+Alt+3)', cmd: { kind: 'heading', level: 3 }, style: { fontSize: '0.68rem', fontWeight: 800 } },
  ],
  [
    { id: 'bold',   label: 'B', title: 'Bold (Ctrl+B)',            cmd: { kind: 'wrap', before: '**', after: '**' }, style: { fontWeight: 900 } },
    { id: 'italic', label: 'I', title: 'Italic (Ctrl+I)',          cmd: { kind: 'wrap', before: '_',  after: '_'  }, style: { fontStyle: 'italic', fontFamily: 'serif' } },
    { id: 'strike', label: 'S', title: 'Strikethrough (Ctrl+Shift+X)', cmd: { kind: 'wrap', before: '~~', after: '~~' }, style: { textDecoration: 'line-through' } },
    { id: 'code',   label: <ToolIcon name="code" />, title: 'Inline code (Ctrl+E)', cmd: { kind: 'wrap', before: '`', after: '`' } },
  ],
  [
    { id: 'ul',    label: <ToolIcon name="bulletList" />,   title: 'Bulleted list (Ctrl+Shift+8)', cmd: { kind: 'prefix', prefix: '- ' } },
    { id: 'ol',    label: <ToolIcon name="numberedList" />, title: 'Numbered list (Ctrl+Shift+7)', cmd: { kind: 'ordered' } },
    { id: 'quote', label: <ToolIcon name="quote" />,        title: 'Quote (Ctrl+Shift+9)',         cmd: { kind: 'prefix', prefix: '> ' } },
    { id: 'link',  label: <ToolIcon name="link" />,         title: 'Link (Ctrl+K)',                cmd: { kind: 'link' } },
  ],
]

const TABLE_SKELETON =
  '| Column | Column |\n| --- | --- |\n|  |  |\n|  |  |'

const TOGGLE_SKELETON =
  '<details>\n<summary>Toggle title</summary>\n\nHidden content.\n\n</details>'

/** Line-icon set for the toolbar and its menus — matches the app's outlined SVG style. */
type ToolIconName =
  | 'code' | 'link' | 'bulletList' | 'numberedList' | 'quote'
  | 'image' | 'divider' | 'toggle' | 'table' | 'toc' | 'youtube'
  | 'clear' | 'copy' | 'task' | 'subtask'

function ToolIcon({ name, size = 15 }: { name: ToolIconName; size?: number }) {
  const paths: Record<ToolIconName, React.ReactNode> = {
    code: <path d="M9 6 4 12l5 6M15 6l5 6-5 6" />,
    link: <><path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.6 1.6" /><path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.6-1.6" /></>,
    bulletList: <><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" /><path d="M9 6h11M9 12h11M9 18h11" /></>,
    numberedList: <>
      <text x="2.2" y="8"  fontSize="6.5" fontWeight={700} fill="currentColor" stroke="none">1</text>
      <text x="2.2" y="14" fontSize="6.5" fontWeight={700} fill="currentColor" stroke="none">2</text>
      <text x="2.2" y="20" fontSize="6.5" fontWeight={700} fill="currentColor" stroke="none">3</text>
      <path d="M9 6h11M9 12h11M9 18h11" />
    </>,
    quote: <path d="M6 9a2.4 2.4 0 0 0-2.4 2.4v1.2A2.4 2.4 0 0 0 6 15h.2L5 18M15.6 9a2.4 2.4 0 0 0-2.4 2.4v1.2a2.4 2.4 0 0 0 2.4 2.4h.2L14.4 18" />,
    image: <><rect x="3" y="4.5" width="18" height="15" rx="2.2" /><circle cx="8.5" cy="10" r="1.6" /><path d="m3.6 17.5 5-4.6 4 3.4 3-2.4 4.8 4" /></>,
    divider: <path d="M4 12h16" />,
    toggle: <path d="M9.5 6l6 6-6 6" />,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 16h18M9 4v16M15 4v16" /></>,
    toc: <path d="M4 6h16M4 12h12M4 18h9" />,
    youtube: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" /></>,
    clear: <><path d="M5 5h9M9.5 5v13" /><path d="M15.5 14.5l4.5 4.5M20 14.5l-4.5 4.5" /></>,
    copy: <><rect x="9" y="3" width="11" height="13" rx="2" /><path d="M6 8H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1" /></>,
    task: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12.5 2.5 2.5L16 9.5" /></>,
    subtask: <><path d="M6 4v9a3 3 0 0 0 3 3h6" /><circle cx="18" cy="16" r="2.6" /><path d="M18 6.4v3.6M16.2 8.2h3.6" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={{ flexShrink: 0 }}>
      {paths[name]}
    </svg>
  )
}

/** Split the value around the selection, expanded to whole lines when asked. */
function lineRange(text: string, start: number, end: number) {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const nl   = text.indexOf('\n', end)
  const to   = nl === -1 ? text.length : nl
  return { from, to }
}

/**
 * Strip Markdown back to its text — the "Clear format" action.
 *
 * Deliberately conservative: it removes markers, never words. Link and image
 * syntax collapses to the label rather than vanishing with the URL.
 */
export function clearFormatting(text: string): string {
  return text
    .replace(/^\s{0,3}(#{1,6})\s+/gm, '')                 // headings
    .replace(/^\s{0,3}>\s?/gm, '')                        // quotes
    .replace(/^(\s*)(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/gm, '$1') // task items
    .replace(/^(\s*)(?:[-*+]|\d+[.)])\s+/gm, '$1')        // list markers
    .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, '')    // rules
    .replace(/^\s*(```|~~~).*$/gm, '')                    // fences
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')             // images → alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')              // links → label
    .replace(/(\*\*|__)(.*?)\1/g, '$2')                   // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')                      // italic
    .replace(/~~(.*?)~~/g, '$1')                          // strike
    .replace(/`([^`]*)`/g, '$1')                          // code
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')                   // html tags
    .replace(/\\([\\`*_{}[\]()#+\-.!<>|~])/g, '$1')       // escapes
    .replace(/ {2}$/gm, '')                               // hard breaks
    .replace(/\n{3,}/g, '\n\n')
}

export function apply(cmd: Cmd, text: string, start: number, end: number): {
  text: string; start: number; end: number
} {
  const selected = text.slice(start, end)

  if (cmd.kind === 'wrap') {
    const { before, after } = cmd
    if (selected.startsWith(before) && selected.endsWith(after) &&
        selected.length >= before.length + after.length) {
      const inner = selected.slice(before.length, selected.length - after.length)
      return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length }
    }
    const next = before + selected + after
    return {
      text:  text.slice(0, start) + next + text.slice(end),
      start: start + before.length,
      end:   start + before.length + selected.length,
    }
  }

  if (cmd.kind === 'link') {
    const label = selected || 'link text'
    const next  = `[${label}](https://)`
    return {
      text:  text.slice(0, start) + next + text.slice(end),
      start: start + next.length - 1,
      end:   start + next.length - 1,
    }
  }

  if (cmd.kind === 'block') {
    // Block content needs its own line and a blank line before it, or Markdown
    // folds it into the paragraph the caret happened to be sitting in.
    const beforeText = text.slice(0, start)
    const afterText  = text.slice(end)
    const lead  = beforeText === '' || beforeText.endsWith('\n\n') ? '' : beforeText.endsWith('\n') ? '\n' : '\n\n'
    const trail = afterText.startsWith('\n') ? '\n' : '\n\n'
    const next  = lead + cmd.text + trail
    const caret = start + next.length - trail.length - (cmd.caretBack ?? 0)
    return { text: beforeText + next + afterText, start: caret, end: caret }
  }

  const { from, to } = lineRange(text, start, end)
  const lines = text.slice(from, to).split('\n')

  let rewritten: string[]
  if (cmd.kind === 'heading') {
    const hashes = '#'.repeat(cmd.level) + ' '
    const already = lines.every(l => l.startsWith(hashes))
    rewritten = lines.map(l => {
      const bare = l.replace(/^#{1,6} +/, '')
      return already ? bare : hashes + bare
    })
  } else if (cmd.kind === 'prefix') {
    const already = lines.every(l => l.startsWith(cmd.prefix))
    rewritten = lines.map(l =>
      already ? l.slice(cmd.prefix.length) : cmd.prefix + l.replace(/^([-*] |> |\d+\. )/, ''))
  } else {
    const already = lines.every(l => /^\d+\. /.test(l))
    rewritten = lines.map((l, i) =>
      already ? l.replace(/^\d+\. /, '') : `${i + 1}. ` + l.replace(/^([-*] |> |\d+\. )/, ''))
  }

  const block = rewritten.join('\n')
  const next  = text.slice(0, from) + block + text.slice(to)

  // With nothing selected, land the caret after the marker instead of
  // selecting the line — otherwise the first thing typed replaces the bullet
  // or checkbox that was just inserted.
  if (start === end) {
    const caret = start + (rewritten[0].length - lines[0].length)
    return { text: next, start: caret, end: caret }
  }
  return { text: next, start: from, end: from + block.length }
}

/** Insert items that need a value before they can be inserted. */
type PromptKind = 'image' | 'youtube' | 'subtask'

const PROMPTS: Record<PromptKind, { label: string; placeholder: string; cta: string }> = {
  image:   { label: 'Image URL',   placeholder: 'https://…', cta: 'Insert image' },
  youtube: { label: 'YouTube URL', placeholder: 'https://youtube.com/watch?v=…', cta: 'Embed video' },
  subtask: { label: 'Subtask name', placeholder: 'What needs doing?', cta: 'Create subtask' },
}

export function BriefEditor({
  value, saving, onSave, onCancel, attachments = [], onCreateSubtask,
}: BriefEditorProps) {
  const [text, setText]       = useState(value)
  const [preview, setPreview] = useState(false)
  const [menu, setMenu]       = useState<'insert' | 'more' | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [prompt, setPrompt]   = useState<PromptKind | null>(null)
  const [draft, setDraft]     = useState('')
  const [note, setNote]       = useState('')
  const [busy, setBusy]       = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const images = imageAttachments(attachments)

  function run(cmd: Cmd) {
    const el = ref.current
    if (!el) return
    const res = apply(cmd, text, el.selectionStart, el.selectionEnd)
    setText(res.text)
    // Selection has to be restored after React paints the new value, or the
    // caret jumps to the end and the next click of the same button misfires.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(res.start, res.end)
    })
  }

  function insertBlock(body: string, caretBack = 0) {
    setMenu(null)
    run({ kind: 'block', text: body, caretBack })
  }

  function openPrompt(kind: PromptKind) {
    setMenu(null)
    setDraft('')
    setPrompt(kind)
  }

  async function confirmPrompt() {
    const v = draft.trim()
    if (!v) return
    if (prompt === 'image')   insertBlock(`![](${v})`, 0)
    if (prompt === 'youtube') insertBlock(v, 0)
    if (prompt === 'subtask' && onCreateSubtask) {
      setBusy(true)
      const made = await onCreateSubtask(v)
      setBusy(false)
      if (!made) { setNote('Could not create that subtask'); return }
      insertBlock(`- [ ] [${made.name}](${made.href})`, 0)
    }
    setPrompt(null)
    setDraft('')
  }

  function clearFormat() {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    if (s === e) { setText(clearFormatting(text)); return }
    const cleaned = clearFormatting(text.slice(s, e))
    setText(text.slice(0, s) + cleaned + text.slice(e))
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(text)
      setNote('Markdown copied')
    } catch {
      setNote('Clipboard blocked by the browser')
    }
    setTimeout(() => setNote(''), 2500)
  }

  function onContextMenu(e: React.MouseEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    setMenu(null)
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  function runAndClose(cmd: Cmd) {
    setCtxMenu(null)
    run(cmd)
  }

  // Mirrors the toolbar's own combos, plus a few the buttons don't have room
  // for (inline code, quote) — every button here has a matching keystroke.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (ctxMenu) { setCtxMenu(null); return }
      onCancel()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSave(text); return }
    if (!(e.metaKey || e.ctrlKey)) return

    const key = e.key.toLowerCase()

    if (!e.shiftKey && !e.altKey) {
      if (key === 'b') { e.preventDefault(); run({ kind: 'wrap', before: '**', after: '**' }); return }
      if (key === 'i') { e.preventDefault(); run({ kind: 'wrap', before: '_',  after: '_'  }); return }
      if (key === 'e') { e.preventDefault(); run({ kind: 'wrap', before: '`',  after: '`'  }); return }
      if (key === 'k') { e.preventDefault(); run({ kind: 'link' }); return }
    }

    if (e.shiftKey && !e.altKey) {
      if (key === 'x')                 { e.preventDefault(); run({ kind: 'wrap', before: '~~', after: '~~' }); return }
      if (e.code === 'Digit7')         { e.preventDefault(); run({ kind: 'ordered' }); return }
      if (e.code === 'Digit8')         { e.preventDefault(); run({ kind: 'prefix', prefix: '- ' }); return }
      if (e.code === 'Digit9')         { e.preventDefault(); run({ kind: 'prefix', prefix: '> ' }); return }
    }

    if (e.altKey && !e.shiftKey) {
      if (key === '1') { e.preventDefault(); run({ kind: 'heading', level: 1 }); return }
      if (key === '2') { e.preventDefault(); run({ kind: 'heading', level: 2 }); return }
      if (key === '3') { e.preventDefault(); run({ kind: 'heading', level: 3 }); return }
    }
  }

  const btn: React.CSSProperties = {
    minWidth: 26, height: 24, padding: '0 6px', borderRadius: 6,
    border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.ink,
    fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
  }

  const INSERT_ITEMS: { icon: React.ReactNode; label: string; run: () => void; hint?: string }[] = [
    { icon: <ToolIcon name="task" />, label: 'Task', run: () => { setMenu(null); run({ kind: 'prefix', prefix: '- [ ] ' }) } },
    ...(onCreateSubtask
      ? [{ icon: <ToolIcon name="subtask" />, label: 'New subtask', run: () => openPrompt('subtask'), hint: 'creates a real task' }]
      : []),
    { icon: <ToolIcon name="image" />,    label: 'Image',    run: () => openPrompt('image') },
    { icon: <ToolIcon name="divider" />,  label: 'Divider',  run: () => insertBlock('---') },
    { icon: <ToolIcon name="toggle" />,   label: 'Toggle list', run: () => insertBlock(TOGGLE_SKELETON, TOGGLE_SKELETON.length - TOGGLE_SKELETON.indexOf('Toggle title') - 'Toggle title'.length) },
    { icon: <ToolIcon name="table" />,    label: 'Table',    run: () => insertBlock(TABLE_SKELETON) },
    { icon: <ToolIcon name="toc" />,      label: 'Table of contents', run: () => insertBlock('[[toc]]') },
    { icon: <ToolIcon name="youtube" />,  label: 'YouTube',  run: () => openPrompt('youtube') },
  ]

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '6px 8px', border: `1px solid ${COLORS.line}`,
        borderRadius: '10px 10px 0 0', borderBottom: 'none', background: '#FAFAF9',
        position: 'relative',
      }}>
        {TOOLS.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {group.map(t => (
              <button
                key={t.id}
                type="button"
                title={t.title}
                aria-label={t.title}
                disabled={preview}
                onMouseDown={e => e.preventDefault()}
                onClick={() => run(t.cmd)}
                style={{ ...btn, ...t.style, opacity: preview ? 0.4 : 1 }}
              >
                {t.label}
              </button>
            ))}
          </div>
        ))}

        {/* Insert */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            disabled={preview}
            aria-haspopup="menu"
            aria-expanded={menu === 'insert'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setMenu(m => (m === 'insert' ? null : 'insert'))}
            style={{
              ...btn, fontWeight: 700, opacity: preview ? 0.4 : 1,
              background: menu === 'insert' ? '#EFEFED' : '#fff',
            }}
          >
            + Insert ▾
          </button>
          {menu === 'insert' && (
            <Menu onClose={() => setMenu(null)}>
              {INSERT_ITEMS.map(it => (
                <MenuItem key={it.label} icon={it.icon} onClick={it.run} hint={it.hint}>
                  {it.label}
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>

        {/* Overflow: clear format / copy markdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            title="More"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menu === 'more'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setMenu(m => (m === 'more' ? null : 'more'))}
            style={{ ...btn, background: menu === 'more' ? '#EFEFED' : '#fff' }}
          >
            ⋯
          </button>
          {menu === 'more' && (
            <Menu onClose={() => setMenu(null)}>
              <MenuItem icon={<ToolIcon name="clear" />} onClick={() => { setMenu(null); clearFormat() }} hint="selection, or all">
                Clear format
              </MenuItem>
              <MenuItem icon={<ToolIcon name="copy" />} onClick={() => { setMenu(null); void copyMarkdown() }}>
                Copy Markdown
              </MenuItem>
            </Menu>
          )}
        </div>

        <button
          type="button"
          onClick={() => { setPreview(p => !p); setCtxMenu(null) }}
          style={{
            ...btn, marginInlineStart: 'auto', fontWeight: 700,
            background: preview ? COLORS.ink : '#fff',
            color: preview ? COLORS.lime : COLORS.muted,
          }}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {/* Value prompt for the insert items that need one */}
      {prompt && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '7px 8px', border: `1px solid ${COLORS.line}`, borderBottom: 'none',
          background: '#FFFDF3',
        }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: COLORS.muted }}>
            {PROMPTS[prompt].label}
          </span>
          <input
            value={draft}
            autoFocus
            placeholder={PROMPTS[prompt].placeholder}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter')  { e.preventDefault(); void confirmPrompt() }
              if (e.key === 'Escape') { setPrompt(null); setDraft('') }
            }}
            style={{
              flex: 1, minWidth: 180, padding: '4px 7px', borderRadius: 6,
              border: `1px solid ${COLORS.line}`, fontSize: '0.76rem',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button type="button" onClick={() => void confirmPrompt()} disabled={busy || !draft.trim()}
                  style={{ ...btn, fontWeight: 700, opacity: busy || !draft.trim() ? 0.5 : 1 }}>
            {busy ? 'Working…' : PROMPTS[prompt].cta}
          </button>
          <button type="button" onClick={() => { setPrompt(null); setDraft('') }} style={btn}>
            Cancel
          </button>

          {prompt === 'image' && images.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.66rem', color: COLORS.muted }}>or use an attachment:</span>
              {images.slice(0, 6).map(a => (
                <button
                  key={a.id}
                  type="button"
                  title={a.filename}
                  onClick={() => { insertBlock(`![${a.filename}](${a.url})`); setPrompt(null) }}
                  style={{ ...btn, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {a.filename}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {preview ? (
        <div style={{
          border: `1px solid ${COLORS.line}`, borderRadius: '0 0 10px 10px',
          padding: '0.6rem 0.7rem', minHeight: 140, background: '#fff',
        }}>
          {text.trim()
            ? <Brief markdown={text} />
            : <span style={{ color: COLORS.muted, fontStyle: 'italic', fontSize: '0.85rem' }}>
                Nothing to preview yet.
              </span>}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onContextMenu={onContextMenu}
          autoFocus
          rows={10}
          placeholder="What needs making, for whom, and any constraints…"
          style={{
            width: '100%', padding: '0.6rem 0.7rem', borderRadius: '0 0 10px 10px',
            border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.ink,
            fontSize: '0.85rem', lineHeight: 1.55, fontFamily: 'inherit',
            outline: 'none', resize: 'vertical', boxSizing: 'border-box', display: 'block',
          }}
        />
      )}

      {/* Right-click formatting menu — the same commands as the toolbar,
          reachable without a trip to the top of the editor. */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
          <MenuItem icon={<b style={{ fontSize: '0.72rem' }}>B</b>} onClick={() => runAndClose({ kind: 'wrap', before: '**', after: '**' })} hint="Ctrl+B">
            Bold
          </MenuItem>
          <MenuItem icon={<i style={{ fontSize: '0.72rem', fontFamily: 'serif' }}>I</i>} onClick={() => runAndClose({ kind: 'wrap', before: '_', after: '_' })} hint="Ctrl+I">
            Italic
          </MenuItem>
          <MenuItem icon={<span style={{ fontSize: '0.72rem', textDecoration: 'line-through' }}>S</span>} onClick={() => runAndClose({ kind: 'wrap', before: '~~', after: '~~' })} hint="Ctrl+Shift+X">
            Strikethrough
          </MenuItem>
          <MenuItem icon={<ToolIcon name="code" size={14} />} onClick={() => runAndClose({ kind: 'wrap', before: '`', after: '`' })} hint="Ctrl+E">
            Inline code
          </MenuItem>
          <div style={{ height: 1, background: COLORS.line, margin: '4px 2px' }} />
          <MenuItem icon={<span style={{ fontSize: '0.66rem', fontWeight: 800 }}>H1</span>} onClick={() => runAndClose({ kind: 'heading', level: 1 })} hint="Ctrl+Alt+1">
            Heading 1
          </MenuItem>
          <MenuItem icon={<span style={{ fontSize: '0.6rem', fontWeight: 800 }}>H2</span>} onClick={() => runAndClose({ kind: 'heading', level: 2 })} hint="Ctrl+Alt+2">
            Heading 2
          </MenuItem>
          <MenuItem icon={<span style={{ fontSize: '0.56rem', fontWeight: 800 }}>H3</span>} onClick={() => runAndClose({ kind: 'heading', level: 3 })} hint="Ctrl+Alt+3">
            Heading 3
          </MenuItem>
          <div style={{ height: 1, background: COLORS.line, margin: '4px 2px' }} />
          <MenuItem icon={<ToolIcon name="bulletList" size={14} />} onClick={() => runAndClose({ kind: 'prefix', prefix: '- ' })} hint="Ctrl+Shift+8">
            Bulleted list
          </MenuItem>
          <MenuItem icon={<ToolIcon name="numberedList" size={14} />} onClick={() => runAndClose({ kind: 'ordered' })} hint="Ctrl+Shift+7">
            Numbered list
          </MenuItem>
          <MenuItem icon={<ToolIcon name="quote" size={14} />} onClick={() => runAndClose({ kind: 'prefix', prefix: '> ' })} hint="Ctrl+Shift+9">
            Quote
          </MenuItem>
          <MenuItem icon={<ToolIcon name="link" size={14} />} onClick={() => runAndClose({ kind: 'link' })} hint="Ctrl+K">
            Link
          </MenuItem>
          <div style={{ height: 1, background: COLORS.line, margin: '4px 2px' }} />
          <MenuItem icon={<ToolIcon name="clear" size={14} />} onClick={() => { setCtxMenu(null); clearFormat() }} hint="selection, or all">
            Clear formatting
          </MenuItem>
          <MenuItem icon={<ToolIcon name="copy" size={14} />} onClick={() => { setCtxMenu(null); void copyMarkdown() }}>
            Copy Markdown
          </MenuItem>
        </ContextMenu>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onSave(text)}
          disabled={saving}
          style={{
            padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none',
            background: COLORS.ink, color: COLORS.lime, fontWeight: 700,
            fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '0.4rem 0.9rem', borderRadius: 8,
            border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.muted,
            fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
        <span style={{ fontSize: '0.66rem', color: note ? COLORS.ink : COLORS.muted, fontWeight: note ? 700 : 400 }}>
          {note || 'Ctrl+Enter saves · Esc cancels · right-click for formatting'}
        </span>
      </div>
    </div>
  )
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      {/* Click-away layer, so the menu closes without a document listener
          fighting the toolbar's own mousedown suppression. */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
      <div
        role="menu"
        style={{
          position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 4, zIndex: 71,
          minWidth: 210, background: '#fff', border: `1px solid ${COLORS.line}`,
          borderRadius: 10, boxShadow: '0 12px 32px rgba(23,19,33,.18)', padding: 5,
        }}
      >
        {children}
      </div>
    </>
  )
}

/** A floating menu anchored to a screen point rather than a toolbar button — the right-click menu. */
function ContextMenu({ x, y, onClose, children }: {
  x: number; y: number; onClose: () => void; children: React.ReactNode
}) {
  const width = 220
  // The menu's real height isn't known until it paints, so this reserves
  // roughly what the full item list needs rather than measuring it.
  const estimatedHeight = 460
  const left = typeof window === 'undefined' ? x : Math.min(x, window.innerWidth - width - 8)
  const top  = typeof window === 'undefined' ? y : Math.max(8, Math.min(y, window.innerHeight - estimatedHeight))
  return (
    <>
      {/* Click- or right-click-away layer, so the menu closes without a
          document listener fighting the textarea's own event handling. */}
      <div
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex: 90 }}
      />
      <div
        role="menu"
        style={{
          position: 'fixed', left, top, zIndex: 91,
          minWidth: width, maxHeight: '70vh', overflowY: 'auto',
          background: '#fff', border: `1px solid ${COLORS.line}`,
          borderRadius: 10, boxShadow: '0 12px 32px rgba(23,19,33,.18)', padding: 5,
        }}
      >
        {children}
      </div>
    </>
  )
}

function MenuItem({ icon, children, hint, onClick }: {
  icon: React.ReactNode; children: React.ReactNode; hint?: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        padding: '7px 9px', borderRadius: 7, border: 'none', background: 'transparent',
        color: COLORS.ink, fontSize: '0.8rem', fontFamily: 'inherit',
        cursor: 'pointer', textAlign: 'start',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F2')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span aria-hidden="true" style={{ width: 16, textAlign: 'center', color: COLORS.muted }}>{icon}</span>
      {children}
      {hint && <span style={{ marginInlineStart: 'auto', fontSize: '0.62rem', color: COLORS.muted }}>{hint}</span>}
    </button>
  )
}
