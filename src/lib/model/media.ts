// Files in the bin: how long an entry is, recognising a file picked again, and its waveform resolution.
import type { Media } from './types.ts'

// How long a bin entry is: the whole file, or the part a saved clip covers.
export const binLength = (m: Media) => (m.range ? m.range[1] - m.range[0] : m.duration)

// The same file picked again: name and size match (copies get a new modified time).
export const sameFile = (a: { name: string; size: number }, b: { name: string; size: number }) => a.name === b.name && a.size === b.size

export const PEAKS_PER_SEC = 50
