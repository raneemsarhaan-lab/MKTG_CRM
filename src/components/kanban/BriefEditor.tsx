'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table/kit'
import { Markdown } from 'tiptap-markdown'
import { imageAttachments } from '@/lib/attachments'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import type { TaskAttachment } from '@/types/index'
import { Toggle, LinkShortcut, BriefImage, SlashCommand, MentionCommand, Youtube, Toc, dismissSlash, dismissMention, getMarkdown, type SlashBridge, type SlashState, type MentionBridge, type MentionState, type MentionPerson } from './brief-editor/extensions'
import { BriefTable, TableResize } from './brief-editor/tableEdges'
import { TableMenu } from './brief-editor/TableMenu'
import { SlashMenu } from './brief-editor/SlashMenu'
import { MentionMenu } from './brief-editor/MentionMenu'
import { blockItems, filterBlocks, insertYoutube, type BlockContext, type BlockItem } from './brief-editor/blocks'
import { ImageUpload, insertImageBlock, blockSlot, type ImageUploadContext, type UploadResult, type UploadUnavailableReason } from './brief-editor/imageUpload'
import { LinkCard } from './brief-editor/LinkCard'
import { ToolIcon, ToolButton, Sep, SaveStatusBadge } from './brief-editor/Toolbar'
import { ConfirmLeave } from './brief-editor/ConfirmLeave'
import { useSaveQueue, type SaveStatus } from './brief-editor/useSaveQueue'
import { Menu, MenuItem } from './brief-editor/Menu'
import { ValuePrompt, type PromptKind } from './brief-editor/ValuePrompt'
import { OverlayStackProvider, createOverlayStack } from './brief-editor/useOverlayStack'
import { positionForAnchor, scrollParent } from './brief-editor/readAnchor'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { withShortcut } from './brief-editor/shortcut'

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
   * Leave editing. Called on a click outside the editor or Esc, through the
   * overlay stack and the unsaved-changes bar; there is no Done button
   * (FR-014, FR-016). Omitted where there is no read view to go back to (the
   * Create Task form), and then a click outside does nothing.
   */
  onDone?: () => void
  /**
   * Where the person clicked in the read view (`anchorFromPoint`): editing
   * starts with the cursor there, and the clicked block is kept where it was
   * on screen while the toolbar appears (FR-015, research R25).
   */
  initialCursor?: { block: number; offset: number; top?: number }
  /** Offered as one-click choices when inserting an image. */
  attachments?: TaskAttachment[]
  /** Creates a real child task and returns a link to it, or null if cancelled. */
  onCreateSubtask?: (name: string) => Promise<{ name: string; href: string } | null>
  /**
   * Upload a pasted or dropped image as an attachment of the task (FR-032).
   * One file per call, in order. Absent → pasting an image explains why
   * instead (`uploadUnavailableReason`).
   */
  onUploadImages?: (file: File) => Promise<UploadResult>
  uploadUnavailableReason?: UploadUnavailableReason
  /** Who "@" offers (spec 012 R11). Absent → typing "@" opens nothing. */
  people?: MentionPerson[]
}

export type { UploadResult, UploadUnavailableReason }

/** On a phone these move from the toolbar row into ⋯ (FR-071, R14). */
const PHONE_IN_MORE = ['strike', 'code', 'quote']

/** How each text style reads in the Text style menu. */
const STYLE_SAMPLE: Record<string, React.CSSProperties> = {
  paragraph: { fontWeight: 500 },
  h1: { fontWeight: 800, fontSize: '1.05em' },
  h2: { fontWeight: 800, fontSize: '0.98em' },
  h3: { fontWeight: 800, fontSize: '0.92em' },
}

