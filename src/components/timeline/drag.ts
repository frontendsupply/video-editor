import type { PointerEvent as ReactPointerEvent } from 'react'

// Window-level pointer tracking so drags keep working outside the element.
export type Move = (dx: number, dy: number, ev: PointerEvent) => void
export function track(e: ReactPointerEvent, move: Move, done?: Move) {
  e.stopPropagation()
  e.preventDefault()
  const [x0, y0] = [e.clientX, e.clientY]
  const onMove = (ev: PointerEvent) => move(ev.clientX - x0, ev.clientY - y0, ev)
  const onUp = (ev: PointerEvent) => {
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerup', onUp)
    done?.(ev.clientX - x0, ev.clientY - y0, ev)
  }
  addEventListener('pointermove', onMove)
  addEventListener('pointerup', onUp)
}
