import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { MAX_ATTACHMENTS_PER_GO, MAX_UPLOAD_BYTES } from '@/lib/attachments'

export type UploadResult =
  | { ok: true; url: string; filename: string }
  | { ok: false; error: string }

export type UploadUnavailableReason = 'not-created' | 'no-permission' | 'no-storage'

/** Everything the plugin needs from the editor component, read when used. */
export interface ImageUploadContext {
  upload?: (file: File) => Promise<UploadResult>
  unavailableReason: UploadUnavailableReason
  note: (msg: string) => void
  pendingChanged: (n: number) => void
  text: {
    uploading: (name: string) => string
    failed: (name: string, error: string) => string
    notAnImage: string
    tooBig: (name: string, mb: number) => string
    skipped: (max: number) => string
    unavailable: (reason: UploadUnavailableReason) => string
  }
}

const key = new PluginKey<DecorationSet>('briefImageUpload')

type Meta = { add?: { id: string; pos: number; label: string } } | { remove?: string }

/**
 * Paste or drop a screenshot into the brief. FR-032–036, research R5,
 * data-model §4.
 *
 * Each image file becomes a job: a placeholder ("Uploading hero.png…") appears
 * where it will go, the file is uploaded as an attachment of the task through
 * the host's `upload`, and the placeholder is replaced by the image. Uploads
 * run one at a time, in order. The placeholder is a decoration, never part of
 * the document, so a half-finished upload can never be saved into the brief.
 * A failed upload removes its placeholder and names the file. Without an
 * uploader (the Create Task form, no permission, no storage) the person is
 * told why, and nothing is inserted.
 */
export const ImageUpload = Extension.create<{ ctx: { current: ImageUploadContext } | null }>({
  name: 'briefImageUpload',
  addOptions() { return { ctx: null } },

  addProseMirrorPlugins() {
    const editor = this.editor
    const ctxRef = this.options.ctx
    let pending = 0
    let queue: Promise<void> = Promise.resolve()
    let seq = 0

    const setPending = (n: number) => { pending = n; ctxRef?.current.pendingChanged(n) }

    function accept(view: EditorView, files: File[], at: number): boolean {
      const ctx = ctxRef?.current
      if (!ctx || !files.length) return false
      const images = files.filter(f => f.type.startsWith('image/'))
      if (images.length < files.length) ctx.note(ctx.text.notAnImage)
      if (!images.length) return true
      if (!ctx.upload) { ctx.note(ctx.text.unavailable(ctx.unavailableReason)); return true }

      const taken = images.slice(0, MAX_ATTACHMENTS_PER_GO)
      if (images.length > taken.length) ctx.note(ctx.text.skipped(MAX_ATTACHMENTS_PER_GO))

      const pos = blockSlot(view.state, at)
      for (const file of taken) {
        if (file.size > MAX_UPLOAD_BYTES) {
          ctx.note(ctx.text.tooBig(file.name, Math.round(MAX_UPLOAD_BYTES / 1_000_000)))
          continue
        }
        const id = `upl-${Date.now()}-${seq++}`
        view.dispatch(view.state.tr.setMeta(key, { add: { id, pos, label: ctx.text.uploading(file.name) } } satisfies Meta))
        setPending(pending + 1)
        queue = queue.then(() => run(id, file))
      }
      return true
    }

    async function run(id: string, file: File) {
      const ctx = ctxRef?.current
      let result: UploadResult
      try {
        result = ctx?.upload ? await ctx.upload(file) : { ok: false, error: 'no uploader' }
      } catch (e) {
        result = { ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) }
      }
      setPending(Math.max(0, pending - 1))
      if (editor.isDestroyed) return
      const where = findPlaceholder(editor.state, id)
      editor.view.dispatch(editor.state.tr.setMeta(key, { remove: id } satisfies Meta))
      if (!result.ok) { ctx?.note(ctx.text.failed(file.name, result.error)); return }
      const at = where ?? blockSlot(editor.state, editor.state.selection.from)
      insertImageBlock(editor, at, result.url, result.filename)
    }

    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          set = set.map(tr.mapping, tr.doc)
          const meta = tr.getMeta(key) as Meta | undefined
          if (meta && 'add' in meta && meta.add) {
            const { id, pos, label } = meta.add
            // side: 1 so an image inserted at this slot pushes the later placeholders
            // after it, keeping several pasted images in their pasted order.
            set = set.add(tr.doc, [Decoration.widget(pos, () => placeholderDom(label), { id, side: 1, key: id })])
          }
          if (meta && 'remove' in meta && meta.remove) {
            const id = meta.remove
            set = set.remove(set.find(undefined, undefined, spec => spec.id === id))
          }
          return set
        },
      },
      props: {
        decorations(state) { return key.getState(state) },
        handlePaste(view, event) {
          const files = [...(event.clipboardData?.files ?? [])]
          if (!files.length) return false
          event.preventDefault()
          return accept(view, files, view.state.selection.from)
        },
        handleDrop(view, event, _slice, moved) {
          if (moved) return false
          const files = [...(event.dataTransfer?.files ?? [])]
          if (!files.length) return false
          event.preventDefault()
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
          return accept(view, files, at)
        },
      },
    })]
  },
})

/**
 * Where an image block can go for a cursor at `pos`: replacing an empty
 * paragraph the cursor is in, else right after the top-level block it is in.
 */
export function blockSlot(state: EditorState, pos: number): number {
  const $p = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)))
  if ($p.depth === 0) return $p.pos
  const block = $p.node(1)
  if (block.type.name === 'paragraph' && block.content.size === 0) return $p.before(1)
  return $p.after(1)
}

/** Put an image on its own line at a block position, with an empty line after
 *  it to keep typing in — never glued onto the text around it (R4). */
export function insertImageBlock(editor: Editor, at: number, src: string, alt = '') {
  const size = editor.state.doc.content.size
  const pos = Math.max(0, Math.min(at, size))
  const $p = editor.state.doc.resolve(pos)
  const replaceEmpty = $p.depth === 0 && $p.nodeAfter?.type.name === 'paragraph' && $p.nodeAfter.content.size === 0
  const range = replaceEmpty ? { from: pos, to: pos + $p.nodeAfter!.nodeSize } : pos
  editor.chain().focus().insertContentAt(range, [
    { type: 'image', attrs: { src, alt } },
    { type: 'paragraph' },
  ]).run()
}

function findPlaceholder(state: EditorState, id: string): number | null {
  const found = key.getState(state)?.find(undefined, undefined, spec => spec.id === id) ?? []
  return found.length ? found[0].from : null
}

function placeholderDom(label: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'fx-upload'
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('data-upload-placeholder', '')
  const spin = document.createElement('i')
  spin.setAttribute('aria-hidden', 'true')
  el.append(spin, document.createTextNode(label))
  return el
}
