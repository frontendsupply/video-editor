// Cropping a clip on the sequence preview. While it's on, the player shows the clip alone and whole, and a box over it
// marks the part that stays: drag a corner or an edge to cut that side (⇧ cuts the opposite side as much too, so the
// box keeps its centre), or the middle to move the box. The rest is dimmed. The box shows only while the clip is on screen at the playhead; its bar sits in the preview's header.
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { headerBtn, primaryBtn } from '@/components/ui'
import { type Crop, cropSize, fitRect, type Media, type Placed } from '@/lib/model'
import type { Player } from '@/lib/player'
import { clamp, cn } from '@/lib/utils'
import { useCanvasView, useOnScreen } from './PictureBox'

export const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 }
const MIN = 0.05 // the smallest box, a share of the picture's width and height
const HANDLES = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const
const MOVE = 2 // a drag's side for the middle: both sides together

// One axis of a drag, moved by d (a share of the picture): the near and far sides (left and right, or top and bottom)
// after it. side -1 moves the near one, 1 the far one, 0 neither, MOVE both. even moves the other side by as much the
// other way, until either one reaches the picture's edge.
function axis(near: number, far: number, side: number, d: number, even: boolean): [number, number] {
  if (even && (side === -1 || side === 1)) {
    const e = clamp(-side * d, -Math.min(near, far), (1 - MIN - near - far) / 2)
    return [near + e, far + e]
  }
  if (side === -1) return [clamp(near + d, 0, 1 - far - MIN), far]
  if (side === 1) return [near, clamp(far - d, 0, 1 - near - MIN)]
  if (side !== MOVE) return [near, far]
  const m = clamp(d, -near, far)
  return [near + m, far - m]
}

export function CropBox({
  canvasRef,
  playerRef,
  placed,
  media,
  crop,
  onCrop,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  playerRef: RefObject<Player | null>
  placed: Placed
  media: Media
  crop: Crop
  onCrop: (c: Crop) => void
}) {
  const on = useOnScreen(playerRef, placed)
  const view = useCanvasView(canvasRef)
  const f = fitRect(media.width, media.height, view.w, view.h, 'contain') // the whole picture, as the player shows it

  const drag = (e: ReactPointerEvent, sx: number, sy: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (!f.w || !f.h) return // not laid out yet
    const [x0, y0, c0] = [e.clientX, e.clientY, crop]
    const move = (ev: PointerEvent) => {
      const [l, r] = axis(c0.l, c0.r, sx, (ev.clientX - x0) / f.w, ev.shiftKey)
      const [t, b] = axis(c0.t, c0.b, sy, (ev.clientY - y0) / f.h, ev.shiftKey)
      onCrop({ l, t, r, b })
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', () => removeEventListener('pointermove', move), { once: true })
  }

  const box = {
    left: f.x + crop.l * f.w,
    top: f.y + crop.t * f.h,
    width: f.w * (1 - crop.l - crop.r),
    height: f.h * (1 - crop.t - crop.b),
  }
  return (
    <div className="absolute" style={{ left: view.x, top: view.y, width: view.w, height: view.h }}>
      {on && (
        <>
          <div
            className="pointer-events-none absolute overflow-hidden"
            style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
          >
            <div
              className="absolute"
              style={{ ...box, left: box.left - f.x, top: box.top - f.y, outline: '9999px solid rgb(0 0 0 / 0.6)' }}
            />
          </div>
          <div
            onPointerDown={e => drag(e, MOVE, MOVE)}
            className="absolute cursor-move touch-none ring-1 ring-accent"
            style={box}
          >
            {HANDLES.map(([sx, sy]) => (
              <span
                key={`${sx}${sy}`}
                onPointerDown={e => drag(e, sx, sy)}
                className={cn(
                  'absolute size-2 -translate-1/2 bg-white ring-1 ring-accent',
                  !sx
                    ? 'cursor-ns-resize'
                    : !sy
                      ? 'cursor-ew-resize'
                      : sx === sy
                        ? 'cursor-nwse-resize'
                        : 'cursor-nesw-resize',
                )}
                style={{ left: `${(sx + 1) * 50}%`, top: `${(sy + 1) * 50}%` }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// The crop's size in the picture's own pixels, and its buttons.
export function CropBar({
  media,
  crop,
  onCrop,
  onCancel,
  onDone,
}: {
  media: Media
  crop: Crop
  onCrop: (c: Crop) => void
  onCancel: () => void
  onDone: () => void
}) {
  const [w, h] = cropSize(media.width, media.height, crop).map(Math.round)
  return (
    <div className="flex items-center gap-1">
      <span className="px-2 text-[11px] font-medium text-ink/65 tabular-nums">
        Crop · {w}×{h}
      </span>
      <button className={headerBtn} onClick={() => onCrop(NO_CROP)}>
        Reset
      </button>
      <button className={headerBtn} onClick={onCancel}>
        Cancel
      </button>
      <button className={primaryBtn} onClick={onDone}>
        Done
      </button>
    </div>
  )
}
