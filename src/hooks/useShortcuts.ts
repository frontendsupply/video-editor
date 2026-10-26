// The editor's keyboard shortcuts (the usual ones for video editing). Keys typed into a control stay with it.
import { useEffect } from 'react'
import { OWN_KEYS } from '@/lib/utils'
import { useLatest } from './useLatest'

export function useShortcuts(actions: {
  undo: () => void
  redo: () => void
  split: () => void
  togglePlay: () => void
  del: () => void
  mark: (edge: 'in' | 'out') => void
  clear: () => void // the selection
  confirm: () => void // Enter: finish what's in progress (a crop)
  seekBy: (seconds: number) => void
  seekTo: (where: 'start' | 'end') => void
  frame: number // seconds per frame
}) {
  const a = useLatest(actions)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement).closest(OWN_KEYS)) return
      const { undo, redo, split, togglePlay, del, mark, clear, confirm, seekBy, seekTo, frame } = a.current
      const k = e.key.toLowerCase()
      if (e.metaKey || e.ctrlKey) {
        if (k === 'z') e.shiftKey ? redo() : undo()
        else if (k === 'y') redo()
        else if (k === 'b') split()
        else return
        e.preventDefault()
        return
      }
      if (e.altKey) return
      if (k === ' ') togglePlay()
      else if (k === 's') split()
      else if (k === 'delete' || k === 'backspace') del()
      else if (k === 'i') mark('in')
      else if (k === 'o') mark('out')
      else if (k === 'escape') clear()
      else if (k === 'enter') confirm()
      else if (k === 'arrowleft') seekBy(-(e.shiftKey ? 1 : frame))
      else if (k === 'arrowright') seekBy(e.shiftKey ? 1 : frame)
      else if (k === 'home') seekTo('start')
      else if (k === 'end') seekTo('end')
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}
