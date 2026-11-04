'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TiptapImage from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table/kit'
import { Markdown } from 'tiptap-markdown'
import { imageAttachments } from '@/lib/attachments'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import type { TaskAttachment } from '@/types/index'
import { Toggle, LinkShortcut, getMarkdown } from './brief-editor/extensions'
import { LinkCard } from './brief-editor/LinkCard'
import { ToolIcon, ToolButton, Sep, SaveStatusBadge } from './brief-editor/Toolbar'
import { ConfirmLeave } from './brief-editor/ConfirmLeave'
import { useSaveQueue, type SaveStatus } from './brief-editor/useSaveQueue'
import { Menu, MenuItem } from './brief-editor/Menu'
import { ValuePrompt, type PromptKind } from './brief-editor/ValuePrompt'
import { OverlayStackProvider, createOverlayStack } from './brief-editor/useOverlayStack'

/**
 * Brief editor — a real rich-text surface, not a Markdown textarea.
 *
 * Briefs are stored as Markdown, which is what the ClickUp import produces
 * and what the panel renders. Tiptap (a ProseMirror-based editor) plus the
 * `Markdown` extension means the box you type in already renders bold as
 * bold, a heading as a heading, a checkbox as a checkbox — Markdown is only
 * the wire format, produced from and parsed back into the same rich
 * document, via `editor.storage.markdown.getMarkdown()`.
 *
 * The pieces live in `./brief-editor/` (spec 005, plan.md): the custom nodes,
 * the toolbar parts, the menus, the value prompt and the overlay stack that
 * decides what Esc closes.
 *
 * There is no Save button: every change is sent right away by
 * `useSaveQueue`, one request at a time and always the newest text. The
 * toolbar shows "Saved" only once the host confirms the save, and a failure
 * shows "Couldn't save · Retry" and retries by itself (research R1).
 */

interface BriefEditorProps {
  value:  string
  /**
   * Store the brief. Must resolve `true` once stored and `false` when not,
   * and must settle in every path, including when the underlying action
   * throws (contracts/brief-editor-props.md). Never called twice at once.
   */
  onSave: (next: string) => Promise<boolean>
  /** Told whenever the save state or the number of uploads in progress changes,
   *  so the host can guard its own close control (FR-004). */
  onSaveStateChange?: (state: SaveStatus, pendingUploads: number) => void
  /**
   * Stop editing. Nothing is discarded — autosave already covers that.
   *
   * Omitted when there is no separate edit/view mode to exit — the create-task
   * form embeds this as its description field, with no "Done" to click back to.
   */
  onDone?: () => void
  /** Offered as one-click choices when inserting an image. */
  attachments?: TaskAttachment[]
  /** Creates a real child task and returns a link to it, or null if cancelled. */
  onCreateSubtask?: (name: string) => Promise<{ name: string; href: string } | null>
}

const TEXT_STYLES: { level: 0 | 1 | 2 | 3; key: 'normal' | 'h1' | 'h2' | 'h3'; sample: React.CSSProperties }[] = [
  { level: 0, key: 'normal', sample: { fontWeight: 500 } },
  { level: 1, key: 'h1',     sample: { fontWeight: 800, fontSize: '1.05em' } },
  { level: 2, key: 'h2',     sample: { fontWeight: 800, fontSize: '0.98em' } },
  { level: 3, key: 'h3',     sample: { fontWeight: 800, fontSize: '0.92em' } },
]

