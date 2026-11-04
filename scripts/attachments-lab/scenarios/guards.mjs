// Cross-cutting guards that need the browser: accessibility (axe) on the
// section, the preview, the ⋯ menu and the duplicate bar.
async function axe(t, label) {
  await t.page.addScriptTag({ url: '/axe.min.js' }).catch(() => {})
  const r = await t.page.evaluate(async () => {
    const res = await window.axe.run(document, { resultTypes: ['violations'] })
    return res.violations.filter(v => v.impact === 'critical').map(v => `${v.id}: ${v.nodes[0]?.target}`)
  })
  t.eq(r, [], `no critical accessibility issues (${label})`)
}

export const guards = [
  {
    id: 'axe',
    async run(t) {
      await axe(t, 'section')
      await t.add(lab => [lab.dataUrlToFile(lab.poster(2), 'AI Adoption Gap - Post v2.png')])
      await t.page.waitForSelector('[data-att-dupe]')
      await axe(t, 'duplicate bar')
      await t.page.click('[data-att-dupe] button:last-child')
      await t.page.locator('[data-att-open]').first().click()
      await axe(t, 'preview')
    },
  },
  {
    id: 'axe-touch-menu',
    touch: true,
    viewport: { width: 390, height: 844 },
    async run(t) {
      await t.page.locator('[data-att-more]').first().click()
      await axe(t, '⋯ menu')
    },
  },
]
