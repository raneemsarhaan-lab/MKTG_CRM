/**
 * Keyboard shortcut labels for the person's platform: ⌘ on a Mac, Ctrl
 * elsewhere (contracts/keyboard-and-a11y.md). `Mod` in the input stands for
 * either, as it does in Tiptap's own keymaps.
 */
export function shortcut(keys: string): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  return mac
    ? keys.replace(/Mod\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥')
    : keys.replace(/Mod\+/g, 'Ctrl+')
}

/** "Bold (Ctrl+B)" / "Bold (⌘B)" */
export function withShortcut(label: string, keys: string): string {
  return `${label} (${shortcut(keys)})`
}
