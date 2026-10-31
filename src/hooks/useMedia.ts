// The files in the bin, and their waveforms, read in the background.
import { useCallback, useState } from 'react'
import { computePeaks } from '@/lib/media/peaks'
import type { Media } from '@/lib/model'

export function useMedia() {
  const [media, setMedia] = useState<Record<string, Media>>({})

  // A file's waveform, read after import (or after a restore, if it wasn't finished). Clips saved from the same file
  // share it.
  const readPeaks = useCallback((m: Media) => {
    const wave = (patch: Partial<Media>) =>
      setMedia(ms =>
        Object.fromEntries(Object.entries(ms).map(([id, x]) => [id, x.file === m.file ? { ...x, ...patch } : x])),
      )
    computePeaks(m.file, m.duration, (peaks, done) => wave({ peaks, peaksDone: done }))
      .then(peaks => wave({ peaks, peaksDone: 1 }))
      .catch(() => wave({ peaks: undefined, peaksDone: 1 })) // the waveform is decoration; playback and export don't need it
  }, [])

  return { media, setMedia, readPeaks }
}
