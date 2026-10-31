import { useSyncExternalStore } from 'react'

// A phone-sized screen, the same width as the max-md: classes. The layout stacks, the bin lists its files and the
// footer folds its tools.
export const phone = matchMedia('(width < 48rem)')
const subscribe = (f: () => void) => (phone.addEventListener('change', f), () => phone.removeEventListener('change', f))

export const usePhone = () => useSyncExternalStore(subscribe, () => phone.matches)
