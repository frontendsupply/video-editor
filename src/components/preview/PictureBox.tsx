// Moving and resizing pictures on the sequence preview. Pressing on a picture on screen selects it and drags it; the
// selected one gets a box with corner handles that resize it, the opposite corner staying put. The box shows only
// while its picture is on screen at the playhead.
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { findPlaced, layerRect, type Media, type Project, type Transform } from '@/lib/model'
import type { Player } from '@/lib/player'
import { clamp, cn } from '@/lib/utils'

const SCALE = [0.05, 10] // smallest and largest, × the fitted size
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const

export function PictureBox({ canvasRef, playerRef, project, media, selected, onSelect, onTransform }: {
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

  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!picture) return setOn(false)
    const at = (t: number) => setOn(t >= picture.start && t < picture.end)
    at(playerRef.current!.t)
    return playerRef.current!.watch(at)
  }, [picture?.start, picture?.end])

  // Where the canvas sits in the preview (it's centred and scaled to fit), to lay the handles over it.
  const [view, setView] = useState({ x: 0, y: 0, w: 0, h: 0 })
  useEffect(() => {
    const c = canvasRef.current!
    const measure = () => setView({ x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(c)
    ro.observe(c.parentElement!)
    return () => ro.disconnect()
  }, [])

  // A drag on the preview, in its own pixels: `to` gets the pointer's offset from where it started.
  const drag = (e: ReactPointerEvent, to: (dx: number, dy: number) => void) => {
    e.preventDefault()
    const x0 = e.clientX
    const y0 = e.clientY
    const move = (ev: PointerEvent) => to(ev.clientX - x0, ev.clientY - y0)
    addEventListener('pointermove', move)
    addEventListener('pointerup', () => removeEventListener('pointermove', move), { once: true })
  }
  const start = (id: string) => findPlaced(project, id)!.clip.transform ?? { x: 0, y: 0, scale: 1 }
  // The centre follows the pointer, kept inside the frame so the picture can't be lost off it.
  const move = (e: ReactPointerEvent, id: string) => {
    const t0 = start(id)
    drag(e, (dx, dy) => onTransform(id, { ...t0, x: clamp(t0.x + dx / view.w, -0.5, 0.5), y: clamp(t0.y + dy / view.h, -0.5, 0.5) }))
  }
  // A corner follows the pointer and the opposite one stays put; the picture keeps its shape.
  const resize = (e: ReactPointerEvent, id: string, sx: number, sy: number) => {
    e.stopPropagation()
    const m = media[findPlaced(project, id)!.clip.mediaId]
    const t0 = start(id)
    const fitted = layerRect(m.width, m.height, view.w, view.h, project.fit)
    const r = layerRect(m.width, m.height, view.w, view.h, project.fit, t0)
    const ax = sx > 0 ? r.x : r.x + r.w // the anchor: the opposite corner
    const ay = sy > 0 ? r.y : r.y + r.h
    const cx = sx > 0 ? r.x + r.w : r.x // the dragged corner, where the drag starts from
    const cy = sy > 0 ? r.y + r.h : r.y
    drag(e, (dx, dy) => {
      const s = clamp(Math.max((sx * (cx + dx - ax)) / fitted.w, (sy * (cy + dy - ay)) / fitted.h), SCALE[0], SCALE[1])
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
  const r = m && layerRect(m.width, m.height, view.w, view.h, project.fit, picture.clip.transform)
  return (
    <div className="absolute" style={{ left: view.x, top: view.y, width: view.w, height: view.h }} onPointerDown={pick}>
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
              className={cn('absolute size-2 -translate-1/2 bg-white ring-1 ring-accent', sx === sy ? 'cursor-nwse-resize' : 'cursor-nesw-resize')}
              style={{ left: sx > 0 ? '100%' : 0, top: sy > 0 ? '100%' : 0 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
