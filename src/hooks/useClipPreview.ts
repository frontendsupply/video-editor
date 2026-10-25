// Clip Preview: a bin entry open on its own (a saved clip opens marked to its part), from where the marked part is
// added to the timeline or saved to the bin as a clip of its own.
import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { play } from 'cuelume'
import { thumbnail } from '@/lib/media/import'
import { clock, newClip, type Media, type Project } from '@/lib/model'
import type { Player } from '@/lib/player'
import { toast } from '@/components/ui'
import type { Marks } from '@/components/preview/ClipPreview'

export function useClipPreview({ media, setMedia, setProject, playerRef }: {
  media: Record<string, Media>
  setMedia: Dispatch<SetStateAction<Record<string, Media>>>
  setProject: (u: (p: Project) => Project) => void
  playerRef: RefObject<Player | null>
}) {
  // The file open in Clip Preview with its marked part, and which preview is showing.
  const [source, setSource] = useState<{ id: string; marks: Marks } | null>(null)
  const [monitor, setMonitor] = useState<'sequence' | 'clip'>('sequence')
  const file = source && media[source.id] && !media[source.id].removed ? media[source.id] : null

  const open = (m: Media) => {
    play('open', { emphasis: 'subtle' })
    playerRef.current!.pause()
    setSource({ id: m.id, marks: { a: m.range?.[0] ?? 0, b: m.range?.[1] ?? m.duration } })
    setMonitor('clip')
  }
  const close = () => {
    setSource(null)
    setMonitor('sequence')
  }
  useEffect(() => void (source && !file && close()), [file]) // removed from the bin, or New project

  const show = (which: 'sequence' | 'clip') => {
    if (which === 'clip') playerRef.current!.pause()
    setMonitor(which)
  }
  const setMarks = (marks: Marks) => setSource(s => s && { ...s, marks })

  // A video goes to the end of Video 1, a sound to the playhead.
  const add = () => {
    const { a, b } = source!.marks
    const clip = { ...newClip(file!), in: a, out: b }
    play('tap', { emphasis: 'strong' })
    if (file!.hasVideo) setProject(p => ({ ...p, video: [...p.video, clip] }))
    else setProject(p => ({ ...p, audio: [...p.audio, { ...clip, start: playerRef.current!.t }] }))
  }
  const saveToBin = () => {
    const m = file!
    const { a, b } = source!.marks
    const id = crypto.randomUUID()
    const name = `${m.file.name} · ${clock(a)}–${clock(b)}`
    play('success', { emphasis: 'subtle' })
    setMedia(ms => ({ ...ms, [id]: { ...m, id, name, range: [a, b], removed: false } }))
    if (m.hasVideo) thumbnail(m.file, a).then(thumb => thumb && setMedia(ms => (ms[id] ? { ...ms, [id]: { ...ms[id], thumb } } : ms)))
    toast.add({ title: 'Clip saved to the media bin', description: name })
  }

  return { file, marks: source?.marks, monitor, show, open, close, setMarks, add, saveToBin }
}
