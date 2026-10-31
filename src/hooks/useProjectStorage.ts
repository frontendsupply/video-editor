// The project is saved as you go. On load the last one comes back by itself when the browser still lets us read its
// files; otherwise the restore panel asks to read them again (or to pick them) or to start fresh, and adding any other
// file starts fresh with it. Nothing is saved until that's settled, so the empty editor never overwrites it.

import { play } from 'cuelume'
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'
import type { Picked } from '@/lib/media/import'
import type { Media, Project } from '@/lib/model'
import { clear, isFileOf, load, readHandles, type Saved, save, toMedia } from '@/lib/store'
import { useLatest } from './useLatest'

// The last project, waiting for its files: the ones found so far, and whether the browser was already asked for the rest.
export type Restore = { saved: Saved; files: Map<string, File>; asked?: boolean }

export function useProjectStorage({
  project,
  media,
  setMedia,
  reset,
  readPeaks,
}: {
  project: Project
  media: Record<string, Media>
  setMedia: Dispatch<SetStateAction<Record<string, Media>>>
  reset: (p: Project) => void // a new starting point for the undo history
  readPeaks: (m: Media) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [restore, setRestore] = useState<Restore | null>(null)
  const pending = useLatest(restore)

  useEffect(() => {
    load()
      .then(async saved => {
        if (!saved) return
        const files = await readHandles(saved.media, false)
        if (files.size === saved.media.length) apply(saved, files)
        else setRestore({ saved, files })
      })
      .catch(e => console.warn("Couldn't load the saved project", e))
      .finally(() => setLoaded(true))
  }, [])

  // Every change is saved a moment later (and right away when the page is hidden or closed).
  useEffect(() => {
    if (!loaded || restore) return
    const now = () => save(project, media)
    const later = setTimeout(now, 300)
    addEventListener('pagehide', now) // closing the tab inside those 300 ms
    return () => (clearTimeout(later), removeEventListener('pagehide', now))
  }, [project, media, loaded, restore])

  function apply(saved: Saved, files: Map<string, File>) {
    const ms = saved.media.map(m => toMedia(m, files.get(m.id)!))
    setMedia(Object.fromEntries(ms.map(m => [m.id, m])))
    reset(saved.project)
    ms.filter(m => m.hasAudio && m.peaksDone !== 1).forEach(readPeaks)
    setRestore(null)
  }

  // One click lets the browser read the saved files again; any it can't reach have to be picked.
  async function reconnect() {
    const r = pending.current!
    const files = new Map([
      ...r.files,
      ...(await readHandles(
        r.saved.media.filter(m => !r.files.has(m.id)),
        true,
      )),
    ])
    if (files.size === r.saved.media.length) apply(r.saved, files)
    else setRestore({ ...r, files, asked: true })
  }

  // Files picked or dropped while the panel is up: when they're all from the last project they reconnect it, matched
  // by name and size (a new handle is kept, so next time they come back by themselves). Any other file starts a new
  // project instead, with everything added. Returns false when they're to be imported as usual.
  function locate(items: Picked[]) {
    const r = pending.current
    if (!r) return false
    if (!items.every(x => r.saved.media.some(m => isFileOf(m, x.file)))) return (discard(), false)
    const files = new Map(r.files)
    const media = r.saved.media.map(m => {
      const found = !files.has(m.id) && items.find(x => isFileOf(m, x.file))
      if (!found) return m
      files.set(m.id, found.file)
      return found.handle ? { ...m, handle: found.handle } : m
    })
    const saved = { ...r.saved, media }
    if (files.size === media.length) apply(saved, files)
    else setRestore({ ...r, saved, files })
    return true
  }

  const discard = () => {
    clear().catch(() => {})
    setRestore(null)
  }
  const startFresh = () => (play('close'), discard())

  return { loaded, restore, reconnect, locate, startFresh }
}
