// Every edit takes a project and returns a new one; nothing is changed in place, so undo is just the previous value.
import { layoutAll, layoutFree, projectDuration } from './layout.ts'
import { clipLength, laneOf, newClip, sourceTime } from './project.ts'
import type { Clip, DropTarget, Media, Placed, Project, SplitTarget } from './types.ts'
import { insertVideo, layoutVideo, packVideo, restoreVideo, withoutVideo } from './video1.ts'

const mapClips = (p: Project, f: (c: Clip) => Clip[]): Project => ({
  ...p,
  video: p.video.flatMap(f),
  overlay: p.overlay.flatMap(f),
  audio: p.audio.flatMap(f),
})

export const updateClip = (p: Project, id: string, patch: Partial<Clip>) =>
  mapClips(p, c => (c.id === id ? [{ ...c, ...patch }] : [c]))

export const removeClip = (p: Project, id: string) => ({ ...mapClips(p, c => (c.id === id ? [] : [c])), video: withoutVideo(p.video, id) })

// Slide a Video 1 clip so it starts at `start` (not before the clip in front of it ends); the clips after it ride along.
export function slideVideoClip(p: Project, id: string, start: number): Project {
  const placed = layoutVideo(p.video)
  const i = placed.findIndex(x => x.clip.id === id)
  if (i < 0) return p
  const gap = start - (i ? placed[i - 1].end : 0)
  return updateClip(p, id, { gap: gap > 1e-6 ? gap : undefined })
}

const EDGE = 0.05 // a split at the playhead never leaves slivers shorter than this at a clip edge
const EXACT = 1e-3 // ripple delete and crop cut where asked, so every track shifts by the same amount

// Cut every targeted clip that t falls inside (by more than `edge`). Timeline positions don't change.
export function splitAt(p: Project, t: number, which: SplitTarget = 'all', edge = EDGE): Project {
  const cuts = new Map<Clip, Clip[]>()
  const visit = (track: 'video' | 'overlay' | 'audio') => (x: Placed) => {
    if (which !== 'all' && which !== track && which !== x.clip.id) return
    if (t <= x.start + edge || t >= x.end - edge) return
    const at = sourceTime(x, t)
    cuts.set(x.clip, [
      { ...x.clip, out: at },
      { ...x.clip, id: crypto.randomUUID(), in: at, start: t, gap: undefined }, // on Video 1 it follows straight on
    ])
  }
  layoutVideo(p.video).forEach(visit('video'))
  layoutFree(p.overlay).forEach(visit('overlay'))
  layoutFree(p.audio).forEach(visit('audio'))
  return cuts.size ? mapClips(p, c => cuts.get(c) ?? [c]) : p
}

export const splitRange = (p: Project, a: number, b: number, which: SplitTarget = 'all', edge = EDGE) =>
  splitAt(splitAt(p, a, which, edge), b, which, edge)

// Remove [a, b) from every track and close the gap: everything after b moves left by exactly b - a, on every track.
export function rippleDelete(p: Project, a: number, b: number): Project {
  const q = splitRange(p, a, b, 'all', EXACT)
  const inside = (x: Placed) => x.start >= a - EXACT && x.end <= b + EXACT
  const free = (clips: Clip[]) =>
    layoutFree(clips)
      .filter(x => !inside(x))
      .map(x => (x.start >= b - EXACT ? { ...x.clip, start: Math.max(0, x.clip.start - (b - a)) } : x.clip))
  return {
    ...q,
    video: packVideo(layoutVideo(q.video).filter(x => !inside(x)).map(x => ({ clip: x.clip, start: x.start >= b - EXACT ? x.start - (b - a) : x.start }))),
    overlay: free(q.overlay),
    audio: free(q.audio),
  }
}

// Keep only [a, b] of every track: everything after b and before a is cut away, and what's left starts at 0.
export const cropRange = (p: Project, a: number, b: number) => rippleDelete(rippleDelete(p, b, projectDuration(p)), 0, a)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MIN_LEN = 0.1

// Drag a clip edge by d timeline-seconds. anchor=true (audio track) keeps content in place when trimming the left edge.
export function trimClip(c: Clip, edge: 'in' | 'out', d: number, mediaDuration: number, anchor: boolean): Clip {
  if (edge === 'out') return { ...c, out: clamp(c.out + d * c.speed, c.in + MIN_LEN * c.speed, mediaDuration) }
  const lo = anchor ? Math.max(0, c.in - c.start * c.speed) : 0
  const inn = clamp(c.in + d * c.speed, lo, Math.max(lo, c.out - MIN_LEN * c.speed)) // a clip already shorter stays put
  return { ...c, in: inn, start: anchor ? c.start + (inn - c.in) / c.speed : c.start }
}

// Drag a Video 1 clip's left edge by d timeline-seconds: its start moves into (or back out of) the gap in front of it,
// while its end and every clip after it stay put. It can't grow past the clip in front.
export function trimVideoIn(c: Clip, d: number, mediaDuration: number): Clip {
  const t = trimClip({ ...c, start: c.gap ?? 0 }, 'in', d, mediaDuration, true)
  return { ...c, in: t.in, gap: t.start > 1e-6 ? t.start : undefined }
}

