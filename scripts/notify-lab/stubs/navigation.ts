// next/navigation for the lab: no app router, so the router records instead.
declare global { interface Window { __nav?: { pushed: string[]; refreshed: number } } }
const nav = () => (window.__nav ??= { pushed: [], refreshed: 0 })
export function useRouter() {
  return {
    push: (url: string) => { nav().pushed.push(url) },
    replace: (url: string) => { nav().pushed.push(url) },
    refresh: () => { nav().refreshed++ },
    back: () => {}, forward: () => {}, prefetch: () => {},
  }
}
export function usePathname() { return '/board' }
export function useSearchParams() { return new URLSearchParams(location.hash.slice(1)) }
