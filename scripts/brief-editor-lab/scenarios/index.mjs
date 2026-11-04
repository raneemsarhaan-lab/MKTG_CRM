// Every scenario, in the order quickstart.md §2 lists them.
import { roundtrip } from './roundtrip.mjs'
import { save } from './save.mjs'
import { links } from './links.mjs'

export const SCENARIOS = [
  ...save,
  ...links,
  ...roundtrip,
]
