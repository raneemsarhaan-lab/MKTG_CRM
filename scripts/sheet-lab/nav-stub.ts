// Sheet lab: next/navigation without a Next app (the lab page has no router).
const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => router
export const usePathname = () => '/'
export const useSearchParams = () => new URLSearchParams()
