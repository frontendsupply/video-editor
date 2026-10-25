// The 1px line between two panels: drag it to resize the panel it belongs to. `edge` is the panel's side the line is
// on: 'top' for the timeline (drag up to make it taller), 'right' for the media bin (drag right to make it wider).
import type { PointerEvent as ReactPointerEvent } from 'react'
import { clamp, cn } from '@/lib/utils'

export function ResizeHandle(props: { size: number; edge: 'top' | 'right'; min: number; max: number; label: string; onResize: (size: number) => void }) {
  const x = props.edge === 'right'
  function drag(e: ReactPointerEvent) {
    e.preventDefault()
    const [p0, s0] = [x ? e.clientX : e.clientY, props.size]
    const move = (ev: PointerEvent) => props.onResize(Math.round(clamp(s0 + (x ? ev.clientX - p0 : p0 - ev.clientY), props.min, props.max)))
    addEventListener('pointermove', move)
    addEventListener('pointerup', () => removeEventListener('pointermove', move), { once: true })
  }
  return (
    <div
      onPointerDown={drag}
      aria-label={props.label}
      className={cn('relative z-10 shrink-0 bg-line transition-colors hover:bg-ink/40', x ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize')}
    >
      <span className={cn('absolute', x ? 'inset-y-0 -right-1 -left-1' : 'inset-x-0 -top-1 -bottom-1')} /> {/* a wider grab area than the 1px line */}
    </div>
  )
}
