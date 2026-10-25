// Video 1's layout, and the helpers the edits use to take clips out of it, put them in and rebuild it.
import { clipLength } from './project.ts'
import type { Clip, Placed } from './types.ts'

// Video 1 is magnetic: clips play in array order, each right after the one before it plus its own gap.
export function layoutVideo(video: Clip[]): Placed[] {
  let t = 0
  return video.map(clip => {
    const start = t + (clip.gap ?? 0)
    t = start + clipLength(clip)
    return { clip, start, end: t }
  })
}

// Rebuild Video 1 from wanted start times, in order: each clip starts at its wanted time or right after the clip before
// it, whichever is later (so nothing overlaps), and the empty space before it becomes its gap.
export function packVideo(items: { clip: Clip; start: number }[]): Clip[] {
  let end = 0
  return items.map(({ clip, start }) => {
    const s = Math.max(end, start)
    const gap = s - end > 1e-6 ? s - end : undefined
    end = s + clipLength(clip)
    return { ...clip, gap }
  })
}

// Take a clip out of Video 1: the clips after it close up its length, the empty space before it stays.
export function withoutVideo(video: Clip[], id: string): Clip[] {
  const out = layoutVideo(video).find(x => x.clip.id === id)
  if (!out) return video
  const len = out.end - out.start
  return packVideo(layoutVideo(video).filter(x => x !== out && x.clip.id !== id).map(x => ({ clip: x.clip, start: x.start >= out.end ? x.start - len : x.start })))
}

// Put a clip into Video 1 at time t, slotted between the clips by where `at` lands (by default its middle). It never
// starts before the clip in front of it ends or after the clip behind it starts; that one is pushed later only if
// they'd overlap.
export function insertVideo(video: Clip[], clip: Clip, t: number, at = t + clipLength(clip) / 2): Clip[] {
  const placed = layoutVideo(video)
  const k = placed.filter(x => (x.start + x.end) / 2 < at).length
  const start = Math.max(k ? placed[k - 1].end : 0, Math.min(t, placed[k]?.start ?? Infinity))
  return packVideo([...placed.slice(0, k), { clip: { ...clip, lane: undefined }, start }, ...placed.slice(k)])
}

// Put a clip back into Video 1 at time t, the exact inverse of taking it out: everything from t on moves right by its
// length. (If something has since come to overlap t, the clip goes right after it.)
export function restoreVideo(video: Clip[], clip: Clip, t: number): Clip[] {
  const len = clipLength(clip)
  const items = layoutVideo(video).map(x => ({ clip: x.clip, start: x.start >= t - 1e-6 ? x.start + len : x.start }))
  const k = items.filter(x => x.start < t - 1e-6).length
  return packVideo([...items.slice(0, k), { clip, start: t }, ...items.slice(k)])
}
