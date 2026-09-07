'use client'

import { useEffect, useRef, useState } from 'react'
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
 * There is no Save button: `onSave` fires on its own, debounced, as the text
 * changes, and is flushed immediately on blur and on close so nothing typed
 * in the last moment is lost. The rendered preview sits live underneath the
 * textarea rather than behind a toggle, so it and the raw Markdown are always
 * in view together and there is nothing to remember to refresh.
 */

interface BriefEditorProps {
  value:  string
  saving: boolean
  onSave: (next: string) => void
  /** Stop editing. Nothing is discarded — autosave already covers that. */
  onDone: () => void
  /** Offered as one-click choices when inserting an image. */
  attachments?: TaskAttachment[]
  /** Creates a real child task and returns a link to it, or null if cancelled. */
  onCreateSubtask?: (name: string) => Promise<{ name: string; href: string } | null>
}

/** How long to let typing settle before autosaving. */
const AUTOSAVE_MS = 900

type Cmd =
  | { kind: 'wrap';    before: string; after: string }
  | { kind: 'heading'; level: 0 | 1 | 2 | 3 }
  | { kind: 'prefix';  prefix: string }
  | { kind: 'ordered' }
  | { kind: 'link' }
  | { kind: 'block';   text: string; caretBack?: number }

/** The blue + lime brand palette, local to the editor. */
const BR = {
  ink:        '#18233F',
  label:      '#68738D',
  faint:      '#929CB0',
  line:       '#E9EDF4',
  surface:    '#F8FAFD',
  blue:       '#3563E9',
  blueLight:  '#EEF3FF',
  blueActive: '#E5EDFF',
} as const

const TEXT_STYLES: { level: 0 | 1 | 2 | 3; label: string; sample: React.CSSProperties }[] = [
  { level: 0, label: 'Normal text', sample: { fontWeight: 500 } },
  { level: 1, label: 'Heading 1',   sample: { fontWeight: 800, fontSize: '1.05em' } },
  { level: 2, label: 'Heading 2',   sample: { fontWeight: 800, fontSize: '0.98em' } },
  { level: 3, label: 'Heading 3',   sample: { fontWeight: 800, fontSize: '0.92em' } },
]

interface ToolbarItem {
  id:     string
  label:  React.ReactNode
  title:  string
  cmd:    Cmd
  style?: React.CSSProperties
}

const TOOLS: ToolbarItem[][] = [
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
  | 'clear' | 'copy' | 'task' | 'subtask' | 'chevron'

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
    chevron: <path d="M6 9.5l6 6 6-6" />,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={{ flexShrink: 0 }}>
      {paths[name]}
    </svg>
  )
}

/** A borderless toolbar action — the only chrome is a hover/active tint. */
function ToolButton({ children, title, active, disabled, wide, chip, onClick }: {
  children: React.ReactNode; title: string; active?: boolean; disabled?: boolean
  /** A labelled control (a dropdown trigger) rather than a bare icon. */
  wide?: boolean
  /** A dropdown trigger — sits on its own light chip even at rest, so it reads
   *  as a control rather than another icon in the row. */
  chip?: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const lit = active || hover
  return (
    <button
      type="button" title={title} aria-label={title} disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 34,
        padding: wide ? '0 12px' : '0 8px', minWidth: wide ? undefined : 34,
        border: 'none', borderRadius: 9, cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500,
        background: lit ? BR.blueActive : chip ? '#fff' : 'transparent',
        color: lit ? BR.blue : BR.ink, opacity: disabled ? 0.4 : 1,
        boxShadow: chip && !lit ? '0 1px 2px rgba(24,35,63,0.05)' : 'none',
        transition: 'background .1s',
      }}
    >
      {children}
    </button>
  )
}

