/**
 * One place the breakpoints are written down.
 *
 * They are needed in two languages — a media query in globals.css and a
 * `matchMedia` string in a hook — and a layout where those two disagree is a
 * layout that flickers between them at exactly one width. The CSS keeps its
 * own copy of the numbers because a stylesheet cannot import; the comment
 * beside each rule there points back here.
 *
 * Why 767: the reference layout is ≥1280, the existing rules narrow it at
 * 1279 and 1023, and below 768 is where the desktop shape stops being a
 * squeeze and starts being wrong. Phones end there; tablets keep the desktop
 * layout, which already holds down to 1023.
 */

/** The widest screen still treated as a phone. */
export const PHONE_MAX = 767

/** For `matchMedia`. Matches the `@media (max-width: 767px)` block in globals.css. */
export const PHONE_QUERY = `(max-width: ${PHONE_MAX}px)`
