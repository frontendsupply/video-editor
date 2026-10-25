// The timeline's zoom (pixels per second). Fully zoomed out, the whole edit fills 90% of the visible timeline; zooming
// in goes to at least 4× that. Editing never changes the zoom, so the view holds still while you trim, move or delete:
// only the zoom controls, the first import and Crop do. If the edit gets shorter the zoom can sit past these limits;
// the controls start from wherever it is.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { zoomToFit } from '@/components/timeline/constants'
import { clamp } from '@/lib/utils'

const ZOOM_MIN = 2 // empty timeline; with clips, the zoom-out limit fits the whole edit
const ZOOM_MAX = 200

export function useZoom({ duration, viewW, scrollRef, time }: {
  duration: number
  viewW: number // visible width of the lanes
  scrollRef: RefObject<HTMLDivElement | null>
  time: () => number // the playhead, which zooming pivots on
}) {
  const [pps, setZoom] = useState(40)
  const zoomMin = duration && viewW ? zoomToFit(viewW, duration) : ZOOM_MIN
  const lo = Math.min(zoomMin, pps)
  const hi = Math.max(Math.max(ZOOM_MAX, zoomMin * 4), pps)

  // Zooming pivots on the playhead: it stays where it was on screen, or comes to the middle if it was out of view.
  // The scroll position before the zoom is remembered, since a shrinking timeline clamps it.
  const zoomed = useRef({ pps, scroll: 0 })
  useEffect(() => {
    const sc = scrollRef.current
    const remember = () => (zoomed.current.scroll = sc!.scrollLeft)
    sc?.addEventListener('scroll', remember, { passive: true })
    return () => sc?.removeEventListener('scroll', remember)
  }, [])
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const before = zoomed.current
    zoomed.current = { pps, scroll: before.scroll }
    if (!sc || before.pps === pps) return
    const t = time()
    const x = t * before.pps - before.scroll // from the left edge of the visible timeline
    sc.scrollLeft = t * pps - (x >= 0 && x <= viewW ? x : viewW / 2)
    zoomed.current.scroll = sc.scrollLeft
  }, [pps])

  const fit = () => setZoom(zoomMin)
  // The first clips in an empty timeline fit it, once its width is known.
  const wasEmpty = useRef(true)
  useEffect(() => {
    if (!viewW) return
    if (wasEmpty.current && duration) fit()
    wasEmpty.current = !duration
  }, [duration, viewW])

  return {
    pps,
    lo,
    hi,
    set: setZoom,
    fit,
    by: (f: number) => setZoom(clamp(pps * f, lo, hi)),
    fitTo: (d: number) => viewW && setZoom(zoomToFit(viewW, d)), // after Crop
  }
}
