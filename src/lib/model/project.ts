// A new project, and the basics of a clip: its lane, its length on the timeline, and source time at a timeline time.
import type { Clip, Media, Placed, Project } from './types.ts'

export const emptyProject = (): Project => ({
  video: [], overlay: [], audio: [], overlayTracks: 0, audioTracks: 1, aspect: 'original', fit: 'contain', fps: 30,
})

export const laneOf = (c: Clip) => c.lane ?? 0

export const clipLength = (c: Clip) => (c.out - c.in) / c.speed

export const sourceTime = (pl: Placed, t: number) => pl.clip.in + (t - pl.start) * pl.clip.speed

export const newClip = (m: Media, start = 0): Clip => ({
  id: crypto.randomUUID(),
  mediaId: m.id,
  start,
  in: m.range?.[0] ?? 0,
  out: m.range?.[1] ?? m.duration,
  speed: 1,
  volume: 1,
})
