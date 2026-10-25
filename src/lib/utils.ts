// Small helpers shared across the app.
export { cn } from 'cn' // joins class names (conditionally) and settles conflicting utility classes: the last one wins

// The shortcut modifier as it's labelled on this platform.
export const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'

// Keys inside these belong to the control, not to the editor shortcuts.
export const OWN_KEYS =
  'input, select, textarea, [role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="tab"], [role="alertdialog"]'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
