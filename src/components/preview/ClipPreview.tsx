// Clip Preview: one file from the bin, played on its own, to mark the part you want (In/Out) before it goes on the
// timeline, or to save that part as a new clip in the bin. Saving several parts splits a file into several bin clips.

import {
  ArrowLeftFromLine,
  ArrowRightFromLine,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Music,
  Pause,
  Play,
  Plus,
} from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { headerBtn, headerIcon, primaryBtn, Tip } from '@/components/ui'
import { lengthLabel, type Media, timecode } from '@/lib/model'
import { cssColor, useDark } from '@/lib/theme'
import { OWN_KEYS } from '@/lib/utils'

export type Marks = { a: number; b: number }
const MIN = 0.05 // s: the shortest part that can be marked

export function ClipPreview({
  media,
  marks,
  fps,
  onMarks,
  onAdd,
  onSave,
}: {
  media: Media
  marks: Marks
  fps: number
  onMarks: (m: Marks) => void
  onAdd: () => void
  onSave: () => void
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [t, setT] = useState(marks.a)
  const [playing, setPlaying] = useState(false)
  const d = media.duration
  const { a, b } = marks

  // Follow the element's clock. Playing from inside the marked part stops at its Out point.
  const marksRef = useRef(marks)
  marksRef.current = marks
  const from = useRef(0) // where playing started
  useEffect(() => {
    const el = ref.current!
    el.currentTime = a
    let raf = 0
    const tick = () => {
      const now = el.currentTime
      if (!el.paused && from.current < marksRef.current.b && now >= marksRef.current.b) {
        el.pause()
        el.currentTime = marksRef.current.b
      }
      setT(el.currentTime)
      raf = requestAnimationFrame(tick)
    }
    tick()
    const on = () => ((from.current = el.currentTime), setPlaying(true))
    const off = () => setPlaying(false)
    el.addEventListener('play', on)
    el.addEventListener('pause', off)
    return () => (
      cancelAnimationFrame(raf), el.pause(), el.removeEventListener('play', on), el.removeEventListener('pause', off)
    )
  }, [media.id])

  const seek = (x: number) => {
    const el = ref.current!
    el.currentTime = Math.max(0, Math.min(d, Math.round(x * fps) / fps)) // on a frame, so marks land on frames too
    setT(el.currentTime)
  }
  const toggle = () => {
    const el = ref.current!
    if (!el.paused) return el.pause()
    if (el.currentTime >= b - 0.01 && el.currentTime <= b + 0.01) el.currentTime = a // at the Out point: play the part again
    el.play().catch(() => {})
  }
  const mark = (edge: 'a' | 'b', at = ref.current!.currentTime) => {
    const x = Math.round(at * fps) / fps
    onMarks(edge === 'a' ? { a: Math.min(x, b - MIN), b } : { a, b: Math.max(x, a + MIN) })
  }

  // Its own shortcuts while it's showing; the rest still reach the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest(OWN_KEYS)) return
      const frame = 1 / fps
      const k = e.key.toLowerCase()
      if (k === ' ') toggle()
      else if (k === 'i') mark('a')
      else if (k === 'o') mark('b')
      else if (k === 'arrowleft') seek(ref.current!.currentTime - (e.shiftKey ? 1 : frame))
      else if (k === 'arrowright') seek(ref.current!.currentTime + (e.shiftKey ? 1 : frame))
      else if (k === 'home') seek(a)
      else if (k === 'end') seek(b)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('keydown', onKey, true) // before the editor's own shortcuts
    return () => document.removeEventListener('keydown', onKey, true)
  })

  // The bar: click or drag to scrub; drag a mark to move it.
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    return Math.max(0, Math.min(d, ((clientX - r.left) / r.width) * d))
  }
  const drag = (e: ReactPointerEvent, move: (x: number) => void) => {
    if (e.button) return
    e.stopPropagation()
    move(timeAt(e.clientX))
    const onMove = (ev: PointerEvent) => move(timeAt(ev.clientX))
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', () => removeEventListener('pointermove', onMove), { once: true })
  }
  const pct = (x: number) => `${(x / d) * 100}%`

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-3 flex items-center justify-center">
          {media.hasVideo ? (
            <video
              ref={ref}
              src={media.url}
              preload="auto"
              className="max-h-full max-w-full bg-black ring-1 ring-line"
            />
          ) : (
            <>
              <audio ref={ref} src={media.url} preload="auto" />
              <span className="grid size-16 place-items-center bg-audio-bg text-audio">
                <Music size={22} />
              </span>
            </>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-line bg-canvas px-3 py-2">
        <div
          ref={bar}
          onPointerDown={e => drag(e, seek)}
          className="relative h-6 cursor-pointer bg-ink/6"
          aria-label="Clip position"
        >
          {media.peaks && <Wave peaks={media.peaks} />}
          <div
            className="pointer-events-none absolute inset-y-0 border-x border-accent bg-accent/15"
            style={{ left: pct(a), width: pct(b - a) }}
          />
          {(['a', 'b'] as const).map(edge => (
            <Tip key={edge} label={edge === 'a' ? 'In point · drag to move (I)' : 'Out point · drag to move (O)'}>
              <span
                onPointerDown={e => drag(e, x => mark(edge, x))}
                className="absolute inset-y-0 -ml-1 w-2 cursor-ew-resize"
                style={{ left: pct(marks[edge]) }}
              />
            </Tip>
          ))}
          <div
            className="pointer-events-none absolute -inset-y-0.5 -ml-px w-0.5 bg-playhead"
            style={{ left: pct(t) }}
          />
        </div>
      </div>
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-line bg-canvas px-1.5">
        <span className="w-28 pl-1 text-[11px] font-semibold tabular-nums">{timecode(t)}</span>
        <div className="flex flex-1 items-center justify-center gap-0.5">
          <Tip label="Mark in point (I)">
            <button className={headerIcon} onClick={() => mark('a')} aria-label="Mark in point">
              <ArrowRightFromLine size={13} />
            </button>
          </Tip>
          <Tip label="Previous frame (←)">
            <button className={headerIcon} onClick={() => seek(t - 1 / fps)}>
              <ChevronLeft size={14} />
            </button>
          </Tip>
          <Tip label={playing ? 'Pause (Space)' : 'Play (Space)'}>
            <button
              className="grid size-6 place-items-center text-ink transition-colors hover:bg-ink/5"
              onClick={toggle}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <Pause size={12} fill="currentColor" />
              ) : (
                <Play size={12} fill="currentColor" className="translate-x-px" />
              )}
            </button>
          </Tip>
          <Tip label="Next frame (→)">
            <button className={headerIcon} onClick={() => seek(t + 1 / fps)}>
              <ChevronRight size={14} />
            </button>
          </Tip>
          <Tip label="Mark out point (O)">
            <button className={headerIcon} onClick={() => mark('b')} aria-label="Mark out point">
              <ArrowLeftFromLine size={13} />
            </button>
          </Tip>
        </div>
        <span className="truncate text-[11px] text-muted tabular-nums">
          {timecode(a)} – {timecode(b)} · {lengthLabel(b - a, 3)}
        </span>
        <Tip label="Save the marked part as a new clip in the media bin">
          <button className={headerBtn} onClick={onSave}>
            <BookmarkPlus size={12} /> Save clip
          </button>
        </Tip>
        <Tip
          label={media.hasVideo ? `Append the marked part to the video track` : 'Add the marked part at the playhead'}
        >
          <button className={primaryBtn} onClick={onAdd}>
            <Plus size={12} /> Add to timeline
          </button>
        </Tip>
      </div>
    </>
  )
}

// The file's waveform across the whole bar (the timeline's colors), so sound can be marked by ear and by eye.
function Wave({ peaks }: { peaks: Float32Array }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dark = useDark()
  useEffect(() => {
    const c = ref.current!
    const w = (c.width = Math.round(c.clientWidth * devicePixelRatio))
    const h = (c.height = Math.round(c.clientHeight * devicePixelRatio))
    const g = c.getContext('2d')!
    g.fillStyle = cssColor('--color-audio')
    g.globalAlpha = 0.5
    for (let x = 0; x < w; x++) {
      let p = 0
      for (
        let i = Math.floor((x / w) * peaks.length), end = Math.max(i + 1, Math.floor(((x + 1) / w) * peaks.length));
        i < end;
        i++
      )
        p = Math.max(p, peaks[i])
      const bh = Math.max(1, p * h)
      g.fillRect(x, (h - bh) / 2, 1, bh)
    }
  }, [peaks, dark])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" />
}
