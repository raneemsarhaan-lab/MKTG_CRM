/** Spec 024 (§8): run the one-time clip move on its own (the seed runs it once; the lab checks it here). */
import { PrismaClient } from '@prisma/client'
import { moveTodoClips } from '@/lib/space-settings-server'

const prisma = new PrismaClient()
moveTodoClips(prisma).then(n => console.log(`${n} clips moved`)).catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
