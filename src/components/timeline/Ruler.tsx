// The ruler: timecode labels with minor ticks every fifth of a step. Only the labels near the view exist. Clicking or
// dragging it moves the playhead (the timeline's scrub handles that); hovering shows the time under the mouse.
import type { PointerEvent as ReactPointerEvent } from 'react'
import { timecode } from '@/lib/model'
import { cn } from '@/lib/utils'

export function Ruler(props: {
  pps: number
  step: number // seconds between labels
  first: number // index of the first label to draw
  count: number
  interactive: boolean // something on the timeline: a pointer cursor and the hover time
  onHover: (e: ReactPointerEvent | null) => void
}) {
  const { pps, step } = props
  return (
    <div
      data-ruler
      onPointerMove={props.onHover}
      onPointerLeave={() => props.onHover(null)}
      className={cn('relative h-6 overflow-hidden border-b border-line', props.interactive && 'cursor-pointer')}
      style={{
        backgroundImage: `repeating-linear-gradient(to right, color-mix(in oklab, var(--color-ink) 14%, transparent) 0 1px, transparent 1px ${(step * pps) / 5}px)`,
        backgroundSize: '100% 5px',
        backgroundPosition: 'bottom',
        backgroundRepeat: 'repeat-x',
      }}
    >
      {Array.from({ length: props.count }, (_, k) => props.first + k).map(i => (
        <span
          key={i}
          className="absolute top-0 bottom-0 border-l border-ink/20 pt-1 pl-1 text-[10px] text-muted tabular-nums"
          style={{ left: i * step * pps }}
        >
          {timecode(i * step, step < 1 ? 1 : 0)}
        </span>
      ))}
    </div>
  )
}
