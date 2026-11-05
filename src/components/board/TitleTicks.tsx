/** The purple tick accent beside the page title (spec 011 FR-004, from the reference). Mirrored in RTL by CSS. */
export function TitleTicks() {
  return (
    <svg className="fx-hd-ticks" width="40" height="34" viewBox="0 0 40 34" fill="none" aria-hidden="true">
      <path d="M8 18L17 4M10 25l20-7M12 31h18" stroke="var(--hd-tick)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