// Free clips (overlay / audio) move in time and across lanes of their kind. Video 1 clips slide or move with slideVideoClip / moveVideoClip.
export function moveClip(p: Project, id: string, d: number, laneDelta = 0): Project {
  const kind = p.overlay.some(c => c.id === id) ? 'overlay' : 'audio'
  const c = p[kind].find(c => c.id === id)!
  const lanes = kind === 'overlay' ? p.overlayTracks : p.audioTracks
  return updateClip(p, id, { start: Math.max(0, c.start + d), lane: clamp(laneOf(c) + laneDelta, 0, lanes - 1) })
}

// Move a video clip to Video 1 (lane -1, also within it) or an overlay lane so it starts at timeline time t.
// Leaving its place on Video 1 closes up its length; on Video 1 it slots in by where its middle lands, at t if there's room.
export function moveVideoClip(p: Project, id: string, lane: number, t: number): Project {
  const clip = p.video.find(c => c.id === id) ?? p.overlay.find(c => c.id === id)
  if (!clip) return p
  const rest = { ...p, video: withoutVideo(p.video, id), overlay: p.overlay.filter(c => c.id !== id) }
  if (lane >= 0) return { ...rest, overlay: [...rest.overlay, { ...clip, start: Math.max(0, t), lane, gap: undefined }] }
  return { ...rest, video: insertVideo(rest.video, clip, Math.max(0, t)) }
}

// Move a video clip's sound into its own audio clip, at the same time on the first audio lane that's free there
// (a new lane if none is), and mute the video clip. From then on they move, trim and split separately.
export function unlinkAudio(p: Project, id: string): Project {
  const pl = layoutAll(p).find(x => x.clip.id === id)
  if (!pl || p.audio.includes(pl.clip) || pl.clip.muted) return p
  const taken = (l: number) => layoutFree(p.audio).some(x => laneOf(x.clip) === l && x.start < pl.end && pl.start < x.end)
  let lane = 0
  while (lane < p.audioTracks && taken(lane)) lane++
  return {
    ...updateClip(p, id, { muted: true }),
    audio: [...p.audio, { ...pl.clip, id: crypto.randomUUID(), start: pl.start, lane, gap: undefined }],
    audioTracks: Math.max(p.audioTracks, lane + 1),
  }
}

// Drop a media file on a lane at timeline time t. On Video 1 it slots in between the clips nearest t.

export function placeClip(p: Project, m: Media, target: DropTarget, t: number): Project {
  if (target.kind === 'video') {
    return { ...p, video: insertVideo(p.video, newClip(m), Math.max(0, t), t) }
  }
  return { ...p, [target.kind]: [...p[target.kind], { ...newClip(m, Math.max(0, t)), lane: target.lane }] }
}

// Where a new sound goes on Audio 1: right after the last clip there.
export const audio1End = (p: Project) => Math.max(0, ...layoutFree(p.audio.filter(c => !laneOf(c))).map(x => x.end))

// Uncheck a file in the bin: take its clips off the timeline (Video 1 closes up as when deleting them) but set them
// aside with where they were, so checking it again puts them back.
export function parkMedia(p: Project, mediaId: string): Project {
  const mine = (c: Clip) => c.mediaId === mediaId
  const parked = [
    ...layoutVideo(p.video).filter(x => mine(x.clip)).map(x => ({ track: 'video' as const, clip: { ...x.clip, start: x.start } })),
    ...p.overlay.filter(mine).map(clip => ({ track: 'overlay' as const, clip })),
    ...p.audio.filter(mine).map(clip => ({ track: 'audio' as const, clip })),
  ]
  if (!parked.length) return p
  const q = parked.reduce((q, x) => removeClip(q, x.clip.id), p)
  return { ...q, parked: [...(p.parked ?? []).filter(x => !mine(x.clip)), ...parked] }
}

// Check a file in the bin: put its set-aside clips back where they were (Video 1 clips slot in at their old times, the
// others return to their tracks, re-adding a track if it was removed since). A file that was never on the timeline is
// added whole, as an import would: a video at the end of Video 1, a sound after the last clip on Audio 1.
export function unparkMedia(p: Project, m: Media): Project {
  const mine = (p.parked ?? []).filter(x => x.clip.mediaId === m.id)
  const rest = { ...p, parked: (p.parked ?? []).filter(x => x.clip.mediaId !== m.id) }
  if (!mine.length) return m.hasVideo ? { ...rest, video: [...rest.video, newClip(m)] } : { ...rest, audio: [...rest.audio, newClip(m, audio1End(rest))] }
  const back = (track: 'video' | 'overlay' | 'audio') => mine.filter(x => x.track === track).map(x => x.clip)
  const video = back('video').sort((a, b) => a.start - b.start).reduce((v, c) => restoreVideo(v, c, c.start), rest.video)
  const [overlay, audio] = [back('overlay'), back('audio')]
  return {
    ...rest,
    video,
    overlay: [...rest.overlay, ...overlay],
    audio: [...rest.audio, ...audio],
    overlayTracks: Math.max(rest.overlayTracks, ...overlay.map(c => laneOf(c) + 1)),
    audioTracks: Math.max(rest.audioTracks, ...audio.map(c => laneOf(c) + 1)),
  }
}
