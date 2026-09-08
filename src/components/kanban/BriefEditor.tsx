'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TiptapImage from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table/kit'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import { Node } from '@tiptap/core'
import { imageAttachments } from '@/lib/attachments'
import type { TaskAttachment } from '@/types/index'

// tiptap-markdown predates Tiptap v3's stricter Storage typing and doesn't
// declare this itself — without it, `editor.storage.markdown` has no type.
declare module '@tiptap/core' {
  interface Storage {
    markdown: MarkdownStorage
  }
}

/**
 * Brief editor — a real rich-text surface, not a Markdown textarea.
 *
 * Briefs are stored as Markdown, which is what the ClickUp import produces
 * and what the panel renders. Earlier versions of this editor kept that as
 * the *editing* format too — a plain textarea where clicking Bold wrapped
 * the selection in `**`, with a separate read-only preview underneath to
 * see the result. That showed raw syntax while typing, which is not how a
 * rich-text editor reads. Tiptap (a ProseMirror-based editor) plus the
 * `Markdown` extension flips that around: the box you type in already
 * renders bold as bold, a heading as a heading, a checkbox as a checkbox —
 * Markdown is only the wire format, produced from and parsed back into the
 * same rich document, via `editor.storage.markdown.getMarkdown()`.
 *
 * There is no Save button: every change calls `onSave` right away, with no
 * artificial delay. What is throttled is concurrency, not time — if a save is
 * still in flight when the text changes again, it waits for that request to
 * finish and then sends the latest text, rather than firing a second request
 * in parallel. Two overlapping saves can resolve out of order over the
 * network, and the one that finishes last wins even if it was sent first —
 * that is how a save typed a moment earlier clobbers one typed a moment
 * later. Sending saves one at a time removes the race instead of just
 * shortening its window.
 */

interface BriefEditorProps {
  value:  string
  saving: boolean
  /** May return a Promise; awaited so a save in flight is never overlapped. */
  onSave: (next: string) => void | Promise<unknown>
  /** Stop editing. Nothing is discarded — autosave already covers that. */
  onDone: () => void
  /** Offered as one-click choices when inserting an image. */
  attachments?: TaskAttachment[]
  /** Creates a real child task and returns a link to it, or null if cancelled. */
  onCreateSubtask?: (name: string) => Promise<{ name: string; href: string } | null>
}

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

/**
 * A collapsible `<details>/<summary>` block.
 *
 * Tiptap has no built-in node for this, and without one, ProseMirror's HTML
 * parser drops the tags it doesn't recognise and keeps only their text —
 * a brief already using Insert ▸ Toggle list would lose the toggle entirely,
 * flattened to plain paragraphs the moment it was reopened. `contentElement`
 * excludes the `<summary>` from the parsed body so its title doesn't also
 * turn up duplicated as the toggle's first line; `addStorage().markdown`
 * re-emits the exact same two tags on save, so existing content round-trips
 * unchanged.
 */
const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      summary: {
        default: 'Toggle title',
        parseHTML: (el: HTMLElement) => el.querySelector('summary')?.textContent || 'Toggle title',
      },
    }
  },
  parseHTML() {
    return [{
      tag: 'details',
      contentElement: (el: HTMLElement) => {
        const clone = el.cloneNode(true) as HTMLElement
        clone.querySelector('summary')?.remove()
        return clone
      },
    }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['details', HTMLAttributes, ['summary', {}, node.attrs.summary], ['div', { 'data-toggle-body': '' }, 0]]
  },
  addNodeView() {
    // A plain renderHTML NodeView would make the <summary> itself part of
    // the editable document, which is exactly the duplication contentElement
    // guards against on the way in. Rendering it by hand keeps the title an
    // independent, directly-editable field instead.
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('details')
      dom.open = true
      const summary = document.createElement('summary')
      summary.contentEditable = 'true'
      summary.textContent = node.attrs.summary
      summary.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault() })
      summary.addEventListener('blur', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos == null) return
        editor.commands.command(({ tr }) => {
          tr.setNodeAttribute(pos, 'summary', summary.textContent || 'Toggle title')
          return true
        })
      })
      const body = document.createElement('div')
      body.setAttribute('data-toggle-body', '')
      dom.append(summary, body)
      return {
        dom,
        contentDOM: body,
        update: (updated) => {
          if (updated.type.name !== 'toggle') return false
          if (document.activeElement !== summary) summary.textContent = updated.attrs.summary
          return true
        },
      }
    }
  },
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prosemirror-markdown's serializer state isn't re-exported by tiptap-markdown
        serialize(state: any, node: any) {
          state.write(`<details>\n<summary>${node.attrs.summary}</summary>\n\n`)
          state.renderContent(node)
          state.ensureNewLine()
          state.write('</details>')
          state.closeBlock(node)
        },
      },
    }
  },
})

