// Moving and resizing pictures on the sequence preview. Pressing on a picture on screen selects it and drags it; the
// selected one gets a box with corner handles that resize it, the opposite corner staying put. Edges and centres snap
// to the frame's, with a guide line (⌥ places freely). The box shows only while its picture is on screen at the
// playhead.
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useState } from 'react'
import { findPlaced, layerRect, type Media, type Placed, type Project, type Transform } from '@/lib/model'
import type { Player } from '@/lib/player'
import { clamp, cn } from '@/lib/utils'

const SCALE = [0.05, 10] // smallest and largest, × the fitted size
const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const
const SNAP = 6 // px on screen: how close an edge or centre comes before it lands on the frame's

// The frame's edge or centre line (0, size / 2, size) within SNAP of any of `points`: the shift that lands the nearest
// one on it, and the line.
function snapTo(points: number[], size: number) {
  let best: { d: number; at: number } | undefined
  for (const p of points)
    for (const line of [0, size / 2, size]) {
      const d = line - p
      if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: line }
    }
  return best
}

export function PictureBox({
  canvasRef,
  playerRef,
  project,
  media,
  selected,
  onSelect,
  onTransform,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  playerRef: RefObject<Player | null>
  project: Project
  media: Record<string, Media>
  selected: string | null
  onSelect: (id: string) => void
  onTransform: (id: string, t: Transform) => void
}) {
  const pl = selected ? findPlaced(project, selected) : null
  const picture = pl && media[pl.clip.mediaId].image ? pl : null

  const on = useOnScreen(playerRef, picture)
  const view = useCanvasView(canvasRef)

  // The frame lines a drag has snapped to, drawn while it lasts.
  const [guides, setGuides] = useState<{ x?: number; y?: number } | null>(null)

  // A drag on the preview, in its own pixels: `to` gets the pointer's offset from where it started, and whether ⌥ is
  // held (no snapping).
  const drag = (e: ReactPointerEvent, to: (dx: number, dy: number, free: boolean) => void) => {
    e.preventDefault()
    if (!view.w || !view.h) return // not laid out yet: every position would divide by zero
    const x0 = e.clientX
    const y0 = e.clientY
    const move = (ev: PointerEvent) => to(ev.clientX - x0, ev.clientY - y0, ev.altKey)
    addEventListener('pointermove', move)
    addEventListener('pointerup', () => (removeEventListener('pointermove', move), setGuides(null)), { once: true })
  }
  const clip = (id: string) => findPlaced(project, id)!.clip
  const start = (id: string) => clip(id).transform ?? { x: 0, y: 0, scale: 1 }
  // The centre follows the pointer, kept inside the frame so the picture can't be lost off it; an edge or the centre
  // near the frame's snaps to it.
  const move = (e: ReactPointerEvent, id: string) => {
    const { mediaId, crop } = clip(id)
    const m = media[mediaId]
    const t0 = start(id)
    drag(e, (dx, dy, free) => {
      const t = { ...t0, x: clamp(t0.x + dx / view.w, -0.5, 0.5), y: clamp(t0.y + dy / view.h, -0.5, 0.5) }
      const r = layerRect(m.width, m.height, view.w, view.h, project.fit, t, crop)
      const gx = free ? undefined : snapTo([r.x, r.x + r.w / 2, r.x + r.w], view.w)
      const gy = free ? undefined : snapTo([r.y, r.y + r.h / 2, r.y + r.h], view.h)
      setGuides({ x: gx?.at, y: gy?.at })
      onTransform(id, { ...t, x: t.x + (gx?.d ?? 0) / view.w, y: t.y + (gy?.d ?? 0) / view.h })
    })
  }
  // A corner follows the pointer and the opposite one stays put; the picture keeps its shape.
  const resize = (e: ReactPointerEvent, id: string, sx: number, sy: number) => {
    e.stopPropagation()
    const { mediaId, crop } = clip(id)
    const m = media[mediaId]
    const t0 = start(id)
    const fitted = layerRect(m.width, m.height, view.w, view.h, project.fit, undefined, crop)
    const r = layerRect(m.width, m.height, view.w, view.h, project.fit, t0, crop)
    const ax = sx > 0 ? r.x : r.x + r.w // the anchor: the opposite corner
    const ay = sy > 0 ? r.y : r.y + r.h
    const cx = sx > 0 ? r.x + r.w : r.x // the dragged corner, where the drag starts from
    const cy = sy > 0 ? r.y + r.h : r.y
    drag(e, (dx, dy, free) => {
      const gx = free ? undefined : snapTo([cx + dx], view.w)
      const gy = free ? undefined : snapTo([cy + dy], view.h)
      const fx = (sx * (cx + dx + (gx?.d ?? 0) - ax)) / fitted.w
      const fy = (sy * (cy + dy + (gy?.d ?? 0) - ay)) / fitted.h
      // keeping its shape, only one side can follow the pointer: the one that snapped, else the farther one
      const byX = gx && !gy ? true : gy && !gx ? false : fx >= fy
      const s = clamp(byX ? fx : fy, SCALE[0], SCALE[1])
      setGuides(byX ? { x: gx?.at } : { y: gy?.at })
      const w = fitted.w * s
      const h = fitted.h * s
      onTransform(id, { x: (ax + (sx * w) / 2) / view.w - 0.5, y: (ay + (sy * h) / 2) / view.h - 0.5, scale: s })
    })
  }
  // Pressing on any picture on screen picks it up.
  const pick = (e: ReactPointerEvent) => {
    const c = canvasRef.current!.getBoundingClientRect()
    const hit = playerRef.current!.pictureAt((e.clientX - c.left) / c.width, (e.clientY - c.top) / c.height)
    if (!hit) return
    onSelect(hit.clip.id)
    move(e, hit.clip.id)
  }

  const m = picture && media[picture.clip.mediaId]
  const r = m && layerRect(m.width, m.height, view.w, view.h, project.fit, picture.clip.transform, picture.clip.crop)
  return (
    <div
      className="absolute touch-none"
      style={{ left: view.x, top: view.y, width: view.w, height: view.h }}
      onPointerDown={pick}
    >
      {guides?.x !== undefined && (
        <span
          className="pointer-events-none absolute inset-y-0 w-px bg-accent"
          style={{ left: Math.round(Math.min(guides.x, view.w - 1)) }}
        />
      )}
      {guides?.y !== undefined && (
        <span
          className="pointer-events-none absolute inset-x-0 h-px bg-accent"
          style={{ top: Math.round(Math.min(guides.y, view.h - 1)) }}
        />
      )}
      {picture && on && r && (
        <div
          onPointerDown={e => (e.stopPropagation(), move(e, picture.clip.id))}
          className="absolute cursor-move ring-1 ring-accent"
          style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
        >
          {CORNERS.map(([sx, sy]) => (
            <span
              key={`${sx}${sy}`}
              onPointerDown={e => resize(e, picture.clip.id, sx, sy)}
              className={cn(
                'absolute size-2 -translate-1/2 bg-white ring-1 ring-accent',
                sx === sy ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
              )}
              style={{ left: sx > 0 ? '100%' : 0, top: sy > 0 ? '100%' : 0 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Whether a clip is on screen at the playhead, kept up to date as the playhead moves.
export function useOnScreen(playerRef: RefObject<Player | null>, pl: Placed | null) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!pl) return setOn(false)
    const at = (t: number) => setOn(t >= pl.start && t < pl.end)
    at(playerRef.current!.t)
    return playerRef.current!.watch(at)
  }, [pl?.start, pl?.end])
  return on
}

// Where the canvas sits in the preview (it's centred and scaled to fit), to lay handles over it.
export function useCanvasView(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const read = (c = canvasRef.current) => ({
    x: c?.offsetLeft ?? 0,
    y: c?.offsetTop ?? 0,
    w: c?.offsetWidth ?? 0,
    h: c?.offsetHeight ?? 0,
  })
  const [view, setView] = useState(() => read()) // a box opened over a canvas already there is placed at once
  useEffect(() => {
    const c = canvasRef.current!
    const measure = () => setView(read(c))
    const ro = new ResizeObserver(measure)
    ro.observe(c)
    ro.observe(c.parentElement!)
    return () => ro.disconnect()
  }, [])
  return view
}
