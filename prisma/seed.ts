import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const defaultPassword = await bcrypt.hash('FluxoAdmin2026!', 10)
  const adminPassword   = await bcrypt.hash('Fluxo-rSpNJNGb9c7prM', 10)

  // Stages
  const stages = [
    { id: 'todo',        label_en: 'To Do',           label_ar: 'افكار للتنفيذ',             phase: 'Intake',   owner_role: null,                terminal_flag: false, sort_order: 0 },
    { id: 'c-prog',      label_en: 'Writing',         label_ar: 'كتابة المحتوى',             phase: 'Content',  owner_role: null,                terminal_flag: false, sort_order: 1 },
    { id: 'c-final',     label_en: 'Content Review',  label_ar: 'مراجعة المحتوى',            phase: 'Content',  owner_role: 'Marketing Manager', terminal_flag: false, sort_order: 2 },
    { id: 'c-check',     label_en: 'Islam Check',     label_ar: 'موافقة نهائية على المحتوى', phase: 'Content',  owner_role: 'Managing Director', terminal_flag: false, sort_order: 3 },
    { id: 'r-design',    label_en: 'Ready to Design', label_ar: 'جاهز للتصميم',              phase: 'Design',   owner_role: null,                terminal_flag: false, sort_order: 4 },
    { id: 'd-prog',      label_en: 'Designing',       label_ar: 'تصميم',                     phase: 'Design',   owner_role: null,                terminal_flag: false, sort_order: 5 },
    { id: 'd-check',     label_en: 'Design Review',   label_ar: 'مراجعة التصميم',            phase: 'Design',   owner_role: 'Brand Director',    terminal_flag: false, sort_order: 6 },
    { id: 'final-check', label_en: 'Final Check',     label_ar: 'المراجعة النهائية',         phase: 'Ship',     owner_role: 'Marketing Manager', terminal_flag: false, sort_order: 7 },
    { id: 'ready-publish', label_en: 'Ready to Publish', label_ar: 'جاهز للنشر',              phase: 'Ship',     owner_role: null,                terminal_flag: false, sort_order: 8 },
    { id: 'scheduled',   label_en: 'Scheduled',       label_ar: 'مجدول',                     phase: 'Ship',     owner_role: null,                terminal_flag: false, sort_order: 9 },
    { id: 'publish',     label_en: 'Published',       label_ar: 'تم النشر',                  phase: 'Ship',     owner_role: null,                terminal_flag: true,  sort_order: 10 },
  ]
  for (const s of stages) {
    await prisma.stage.upsert({ where: { id: s.id }, update: s, create: s })
  }

  // Brands
  // Emblems ship with the app (public/brands) — the Pipeline handoff §6 draws
  // the brand chips with real marks, and three of the four have artwork. The
  // Strategy Community has none in the handoff and falls back to its initial
  // on its own colour, which is what the reference does too.
  const brands = [
    { name: 'Forefront Consulting',    color: '#B4322F', logo_url: '/brands/forefront.png' },
    { name: 'Omnisight',               color: '#0E7C7B', logo_url: '/brands/omnisight.png' },
    { name: 'The Strategy Community',  color: '#7A5A2E', logo_url: null },
    { name: 'Islam Personal Branding', color: '#1E293B', logo_url: '/brands/islam.png' },
  ]
  for (const b of brands) {
    await prisma.brand.upsert({ where: { name: b.name }, update: b, create: b })
  }

  // Content types
  const labels = ['Post', 'Video', 'Reel', 'Design', 'Email', 'Story', 'Deck', 'Other']
  for (const label of labels) {
    await prisma.contentType.upsert({ where: { label }, update: {}, create: { label } })
  }

  // SLA config
  const slaStages = ['todo', 'c-prog', 'c-final', 'c-check', 'r-design', 'd-prog', 'd-check', 'final-check', 'ready-publish', 'scheduled', 'publish']
  const slaDays: Record<string, Record<string, number>> = {
    'todo':        { Post: 1, Video: 2, Reel: 2, Design: 1, Email: 1, Story: 1, Deck: 3, Other: 2 },
    'c-prog':      { Post: 2, Video: 4, Reel: 3, Design: 2, Email: 2, Story: 1, Deck: 5, Other: 3 },
    'c-final':     { Post: 1, Video: 1, Reel: 1, Design: 1, Email: 1, Story: 1, Deck: 2, Other: 1 },
    'c-check':     { Post: 1, Video: 2, Reel: 1, Design: 1, Email: 1, Story: 1, Deck: 2, Other: 1 },
    'r-design':    { Post: 1, Video: 2, Reel: 2, Design: 1, Email: 1, Story: 1, Deck: 2, Other: 2 },
    'd-prog':      { Post: 2, Video: 5, Reel: 4, Design: 3, Email: 2, Story: 1, Deck: 4, Other: 3 },
    'd-check':     { Post: 1, Video: 2, Reel: 2, Design: 1, Email: 1, Story: 1, Deck: 2, Other: 1 },
    'final-check': { Post: 1, Video: 1, Reel: 1, Design: 1, Email: 1, Story: 1, Deck: 1, Other: 1 },
    'ready-publish': { Post: 1, Video: 1, Reel: 1, Design: 1, Email: 1, Story: 1, Deck: 1, Other: 1 },
    'scheduled':   { Post: 2, Video: 2, Reel: 2, Design: 2, Email: 2, Story: 2, Deck: 2, Other: 2 },
    'publish':     { Post: 0, Video: 0, Reel: 0, Design: 0, Email: 0, Story: 0, Deck: 0, Other: 0 },
  }
  for (const stage_id of slaStages) {
    for (const [label, days] of Object.entries(slaDays[stage_id] ?? {})) {
      await prisma.slaConfig.upsert({
        where:  { stage_id_content_type_label: { stage_id, content_type_label: label } },
        update: { max_business_days: days },
        create: { stage_id, content_type_label: label, max_business_days: days },
      })
    }
  }

  // Members (initial team with default password)
  const members = [
    { name: 'Raneem',                       email: 'raneem.sarhaan@forefront.consulting', role: 'Marketing Manager',    access: 'admin',     capacity_hrs_wk: 40, status: 'Available' },
    { name: 'Islam',                        email: 'islam@forefront.consulting',   role: 'Managing Director',           access: 'superuser', capacity_hrs_wk: 20, status: 'Busy' },
    { name: 'Brand Director',               email: 'brand@forefront.consulting',   role: 'Brand Director',              access: 'superuser', capacity_hrs_wk: 35, status: 'Busy' },
    { name: 'Digital Marketing Specialist', email: 'dms@forefront.consulting',     role: 'Digital Marketing Specialist',access: 'superuser', capacity_hrs_wk: 40, status: 'Available' },
    { name: 'Content Creator',              email: 'content@forefront.consulting', role: 'Content Creator',             access: 'user',      capacity_hrs_wk: 40, status: 'Available' },
    { name: 'Graphic Designer',             email: 'design@forefront.consulting',  role: 'Graphic Designer',            access: 'user',      capacity_hrs_wk: 40, status: 'Available' },
    { name: 'Video Editor',                 email: 'video@forefront.consulting',   role: 'Video Editor',                access: 'user',      capacity_hrs_wk: 40, status: 'Available' },
  ]
  for (const m of members) {
    // The admin account gets its own password; the rest still share the
    // default until they are rotated (HANDOVER §14).
    const password_hash = m.access === 'admin' ? adminPassword : defaultPassword
    await prisma.member.upsert({
      where:  { email: m.email },
      update: {},
      create: { ...m, password_hash },
    })
  }

  // Workspace settings
  await prisma.workspaceSettings.upsert({
    where:  { id: 1 },
    update: {},
    create: { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false },
  })

  console.log('✅ Seed complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
