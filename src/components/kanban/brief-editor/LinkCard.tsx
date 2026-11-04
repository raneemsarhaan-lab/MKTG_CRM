'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import { hostOf, prettyPath, hrefFor } from '@/lib/links'
import { ToolIcon } from './Toolbar'

/**
 * The card that appears when the cursor is in a link: where it goes, and
 * Open ↗ · Edit · Remove. FR-020, FR-021, research R3.
 *
 * Clicking a link while editing used to open it in a new tab, so a link could
 * not be clicked into to change it, and there was no way to remove one at all
 * (audit E2, E9). Now a click only places the cursor, and this card offers
 * the three things a person wants to do with a link. It replaces the old
 * selection popup, which repeated the toolbar's own buttons (E21, FR-025).
 */
export function LinkCard({ editor, hiddenRef, onEdit, onNote }: {
  editor: Editor
  /** True while the link box itself is open. A ref, because the bubble
   *  menu plugin keeps the first `shouldShow` it is given. */
  hiddenRef: React.RefObject<boolean>
  onEdit: () => void
  onNote: (msg: string) => void
}) {
  const t = useTranslations('briefEditor')
  const href = (editor.getAttributes('link').href as string | undefined) ?? ''
  const host = hostOf(href) || href
  const path = prettyPath(href)
  const shortPath = path.length > 32 ? `${path.slice(0, 31)}…` : path

  // Stable props: the bubble menu re-sends its options whenever these change
  // identity, and that update is a transaction, which re-renders the editor.
  const shouldShow = useCallback(
    ({ editor: ed, view }: { editor: Editor; view: { hasFocus: () => boolean } }) =>
      !hiddenRef.current && ed.isEditable && ed.isActive('link') && view.hasFocus(),
    [hiddenRef],
  )

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="briefLinkCard"
      shouldShow={shouldShow}
      options={CARD_OPTIONS}
    >
      <div
        role="dialog"
        aria-label={host}
        data-link-card=""
        data-overlay=""
        onMouseDown={e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault() }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 6px 6px 10px', maxWidth: 380,
          background: COLORS.panel, borderRadius: 12, boxShadow: `0 12px 32px ${alpha(BRIEF_UI.ink, 0.16)}`,
        }}
      >
        <div style={{ minWidth: 0, fontSize: 12.5, lineHeight: 1.3 }}>
          <b data-url="" dir="ltr" style={{ display: 'block', color: BRIEF_UI.ink }}>{host}</b>
          {shortPath && <span data-url="" dir="ltr" title={href} style={{ display: 'block', color: BRIEF_UI.label, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>{shortPath}</span>}
        </div>
        <a href={href.startsWith('/') ? href : hrefFor(href)} target="_blank" rel="noopener noreferrer" style={cardBtn(BRIEF_UI.blueLight, BRIEF_UI.blue)}>
          {t('open')} <ToolIcon name="external" size={12} />
        </a>
        <button type="button" onClick={onEdit} style={cardBtn(BRIEF_UI.blueLight, BRIEF_UI.blue)}>{t('edit')}</button>
        <button type="button"
                onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onNote(t('linkRemoved')) }}
                style={cardBtn('transparent', BRIEF_UI.error)}>
          {t('remove')}
        </button>
      </div>
    </BubbleMenu>
  )
}

const CARD_OPTIONS = { placement: 'bottom-start' as const, offset: 6 }

function cardBtn(bg: string, fg: string): React.CSSProperties {
  return {
    flexShrink: 0, height: 28, display: 'inline-flex', alignItems: 'center', gap: 4,
    border: 'none', borderRadius: 7, padding: '0 9px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', background: bg, color: fg, textDecoration: 'none', fontFamily: 'inherit',
  }
}
