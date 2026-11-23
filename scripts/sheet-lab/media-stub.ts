// Sheet lab: the media server actions (spec 022), stubbed so the lab bundles without the server.
const no = async () => ({ success: false as const, error: 'generic' })
export const linkToMedia = no
export const createMediaTask = no
export const unlinkMedia = no
export const relinkMedia = no
export const linkFromCalendar = no
export const mediaBoardsFor = async () => []
