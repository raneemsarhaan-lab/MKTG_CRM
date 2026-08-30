/**
 * Regenerate the PWA icons from their SVG sources.
 *
 *   node scripts/icons.mjs
 *
 * The PNGs are committed, so this is not part of the build — it exists so the
 * icons can be reproduced from the sources rather than being binaries nobody
 * can edit. Run it after changing either SVG and commit the result.
 *
 * Two sources, because the two jobs are different:
 *
 *   app/icon.svg           the rounded-rectangle mark. The browser tab, and
 *                          the manifest's "any" icons, where the app draws
 *                          its own shape.
 *   app/icon-maskable.svg  full-bleed, mark inset to the safe zone. Android's
 *                          maskable icon and iOS's apple-touch-icon, where
 *                          something else decides the shape.
 */
import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const OUT = [
  // Manifest "any" — the app supplies its own rounded corners.
  { src: 'src/app/icon.svg',          size: 192, out: 'public/icon-192.png' },
  { src: 'src/app/icon.svg',          size: 512, out: 'public/icon-512.png' },
  // Manifest "maskable" — the launcher supplies the shape.
  { src: 'src/app/icon-maskable.svg', size: 512, out: 'public/icon-maskable-512.png' },
  // iOS reads this one and ignores the manifest entirely. 180 is what current
  // iPhones ask for; Next serves it from the app directory by filename.
  { src: 'src/app/icon-maskable.svg', size: 180, out: 'src/app/apple-icon.png' },
]

for (const { src, size, out } of OUT) {
  const svg = await readFile(join(root, src))
  const png = await sharp(svg, { density: 512 }).resize(size, size).png().toBuffer()
  await writeFile(join(root, out), png)
  console.log(`${out}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`)
}
