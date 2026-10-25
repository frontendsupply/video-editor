import { useRef } from 'react'

// The latest value, for a listener registered once that must still call the current version of something.
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}