/** The `[[toc]]` marker, as literal text — expanded to a real table of
 *  contents at render time by `Brief`'s own `expandToc`, same as before.
 *  The Markdown serializer escapes bare brackets it doesn't recognise as a
 *  link or image (`\[\[toc\]\]`), so that has to be undone before saving or
 *  `expandToc`'s literal-string match would stop finding it. */
function getMarkdown(editor: Editor): string {
  return editor.storage.markdown.getMarkdown().replace(/\\\[\\\[toc\\\]\\\]/g, '[[toc]]')
}

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

/** Insert items that need a value before they can be inserted. */
type PromptKind = 'image' | 'youtube' | 'subtask' | 'link'

const PROMPTS: Record<PromptKind, { label: string; placeholder: string; cta: string }> = {
  image:   { label: 'Image URL',   placeholder: 'https://…', cta: 'Insert image' },
  youtube: { label: 'YouTube URL', placeholder: 'https://youtube.com/watch?v=…', cta: 'Embed video' },
  subtask: { label: 'Subtask name', placeholder: 'What needs doing?', cta: 'Create subtask' },
  link:    { label: 'Link URL',    placeholder: 'https://…', cta: 'Add link' },
}

export function BriefEditor({
  value, saving, onSave, onDone, attachments = [], onCreateSubtask,
}: BriefEditorProps) {
  const [busySaving, setBusySaving] = useState(false)
  const [menu, setMenu]       = useState<'insert' | 'more' | 'style' | null>(null)
  const [focused, setFocused] = useState(false)
  const [prompt, setPrompt]   = useState<PromptKind | null>(null)
  const [draft, setDraft]     = useState('')
  const [note, setNote]       = useState('')
  const [busy, setBusy]       = useState(false)
  // Bumped on every editor transaction so the toolbar's active states
  // (`editor.isActive('bold')` and friends) re-evaluate on selection moves
  // too, not just on content changes.
  const [, bump] = useState(0)

  const images = imageAttachments(attachments)

  // Autosave bookkeeping. Refs, not state: a request resolving later, or the
  // unmount cleanup, needs the *latest* text and the *latest* save target
  // without waiting on a render — a stale closure here is how the last few
  // keystrokes typed right before closing the editor go unsaved.
  const textRef     = useRef(value)
  const savedRef     = useRef(value)
  const inFlightRef = useRef(false)

  /**
   * Send whatever hasn't been saved yet — but only one request at a time.
   *
   * Called again from its own `.finally`, so a burst of keystrokes while a
   * save is in flight collapses into exactly one follow-up request carrying
   * the latest text, sent the instant the first one completes, rather than a
   * second request racing it. Two requests in flight together can finish in
   * either order over the network; the one that lands last wins regardless of
   * which was sent first, which is how an older save can silently overwrite a
   * newer one. Never running two at once removes that race instead of just
   * narrowing its window.
   */
  function pump() {
    if (inFlightRef.current) return
    const next = textRef.current
    if (next === savedRef.current) { setBusySaving(false); return }
    savedRef.current = next
    inFlightRef.current = true
    setBusySaving(true)
    Promise.resolve(onSave(next)).finally(() => {
      inFlightRef.current = false
      pump()
    })
  }

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: 'end',
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      TiptapImage,
      Toggle,
      TableKit,
      Placeholder.configure({ placeholder: 'What needs making, for whom, and any constraints…' }),
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'fx-brief fx-brief-edit' },
      handleKeyDown(_view, event) {
        if (event.key === 'Escape') { onDone(); return true }
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { onDone(); return true }
        return false
      },
    },
    onUpdate({ editor }) {
      textRef.current = getMarkdown(editor)
      pump()
    },
    onTransaction: () => bump(n => n + 1),
    onFocus: () => setFocused(true),
    onBlur:  () => setFocused(false),
  })

  // Catch whatever never got a chance to start a save at all if the editor
  // unmounts out from under it — closing the task panel mid-keystroke, say.
  // A save already in flight keeps going and still lands, and its own
  // `.finally` still sends any text newer than it once it resolves (those
  // closures don't care that the component is gone); sending another one
  // here too would just race that one.
  useEffect(() => () => {
    if (!inFlightRef.current && textRef.current !== savedRef.current) onSave(textRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openPrompt(kind: PromptKind) {
    setMenu(null)
    setDraft(kind === 'link' ? (editor?.getAttributes('link').href as string | undefined) ?? '' : '')
    setPrompt(kind)
  }

  async function confirmPrompt() {
    const v = draft.trim()
    if (!v || !editor) return
    if (prompt === 'image') editor.chain().focus().setImage({ src: v }).run()
    if (prompt === 'youtube') editor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: v }] }).run()
    if (prompt === 'link') {
      if (editor.state.selection.empty) {
        editor.chain().focus().insertContent({ type: 'text', text: v, marks: [{ type: 'link', attrs: { href: v } }] }).run()
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href: v }).run()
      }
    }
    if (prompt === 'subtask' && onCreateSubtask) {
      setBusy(true)
      const made = await onCreateSubtask(v)
      setBusy(false)
      if (!made) { setNote('Could not create that subtask'); return }
      editor.chain().focus().insertContent({
        type: 'taskList',
        content: [{
          type: 'taskItem', attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: made.name, marks: [{ type: 'link', attrs: { href: made.href } }] }] }],
        }],
      }).run()
    }
    setPrompt(null)
    setDraft('')
  }

  function clearFormat() {
    if (!editor) return
    const chain = editor.chain().focus()
    if (editor.state.selection.empty) chain.selectAll()
    chain.unsetAllMarks().clearNodes().run()
  }

  async function copyMarkdown() {
    if (!editor) return
    try {
      await navigator.clipboard.writeText(getMarkdown(editor))
      setNote('Markdown copied')
    } catch {
      setNote('Clipboard blocked by the browser')
    }
    setTimeout(() => setNote(''), 2500)
  }

  if (!editor) return null

  const TOOLS: { id: string; title: string; label: React.ReactNode; active: boolean; run: () => void }[][] = [
    [
      { id: 'bold',   title: 'Bold (Ctrl+B)', label: <span style={{ fontWeight: 900 }}>B</span>,
        active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
      { id: 'italic', title: 'Italic (Ctrl+I)', label: <span style={{ fontStyle: 'italic', fontFamily: 'serif' }}>I</span>,
        active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
      { id: 'strike', title: 'Strikethrough (Ctrl+Shift+X)', label: <span style={{ textDecoration: 'line-through' }}>S</span>,
        active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
      { id: 'code',   title: 'Inline code (Ctrl+E)', label: <ToolIcon name="code" />,
        active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
    ],
    [
      { id: 'ul',    title: 'Bulleted list (Ctrl+Shift+8)', label: <ToolIcon name="bulletList" />,
        active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
      { id: 'ol',    title: 'Numbered list (Ctrl+Shift+7)', label: <ToolIcon name="numberedList" />,
        active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
      { id: 'quote', title: 'Quote (Ctrl+Shift+9)', label: <ToolIcon name="quote" />,
        active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
      { id: 'link',  title: 'Link (Ctrl+K)', label: <ToolIcon name="link" />,
        active: editor.isActive('link'), run: () => openPrompt('link') },
    ],
  ]

  const INSERT_ITEMS: { icon: React.ReactNode; label: string; run: () => void; hint?: string }[] = [
    { icon: <ToolIcon name="task" />, label: 'Task', run: () => { setMenu(null); editor.chain().focus().toggleTaskList().run() } },
    ...(onCreateSubtask
      ? [{ icon: <ToolIcon name="subtask" />, label: 'New subtask', run: () => openPrompt('subtask'), hint: 'creates a real task' }]
      : []),
    { icon: <ToolIcon name="image" />,    label: 'Image',    run: () => openPrompt('image') },
    { icon: <ToolIcon name="divider" />,  label: 'Divider',  run: () => { setMenu(null); editor.chain().focus().setHorizontalRule().run() } },
    { icon: <ToolIcon name="toggle" />,   label: 'Toggle list', run: () => {
      setMenu(null)
      editor.chain().focus().insertContent({
        type: 'toggle', attrs: { summary: 'Toggle title' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden content.' }] }],
      }).run()
    } },
    { icon: <ToolIcon name="table" />,    label: 'Table',    run: () => { setMenu(null); editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run() } },
    { icon: <ToolIcon name="toc" />,      label: 'Table of contents', run: () => { setMenu(null); editor.chain().focus().insertContent('[[toc]]').run() } },
    { icon: <ToolIcon name="youtube" />,  label: 'YouTube',  run: () => openPrompt('youtube') },
  ]

  const currentStyle =
    editor.isActive('heading', { level: 1 }) ? TEXT_STYLES[1] :
    editor.isActive('heading', { level: 2 }) ? TEXT_STYLES[2] :
    editor.isActive('heading', { level: 3 }) ? TEXT_STYLES[3] :
    TEXT_STYLES[0]

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
              <span style={currentStyle.level === 0 ? undefined : { fontWeight: 700 }}>{currentStyle.label}</span>
              <ToolIcon name="chevron" size={14} />
            </ToolButton>
            {menu === 'style' && (
              <Menu onClose={() => setMenu(null)}>
                {TEXT_STYLES.map(s => (
                  <MenuItem key={s.level} icon={null}
                            onClick={() => {
                              setMenu(null)
                              if (s.level === 0) editor.chain().focus().setParagraph().run()
                              else editor.chain().focus().toggleHeading({ level: s.level }).run()
                            }}>
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
                <ToolButton key={t.id} title={t.title} active={t.active} onClick={t.run}>
                  <span style={{ fontSize: 15 }}>{t.label}</span>
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
            fontSize: 12.5, fontWeight: 600, color: busySaving || saving ? BR.blue : BR.faint,
          }}>
            {busySaving || saving ? 'Saving…' : 'Saved'}
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
                    onClick={() => { editor.chain().focus().setImage({ src: a.url ?? '', alt: a.filename }).run(); setPrompt(null) }}
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

        <BubbleMenu editor={editor}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2, background: '#fff', borderRadius: 10,
            boxShadow: '0 12px 32px rgba(24,35,63,.16)', padding: 4,
          }}>
            <ToolButton title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
              <b style={{ fontSize: 14 }}>B</b>
            </ToolButton>
            <ToolButton title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <i style={{ fontSize: 14, fontFamily: 'serif' }}>I</i>
            </ToolButton>
            <ToolButton title="Strikethrough (Ctrl+Shift+X)" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
              <span style={{ fontSize: 14, textDecoration: 'line-through' }}>S</span>
            </ToolButton>
            <ToolButton title="Inline code (Ctrl+E)" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
              <ToolIcon name="code" size={14} />
            </ToolButton>
            <Sep />
            <ToolButton title="Link (Ctrl+K)" active={editor.isActive('link')} onClick={() => openPrompt('link')}>
              <ToolIcon name="link" size={14} />
            </ToolButton>
          </div>
        </BubbleMenu>

        <EditorContent editor={editor} style={{ padding: '24px 28px 32px', borderRadius: contentRadius }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onDone}
          style={{
            padding: '7px 16px', borderRadius: 9, border: 'none',
            background: BR.blue, color: '#fff', fontWeight: 700,
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Done
        </button>
        <span style={{ fontSize: 12, color: note ? BR.ink : BR.faint, fontWeight: note ? 700 : 400 }}>
          {note || (busySaving || saving ? 'Saving…' : 'Saved · Esc closes · select text for formatting')}
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
