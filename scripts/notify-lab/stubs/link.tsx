// next/link for the lab: an anchor whose clicks are recorded, not followed.
import React, { forwardRef } from 'react'
type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, onClick, prefetch: _p, ...rest }, ref) {
  return <a ref={ref} href={href} {...rest} onClick={e => {
    e.preventDefault()
    onClick?.(e)
    ;(window.__nav ??= { pushed: [], refreshed: 0 }).pushed.push(href)
  }} />
})
export default Link
