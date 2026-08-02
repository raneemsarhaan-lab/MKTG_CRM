'use client'

import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { COLORS } from '@/lib/tokens'

/**
 * Brief editor with a formatting toolbar.
 *
 * Briefs are stored as Markdown — that is what the ClickUp import produces and
 * what the panel renders — so the toolbar edits Markdown source rather than
 * running a contenteditable surface. Every button is a text transform on the
 * current selection, which keeps the stored value round-trippable: what the
 * import wrote, the editor can re-emit unchanged.
 *
 * Preview is a toggle rather than a second pane. The panel is 57% of a modal;
 * a side-by-side split at that width leaves neither half usable.
 */

interface BriefEditorProps {
  value:    string
  saving:   boolean
  onSave:   (next: string) => void
  onCancel: () => void
}

type Cmd =
  | { kind: 'wrap';    before: string; after: string }
  | { kind: 'heading'; level: 1 | 2 | 3 }
  | { kind: 'prefix';  prefix: string }
  | { kind: 'ordered' }
  | { kind: 'link' }

interface ToolbarItem {
  id:     string
  label:  React.ReactNode
  title:  string
  cmd:    Cmd
  style?: React.CSSProperties
}

const TOOLS: ToolbarItem[][] = [
  [
    { id: 'h1', label: 'H1', title: 'Heading 1',       cmd: { kind: 'heading', level: 1 }, style: { fontSize: '0.78rem', fontWeight: 800 } },
    { id: 'h2', label: 'H2', title: 'Heading 2',       cmd: { kind: 'heading', level: 2 }, style: { fontSize: '0.72rem', fontWeight: 800 } },
    { id: 'h3', label: 'H3', title: 'Heading 3',       cmd: { kind: 'heading', level: 3 }, style: { fontSize: '0.68rem', fontWeight: 800 } },
  ],
  [
    { id: 'bold',   label: 'B', title: 'Bold (Ctrl+B)',        cmd: { kind: 'wrap', before: '**', after: '**' },  style: { fontWeight: 900 } },
    { id: 'italic', label: 'I', title: 'Italic (Ctrl+I)',      cmd: { kind: 'wrap', before: '_',  after: '_'  },  style: { fontStyle: 'italic', fontFamily: 'serif' } },
    { id: 'strike', label: 'S', title: 'Strikethrough',        cmd: { kind: 'wrap', before: '~~', after: '~~' },  style: { textDecoration: 'line-through' } },
    { id: 'code',   label: '</>', title: 'Inline code',        cmd: { kind: 'wrap', before: '`',  after: '`'  },  style: { fontSize: '0.62rem' } },
  ],
  [
    { id: 'ul',    label: '• —', title: 'Bulleted list',       cmd: { kind: 'prefix', prefix: '- ' } },
    { id: 'ol',    label: '1.',  title: 'Numbered list',       cmd: { kind: 'ordered' } },
    { id: 'quote', label: '❝',   title: 'Quote',               cmd: { kind: 'prefix', prefix: '> ' } },
    { id: 'link',  label: '🔗',  title: 'Link (Ctrl+K)',       cmd: { kind: 'link' } },
  ],
]

/** Split the value around the selection, expanded to whole lines when asked. */
function lineRange(text: string, start: number, end: number) {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const nl   = text.indexOf('\n', end)
  const to   = nl === -1 ? text.length : nl
  return { from, to }
}

export function apply(cmd: Cmd, text: string, start: number, end: number): {
  text: string; start: number; end: number
} {
  const selected = text.slice(start, end)

  if (cmd.kind === 'wrap') {
    const { before, after } = cmd
    // Toggle: strip the markers when the selection already carries them.
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
      // Land the caret inside the URL — that is the part that still needs typing.
      start: start + next.length - 1,
      end:   start + next.length - 1,
    }
  }

  // Line-oriented commands rewrite every line the selection touches.
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
  return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length }
}

export function BriefEditor({ value, saving, onSave, onCancel }: BriefEditorProps) {
  const [text, setText]       = useState(value)
  const [preview, setPreview] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

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

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSave(text); return }
    if (!(e.metaKey || e.ctrlKey)) return
    const key = e.key.toLowerCase()
    if (key === 'b') { e.preventDefault(); run({ kind: 'wrap', before: '**', after: '**' }) }
    if (key === 'i') { e.preventDefault(); run({ kind: 'wrap', before: '_',  after: '_'  }) }
    if (key === 'k') { e.preventDefault(); run({ kind: 'link' }) }
  }

  const btn: React.CSSProperties = {
    minWidth: 26, height: 24, padding: '0 6px', borderRadius: 6,
    border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.ink,
    fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '6px 8px', border: `1px solid ${COLORS.line}`,
        borderRadius: '10px 10px 0 0', borderBottom: 'none', background: '#FAFAF9',
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
                // Keep focus in the textarea so the selection survives the click.
                onMouseDown={e => e.preventDefault()}
                onClick={() => run(t.cmd)}
                style={{ ...btn, ...t.style, opacity: preview ? 0.4 : 1 }}
              >
                {t.label}
              </button>
            ))}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setPreview(p => !p)}
          style={{
            ...btn, marginInlineStart: 'auto', fontWeight: 700,
            background: preview ? COLORS.ink : '#fff',
            color: preview ? COLORS.lime : COLORS.muted,
          }}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {preview ? (
        <div
          className="fx-brief"
          style={{
            border: `1px solid ${COLORS.line}`, borderRadius: '0 0 10px 10px',
            padding: '0.6rem 0.7rem', minHeight: 140, background: '#fff',
          }}
        >
          {text.trim()
            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            : <span style={{ color: COLORS.muted, fontStyle: 'italic' }}>Nothing to preview yet.</span>}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          rows={8}
          placeholder="What needs making, for whom, and any constraints…"
          style={{
            width: '100%', padding: '0.6rem 0.7rem', borderRadius: '0 0 10px 10px',
            border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.ink,
            fontSize: '0.85rem', lineHeight: 1.55, fontFamily: 'inherit',
            outline: 'none', resize: 'vertical', boxSizing: 'border-box', display: 'block',
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
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
        <span style={{ fontSize: '0.66rem', color: COLORS.muted }}>
          Ctrl+Enter saves · Esc cancels
        </span>
      </div>
    </div>
  )
}
