// Where every clip sits on the timeline, and how long the edit is.
import { clipLength } from './project.ts'
import type { Clip, Placed, Project } from './types.ts'
import { layoutVideo } from './video1.ts'

// Overlay and audio lanes: each clip sits at its own start.
export const layoutFree = (clips: Clip[]): Placed[] =>
  clips.map(clip => ({ clip, start: clip.start, end: clip.start + clipLength(clip) }))

export const layoutAll = (p: Project) => [...layoutVideo(p.video), ...layoutFree(p.overlay), ...layoutFree(p.audio)]

export const projectDuration = (p: Project) => Math.max(0, ...layoutAll(p).map(x => x.end))

export const findPlaced = (p: Project, id: string | null) => layoutAll(p).find(x => x.clip.id === id)
