'use client'

/**
 * A person in a sheet cell or menu: their avatar (photo, or initials on their
 * board colour) and their name. The initials are drawn by CSS from
 * `data-initials`, so the cell's text is the name alone, for screen readers,
 * typeahead and copy.
 */
import type { Member } from '@/types/index'
import { avatarColor, initials } from '@/lib/utils'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'

export function PersonAvatar({ member }: { member: Pick<Member, 'name' | 'avatar_url'> }) {
  return (
    <span className="fx-person-av" data-initials={initials(member.name)} style={{ background: avatarColor(member.name) }} aria-hidden="true">
      <ImageWithFallback src={member.avatar_url} alt="" className="fx-person-img" fallback={null} />
    </span>
  )
}

export function PersonChip({ member, empty }: { member: Pick<Member, 'name' | 'avatar_url'> | undefined; empty?: string }) {
  if (!member) {
    return (
      <span className="fx-person">
        <span className="fx-person-av is-empty" aria-hidden="true" />
        <span className="fx-sheet-ellipsis fx-sheet-muted">{empty ?? ''}</span>
      </span>
    )
  }
  return (
    <span className="fx-person">
      <PersonAvatar member={member} />
      <span className="fx-sheet-ellipsis">{member.name}</span>
    </span>
  )
}
