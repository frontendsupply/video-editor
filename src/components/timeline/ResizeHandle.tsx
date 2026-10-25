// The 1px line between the preview and the timeline: drag it to make the timeline taller or shorter.
import type { PointerEvent as ReactPointerEvent } from 'react'
import { clamp } from '@/lib/utils'

export function ResizeHandle({ height, onResize }: { height: number; onResize: (height: number) => void }) {
  function drag(e: ReactPointerEvent) {
    e.preventDefault()
    const [y0, h0] = [e.clientY, height]
    const move = (ev: PointerEvent) => onResize(Math.round(clamp(h0 - (ev.clientY - y0), 236, innerHeight * 0.65)))
    addEventListener('pointermove', move)
    addEventListener('pointerup', () => removeEventListener('pointermove', move), { once: true })
  }
  return (
    <div onPointerDown={drag} className="relative z-10 h-px shrink-0 cursor-row-resize bg-line transition-colors hover:bg-ink/40" aria-label="Resize timeline">
      <span className="absolute inset-x-0 -top-1 -bottom-1" /> {/* a wider grab area than the 1px line */}
    </div>
  )
}