export function BriefEditor({
  value, onSave, onSaveStateChange, onDone, initialCursor, attachments = [], onCreateSubtask,
  onUploadImages, uploadUnavailableReason = 'not-created', people = [],
}: BriefEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  // A phone: one toolbar row that scrolls sideways, rarer actions in ⋯ (FR-071).
  // The editor only renders in the browser, so there is no first-paint flash.
  const phone = useMediaQuery('(max-width: 480px)')
  const t = useTranslations('briefEditor')
  const stack = useMemo(createOverlayStack, [])
  const save = useSaveQueue(value, onSave)
  const [pendingUploads, setPendingUploads] = useState(0)
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
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [slashActive, setSlashActive] = useState(0)
  const slashRef = useRef<{ state: SlashState | null; active: number }>({ state: null, active: 0 })
  slashRef.current = { state: slash, active: slashActive }
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

  // What the paste/drop uploader needs, read when it runs (research R5).
  const uploadCtx = useRef<ImageUploadContext>(null as unknown as ImageUploadContext)
  uploadCtx.current = {
    upload: onUploadImages,
    unavailableReason: uploadUnavailableReason,
    note: msg => flashNote(msg, 6000),
    pendingChanged: n => setPendingUploads(n),
    text: {
      uploading: name => t('uploading', { name }),
      failed: (name, error) => t('uploadFailed', { name, error }),
      notAnImage: t('notAnImage'),
      tooBig: (name, mb) => t('tooBig', { name, mb }),
      skipped: max => t('skipped', { max }),
      unavailable: reason => t(reason === 'no-permission' ? 'noPermission' : reason === 'no-storage' ? 'noStorage' : 'notCreated'),
    },
  }

  // The block items every menu offers (research R6), and how they run.
  const blockCtx: BlockContext = { openPrompt: kind => openPrompt(kind), canCreateSubtask: !!onCreateSubtask }
  const items = blockItems(blockCtx)

  // The "/" menu: the suggestion plugin asks this what to show and how to run
  // a pick; arrows and Enter reach it through the editor (FR-040–042).
  const slashBridge = useRef<SlashBridge>(null as unknown as SlashBridge)
  slashBridge.current = {
    items: query => filterBlocks(items, query, key => t(key)),
    run: item => { if (editor) item.run(editor, blockCtx) },
    show: state => {
      setSlash(state)
      setSlashActive(a => (state && a < state.items.length ? a : 0))
    },
    key: event => {
      const { state, active } = slashRef.current
      if (!state || !state.items.length) return false
      if (event.key === 'ArrowDown') { setSlashActive((active + 1) % state.items.length); return true }
      if (event.key === 'ArrowUp') { setSlashActive((active - 1 + state.items.length) % state.items.length); return true }
      if (event.key === 'Enter' || event.key === 'Tab') { state.select(state.items[active]); return true }
      return false
    },
  }

  // The "@" menu (spec 012 R11), driven the same way as "/".
  const [mention, setMention] = useState<MentionState | null>(null)
  const [mentionActive, setMentionActive] = useState(0)
  const mentionRef = useRef<{ state: MentionState | null; active: number }>({ state: null, active: 0 })
  mentionRef.current = { state: mention, active: mentionActive }
  const mentionBridge = useRef<MentionBridge>(null as unknown as MentionBridge)
  mentionBridge.current = {
    items: query => {
      const q = query.trim().toLowerCase()
      return people
        .filter(p => !q || p.name.toLowerCase().includes(q) || (p.role ?? '').toLowerCase().includes(q))
        .slice(0, 8)
    },
    show: state => {
      setMention(state)
      setMentionActive(a => (state && a < state.items.length ? a : 0))
    },
    key: event => {
      const { state, active } = mentionRef.current
      if (!state || !state.items.length) return false
      if (event.key === 'ArrowDown') { setMentionActive((active + 1) % state.items.length); return true }
      if (event.key === 'ArrowUp') { setMentionActive((active - 1 + state.items.length) % state.items.length); return true }
      if (event.key === 'Enter' || event.key === 'Tab') { state.select(state.items[active]); return true }
      return false
    },
  }

  // The size badge while a table is being resized (FR-067).
  const [badge, setBadge] = useState<{ text: string; x: number; y: number } | null>(null)
  const sizeBadge = useRef((text: string, x: number, y: number) => setBadge(text ? { text, x, y } : null))
  const sizeTexts = useRef({ wide: (n: number) => t('wide', { n }), columns: t('dragColumns'), table: t('dragTable') })
  sizeTexts.current = { wide: (n: number) => t('wide', { n }), columns: t('dragColumns'), table: t('dragTable') }

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
    autofocus: false,
    extensions: [
      StarterKit.configure({
        // A click inside the editor places the cursor; the link card offers
        // Open (research R3). Parsing keeps Tiptap's default URI check, so
        // existing relative, anchor and mailto links in briefs survive (FR-100).
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
      }),
      LinkShortcut.configure({ open: () => openLinkRef.current() }),
      SlashCommand.configure({ bridge: slashBridge }),
      MentionCommand.configure({ bridge: mentionBridge }),
      TaskList,
      TaskItem.configure({ nested: true }),
      // allowBase64: an image picked from an older attachment stored in the
      // database is a data: URL; without this it vanished on reopening.
      BriefImage.configure({ allowBase64: true }),
      ImageUpload.configure({ ctx: uploadCtx }),
      Toggle.configure({ titleHint: t('toggleTitle'), defaultTitle: t('toggleDefaultTitle') }),
      Youtube.configure({ label: t('videoBlock') }),
      Toc.configure({ label: t('tocLabel'), empty: t('tocEmpty') }),
      TableKit.configure({ table: false }),
      // No built-in table view: it sizes columns itself and would ignore ours.
      BriefTable.configure({ resizable: false, View: null }),
      TableResize.configure({ label: sizeBadge, texts: sizeTexts }),
      // The main hint on an empty brief. Empty lines inside a toggle get the
      // "Hidden content" hint from CSS (--brief-toggle-hint, set below), since
      // the placeholder callback can't safely look at where a line sits.
      Placeholder.configure({
        includeChildren: true,
        showOnlyCurrent: false,
        placeholder: ({ editor: ed }) => (ed.isEmpty ? t('placeholder') : ''),
      }),
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'fx-brief fx-brief-edit',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': t('label'),
      },
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
    onCreate({ editor }) {
      // Start where the person clicked, without the browser scrolling to it;
      // the layout effect below keeps the clicked text still instead.
      const pos = initialCursor ? positionForAnchor(editor.state.doc, initialCursor.block, initialCursor.offset) : null
      if (pos !== null) editor.chain().setTextSelection(pos).focus(undefined, { scrollIntoView: false }).run()
      else editor.commands.focus('end', { scrollIntoView: !initialCursor })
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

  // Keep the clicked block where it was on screen: the toolbar appearing above
  // the text would otherwise push it down by ~60px (FR-015, SC-011).
  const compensated = useRef(false)
  useLayoutEffect(() => {
    if (!editor || compensated.current || initialCursor?.top === undefined) return
    compensated.current = true
    const block = editor.view.dom.children[initialCursor.block] as HTMLElement | undefined
    if (!block) return
    const drift = block.getBoundingClientRect().top - initialCursor.top
    if (Math.abs(drift) > 1) scrollParent(editor.view.dom).scrollTop += drift
  })

  // A click outside the brief ends editing, like Esc (FR-016). The first such
  // click closes an open menu or prompt instead; clicks inside floating parts
  // of the editor (link card, table menu) don't count; the click still goes
  // on to whatever was clicked.
  useEffect(() => {
    if (!onDone) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (!target || rootRef.current?.contains(target)) return
      if (target.closest?.('[data-overlay]') || stack.contains(target)) return
      leaveRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onDone, stack])

  function closePrompt() {
    setPrompt(null)
    editor?.commands.focus()
  }

  async function confirmPrompt(v: string) {
    if (!editor) return
    if (prompt === 'image') insertImageBlock(editor, blockSlot(editor.state, promptRange.current?.from ?? editor.state.selection.from), v)
    if (prompt === 'youtube') insertYoutube(editor, v, promptRange.current?.from ?? editor.state.selection.from)
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

  /** Clear formatting from the selected text only (FR-012). It used to clear
   *  the whole brief when nothing was selected, without asking (audit E5). */
  function clearFormat() {
    if (!editor || editor.state.selection.empty) return
    editor.chain().focus().unsetAllMarks().clearNodes().run()
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

  // Roving focus for the toolbar: one Tab stop; arrow keys move between the
  // buttons, reversed in right-to-left (FR-045, R16).
  useEffect(() => {
    const bar = toolbarRef.current
    if (!bar) return
    const btns = [...bar.querySelectorAll<HTMLButtonElement>('button[data-tool]')].filter(b => !b.disabled && !b.closest('[role="menu"]'))
    const focusedAt = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (focusedAt >= 0) rovingAt.current = focusedAt
    const keep = Math.min(rovingAt.current, btns.length - 1)
    bar.querySelectorAll<HTMLButtonElement>('button[data-tool]').forEach(b => { if (b.disabled) b.tabIndex = -1 })
    btns.forEach((b, i) => { b.tabIndex = i === keep ? 0 : -1 })
  })
  const rovingAt = useRef(0)
  function onToolbarKey(e: React.KeyboardEvent) {
    const bar = toolbarRef.current
    if (!bar || (e.target as HTMLElement).closest('[role="menu"]')) return
    const btns = [...bar.querySelectorAll<HTMLButtonElement>('button[data-tool]')].filter(b => !b.disabled && !b.closest('[role="menu"]'))
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const rtl = getComputedStyle(bar).direction === 'rtl'
    let n: number | null = null
    if (e.key === 'ArrowRight') n = rtl ? i - 1 : i + 1
    if (e.key === 'ArrowLeft') n = rtl ? i + 1 : i - 1
    if (e.key === 'Home') n = 0
    if (e.key === 'End') n = btns.length - 1
    if (n === null) return
    e.preventDefault()
    n = (n + btns.length) % btns.length
    btns.forEach(b => { b.tabIndex = -1 })
    btns[n].tabIndex = 0
    rovingAt.current = n
    btns[n].focus()
  }

  // Tell assistive technology which "/" item is highlighted.
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    if (slash && slash.items[slashActive]) {
      dom.setAttribute('aria-controls', 'brief-slash-menu')
      dom.setAttribute('aria-activedescendant', `brief-slash-${slash.items[slashActive].id}`)
    } else if (mention && mention.items[mentionActive]) {
      dom.setAttribute('aria-controls', 'brief-mention-menu')
      dom.setAttribute('aria-activedescendant', `brief-mention-${mention.items[mentionActive].id}`)
    } else {
      dom.removeAttribute('aria-controls')
      dom.removeAttribute('aria-activedescendant')
    }
  }, [editor, slash, slashActive, mention, mentionActive])

  if (!editor) return null

  const TOOLS: { id: string; title: string; label: React.ReactNode; active: boolean; run: () => void }[][] = [
    [
      { id: 'bold',   title: withShortcut(t('bold'), 'Mod+B'), label: <span style={{ fontWeight: 900 }}>B</span>,
        active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
      { id: 'italic', title: withShortcut(t('italic'), 'Mod+I'), label: <span style={{ fontStyle: 'italic', fontFamily: 'serif' }}>I</span>,
        active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
      { id: 'strike', title: withShortcut(t('strike'), 'Mod+Shift+X'), label: <span style={{ textDecoration: 'line-through' }}>S</span>,
        active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
      { id: 'code',   title: withShortcut(t('code'), 'Mod+E'), label: <ToolIcon name="code" />,
        active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
    ],
    [
      { id: 'ul',    title: withShortcut(t('bulletList'), 'Mod+Shift+8'), label: <ToolIcon name="bulletList" />,
        active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
      { id: 'ol',    title: withShortcut(t('numberedList'), 'Mod+Shift+7'), label: <ToolIcon name="numberedList" />,
        active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
      { id: 'quote', title: withShortcut(t('quote'), 'Mod+Shift+9'), label: <ToolIcon name="quote" />,
        active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
      { id: 'link',  title: withShortcut(t('link'), 'Mod+K'), label: <ToolIcon name="link" />,
        active: editor.isActive('link'), run: () => openPrompt('link') },
    ],
  ]


  const currentStyle =
    editor.isActive('heading', { level: 1 }) ? 'h1' :
    editor.isActive('heading', { level: 2 }) ? 'h2' :
    editor.isActive('heading', { level: 3 }) ? 'h3' :
    'paragraph'
  const styleItems = items.filter(b => b.group === 'style')
  const insertItems = items.filter(b => b.group === 'block')
  const runItem = (item: BlockItem) => { setMenu(null); item.run(editor, blockCtx) }

  return (
    <OverlayStackProvider stack={stack}>
    <div
      ref={rootRef}
      // Esc while focus is on the toolbar (after closing a menu, say) leaves
      // editing too, and is marked handled so the task panel's own Esc
      // doesn't also close the panel. Inside the text, ProseMirror handles it.
      onKeyDown={e => {
        if (e.key !== 'Escape' || e.defaultPrevented || (e.target as HTMLElement).isContentEditable) return
        e.preventDefault()
        requestLeave()
      }}
    >
      <div style={{
        // No overflow: hidden here: it would stop the toolbar sticking (R13).
        borderRadius: 18, background: COLORS.panel,
        boxShadow: focused
          ? `0 0 0 2px ${alpha(BRIEF_UI.blue, 0.08)}, 0 4px 20px ${alpha(BRIEF_UI.ink, 0.04)}`
          : `0 2px 12px ${alpha(BRIEF_UI.ink, 0.05)}`,
        transition: 'box-shadow .12s',
      }}>
        {/* Pinned to the top of the panel while a long brief scrolls (FR-070). */}
        <div ref={toolbarRef} role="toolbar" aria-label={t('toolbar')} onKeyDown={onToolbarKey} data-brief-toolbar="" style={{
          display: 'flex', alignItems: 'center', gap: phone ? 2 : 4, flexWrap: phone ? 'nowrap' : 'wrap',
          overflowX: phone ? 'auto' : undefined, scrollbarWidth: phone ? 'none' : undefined,
          minHeight: phone ? 48 : 58, padding: phone ? '6px 8px' : '10px 16px',
          background: BRIEF_UI.surface, borderRadius: '18px 18px 0 0',
          position: 'sticky', top: 0, zIndex: 5,
        }}>
          {/* Undo / Redo (FR-013) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ToolButton title={withShortcut(t('undo'), 'Mod+Z')} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
              <ToolIcon name="undo" />
            </ToolButton>
            <ToolButton title={withShortcut(t('redo'), 'Mod+Shift+Z')} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
              <ToolIcon name="redo" />
            </ToolButton>
          </div>

          {!phone && <Sep />}

          {/* Text style */}
          <div style={{ position: 'relative' }}>
            <ToolButton buttonRef={styleBtn} title={t('textStyle')} active={menu === 'style'} wide chip menu expanded={menu === 'style'}
                        onClick={() => setMenu(m => (m === 'style' ? null : 'style'))}>
              <span style={currentStyle === 'paragraph' ? undefined : { fontWeight: 700 }}>{t(styleItems.find(b => b.id === currentStyle)?.labelKey ?? 'normal')}</span>
              <ToolIcon name="chevron" size={14} />
            </ToolButton>
            {menu === 'style' && (
              <Menu id="style" label={t('textStyle')} anchor={styleBtn.current} onClose={() => setMenu(null)}>
                {styleItems.map(item => (
                  // setHeading, not toggleHeading: picking the current style keeps it (FR-047).
                  <MenuItem key={item.id} icon={null} checked={item.id === currentStyle} hint={item.mdHint}
                            onClick={() => runItem(item)}>
                    <span style={STYLE_SAMPLE[item.id]}>{t(item.labelKey)}</span>
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          {!phone && <Sep />}

          {TOOLS.map((group, gi) => (
            <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {gi > 0 && !phone && <Sep />}
              {group.filter(tool => !phone || !PHONE_IN_MORE.includes(tool.id)).map(tool => (
                <ToolButton key={tool.id} title={tool.title} active={tool.active} pressed={tool.id === 'link' ? undefined : tool.active} onClick={tool.run}>
                  <span style={{ fontSize: 15 }}>{tool.label}</span>
                </ToolButton>
              ))}
            </div>
          ))}

          {!phone && <Sep />}

          {/* Insert */}
          <div style={{ position: 'relative' }}>
            <ToolButton buttonRef={insertBtn} title={t('insert')} active={menu === 'insert'} wide chip menu expanded={menu === 'insert'}
                        onClick={() => setMenu(m => (m === 'insert' ? null : 'insert'))}>
              + {t('insert')} <ToolIcon name="chevron" size={14} />
            </ToolButton>
            {menu === 'insert' && (
              <Menu id="insert" label={t('insert')} anchor={insertBtn.current} onClose={() => setMenu(null)}>
                {insertItems.map(item => (
                  <MenuItem key={item.id} icon={<ToolIcon name={item.icon} />} onClick={() => runItem(item)}
                            hint={item.mdHint ?? (item.id === 'subtask' ? t('subtaskHint') : undefined)}>
                    {t(item.labelKey)}
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
                <MenuItem icon={<ToolIcon name="clear" />} disabled={editor.state.selection.empty} onClick={() => { setMenu(null); clearFormat() }} hint={t('clearFormatHint')}>
                  {t('clearFormat')}
                </MenuItem>
                <MenuItem icon={<ToolIcon name="copy" />} onClick={() => { setMenu(null); void copyMarkdown() }}>
                  {t('copyMarkdown')}
                </MenuItem>
                {phone && TOOLS.flat().filter(tool => PHONE_IN_MORE.includes(tool.id)).map(tool => (
                  <MenuItem key={tool.id} icon={<span style={{ fontSize: 13 }}>{tool.label}</span>}
                            onClick={() => { setMenu(null); tool.run() }}>
                    {tool.title.replace(/ \(.*\)$/, '')}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          <span style={{ flex: 1 }} />

          <SaveStatusBadge
            status={save.status}
            labels={{ saved: t('saved'), saving: t('saving'), couldntSave: t('couldntSave'), retry: t('retry') }}
            onRetry={save.retry}
            compact={phone}
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
            onPickAttachment={a => {
              insertImageBlock(editor, blockSlot(editor.state, promptRange.current?.from ?? editor.state.selection.from), a.url ?? a.data ?? '', a.filename)
              setPrompt(null)
            }}
            onCancel={closePrompt}
          />
        )}

        {slash && (
          <SlashMenu state={slash} active={slashActive} onClose={() => dismissSlash(editor)} />
        )}
        {mention && (
          <MentionMenu state={mention} active={mentionActive} onClose={() => dismissMention(editor)} />
        )}

        <TableMenu editor={editor} />

        {badge && (
          <div aria-hidden="true" style={{
            position: 'fixed', left: badge.x, top: badge.y, transform: 'translate(-50%, -50%)', zIndex: 90,
            background: BRIEF_UI.ink, color: COLORS.panel, borderRadius: 6, padding: '3px 7px',
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none', fontVariantNumeric: 'tabular-nums',
          }}>{badge.text}</div>
        )}

        <LinkCard editor={editor} hiddenRef={promptOpenRef} onEdit={() => openPrompt('link')} onNote={flashNote} />

        <EditorContent editor={editor} style={{
          padding: '24px 28px 32px', borderRadius: '0 0 18px 18px',
          ['--brief-toggle-hint' as string]: JSON.stringify(t('toggleBody')),
        }} />
      </div>

      {note && (
        <div role="status" style={{ marginTop: 10, fontSize: 12, color: BRIEF_UI.ink, fontWeight: 700 }}>
          {note}
        </div>
      )}
    </div>
    </OverlayStackProvider>
  )
}
