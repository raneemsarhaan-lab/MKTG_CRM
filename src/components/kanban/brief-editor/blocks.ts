import type { Editor } from '@tiptap/core'
import { blockSlot } from './imageUpload'
import type { ToolIconName } from './Toolbar'
import type { PromptKind } from './ValuePrompt'

/** What a block item needs from the editor component to run. */
export interface BlockContext {
  openPrompt: (kind: PromptKind) => void
  canCreateSubtask: boolean
}

export interface BlockItem {
  id: string
  /** Key in the `briefEditor` messages namespace. */
  labelKey: string
  /** Extra words the "/" menu matches, in English and Arabic. */
  keywords: string[]
  icon: ToolIconName
  /** The Markdown shortcut that does the same thing, shown beside the item (FR-043). */
  mdHint?: string
  /** 'style' items appear in Text style; 'block' items in Insert; both in "/". */
  group: 'style' | 'block'
  /** Hidden unless the host can create subtasks. */
  needsSubtasks?: boolean
  run: (editor: Editor, ctx: BlockContext) => void
}

/**
 * Every text style and insertable block, in one list shared by the Insert
 * menu, the Text style menu and the "/" menu, so the three never disagree
 * (research R6, R21).
 */
export const BLOCK_ITEMS: BlockItem[] = [
  { id: 'paragraph', labelKey: 'normal', keywords: ['text', 'paragraph', 'body', 'نص', 'فقرة'], icon: 'text', group: 'style',
    run: e => { e.chain().focus().setParagraph().run() } },
  { id: 'h1', labelKey: 'h1', keywords: ['heading', 'title', 'h1', 'عنوان'], icon: 'heading', mdHint: '#', group: 'style',
    run: e => { e.chain().focus().setHeading({ level: 1 }).run() } },
  { id: 'h2', labelKey: 'h2', keywords: ['heading', 'subtitle', 'h2', 'عنوان'], icon: 'heading', mdHint: '##', group: 'style',
    run: e => { e.chain().focus().setHeading({ level: 2 }).run() } },
  { id: 'h3', labelKey: 'h3', keywords: ['heading', 'h3', 'عنوان'], icon: 'heading', mdHint: '###', group: 'style',
    run: e => { e.chain().focus().setHeading({ level: 3 }).run() } },
  { id: 'bulletList', labelKey: 'bulletList', keywords: ['bullet', 'list', 'unordered', 'قائمة', 'نقاط'], icon: 'bulletList', mdHint: '-', group: 'block',
    run: e => { e.chain().focus().toggleBulletList().run() } },
  { id: 'orderedList', labelKey: 'numberedList', keywords: ['numbered', 'ordered', 'list', 'قائمة', 'مرقمة'], icon: 'numberedList', mdHint: '1.', group: 'block',
    run: e => { e.chain().focus().toggleOrderedList().run() } },
  { id: 'task', labelKey: 'task', keywords: ['task', 'todo', 'checkbox', 'checklist', 'مهمة', 'مهام'], icon: 'task', mdHint: '[ ]', group: 'block',
    run: e => { insertTask(e) } },
  { id: 'subtask', labelKey: 'subtask', keywords: ['subtask', 'child', 'مهمة فرعية'], icon: 'subtask', group: 'block', needsSubtasks: true,
    run: (_e, ctx) => ctx.openPrompt('subtask') },
  { id: 'quote', labelKey: 'quote', keywords: ['quote', 'blockquote', 'اقتباس'], icon: 'quote', mdHint: '>', group: 'block',
    run: e => { e.chain().focus().toggleBlockquote().run() } },
  { id: 'table', labelKey: 'table', keywords: ['table', 'grid', 'جدول'], icon: 'table', group: 'block',
    run: e => { insertTable(e) } },
  { id: 'image', labelKey: 'image', keywords: ['image', 'picture', 'photo', 'screenshot', 'صورة'], icon: 'image', group: 'block',
    run: (_e, ctx) => ctx.openPrompt('image') },
  { id: 'youtube', labelKey: 'youtube', keywords: ['youtube', 'video', 'embed', 'فيديو', 'يوتيوب'], icon: 'youtube', group: 'block',
    run: (_e, ctx) => ctx.openPrompt('youtube') },
  { id: 'toggle', labelKey: 'toggle', keywords: ['toggle', 'collapse', 'details', 'قابلة للطي'], icon: 'toggle', group: 'block',
    run: e => { insertToggle(e) } },
  { id: 'divider', labelKey: 'divider', keywords: ['divider', 'line', 'rule', 'separator', 'فاصل', 'خط'], icon: 'divider', mdHint: '---', group: 'block',
    run: e => { e.chain().focus().setHorizontalRule().run() } },
  { id: 'toc', labelKey: 'toc', keywords: ['toc', 'contents', 'محتويات'], icon: 'toc', group: 'block',
    run: e => { insertToc(e) } },
]

export function blockItems(ctx: BlockContext): BlockItem[] {
  return BLOCK_ITEMS.filter(b => !b.needsSubtasks || ctx.canCreateSubtask)
}

/** Items matching what was typed after "/", by label or keyword. */
export function filterBlocks(items: BlockItem[], query: string, label: (key: string) => string): BlockItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(b =>
    label(b.labelKey).toLowerCase().includes(q) || b.keywords.some(k => k.toLowerCase().includes(q)))
}

// ── Block inserts (spec 005 US6) ──────────────────────────────────────────

/**
 * A new empty checklist item on the line below, leaving the current line as
 * it is (FR-062). It used to turn the current line into a checkbox (E11).
 */
function insertTask(e: Editor) {
  const { $from } = e.state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'taskItem') {
      // Already in a checklist: a new item after this one.
      const end = $from.end(d) - 1
      e.chain().focus().setTextSelection(end).splitListItem('taskItem').run()
      return
    }
  }
  const at = blockSlot(e.state, $from.pos)
  e.chain().focus()
    .insertContentAt(at, { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] })
    .setTextSelection(at + 3)
    .run()
}

/** An empty toggle with grey hints for its title and body (FR-065). */
function insertToggle(e: Editor) {
  const at = blockSlot(e.state, e.state.selection.from)
  e.chain().focus()
    .insertContentAt(at, { type: 'toggle', attrs: { summary: '' }, content: [{ type: 'paragraph' }] })
    .setTextSelection(at + 2)
    .run()
}

/** A labelled table-of-contents block (FR-066). */
function insertToc(e: Editor) {
  const at = blockSlot(e.state, e.state.selection.from)
  e.chain().focus().insertContentAt(at, [{ type: 'toc' }, { type: 'paragraph' }]).run()
}

/** A YouTube video block on its own line (FR-060). */
export function insertYoutube(e: Editor, src: string, near: number) {
  const at = blockSlot(e.state, near)
  e.chain().focus().insertContentAt(at, [{ type: 'youtube', attrs: { src } }, { type: 'paragraph' }]).run()
}

/** A full-width 3 × 3 table with a header row, on its own line (FR-064). */
function insertTable(e: Editor) {
  const at = blockSlot(e.state, e.state.selection.from)
  const cell = (type: string) => ({ type, content: [{ type: 'paragraph' }] })
  const row = (type: string) => ({ type: 'tableRow', content: [cell(type), cell(type), cell(type)] })
  e.chain().focus()
    .insertContentAt(at, [{ type: 'table', content: [row('tableHeader'), row('tableCell'), row('tableCell')] }, { type: 'paragraph' }])
    .setTextSelection(at + 4)
    .run()
}
