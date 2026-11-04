// US1: see every clip of a video in one dense sheet (FR-001–FR-005).
export const us1 = [
  {
    id: 'smoke',
    async run(t) {
      const rows = await t.rows()
      t.assert(rows[0] === 'v:v1', `video row first: ${rows[0]}`)
    },
  },
]
