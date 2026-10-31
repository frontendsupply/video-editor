// The project being edited, with its undo history, the selected clips and range, and the edits the toolbar, the
// keyboard and the bin make on it.

import { play } from 'cuelume'
import { type Dispatch, type RefObject, type SetStateAction, useEffect, useState } from 'react'
import {
  type Clip,
  cropRange,
  type DropTarget,
  emptyProject,
  findPlaced,
  type Media,
  mergeClips,
  newClip,
  type Project,
  parkMedia,
  placeClip,
  projectDuration,
  type Range,
  removeClip,
  rippleDelete,
  type SplitTarget,
  splitAt,
  splitRange,
  unparkMedia,
  updateClip,
} from '@/lib/model'
import type { Player } from '@/lib/player'
import { useHistory } from './useHistory'

export function useEditor({
  playerRef,
  media,
  setMedia,
  seekAfter,
  onCropped,
}: {
  playerRef: RefObject<Player | null>
  media: Record<string, Media>
  setMedia: Dispatch<SetStateAction<Record<string, Media>>>
  seekAfter: (t?: number) => void // where the preview goes once the change is in
  onCropped: (next: Project) => void
}) {
  const [project, setProject, history] = useHistory<Project>(emptyProject())
  const [selected, setSelected] = useState<string[]>([]) // clip ids, in the order they were picked
  const [range, setRange] = useState<Range | null>(null)
  const duration = projectDuration(project)
  const time = () => playerRef.current!.t
  const used = new Set([...project.video, ...project.overlay, ...project.audio].map(c => c.mediaId))

  // Selected clips or the range can disappear under an undo, a merge, or when the last clip goes.
  useEffect(() => {
    if (!selected.every(id => findPlaced(project, id))) setSelected(s => s.filter(id => findPlaced(project, id)))
    if (!duration) setRange(null)
  }, [project])

  const change = (p: Project, seekTo?: number) => {
    seekAfter(seekTo)
    setProject(p)
  }
  const patch = (c: Partial<Clip>) => setProject(p => updateClip(p, selected[0], c)) // the footer shows it for one clip
  const undo = () => history.canUndo && (play('navigate', { direction: 'back', emphasis: 'subtle' }), history.undo())
  const redo = () => history.canRedo && (play('navigate', { direction: 'forward', emphasis: 'subtle' }), history.redo())

  // Split at the playhead, or at both edges of the selected range (unless `here`: the playhead's own scissors).
  const split = (which: SplitTarget, here = false) => {
    const p = range && !here ? splitRange(project, range.a, range.b, which) : splitAt(project, time(), which)
    if (p === project) return play('error', { emphasis: 'subtle' }) // nothing under the playhead
    play('tap')
    setProject(p)
  }
  // A media file dragged from the bin onto a lane. Video lanes need a picture, audio lanes need sound.
  const place = (mediaId: string, target: DropTarget, t: number) => {
    const m = media[mediaId]
    if (target.kind === 'audio' ? !m.hasAudio : !m.hasVideo) return play('error', { emphasis: 'subtle' })
    play('tap', { emphasis: 'strong' })
    setProject(p => placeClip(p, m, target, t))
  }
  // The bin's quick adds: a video to the end of Video 1, a sound at the playhead.
  const appendVideo = (m: Media) => setProject(p => ({ ...p, video: [...p.video, newClip(m)] }))
  const addAudio = (m: Media) => setProject(p => ({ ...p, audio: [...p.audio, newClip(m, time())] }))
  // Removing a file from the bin also removes its clips from the timeline. The file stays in memory, hidden, so undo
  // can bring the clips back, and with them the file.
  const removeMedia = (id: string) => {
    play('close', { emphasis: 'strong' })
    setProject(p => {
      const q = [...p.video, ...p.overlay, ...p.audio]
        .filter(c => c.mediaId === id)
        .reduce((q, c) => removeClip(q, c.id), p)
      return { ...q, parked: (q.parked ?? []).filter(x => x.clip.mediaId !== id) }
    })
    setMedia(ms => ({ ...ms, [id]: { ...ms[id], removed: true } }))
  }
  const clipsOf = (id: string) =>
    [...project.video, ...project.overlay, ...project.audio].filter(c => c.mediaId === id).length
  // The bin's checkbox. Unchecking takes a file's clips off the timeline but keeps them aside (cuts, trims, speed and
  // places included), so checking it again puts them back as they were; a file that was never on it is added whole.
  // Each toggle is one undo step.
  const toggleMedia = (m: Media) => {
    const on = used.has(m.id)
    play('toggle', { direction: on ? 'back' : 'forward' })
    setProject(p => (on ? parkMedia(p, m.id) : unparkMedia(p, m)))
  }
  // Delete: the selected range (ripple, all tracks) or else the selected clips.
  const del = () => {
    if (range) {
      play('close', { emphasis: 'strong' })
      change(rippleDelete(project, range.a, range.b), range.a)
      setRange(null)
    } else if (selected.length) {
      play('close', { emphasis: 'strong' })
      setProject(p => selected.reduce(removeClip, p))
      setSelected([])
    }
  }
  // Merge: the selected clips that follow on from each other, as a split left them, become one clip again.
  const merged = mergeClips(project, selected)
  const merge = merged === project ? null : () => (play('tap', { emphasis: 'strong' }), setProject(merged))
  // Crop: keep only the selected range on every track, then zoom to fit what's left.
  const crop = () => {
    if (!range) return
    play('close', { emphasis: 'strong' })
    const next = cropRange(project, range.a, range.b)
    change(next, 0)
    setRange(null)
    onCropped(next)
  }
  // I / O mark the range start / end at the playhead.
  const mark = (edge: 'in' | 'out') => {
    const t = time()
    const r = edge === 'in' ? { a: t, b: Math.max(range?.b ?? duration, t) } : { a: Math.min(range?.a ?? 0, t), b: t }
    setRange(r.b - r.a > 0.01 ? r : null)
  }
  // New project: an empty timeline and bin (the files on disk aren't touched; the saved project goes too).
  const newProject = () => {
    play('close', { emphasis: 'strong' })
    playerRef.current!.pause()
    setMedia({})
    history.reset(emptyProject())
    setSelected([])
    setRange(null)
  }

  return {
    project,
    setProject,
    history,
    duration,
    used,
    selected,
    setSelected,
    range,
    setRange,
    change,
    patch,
    undo,
    redo,
    split,
    place,
    appendVideo,
    addAudio,
    removeMedia,
    clipsOf,
    toggleMedia,
    del,
    merge,
    crop,
    mark,
    newProject,
  }
}
