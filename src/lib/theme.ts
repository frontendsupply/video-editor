// Light or dark: the html element's data-theme. index.html picks it before the first paint (the saved choice, else
// the system's); the status bar toggle flips and saves it.
import { useSyncExternalStore } from 'react'

const root = document.documentElement
const subs = new Set<() => void>()

export const useDark = () =>
  useSyncExternalStore(
    f => (subs.add(f), () => subs.delete(f)),
    () => root.dataset.theme === 'dark',
  )

export function setDark(dark: boolean) {
  root.dataset.theme = dark ? 'dark' : 'light'
  try {
    localStorage.setItem('theme', root.dataset.theme)
  } catch {} // storage blocked: the choice lasts until reload
  subs.forEach(f => f())
}

// A theme color for canvas drawing, which can't read CSS variables itself.
export const cssColor = (name: string) => getComputedStyle(root).getPropertyValue(name)
