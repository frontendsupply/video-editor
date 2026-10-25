// Adding, removing and naming the free tracks (Video 2+ and Audio 1+).
import { laneOf } from './project.ts'
import type { LaneKind, Project } from './types.ts'

export const addTrack = (p: Project, kind: LaneKind): Project =>
  kind === 'overlay' ? { ...p, overlayTracks: p.overlayTracks + 1 } : { ...p, audioTracks: p.audioTracks + 1 }

// Remove a lane and its clips; lanes above it move down one, taking their names along.
export function removeTrack(p: Project, kind: LaneKind, lane: number): Project {
  const clips = p[kind].filter(c => laneOf(c) !== lane).map(c => (laneOf(c) > lane ? { ...c, lane: laneOf(c) - 1 } : c))
  const k = kind[0]
  const names = Object.fromEntries(
    Object.entries(p.names ?? {}).flatMap(([key, n]) => {
      const l = Number(key.slice(1))
      return key[0] !== k ? [[key, n]] : l === lane ? [] : [[l > lane ? `${k}${l - 1}` : key, n]]
    }),
  )
  return kind === 'overlay'
    ? { ...p, overlay: clips, overlayTracks: Math.max(0, p.overlayTracks - 1), names }
    : { ...p, audio: clips, audioTracks: Math.max(1, p.audioTracks - 1), names }
}

// Track names: 'v1' is Video 1, 'o<lane>' the overlays (Video 2, 3, …), 'a<lane>' Audio 1, 2, …
export const trackKey = (kind: 'video' | LaneKind, lane = 0) => (kind === 'video' ? 'v1' : `${kind[0]}${lane}`)
const defaultName = (key: string) => (key === 'v1' ? 'Video 1' : `${key[0] === 'o' ? 'Video' : 'Audio'} ${Number(key.slice(1)) + (key[0] === 'o' ? 2 : 1)}`)
export const trackName = (p: Project, key: string) => p.names?.[key] ?? defaultName(key)
// An empty name (or the default one) goes back to the default.
export function renameTrack(p: Project, key: string, name: string): Project {
  const { [key]: _, ...names } = p.names ?? {}
  const n = name.trim()
  return { ...p, names: n && n !== defaultName(key) ? { ...names, [key]: n } : names }
}