/** A hairline between logical toolbar groups — never between two single buttons. */
function Sep() {
  return <span aria-hidden="true" style={{ width: 1, height: 26, background: BR.line, margin: '0 4px', flexShrink: 0 }} />
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
  if (cmd.kind === 'heading' && cmd.level === 0) {
    // "Normal text" — always strips, regardless of what heading (if any) was there.
    rewritten = lines.map(l => l.replace(/^#{1,6} +/, ''))
  } else if (cmd.kind === 'heading') {
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
  value, saving, onSave, onDone, attachments = [], onCreateSubtask,
}: BriefEditorProps) {
  const [text, setTextState]  = useState(value)
  const [pending, setPending] = useState(false)
  const [menu, setMenu]       = useState<'insert' | 'more' | 'style' | null>(null)
  const [focused, setFocused] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [prompt, setPrompt]   = useState<PromptKind | null>(null)
  const [draft, setDraft]     = useState('')
  const [note, setNote]       = useState('')
  const [busy, setBusy]       = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const images = imageAttachments(attachments)

  // Autosave bookkeeping. Refs, not state: a debounce timer firing later, or
  // the unmount cleanup, needs the *latest* text and the *latest* save target
  // without waiting on a render — a stale closure here is how the last few
  // keystrokes typed right before closing the editor go unsaved.
  const textRef  = useRef(value)
  const savedRef = useRef(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flush() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setPending(false)
    if (textRef.current === savedRef.current) return
    savedRef.current = textRef.current
    onSave(textRef.current)
  }

  /** Every change to the text goes through here, whatever triggered it —
   *  typing, a toolbar command, or the right-click menu — so autosave sees
   *  all of them alike. */
  function setText(next: string) {
    textRef.current = next
    setTextState(next)
    setPending(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, AUTOSAVE_MS)
  }

  // Flush whatever the debounce hasn't gotten to yet if the editor unmounts
  // out from under it — closing the task panel mid-keystroke, say.
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      flush()
      onDone()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); flush(); onDone(); return }
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

  const contentRadius: React.CSSProperties['borderRadius'] = '0 0 18px 18px'

  return (
    <div>
      <div style={{
        borderRadius: 18, background: '#fff', overflow: 'hidden',
        boxShadow: focused
          ? '0 0 0 2px rgba(53,99,233,0.08), 0 4px 20px rgba(24,35,63,0.04)'
          : '0 2px 12px rgba(24,35,63,0.05)',
        transition: 'box-shadow .12s',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          minHeight: 58, padding: '10px 16px', background: BR.surface, borderRadius: '18px 18px 0 0',
          position: 'relative',
        }}>
          {/* Text style */}
          <div style={{ position: 'relative' }}>
            <ToolButton title="Text style" active={menu === 'style'} wide chip
                        onClick={() => setMenu(m => (m === 'style' ? null : 'style'))}>
              Text style <ToolIcon name="chevron" size={14} />
            </ToolButton>
            {menu === 'style' && (
              <Menu onClose={() => setMenu(null)}>
                {TEXT_STYLES.map(s => (
                  <MenuItem key={s.level} icon={null}
                            onClick={() => { setMenu(null); run({ kind: 'heading', level: s.level }) }}>
                    <span style={s.sample}>{s.label}</span>
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          <Sep />

          {TOOLS.map((group, gi) => (
            <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {gi > 0 && <Sep />}
              {group.map(t => (
                <ToolButton key={t.id} title={t.title} onClick={() => run(t.cmd)}>
                  <span style={{ fontSize: 15, ...t.style }}>{t.label}</span>
                </ToolButton>
              ))}
            </div>
          ))}

          <Sep />

          {/* Insert */}
          <div style={{ position: 'relative' }}>
            <ToolButton title="Insert" active={menu === 'insert'} wide chip
                        onClick={() => setMenu(m => (m === 'insert' ? null : 'insert'))}>
              + Insert <ToolIcon name="chevron" size={14} />
            </ToolButton>
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
            <ToolButton title="More actions" active={menu === 'more'}
                        onClick={() => setMenu(m => (m === 'more' ? null : 'more'))}>
              <span style={{ fontSize: 16 }}>⋯</span>
            </ToolButton>
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

          <span style={{ flex: 1 }} />

          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 4px',
            fontSize: 12.5, fontWeight: 600, color: pending || saving ? BR.blue : BR.faint,
          }}>
            {pending || saving ? 'Saving…' : 'Saved'}
          </span>
        </div>

        {/* Value prompt for the insert items that need one */}
        {prompt && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '10px 14px', background: BR.blueLight,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: BR.blue }}>
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
                flex: 1, minWidth: 180, height: 30, padding: '0 10px', borderRadius: 8,
                border: 'none', background: '#fff', fontSize: 13,
                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button type="button" onClick={() => void confirmPrompt()} disabled={busy || !draft.trim()}
                    style={{
                      height: 30, padding: '0 12px', border: 'none', borderRadius: 8,
                      background: BR.blue, color: '#fff', fontWeight: 700, fontSize: 12.5,
                      cursor: 'pointer', fontFamily: 'inherit', opacity: busy || !draft.trim() ? 0.5 : 1,
                    }}>
              {busy ? 'Working…' : PROMPTS[prompt].cta}
            </button>
            <ToolButton title="Cancel" onClick={() => { setPrompt(null); setDraft('') }}>Cancel</ToolButton>

            {prompt === 'image' && images.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: BR.label }}>or use an attachment:</span>
                {images.slice(0, 6).map(a => (
                  <button
                    key={a.id}
                    type="button"
                    title={a.filename}
                    onClick={() => { insertBlock(`![${a.filename}](${a.url})`); setPrompt(null) }}
                    style={{
                      height: 28, padding: '0 10px', border: 'none', borderRadius: 7,
                      background: '#fff', color: BR.ink, fontSize: 12.5, cursor: 'pointer',
                      fontFamily: 'inherit', maxWidth: 160, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {a.filename}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onContextMenu={onContextMenu}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); flush() }}
          autoFocus
          rows={9}
          placeholder="What needs making, for whom, and any constraints…"
          style={{
            width: '100%', padding: '24px 28px 14px',
            border: 'none', background: '#fff', color: BR.ink,
            fontSize: 16, lineHeight: 1.65, fontFamily: 'inherit',
            outline: 'none', resize: 'vertical', boxSizing: 'border-box', display: 'block',
          }}
        />

        {/* The rendered brief, live underneath the source — no toggle to
            remember, no stale preview: it is always exactly `text`. */}
        <div style={{ borderTop: `1px solid ${BR.line}`, borderRadius: contentRadius, background: '#fff' }}>
          <div style={{
            padding: '10px 28px 0', fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: BR.faint,
          }}>
            Preview
          </div>
          <div style={{ padding: '8px 28px 26px', minHeight: 60 }}>
            {text.trim()
              ? <Brief markdown={text} />
              : <span style={{ color: BR.faint, fontStyle: 'italic', fontSize: 15 }}>
                  Nothing to preview yet.
                </span>}
          </div>
        </div>
      </div>

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
          <div style={{ height: 1, background: BR.line, margin: '4px 2px' }} />
          <MenuItem icon={<span style={{ fontSize: '0.66rem', fontWeight: 800 }}>H1</span>} onClick={() => runAndClose({ kind: 'heading', level: 1 })} hint="Ctrl+Alt+1">
            Heading 1
          </MenuItem>
          <MenuItem icon={<span style={{ fontSize: '0.6rem', fontWeight: 800 }}>H2</span>} onClick={() => runAndClose({ kind: 'heading', level: 2 })} hint="Ctrl+Alt+2">
            Heading 2
          </MenuItem>
          <MenuItem icon={<span style={{ fontSize: '0.56rem', fontWeight: 800 }}>H3</span>} onClick={() => runAndClose({ kind: 'heading', level: 3 })} hint="Ctrl+Alt+3">
            Heading 3
          </MenuItem>
          <div style={{ height: 1, background: BR.line, margin: '4px 2px' }} />
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
          <div style={{ height: 1, background: BR.line, margin: '4px 2px' }} />
          <MenuItem icon={<ToolIcon name="clear" size={14} />} onClick={() => { setCtxMenu(null); clearFormat() }} hint="selection, or all">
            Clear formatting
          </MenuItem>
          <MenuItem icon={<ToolIcon name="copy" size={14} />} onClick={() => { setCtxMenu(null); void copyMarkdown() }}>
            Copy Markdown
          </MenuItem>
        </ContextMenu>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => { flush(); onDone() }}
          style={{
            padding: '7px 16px', borderRadius: 9, border: 'none',
            background: BR.blue, color: '#fff', fontWeight: 700,
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Done
        </button>
        <span style={{ fontSize: 12, color: note ? BR.ink : BR.faint, fontWeight: note ? 700 : 400 }}>
          {note || (pending || saving ? 'Saving…' : 'Saved · Esc closes · right-click for formatting')}
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
          position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 6, zIndex: 71,
          minWidth: 210, background: '#fff', border: 'none',
          borderRadius: 12, boxShadow: '0 12px 32px rgba(24,35,63,.14)', padding: 5,
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
          background: '#fff', border: 'none',
          borderRadius: 12, boxShadow: '0 12px 32px rgba(24,35,63,.14)', padding: 5,
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
        padding: '7px 9px', borderRadius: 8, border: 'none', background: 'transparent',
        color: BR.ink, fontSize: 12.5, fontFamily: 'inherit',
        cursor: 'pointer', textAlign: 'start',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = BR.blueLight)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {icon !== null && <span aria-hidden="true" style={{ width: 16, textAlign: 'center', color: BR.label }}>{icon}</span>}
      {children}
      {hint && <span style={{ marginInlineStart: 'auto', fontSize: 11, color: BR.faint }}>{hint}</span>}
    </button>
  )
}
