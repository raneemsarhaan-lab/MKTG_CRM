'use client'

/**
 * The Editor and Type cells (spec 008 FR-025): people, editing roles first,
 * then everyone else, then Unassigned; and the content types.
 */
import type { useTranslations } from 'next-intl'
import type { Member } from '@/types/index'
import { isEditingRole } from './columns'
import type { MenuItem } from './SheetMenu'

/** Members in the Editor menu's order: editing roles first, each part by name. */
export function editorOrder(members: Member[]): Member[] {
  return [...members].sort((a, b) =>
    Number(isEditingRole(b.role)) - Number(isEditingRole(a.role)) || a.name.localeCompare(b.name))
}

export function editorMenuItems(
  members: Member[], current: string | null | undefined,
  t: ReturnType<typeof useTranslations>, choose: (id: string) => void,
): MenuItem[] {
  return [
    ...editorOrder(members).map(m => ({
      key: m.id, text: `${m.name}, ${m.role}`, label: m.name, hint: m.role,
      tone: m.id === current ? ('next' as const) : undefined,
      onSelect: () => choose(m.id),
    })),
    { key: '', text: t('unassigned'), label: t('unassigned'), tone: !current ? ('next' as const) : undefined, onSelect: () => choose('') },
  ]
}

export function typeMenuItems(types: { label: string }[], current: string, choose: (label: string) => void): MenuItem[] {
  return types.map(ct => ({
    key: ct.label, text: ct.label, label: ct.label,
    tone: ct.label === current ? ('next' as const) : undefined,
    onSelect: () => choose(ct.label),
  }))
}

export function EditorContent({ member, t }: { member: Member | undefined; t: ReturnType<typeof useTranslations> }) {
  return member
    ? <span className="fx-sheet-ellipsis">{member.name}</span>
    : <span className="fx-sheet-ellipsis fx-sheet-muted">{t('unassigned')}</span>
}
