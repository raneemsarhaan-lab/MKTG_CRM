// Every scenario, in the order quickstart.md §2 lists them.
import { roundtrip } from './roundtrip.mjs'
import { save } from './save.mjs'
import { links } from './links.mjs'
import { images } from './images.mjs'
import { editing } from './editing.mjs'
import { keyboard } from './keyboard.mjs'

export const SCENARIOS = [
  ...save,
  ...links,
  ...images,
  ...editing,
  ...keyboard,
  ...roundtrip,
]
