// The project's undo history: useState with undo, redo, and a reset for a restored or new project.
import { useCallback, useState } from 'react'

const LIMIT = 100

// Changes made in one gesture are one undo step: everything while a pointer is pressed (a trim, a reorder or a slider
// drag fires dozens of changes, however slowly) and a run of typing into one field. Each click or key is its own step.
let gesture: { field?: EventTarget } | null = null
addEventListener('pointerdown', () => (gesture = {}), true)
for (const type of ['pointerup', 'pointercancel'])
  addEventListener(type, () => {
    const g = gesture // ended a task later, so the press's click or a drag's change on release still belongs to it
    setTimeout(() => gesture === g && (gesture = null))
  }, true)
addEventListener('input', e => {
  if (gesture && !gesture.field) return // input during a press stays part of the press
  if (gesture?.field !== e.target) gesture = { field: e.target! }
}, true)
// A typing run ends when focus moves on (say, Tab to a slider and arrow keys).
const current = () => (gesture && (!gesture.field || gesture.field === document.activeElement) ? gesture : null)

// useState with undo/redo.
export function useHistory<T>(initial: T) {
  const [s, setS] = useState({ past: [] as T[], present: initial, future: [] as T[], gesture: null as object | null })

  const set = useCallback((u: T | ((prev: T) => T)) => {
    const g = current() // read now: the updater may run later
    setS(s => {
      const next = typeof u === 'function' ? (u as (prev: T) => T)(s.present) : u
      if (Object.is(next, s.present)) return s
      const past = g && g === s.gesture ? s.past : [...s.past.slice(-LIMIT), s.present]
      return { past, present: next, future: [], gesture: g }
    })
  }, [])
  const undo = useCallback(
    () => setS(s => (s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1)!, future: [s.present, ...s.future], gesture: null } : s)),
    [],
  )
  const redo = useCallback(
    () => setS(s => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), gesture: null } : s)),
    [],
  )

  // A new starting point with nothing to undo (a restored project).
  const reset = useCallback((present: T) => setS({ past: [], present, future: [], gesture: null }), [])

  return [s.present, set, { undo, redo, reset, canUndo: s.past.length > 0, canRedo: s.future.length > 0 }] as const
}
