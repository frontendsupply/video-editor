// The preview player: plays the project onto the canvas, and writes the clock, the playhead and its time label
// straight to the DOM, so playing never re-renders React.
import { useEffect, useState, type RefObject } from 'react'
import { timecode, type Media, type Project } from '@/lib/model'
import { Player } from '@/lib/player'
import { useLatest } from './useLatest'

export function usePlayer(o: {
  playerRef: RefObject<Player | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  clockRef: RefObject<HTMLSpanElement | null> // the time under the preview
  playheadRef: RefObject<HTMLDivElement | null> // null while the timeline shows its error fallback
  playheadLabelRef: RefObject<HTMLSpanElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  seekAfter: RefObject<number | undefined> // where to go once the next project change is in
  project: Project
  media: Record<string, Media>
  pps: number
  viewW: number // visible width of the lanes
  digits: 0 | 1 | 3
}) {
  const [playing, setPlaying] = useState(false)
  const view = useLatest({ pps: o.pps, viewW: o.viewW, digits: o.digits })

  useEffect(() => {
    const player = new Player(o.canvasRef.current!)
    player.onPlayingChange = setPlaying
    player.onTime = t => {
      const { pps, viewW, digits } = view.current
      const x = t * pps
      o.clockRef.current!.textContent = timecode(t)
      if (o.playheadRef.current) o.playheadRef.current.style.transform = `translateX(${x}px)`
      const sc = o.scrollRef.current
      if (sc && player.playing && (x < sc.scrollLeft || x > sc.scrollLeft + viewW - 40)) sc.scrollLeft = x - 40
      const label = o.playheadLabelRef.current
      if (!label || !sc) return
      label.textContent = timecode(t, digits && 1) // at most tenths: the clock under the preview has the ms
      // The label is centred on the playhead (~34 px each side): nudge it (and the mark buttons beside it) to stay
      // inside the visible timeline.
      const left = x - sc.scrollLeft
      o.playheadRef.current!.style.setProperty('--nudge', `${Math.max(0, 34 - left) - Math.max(0, 34 - (viewW - left))}px`)
    }
    o.playerRef.current = player
    // Scrolling moves the visible edges, so the label is fitted again.
    const sc = o.scrollRef.current
    const refit = () => player.onTime(player.t)
    sc?.addEventListener('scroll', refit, { passive: true })
    return () => sc?.removeEventListener('scroll', refit)
  }, [])

  useEffect(() => {
    const player = o.playerRef.current!
    player.setProject(o.project, o.media)
    if (o.seekAfter.current !== undefined) player.seek(o.seekAfter.current)
    o.seekAfter.current = undefined
  }, [o.project, o.media])

  useEffect(() => o.playerRef.current!.onTime(o.playerRef.current!.t), [o.pps])

  return { playing }
}
