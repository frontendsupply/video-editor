// Snapping: the times a dragged edge can lock onto, and how far it has to move to lock on.
import { layoutAll } from './layout.ts'
import type { Clip, Project } from './types.ts'

// Where a dragged edge can lock on: every clip's start and end on every track, 0, and any extra times (the playhead).
export function snapPoints(p: Project, skip: (c: Clip) => boolean, extra: number[] = []): number[] {
  const points = new Set([0, ...extra])
  for (const x of layoutAll(p)) if (!skip(x.clip)) points.add(x.start).add(x.end)
  return [...points]
}

// The nearest point within `tol` of any moving edge: how far to shift so they line up, and where the guide goes.
export function snapShift(edges: number[], points: number[], tol: number): { shift: number; at: number | null } {
  let best = { shift: 0, at: null as number | null }
  let dist = tol
  for (const e of edges)
    for (const pt of points)
      if (Math.abs(pt - e) <= dist) {
        dist = Math.abs(pt - e)
        best = { shift: pt - e, at: pt }
      }
  return best
}
