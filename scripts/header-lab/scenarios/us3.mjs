// US3: a quieter Inbox.
export const us3 = [
  {
    id: 'h3-urgent', hash: 'inbox=urgent',
    async run(t) {
      const b = t.page.locator('[data-inbox-button]')
      t.eq(await t.text('[data-inbox-badge]'), '8', 'badge')
      t.assert(await t.page.locator('[data-inbox-badge].is-urgent').count() === 1, 'urgent colour')
      const title = await b.getAttribute('title')
      t.assert(/late/.test(title) && /review/.test(title), `summary in the tooltip: ${title}`)
      t.assert(await t.page.locator('[data-inbox-summary]').count() === 1, 'summary kept for screen readers')
      const name = await b.evaluate(e => e.innerText + ' ' + [...e.querySelectorAll('.fx-sheet-sr')].map(x => x.textContent).join(' '))
      t.assert(/Inbox/.test(name) && /late/.test(name), 'accessible text holds the label and summary')
      const bg = await b.evaluate(e => getComputedStyle(e).backgroundColor)
      t.assert(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent', `no fill (${bg})`)
    },
  },
  {
    id: 'h3-normal', hash: 'inbox=normal',
    async run(t) {
      t.eq(await t.page.locator('[data-inbox-badge].is-urgent').count(), 0, 'not urgent')
      t.eq(await t.page.locator('[data-inbox-badge]').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(124, 58, 237)', 'purple badge')
    },
  },
  {
    id: 'h3-clear', hash: 'inbox=clear',
    async run(t) {
      t.eq(await t.page.locator('[data-inbox-badge]').count(), 0, 'no badge')
      t.eq(await t.page.locator('[data-inbox-button]').getAttribute('title'), 'All clear', 'All clear')
      t.assert(await t.page.locator('[data-inbox-button].is-zero').count() === 1, 'quiet')
    },
  },
]
