// Small helpers shared across the app.
export { cn } from 'cn' // joins class names (conditionally) and settles conflicting utility classes: the last one wins

// The shortcut modifier as it's labelled on this platform.
export const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'

// Keys inside these belong to the control, not to the editor shortcuts.
export const OWN_KEYS =
  'input, select, textarea, [role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="tab"], [role="alertdialog"]'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Copy: counts and lists follow the language's own plural and list rules. `#` in a form is the count.
const plurals = new Intl.PluralRules('en')
export const plural = (n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) =>
  (forms[plurals.select(n)] ?? forms.other).replace('#', String(n))
export const list = (items: string[]) => new Intl.ListFormat('en').format(items)