export function BriefEditor({
  value, onSave, onSaveStateChange, onDone, attachments = [], onCreateSubtask,
}: BriefEditorProps) {
  const t = useTranslations('briefEditor')
  const stack = useMemo(createOverlayStack, [])
  const save = useSaveQueue(value, onSave)
  const [pendingUploads] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState<'unsaved' | 'uploading' | null>(null)
  const [menu, setMenu]       = useState<'insert' | 'more' | 'style' | null>(null)
  const [focused, setFocused] = useState(false)
  const [prompt, setPrompt]   = useState<PromptKind | null>(null)
  const [promptInitial, setPromptInitial] = useState('')
  // Bumped on every open, so reopening the box (Mod+K again, Edit on another
  // link) starts from that link's address rather than the last draft.
  const [promptSeq, setPromptSeq] = useState(0)
  // The selection when the box opened. Typing in the box takes focus from the
  // editor, and the editor's own selection can move meanwhile (a save landing,
  // a click elsewhere), so the link goes onto the range that was selected.
  const promptRange = useRef<{ from: number; to: number } | null>(null)
  const [note, setNote]       = useState('')
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const styleBtn  = useRef<HTMLButtonElement>(null)
  const insertBtn = useRef<HTMLButtonElement>(null)
  const moreBtn   = useRef<HTMLButtonElement>(null)
  // Bumped on every editor transaction so the toolbar's active states
  // (`editor.isActive('bold')` and friends) re-evaluate on selection moves
  // too, not just on content changes.
  const [, bump] = useState(0)

  const images = imageAttachments(attachments)

  // Tell the host about the save state, so its own close control can ask
  // before throwing away unsaved text (FR-004).
  const stateCb = useRef(onSaveStateChange)
  stateCb.current = onSaveStateChange
  useEffect(() => { stateCb.current?.(save.status, pendingUploads) }, [save.status, pendingUploads])

  // Read by the key handler and extensions, which Tiptap captures once at creation.
  const leaveRef = useRef<() => void>(() => {})
  const openLinkRef = useRef<() => void>(() => {})
  const promptOpenRef = useRef(false)
  promptOpenRef.current = prompt !== null

  /**
   * Leave editing, the way Esc and a click outside both do (contracts/
   * keyboard-and-a11y.md "Esc layering"): close the top menu or prompt if one
   * is open; otherwise, if a save has failed or an image is still uploading,
   * ask first; otherwise leave.
   */
  function requestLeave() {
    if (stack.closeTop()) return
    if (!onDone) return
    if (save.status === 'error') { setConfirmLeave('unsaved'); return }
    if (pendingUploads > 0) { setConfirmLeave('uploading'); return }
    onDone()
  }
  leaveRef.current = requestLeave

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: 'end',
    extensions: [
      StarterKit.configure({
        // A click inside the editor places the cursor; the link card offers
        // Open (research R3). Parsing keeps Tiptap's default URI check, so
        // existing relative, anchor and mailto links in briefs survive (FR-100).
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
      }),
      LinkShortcut.configure({ open: () => openLinkRef.current() }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TiptapImage,
      Toggle,
      TableKit,
      Placeholder.configure({ placeholder: t('placeholder') }),
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'fx-brief fx-brief-edit' },
      handleKeyDown(_view, event) {
        if (event.key === 'Escape') {
          if (!onDone && stack.isEmpty()) return false
          leaveRef.current(); return true
        }
        if (onDone && (event.metaKey || event.ctrlKey) && event.key === 'Enter') { leaveRef.current(); return true }
        return false
      },
    },
    onUpdate({ editor }) {
      save.update(getMarkdown(editor))
    },
    onTransaction: () => bump(n => n + 1),
    onFocus: () => setFocused(true),
    onBlur:  () => setFocused(false),
  })

  function openPrompt(kind: PromptKind) {
    setMenu(null)
    setPromptInitial(kind === 'link' ? (editor?.getAttributes('link').href as string | undefined) ?? '' : '')
    promptRange.current = editor ? { from: editor.state.selection.from, to: editor.state.selection.to } : null
    setPrompt(kind)
    setPromptSeq(n => n + 1)
  }

  openLinkRef.current = () => openPrompt('link')

  function closePrompt() {
    setPrompt(null)
    editor?.commands.focus()
  }

  async function confirmPrompt(v: string) {
    if (!editor) return
    if (prompt === 'image') editor.chain().focus().setImage({ src: v }).run()
    if (prompt === 'youtube') editor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: v }] }).run()
    if (prompt === 'link') {
      const r = promptRange.current
      const size = editor.state.doc.content.size
      const range = r && r.to <= size ? r : { from: editor.state.selection.from, to: editor.state.selection.to }
      const chain = editor.chain().focus().setTextSelection(range)
      if (range.from !== range.to) chain.setLink({ href: v }).run()
      else if (editor.isActive('link')) chain.extendMarkRange('link').setLink({ href: v }).run()
      else chain.insertContent({ type: 'text', text: v, marks: [{ type: 'link', attrs: { href: v } }] }).run()
    }
    if (prompt === 'subtask' && onCreateSubtask) {
      const made = await onCreateSubtask(v)
      if (!made) { flashNote(t('subtaskFailed')); return }
      editor.chain().focus().insertContent({
        type: 'taskList',
        content: [{
          type: 'taskItem', attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: made.name, marks: [{ type: 'link', attrs: { href: made.href } }] }] }],
        }],
      }).run()
    }
    setPrompt(null)
  }

  function clearFormat() {
    if (!editor) return
    const chain = editor.chain().focus()
    if (editor.state.selection.empty) chain.selectAll()
    chain.unsetAllMarks().clearNodes().run()
  }

  function flashNote(msg: string, ms = 2500) {
    setNote(msg)
    clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => setNote(''), ms)
  }

  async function copyMarkdown() {
    if (!editor) return
    try {
      await navigator.clipboard.writeText(getMarkdown(editor))
      flashNote(t('markdownCopied'))
    } catch {
      flashNote(t('clipboardBlocked'))
    }
  }

  if (!editor) return null

  const TOOLS: { id: string; title: string; label: React.ReactNode; active: boolean; run: () => void }[][] = [
    [
      { id: 'bold',   title: `${t('bold')} (Ctrl+B)`, label: <span style={{ fontWeight: 900 }}>B</span>,
        active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
      { id: 'italic', title: `${t('italic')} (Ctrl+I)`, label: <span style={{ fontStyle: 'italic', fontFamily: 'serif' }}>I</span>,
        active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
      { id: 'strike', title: `${t('strike')} (Ctrl+Shift+X)`, label: <span style={{ textDecoration: 'line-through' }}>S</span>,
        active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
      { id: 'code',   title: `${t('code')} (Ctrl+E)`, label: <ToolIcon name="code" />,
        active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
    ],
    [
      { id: 'ul',    title: `${t('bulletList')} (Ctrl+Shift+8)`, label: <ToolIcon name="bulletList" />,
        active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
      { id: 'ol',    title: `${t('numberedList')} (Ctrl+Shift+7)`, label: <ToolIcon name="numberedList" />,
        active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
      { id: 'quote', title: `${t('quote')} (Ctrl+Shift+9)`, label: <ToolIcon name="quote" />,
        active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
      { id: 'link',  title: `${t('link')} (Ctrl+K)`, label: <ToolIcon name="link" />,
        active: editor.isActive('link'), run: () => openPrompt('link') },
    ],
  ]

  const INSERT_ITEMS: { icon: React.ReactNode; label: string; run: () => void; hint?: string }[] = [
    { icon: <ToolIcon name="task" />, label: t('task'), run: () => { setMenu(null); editor.chain().focus().toggleTaskList().run() } },
    ...(onCreateSubtask
      ? [{ icon: <ToolIcon name="subtask" />, label: t('subtask'), run: () => openPrompt('subtask'), hint: t('subtaskHint') }]
      : []),
    { icon: <ToolIcon name="image" />,    label: t('image'),    run: () => openPrompt('image') },
    { icon: <ToolIcon name="divider" />,  label: t('divider'),  run: () => { setMenu(null); editor.chain().focus().setHorizontalRule().run() } },
    { icon: <ToolIcon name="toggle" />,   label: t('toggle'), run: () => {
      setMenu(null)
      editor.chain().focus().insertContent({
        type: 'toggle', attrs: { summary: 'Toggle title' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden content.' }] }],
      }).run()
    } },
    { icon: <ToolIcon name="table" />,    label: t('table'),    run: () => { setMenu(null); editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run() } },
    { icon: <ToolIcon name="toc" />,      label: t('toc'), run: () => { setMenu(null); editor.chain().focus().insertContent('[[toc]]').run() } },
    { icon: <ToolIcon name="youtube" />,  label: t('youtube'),  run: () => openPrompt('youtube') },
  ]

  const currentStyle =
    editor.isActive('heading', { level: 1 }) ? TEXT_STYLES[1] :
    editor.isActive('heading', { level: 2 }) ? TEXT_STYLES[2] :
    editor.isActive('heading', { level: 3 }) ? TEXT_STYLES[3] :
    TEXT_STYLES[0]

  return (
    <OverlayStackProvider stack={stack}>
    <div>
      <div style={{
        borderRadius: 18, background: COLORS.panel, overflow: 'hidden',
        boxShadow: focused
          ? `0 0 0 2px ${alpha(BRIEF_UI.blue, 0.08)}, 0 4px 20px ${alpha(BRIEF_UI.ink, 0.04)}`
          : `0 2px 12px ${alpha(BRIEF_UI.ink, 0.05)}`,
        transition: 'box-shadow .12s',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          minHeight: 58, padding: '10px 16px', background: BRIEF_UI.surface, borderRadius: '18px 18px 0 0',
          position: 'relative',
        }}>
          {/* Text style */}
          <div style={{ position: 'relative' }}>
            <ToolButton buttonRef={styleBtn} title={t('textStyle')} active={menu === 'style'} wide chip menu expanded={menu === 'style'}
                        onClick={() => setMenu(m => (m === 'style' ? null : 'style'))}>
              <span style={currentStyle.level === 0 ? undefined : { fontWeight: 700 }}>{t(currentStyle.key)}</span>
              <ToolIcon name="chevron" size={14} />
            </ToolButton>
            {menu === 'style' && (
              <Menu id="style" label={t('textStyle')} anchor={styleBtn.current} onClose={() => setMenu(null)}>
                {TEXT_STYLES.map(s => (
                  <MenuItem key={s.level} icon={null}
                            onClick={() => {
                              setMenu(null)
                              if (s.level === 0) editor.chain().focus().setParagraph().run()
                              else editor.chain().focus().toggleHeading({ level: s.level }).run()
                            }}>
                    <span style={s.sample}>{t(s.key)}</span>
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          <Sep />

          {TOOLS.map((group, gi) => (
            <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {gi > 0 && <Sep />}
              {group.map(tool => (
                <ToolButton key={tool.id} title={tool.title} active={tool.active} onClick={tool.run}>
                  <span style={{ fontSize: 15 }}>{tool.label}</span>
                </ToolButton>
              ))}
            </div>
          ))}

          <Sep />

          {/* Insert */}
          <div style={{ position: 'relative' }}>
            <ToolButton buttonRef={insertBtn} title={t('insert')} active={menu === 'insert'} wide chip menu expanded={menu === 'insert'}
                        onClick={() => setMenu(m => (m === 'insert' ? null : 'insert'))}>
              + {t('insert')} <ToolIcon name="chevron" size={14} />
            </ToolButton>
            {menu === 'insert' && (
              <Menu id="insert" label={t('insert')} anchor={insertBtn.current} onClose={() => setMenu(null)}>
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
            <ToolButton buttonRef={moreBtn} title={t('more')} active={menu === 'more'} menu expanded={menu === 'more'}
                        onClick={() => setMenu(m => (m === 'more' ? null : 'more'))}>
              <span style={{ fontSize: 16 }}>⋯</span>
            </ToolButton>
            {menu === 'more' && (
              <Menu id="more" label={t('more')} anchor={moreBtn.current} onClose={() => setMenu(null)}>
                <MenuItem icon={<ToolIcon name="clear" />} onClick={() => { setMenu(null); clearFormat() }} hint={t('clearFormatHint')}>
                  {t('clearFormat')}
                </MenuItem>
                <MenuItem icon={<ToolIcon name="copy" />} onClick={() => { setMenu(null); void copyMarkdown() }}>
                  {t('copyMarkdown')}
                </MenuItem>
              </Menu>
            )}
          </div>

          <span style={{ flex: 1 }} />

          <SaveStatusBadge
            status={save.status}
            labels={{ saved: t('saved'), saving: t('saving'), couldntSave: t('couldntSave'), retry: t('retry') }}
            onRetry={save.retry}
          />
        </div>

        {confirmLeave && (
          <ConfirmLeave
            reason={confirmLeave}
            onStay={() => { setConfirmLeave(null); editor.commands.focus() }}
            onLeave={() => { setConfirmLeave(null); onDone?.() }}
          />
        )}

        {/* Value prompt for the insert items that need one */}
        {prompt && (
          <ValuePrompt
            key={`${prompt}:${promptSeq}`}
            kind={prompt}
            initial={promptInitial}
            images={images}
            onConfirm={confirmPrompt}
            onPickAttachment={a => { editor.chain().focus().setImage({ src: a.url ?? a.data ?? '', alt: a.filename }).run(); setPrompt(null) }}
            onCancel={closePrompt}
          />
        )}

        <LinkCard editor={editor} hiddenRef={promptOpenRef} onEdit={() => openPrompt('link')} onNote={flashNote} />

        <EditorContent editor={editor} style={{ padding: '24px 28px 32px', borderRadius: '0 0 18px 18px' }} />
      </div>

      {(onDone || note) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          {onDone && <button
            type="button"
            onClick={requestLeave}
            style={{
              padding: '7px 16px', borderRadius: 9, border: 'none',
              background: BRIEF_UI.blue, color: COLORS.panel, fontWeight: 700,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('done')}
          </button>}
          <span role="status" style={{ fontSize: 12, color: BRIEF_UI.ink, fontWeight: 700 }}>
            {note}
          </span>
        </div>
      )}
    </div>
    </OverlayStackProvider>
  )
}
