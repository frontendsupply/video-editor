import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { play } from 'cuelume'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import type { BaseUIEvent } from '@base-ui/react/types'
import { Toggle } from '@base-ui/react/toggle'
import { ArrowLeftRight, ChevronRight, Crop, Download, Film, Layers, Magnet, Minus, Music, Plus, Scissors, Trash2, Unlink } from 'lucide-react'
import {
  addTrack, clipLength, digitsFor, findPlaced, gridFor, laneOf, lengthLabel, layoutFree, layoutVideo, moveClip, moveVideoClip, PEAKS_PER_SEC, slideVideoClip, projectDuration, removeClip, removeTrack,
  snapPoints, snapShift, timecode, trimClip, unlinkAudio, updateClip,
  type DropTarget, type ExportPreset, type LaneKind, type Media, type Placed, type Project, type SplitTarget,
} from './model'
import { card, dialogBackdrop, dialogPopup, ExportItems, menuItem, pill, popup, Tip } from './ui'

export type Range = { a: number; b: number }
// dataTransfer type for dragging a media item from the bin onto a lane
export const MEDIA_MIME = 'application/x-editor-media'

type Props = {
  project: Project
  media: Record<string, Media>
  pps: number // pixels per second (zoom)
  height: number
  selected: string | null
  range: Range | null
  onSelect: (id: string | null) => void
  onRange: (r: Range | null) => void
  onChange: (p: Project, seekTo?: number) => void
  onSeek: (t: number) => void
  onSplit: (which: SplitTarget, here?: boolean) => void // here: at the playhead even with a range selected
  onDeleteRange: () => void
  onCrop: () => void
  onExport: (preset: ExportPreset, region: Range) => void
  onMark: (edge: 'in' | 'out') => void
  playing: boolean
  onPlace: (mediaId: string, target: DropTarget, t: number) => void
  onAdd: () => void
  time: () => number // the playhead, which clips also snap to
  viewW: number // visible width of the lanes, reported through onViewW
  onViewW: (w: number) => void
  snapping: boolean
  onSnapping: (on: boolean) => void
  footer: ReactNode
  playheadRef: RefObject<HTMLDivElement | null>
  playheadLabelRef: RefObject<HTMLSpanElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
}

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
const MARGIN = 16 // left gutter (ml-4) so the playhead pill isn't clipped at 0s
const ROOM = 160 // px past the last clip: the "+" tile and room to drag
const FIT = 0.9 // fully zoomed out, the whole edit fills this much of the visible timeline
// Pixels per second at which the whole edit fills FIT of the visible timeline: the zoom-out limit.
export const zoomToFit = (viewW: number, duration: number) => (FIT * (viewW - MARGIN)) / duration
const STEP = { overlay: 56 + 6, audio: 36 + 6 } // lane height + gap: how far a clip moves to change lane
const lane = 'rounded-sm bg-ink/2.5'
const mini = 'grid size-5 place-items-center rounded-xs text-ink/60 hover:bg-ink/5 hover:text-ink' // fits in the ruler
const floating = 'pointer-events-auto absolute top-px flex gap-px rounded-sm bg-white p-px ring-1 ring-ink/15'
const kbd = 'font-sans text-[10px] text-ink/40'
const hint = 'pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[11px] whitespace-nowrap text-ink/30'
const SNAP_PX = 8 // edges within this many screen pixels lock together, at any zoom
// The ruler and waveforms only render TILE-wide pieces near the visible part, so a 4-hour clip at full zoom
// (millions of px wide) costs the same as a short one. Scrolling re-renders once per tile crossed.
const TILE = 1024

// Window-level pointer tracking so drags keep working outside the element.
type Move = (dx: number, dy: number, ev: PointerEvent) => void
function track(e: ReactPointerEvent, move: Move, done?: Move) {
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

// One timeline row: the header on the left and the lane on the right share its height and top margin.
type Row = { key: string; size: string; header: ReactNode; lane: ReactNode; band?: boolean }

export function Timeline(props: Props) {
  const { project, media, pps, selected, range, onSelect, onRange, onChange, onSeek, viewW } = props
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  // Removing a track that still has clips asks first. Closing only flips `open`, so the text stays while it animates out.
  const [confirm, setConfirm] = useState<{ kind: LaneKind; lane: number; clips: number; open: boolean } | null>(null)
  // A Video 1 clip being dragged sideways: where it would start, and whether it's carried alone to slot in among earlier
  // clips (else everything after it slides along).
  const [slide, setSlide] = useState<{ id: string; start: number; insert: boolean } | null>(null)
  // Snap guide: the time a dragged edge has locked onto, drawn as a line across every track.
  const [guide, setGuide] = useState<number | null>(null)
  const guideAt = useRef<number | null>(null)
  const showGuide = (at: number | null) => {
    if (at !== null && at !== guideAt.current) play('select', { emphasis: 'subtle' }) // a soft detent as it locks
    guideAt.current = at
    setGuide(at)
  }
  // Mouse edits land on the zoom's grid (whole minutes zoomed far out, frames zoomed far in), and times show just the
  // digits that grid needs.
  const grid = gridFor(pps, project.fps)
  const digits = digitsFor(grid)
  // Shift needed to line any of `edges` up with the nearest point (snapping, off with the magnet); with nothing in reach,
  // the first edge lands on the grid instead. Alt places freely.
  const snapper = (points: number[]) => (edges: number[], ev: { altKey: boolean }) => {
    const r = props.snapping && !ev.altKey ? snapShift(edges, points, SNAP_PX / pps) : { shift: 0, at: null }
    showGuide(r.at)
    return r.at !== null || ev.altKey ? r.shift : Math.round(edges[0] / grid) * grid - edges[0]
  }
  const [selecting, setSelecting] = useState(false)
  const [moving, setMoving] = useState<'a' | 'b'>('b') // the range edge being dragged
  const [marking, setMarking] = useState(false) // a click placed the playhead: offer [ ] to mark the range there
  const [menu, setMenu] = useState<Placed | 'range' | null>(null) // what the right-click menu acts on
  const contentRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<HTMLSpanElement>(null)
  const timeAt = (clientX: number) => (clientX - contentRef.current!.getBoundingClientRect().left) / pps
  const inRange = (clientX: number) => !!range && timeAt(clientX) >= range.a && timeAt(clientX) <= range.b
  const [tile, setTile] = useState(0) // the TILE the view's left edge is in
  // Content always fills the visible width, and only scrolls when the clips don't fit.
  useEffect(() => {
    const el = props.scrollRef.current!
    const ro = new ResizeObserver(() => props.onViewW(el.clientWidth))
    ro.observe(el)
    const onScroll = () => setTile(Math.floor(el.scrollLeft / TILE))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])
  // Timeline px worth rendering: the view plus a tile either side, so a scroll never shows a gap before the next render.
  const near = [(tile - 1) * TILE, (tile + 2) * TILE + viewW]
  const nearClip = (pl: Placed): [number, number] => [near[0] - pl.start * pps, near[1] - pl.start * pps]
  const duration = projectDuration(project)
  // Past the last clip there's room for the + tile and dragging; fully zoomed out that's the 10% left, so nothing scrolls.
  const width = Math.max(viewW - MARGIN, duration * pps + Math.min(ROOM, (1 - FIT) * (viewW - MARGIN)))
  const step = TICK_STEPS.find(s => s * pps >= 90) ?? 1200
  const firstTick = Math.max(0, Math.floor(near[0] / (step * pps)))
  const ticks = Math.max(0, Math.min(Math.ceil(width / pps / step), Math.ceil(near[1] / (step * pps))) - firstTick)

  // Ruler: click or drag moves the playhead (a selected range stays). Empty lane: a click moves the playhead and clears
  // the selection; a drag selects a time range across all tracks, the playhead following the moving edge.
  function scrub(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button || e.ctrlKey) return // right-click: the context menu
    const ruler = !!(e.target as Element).closest('[data-ruler]')
    const snap = snapper(snapPoints(project, () => false))
    const at = (t: number, ev: { altKey: boolean }) => Math.min(duration, Math.max(0, t + snap([t], ev)))
    const t0 = at(timeAt(e.clientX), e)
    showGuide(null)
    onSeek(t0)
    if (!ruler) {
      onSelect(null)
      onRange(null)
      setSelecting(true)
    }
    setMarking(false)
    track(
      e,
      (dx, _, ev) => {
        const t1 = at(t0 + dx / pps, ev)
        if (!ruler && Math.abs(dx) > 3) {
          onRange({ a: Math.min(t0, t1), b: Math.max(t0, t1) })
          setMoving(t1 < t0 ? 'a' : 'b')
        }
        onSeek(t1)
      },
      dx => {
        showGuide(null)
        setSelecting(false)
        setMarking(Math.abs(dx) <= 3)
        if (!ruler && Math.abs(dx) > 3) play('select', { emphasis: 'subtle' })
      },
    )
  }
  // The selection block in the bar: drag an edge to resize the range, the middle to move it. Edges snap; the playhead
  // follows the edge (or the start when moving).
  function dragRange(e: ReactPointerEvent, part: 'a' | 'b' | 'both') {
    if (e.button || e.ctrlKey || !range) return // right-click: the region menu
    const r0 = range
    const len = r0.b - r0.a
    const snap = snapper(snapPoints(project, () => false))
    setSelecting(true)
    setMarking(false)
    track(
      e,
      (dx, _, ev) => {
        if (part === 'both') {
          const a0 = Math.min(duration - len, Math.max(0, r0.a + dx / pps))
          const a = Math.min(duration - len, Math.max(0, a0 + snap([a0, a0 + len], ev)))
          onRange({ a, b: a + len })
          onSeek(a)
          return
        }
        const t0 = (part === 'a' ? r0.a : r0.b) + dx / pps
        const t = Math.min(duration, Math.max(0, t0 + snap([t0], ev)))
        const other = part === 'a' ? r0.b : r0.a
        if (Math.abs(t - other) > 0.01) onRange({ a: Math.min(t, other), b: Math.max(t, other) })
        setMoving(t < other ? 'a' : 'b')
        onSeek(t)
      },
      () => {
        showGuide(null)
        setSelecting(false)
        play('select', { emphasis: 'subtle' })
      },
    )
  }

  // The time under the mouse, shown under the ruler. Written to the DOM: no re-render per mouse move.
  const hover = (e: ReactPointerEvent | null) => {
    const el = hoverRef.current!
    el.style.display = e ? 'block' : 'none'
    if (!e) return
    const t = Math.min(duration, Math.max(0, timeAt(e.clientX)))
    el.style.left = `${t * pps}px`
    el.textContent = timecode(t, digits)
  }

  function pick(id: string) {
    if (id !== selected) play('select', { emphasis: 'subtle' })
    setMarking(false)
    onRange(null)
    onSelect(id)
  }
  // A right-click (or Ctrl-click) only selects the clip, or inside the selected range keeps the range: the context menu
  // then acts on it.
  const secondary = (e: ReactPointerEvent, id: string) => {
    if (!e.button && !e.ctrlKey) return false
    e.stopPropagation()
    if (!inRange(e.clientX)) pick(id)
    return true
  }
  // One right-click menu for the whole timeline: inside the selected range it acts on the range, on a clip on the clip.
  function openMenu(e: BaseUIEvent<ReactMouseEvent<HTMLDivElement>>) {
    const id = (e.target as Element).closest<HTMLElement>('[data-clip]')?.dataset.clip
    const target = inRange(e.clientX) ? 'range' : (findPlaced(project, id ?? null) ?? null)
    if (!target) return e.preventBaseUIHandler() // an empty lane: no menu
    play('open', { emphasis: 'subtle' })
    setMenu(target)
  }

  function trim(e: ReactPointerEvent, pl: Placed, edge: 'in' | 'out') {
    const { clip } = pl
    if (secondary(e, clip.id)) return
    const free = !project.video.includes(clip) // free clips keep their content in place when trimming the left edge
    const sound = project.audio.includes(clip)
    const base = project // every move re-derives from the drag start, so edits never accumulate error
    const i = project.video.indexOf(clip)
    // skip this clip, and on Video 1 the clips after it too: they ripple with the edge
    const snap = snapper(snapPoints(base, c => c === clip || (i >= 0 && base.video.indexOf(c) > i), [props.time()]))
    const rippling = edge === 'in' && !free // the end moves the opposite way to the drag
    const trimmed = (d: number) => {
      const c = trimClip(clip, edge, d, media[clip.mediaId].duration, free)
      const start = free ? c.start : pl.start
      return { c, start, edgeAt: edge === 'in' && free ? start : start + clipLength(c) }
    }
    pick(clip.id)
    track(
      e,
      (dx, _, ev) => {
        let d = dx / pps
        const shift = snap([trimmed(d).edgeAt], ev)
        d += rippling ? -shift : shift
        const { c, start } = trimmed(d)
        // video: jump the preview to the edge being trimmed so you see the cut frame
        onChange(updateClip(base, clip.id, c), sound ? undefined : edge === 'in' ? start : start + clipLength(c) - 0.01)
      },
      () => {
        showGuide(null)
        play('tap', { emphasis: 'subtle' })
      },
    )
  }

  // Free clips move in time, and up/down into other lanes of the same kind. Overlays can also go up into Video 1.
  function moveFree(e: ReactPointerEvent, pl: Placed, kind: LaneKind) {
    if (secondary(e, pl.clip.id)) return
    const base = project
    const lanes = kind === 'overlay' ? project.overlayTracks : project.audioTracks
    const from = laneOf(pl.clip)
    const top = kind === 'overlay' ? -1 : 0 // lane -1 is Video 1, directly above Video 2
    const laneDelta = (dy: number) => Math.min(lanes - 1 - from, Math.max(top - from, Math.round(dy / STEP[kind])))
    const snap = snapper(snapPoints(base, c => c === pl.clip, [props.time()]))
    const snapped = (dx: number, ev: PointerEvent) => {
      const s = pl.start + dx / pps
      return dx + snap([s, s + pl.end - pl.start], ev) * pps // either edge can lock on
    }
    pick(pl.clip.id)
    track(
      e,
      (dx, dy, ev) => setDrag({ id: pl.clip.id, dx: snapped(dx, ev), dy: laneDelta(dy) * STEP[kind] }),
      (dx, dy, ev) => {
        const sdx = snapped(dx, ev)
        showGuide(null)
        setDrag(null)
        const dl = laneDelta(dy)
        if (Math.abs(dx) <= 3 && !dl) return
        const t = pl.start + sdx / pps
        onChange(from + dl < 0 ? moveVideoClip(base, pl.clip.id, -1, t) : moveClip(base, pl.clip.id, sdx / pps, dl))
        play('tap', { emphasis: 'strong' })
      },
    )
  }

  // Video 1 clips: drag sideways to slide the clip and everything after it, leaving a gap in front (Offset shows its new
  // start). Once its middle passes the end of the clip in front, it's carried alone and slots in where it's dropped.
  // Up/down (when there are overlay tracks) carries it out to an overlay lane, shown as a ghost snapped to lanes.
  function grabMain(e: ReactPointerEvent, pl: Placed) {
    if (secondary(e, pl.clip.id)) return
    pick(pl.clip.id)
    const base = project
    const placed = layoutVideo(base.video)
    const i = placed.findIndex(x => x.clip.id === pl.clip.id)
    const front = i ? placed[i - 1].end : 0 // where the clip in front of it ends
    const len = pl.end - pl.start
    const laneAt = (dy: number) => Math.min(project.overlayTracks - 1, Math.max(-1, Math.round(dy / STEP.overlay) - 1))
    const alone = snapper(snapPoints(base, c => c === pl.clip, [props.time()]))
    const riding = snapper(snapPoints(base, c => base.video.indexOf(c) >= i, [props.time()])) // the clips after it move too
    const snapped = (dx: number, ev: PointerEvent) => {
      const t = pl.start + dx / pps
      return dx + alone([t, t + len], ev) * pps
    }
    const slid = (dx: number, ev: PointerEvent) => {
      const t = pl.start + dx / pps
      const insert = t + len / 2 < front
      return { start: insert ? Math.max(0, t + alone([t, t + len], ev)) : Math.max(front, t + riding([t, t + len], ev)), insert }
    }
    let mode: 'side' | 'cross' | null = null // decided after 5 px
    track(
      e,
      (dx, dy, ev) => {
        mode ??= Math.hypot(dx, dy) < 5 ? null : project.overlayTracks && Math.abs(dy) > Math.abs(dx) ? 'cross' : 'side'
        if (mode === 'cross') setDrag({ id: pl.clip.id, dx: snapped(dx, ev), dy: (laneAt(dy) + 1) * STEP.overlay })
        if (mode === 'side') setSlide({ id: pl.clip.id, ...slid(dx, ev) })
      },
      (dx, dy, ev) => {
        const lane = laneAt(dy)
        const to = mode === 'side' ? slid(dx, ev) : null
        const t = pl.start + snapped(dx, ev) / pps
        showGuide(null)
        setDrag(null)
        setSlide(null)
        if (mode === 'cross' && lane >= 0) onChange(moveVideoClip(base, pl.clip.id, lane, t))
        else if (to && Math.abs(to.start - pl.start) > 1e-6)
          onChange(to.insert ? moveVideoClip(base, pl.clip.id, -1, to.start) : slideVideoClip(base, pl.clip.id, to.start))
        else return // a click, or let go where it was
        play('tap', { emphasis: 'strong' })
      },
    )
  }

  // Lanes accept media dragged from the bin.
  const dropAt = (e: DragEvent) => {
    const t = (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps
    return t + snapper(snapPoints(project, () => false, [props.time()]))([t], e)
  }
  const dropProps = (key: string, target: DropTarget) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(MEDIA_MIME)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropKey(key)
      dropAt(e) // shows the guide
    },
    onDragLeave: () => {
      setDropKey(k => (k === key ? null : k))
      showGuide(null)
    },
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(MEDIA_MIME)
      if (!id) return
      e.preventDefault()
      const t = dropAt(e)
      setDropKey(null)
      showGuide(null)
      props.onPlace(id, target, t)
    },
  })
  const dropRing = (key: string) => (dropKey === key ? 'ring-2 ring-accent bg-accent/10' : '')

  const handles = (pl: Placed) => (
    <>
      <Handle side="l" onPointerDown={e => trim(e, pl, 'in')} />
      <Handle side="r" onPointerDown={e => trim(e, pl, 'out')} />
    </>
  )

  // A free-placed clip (overlay or audio), shifted while being dragged.
  const freeClip = (pl: Placed, kind: LaneKind) => {
    const d = drag?.id === pl.clip.id ? drag : null
    const w = (pl.end - pl.start) * pps
    return (
      <div
        key={pl.clip.id}
        data-clip={pl.clip.id}
        data-selected={selected === pl.clip.id || undefined}
        onPointerDown={e => moveFree(e, pl, kind)}
        className={`group absolute top-0 bottom-0 cursor-grab px-0.5 data-selected:z-10 ${d ? 'z-30' : ''}`}
        style={{ left: pl.start * pps, width: w, transform: d ? `translate(${d.dx}px, ${d.dy}px)` : undefined }}
      >
        {kind === 'overlay' ? <ClipBody pl={pl} media={media[pl.clip.mediaId]} width={w} view={nearClip(pl)} /> : <AudioBody pl={pl} media={media[pl.clip.mediaId]} width={w} view={nearClip(pl)} label />}
        {handles(pl)}
      </div>
    )
  }

  // − removes the last added track of a kind (Video 2+, Audio 2+); Video 1 and Audio 1 always stay.
  const lastLane = (kind: LaneKind) => (kind === 'overlay' ? project.overlayTracks - 1 : project.audioTracks > 1 ? project.audioTracks - 1 : -1)
  const trackName = (kind: LaneKind, l: number) => (kind === 'overlay' ? `Video ${l + 2}` : `Audio ${l + 1}`)
  const removeLane = (kind: LaneKind, lane: number) => {
    play('close', { emphasis: 'strong' })
    onChange(removeTrack(project, kind, lane))
  }
  function askRemove(kind: LaneKind) {
    const lane = lastLane(kind)
    const clips = project[kind].filter(c => laneOf(c) === lane).length
    if (!clips) return removeLane(kind, lane)
    play('open')
    setConfirm({ kind, lane, clips, open: true })
  }
  const trackControls = (kind: LaneKind) => {
    const l = lastLane(kind)
    const noun = kind === 'overlay' ? 'video' : 'audio'
    const btn = 'grid size-5 place-items-center rounded-sm text-ink/45 hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30'
    return (
      <div className="flex h-full items-center justify-end gap-0.5 px-1.5">
        <Tip label={l < 0 ? `No added ${noun} track to remove` : `Remove ${trackName(kind, l)}`}>
          <button className={btn} disabled={l < 0} onClick={() => askRemove(kind)} aria-label={`Remove ${noun} track`}>
            <Minus size={13} />
          </button>
        </Tip>
        <Tip label={`Add ${noun} track`}>
          <button
            className={btn}
            onClick={() => {
              play('open', { emphasis: 'subtle' })
              onChange(addTrack(project, kind))
            }}
            aria-label={`Add ${noun} track`}
          >
            <Plus size={13} />
          </button>
        </Tip>
      </div>
    )
  }
  const head = 'flex h-full items-center gap-1.5 px-2.5 whitespace-nowrap'

  const main = layoutVideo(project.video)
  const slid = slide ? main.findIndex(x => x.clip.id === slide.id) : -1
  const rows: Row[] = [
    {
      key: 'sel',
      size: 'mt-1 h-5.5',
      header: <div className={head}><ArrowLeftRight size={13} /> Select</div>,
      lane: (
        // The selection bar: drag here to select a range (scrub() handles it like an empty lane). The range shows as a
        // block with its times; drag its edges or middle to adjust, and its tools sit right after it.
        <div
          className={`group/bar relative h-full cursor-col-resize rounded-xs border border-dashed transition-colors ${range ? 'border-transparent bg-ink/3' : 'border-ink/15 bg-ink/2 hover:border-ink/35 hover:bg-ink/5'}`}
        >
          {!range && (
            <span className="pointer-events-none sticky left-2 inline-flex h-full items-center gap-1.5 pl-2 text-[11px] whitespace-nowrap text-ink/40 transition-colors group-hover/bar:text-ink/70">
              <ArrowLeftRight size={12} /> Drag here to select a range
            </span>
          )}
          {range && (
            <div
              onPointerDown={e => dragRange(e, 'both')}
              className="absolute inset-y-0 z-16 flex cursor-grab items-center justify-center overflow-hidden rounded-xs bg-accent px-2.5 text-[10px] font-semibold text-ink tabular-nums active:cursor-grabbing"
              style={{ left: range.a * pps, width: Math.max(2, (range.b - range.a) * pps) }}
            >
              <span className="pointer-events-none truncate">{timecode(range.a, digits)} – {timecode(range.b, digits)} · {lengthLabel(range.b - range.a, digits)}</span>
              {(['a', 'b'] as const).map(edge => (
                <span
                  key={edge}
                  onPointerDown={e => dragRange(e, edge)}
                  className={`absolute inset-y-0 grid w-2 cursor-ew-resize place-items-center hover:bg-ink/10 ${edge === 'a' ? 'left-0' : 'right-0'}`}
                >
                  <span className="h-3 w-0.5 rounded-xs bg-ink/45" />
                </span>
              ))}
            </div>
          )}
          {range && !selecting && (
            <div
              onPointerDown={e => e.stopPropagation()}
              className="absolute inset-y-0 z-25 ml-1 flex items-center gap-px rounded-sm bg-white px-px ring-1 ring-ink/15"
              style={{ left: range.b * pps }}
            >
              <Tip label="Delete selected region (⌫)">
                <button className={`${mini} hover:text-playhead`} onClick={props.onDeleteRange} aria-label="Delete selected region"><Trash2 size={12} /></button>
              </Tip>
              <Tip label="Crop to selected region">
                <button className={mini} onClick={props.onCrop} aria-label="Crop to selected region"><Crop size={12} /></button>
              </Tip>
              <Menu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
                <Tip label="Export selected region">
                  <Menu.Trigger className={`${mini} data-popup-open:bg-ink/5`} aria-label="Export selected region"><Download size={12} /></Menu.Trigger>
                </Tip>
                <Menu.Portal>
                  <Menu.Positioner className="z-20 outline-none" sideOffset={6}>
                    <Menu.Popup className={`${popup} w-60`}>
                      <ExportItems project={project} media={media} onPick={preset => props.onExport(preset, range)} />
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'v1',
      size: 'mt-1.5 h-14',
      header: <div className={head}><Film size={13} /> Video 1</div>,
      lane: (
        // Video 1: magnetic, each clip right after the one before plus its gap; a sideways drag slides or moves a clip
        <div className={`relative flex h-full items-stretch ${lane} ${dropRing('v1')}`} {...dropProps('v1', { kind: 'video' })}>
          {main.map((pl, i) => {
            const moved = slide && (pl.clip.id === slide.id || (!slide.insert && i > slid))
            const w = (pl.end - pl.start) * pps
            return (
              <div
                key={pl.clip.id}
                data-clip={pl.clip.id}
                data-selected={selected === pl.clip.id || undefined}
                onPointerDown={e => grabMain(e, pl)}
                className={`group relative h-full shrink-0 cursor-grab px-0.5 outline-none data-selected:z-10 active:cursor-grabbing ${drag?.id === pl.clip.id ? 'opacity-40' : ''} ${moved ? 'z-30' : ''}`}
                style={{ width: w, marginLeft: (pl.clip.gap ?? 0) * pps, transform: moved ? `translateX(${(slide.start - main[slid].start) * pps}px)` : undefined }}
              >
                <ClipBody pl={pl} media={media[pl.clip.mediaId]} width={w} view={nearClip(pl)} />
                {handles(pl)}
                {slide?.id === pl.clip.id && (
                  <span className="pointer-events-none absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-sm bg-white px-1.5 py-0.5 text-[10px] whitespace-nowrap tabular-nums ring-1 ring-ink/15">
                    Offset: {timecode(slide.start, digits)}
                  </span>
                )}
              </div>
            )
          })}
          {/* ghost of a Video 1 clip being carried to an overlay lane */}
          {main
            .filter(pl => drag?.id === pl.clip.id)
            .map(pl => (
              <div
                key="ghost"
                className="pointer-events-none absolute top-0 bottom-0 z-30 px-0.5"
                style={{ left: pl.start * pps + drag!.dx, width: (pl.end - pl.start) * pps, transform: `translateY(${drag!.dy}px)` }}
              >
                <ClipBody pl={pl} media={media[pl.clip.mediaId]} width={(pl.end - pl.start) * pps} view={nearClip(pl)} />
              </div>
            ))}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={props.onAdd}
            data-cuelume-open=""
            className="ml-1 grid w-16 shrink-0 place-items-center rounded-md border border-dashed border-ink/20 text-ink/40 transition-colors hover:border-ink/40 hover:text-ink"
            aria-label="Add media"
          >
            <Plus size={16} />
          </button>
        </div>
      ),
    },
    // Video 2, 3, …: free-placed overlays, drawn on top of the tracks below them in number
    ...Array.from({ length: project.overlayTracks }, (_, l): Row => ({
      key: `o${l}`,
      size: 'mt-1.5 h-14',
      header: (
        <Tip label={`Drawn on top of Video ${l + 1}`}>
          <div className={head}><Layers size={13} /> Video {l + 2}</div>
        </Tip>
      ),
      lane: (
        <div className={`relative h-full ${lane} ${dropRing(`o${l}`)}`} {...dropProps(`o${l}`, { kind: 'overlay', lane: l })}>
          {!project.overlay.some(c => laneOf(c) === l) && <span className={hint}>Drag a video from the media bin here to overlay it</span>}
          {layoutFree(project.overlay).filter(pl => laneOf(pl.clip) === l).map(pl => freeClip(pl, 'overlay'))}
        </div>
      ),
    })),
    { key: 'add-v', size: 'mt-1.5 h-7', header: trackControls('overlay'), lane: null, band: true },
    // Audio 1, 2, …: music, voiceover and unlinked video sound, placed freely
    ...Array.from({ length: project.audioTracks }, (_, l): Row => ({
      key: `a${l}`,
      size: 'mt-1.5 h-9',
      header: (
        <div className={head}><Music size={13} /> Audio {l + 1}</div>
      ),
      lane: (
        <div className={`relative h-full ${lane} ${dropRing(`a${l}`)}`} {...dropProps(`a${l}`, { kind: 'audio', lane: l })}>
          {!project.audio.some(c => laneOf(c) === l) && <span className={hint}>Drag and drop your audio clips here to mix</span>}
          {layoutFree(project.audio).filter(pl => laneOf(pl.clip) === l).map(pl => freeClip(pl, 'audio'))}
        </div>
      ),
    })),
    { key: 'add-a', size: 'mt-1.5 h-7', header: trackControls('audio'), lane: null, band: true },
  ]

  return (
    <div className={`${card} flex shrink-0 flex-col overflow-hidden select-none`} style={{ height: props.height }}>
      {/* both columns scroll vertically together when there are many tracks */}
      <div className="flex min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="min-h-full w-28 shrink-0 self-start border-r border-ink/6 pb-8 text-[11px] font-medium text-ink/60">
          <div className="flex h-6 items-center border-b border-ink/6 px-2.5 text-[10px] tracking-wide text-ink/40 uppercase">Timeline</div>
          {rows.map(r => <div key={r.key} className={`${r.size} ${r.band ? 'border-y border-ink/6' : ''}`}>{r.header}</div>)}
        </div>

        <div ref={props.scrollRef} className="min-h-full min-w-0 flex-1 self-start overflow-x-auto overflow-y-hidden">
          <ContextMenu.Root>
          <ContextMenu.Trigger ref={contentRef} className="relative ml-4 pb-8 cursor-text" style={{ width }} onPointerDown={scrub} onContextMenu={openMenu}>
            {/* ruler: timecode labels + minor ticks every fifth of a step. Click or drag it to move the playhead. */}
            <div
              data-ruler
              onPointerMove={hover}
              onPointerLeave={() => hover(null)}
              className="relative h-6 cursor-pointer overflow-hidden border-b border-ink/6"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, rgb(29 29 32 / 0.14) 0 1px, transparent 1px ${(step * pps) / 5}px)`,
                backgroundSize: '100% 5px',
                backgroundPosition: 'bottom',
                backgroundRepeat: 'repeat-x',
              }}
            >
              {Array.from({ length: ticks }, (_, k) => firstTick + k).map(i => (
                <span key={i} className="absolute top-0 bottom-0 border-l border-ink/20 pt-1 pl-1 text-[10px] text-ink/40 tabular-nums" style={{ left: i * step * pps }}>
                  {timecode(i * step, step < 1 ? 1 : 0)}
                </span>
              ))}
            </div>

            {rows.map(r => (
              <div key={r.key} className={`${r.size} ${r.band ? '-ml-4 border-y border-ink/6' : ''}`} style={r.band ? { width: width + MARGIN } : undefined}>
                {r.lane}
              </div>
            ))}

            {/* snap guide: the exact time a dragged edge has locked onto */}
            {guide !== null && <div className="pointer-events-none absolute top-0 bottom-0 z-25 w-px -ml-px bg-amber-500" style={{ left: guide * pps }} />}

            {/* time under the mouse on the ruler */}
            <span ref={hoverRef} className="pointer-events-none absolute top-6.5 z-30 hidden -translate-x-1/2 rounded-sm bg-white px-1.5 py-0.5 text-[10px] whitespace-nowrap tabular-nums ring-1 ring-ink/15" />

            {/* selected time range tinted across all tracks and the ruler; Start/End beside the moving edge while dragging */}
            {range && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-15 border-x border-accent bg-accent/20"
                style={{ left: range.a * pps, width: (range.b - range.a) * pps }}
              >
                <div className="h-6 bg-accent/45" />
                {selecting && (
                  <span className={`absolute top-13 grid rounded-sm bg-white px-1.5 py-1 text-[10px] leading-snug whitespace-nowrap tabular-nums ring-1 ring-ink/15 ${moving === 'b' ? 'left-full ml-1.5' : 'right-full mr-1.5'}`}>
                    <span>Selection Start: {timecode(range.a, digits)}</span>
                    <span>Selection End: {timecode(range.b, digits)}</span>
                  </span>
                )}
              </div>
            )}

            {/* playhead: red line, time pill in the ruler, split button at its foot; moved by the player through the DOM */}
            <div ref={props.playheadRef} className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-0.5 -ml-px bg-playhead">
              <span ref={props.playheadLabelRef} style={{ transform: 'translateX(var(--nudge, 0px))' }} className="absolute top-1 left-1/2 -translate-x-1/2 rounded-sm bg-white px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-playhead tabular-nums ring-1 ring-playhead/25">
                0:00:00.0
              </span>
              {/* after a click: mark the selection start or end right here */}
              {marking && !props.playing && (
                <div onPointerDown={e => e.stopPropagation()} style={{ transform: 'translateX(var(--nudge, 0px))' }} className={`${floating} left-1/2 ml-9`}>
                  {(['in', 'out'] as const).map(edge => (
                    <Tip key={edge} label={edge === 'in' ? 'Mark selection start here (I)' : 'Mark selection end here (O)'}>
                      <button
                        className={`${mini} text-[13px] leading-none font-bold`}
                        onClick={() => {
                          play('select', { emphasis: 'subtle' })
                          props.onMark(edge)
                          setMarking(false)
                        }}
                        aria-label={edge === 'in' ? 'Mark selection start' : 'Mark selection end'}
                      >
                        {edge === 'in' ? '[' : ']'}
                      </button>
                    </Tip>
                  ))}
                </div>
              )}
              {duration > 0 && (
                <Tip label="Split all tracks at playhead (S)">
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => props.onSplit('all', true)}
                    aria-label="Split all tracks at playhead"
                    className="pointer-events-auto absolute bottom-1 left-1 grid size-6 place-items-center rounded-sm bg-white text-ink/70 ring-1 ring-ink/15 hover:text-ink hover:ring-ink/30"
                  >
                    <Scissors size={12} />
                  </button>
                </Tip>
              )}
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner className="z-20 outline-none">
              <ContextMenu.Popup className={`${popup} w-56`}>
                {menu === 'range' && range ? (
                  <>
                    <ContextMenu.Item className={menuItem} onClick={() => props.onSplit('all')}>
                      <span className="flex items-center gap-2"><Scissors size={13} /> Split All Tracks</span><kbd className={kbd}>S</kbd>
                    </ContextMenu.Item>
                    <ContextMenu.Item className={menuItem} onClick={props.onDeleteRange}>
                      <span className="flex items-center gap-2"><Trash2 size={13} /> Delete Selected Region</span><kbd className={kbd}>⌫</kbd>
                    </ContextMenu.Item>
                    <ContextMenu.Item className={menuItem} onClick={props.onCrop}>
                      <span className="flex items-center gap-2"><Crop size={13} /> Crop Selected Region</span>
                    </ContextMenu.Item>
                    <ContextMenu.SubmenuRoot>
                      <ContextMenu.SubmenuTrigger className={`${menuItem} data-popup-open:bg-ink/6`}>
                        <span className="flex items-center gap-2"><Download size={13} /> Export Selected Region</span><ChevronRight size={12} className="text-ink/40" />
                      </ContextMenu.SubmenuTrigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Positioner className="z-20 outline-none" sideOffset={4}>
                          <ContextMenu.Popup className={`${popup} w-60`}>
                            <ExportItems project={project} media={media} onPick={preset => props.onExport(preset, range)} />
                          </ContextMenu.Popup>
                        </ContextMenu.Positioner>
                      </ContextMenu.Portal>
                    </ContextMenu.SubmenuRoot>
                  </>
                ) : menu && menu !== 'range' ? (
                  <>
                    <ContextMenu.Item
                      className={menuItem}
                      // only a video clip that still carries its sound can unlink it
                      disabled={!media[menu.clip.mediaId].hasAudio || !!menu.clip.muted || project.audio.some(c => c.id === menu.clip.id)}
                      onClick={() => {
                        play('tap', { emphasis: 'strong' })
                        onChange(unlinkAudio(project, menu.clip.id))
                      }}
                    >
                      <span className="flex items-center gap-2"><Unlink size={13} /> Unlink audio</span>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={menuItem}
                      onClick={() => {
                        play('close', { emphasis: 'strong' })
                        onChange(removeClip(project, menu.clip.id))
                        onSelect(null)
                      }}
                    >
                      <span className="flex items-center gap-2"><Trash2 size={13} /> Delete</span><kbd className={kbd}>⌫</kbd>
                    </ContextMenu.Item>
                  </>
                ) : null}
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
          </ContextMenu.Root>
        </div>
      </div>
      <div className="flex h-8 shrink-0 items-center gap-1 border-t border-ink/6 px-2">
        {props.footer}
        <Tip label={props.snapping ? 'Snapping on (N). Hold ⌥ to drag freely' : 'Snapping off (N)'}>
          <Toggle
            pressed={props.snapping}
            onPressedChange={props.onSnapping}
            data-cuelume-toggle=""
            aria-label="Snapping"
            className="ml-1 grid size-7 place-items-center rounded-md text-ink/45 hover:bg-ink/5 hover:text-ink data-pressed:bg-accent/30 data-pressed:text-ink"
          >
            <Magnet size={14} />
          </Toggle>
        </Tip>
      </div>

      <AlertDialog.Root open={!!confirm?.open} onOpenChange={open => !open && setConfirm(c => c && { ...c, open: false })}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={dialogBackdrop} />
          <AlertDialog.Popup className={dialogPopup}>
            {confirm && (
              <>
                <div className="grid gap-1">
                  <AlertDialog.Title className="text-sm font-semibold">Remove {trackName(confirm.kind, confirm.lane)}?</AlertDialog.Title>
                  <AlertDialog.Description className="text-[11px] text-ink/50">
                    It has {confirm.clips} {confirm.clips === 1 ? 'clip' : 'clips'}, which will be removed with the track. You can undo this.
                  </AlertDialog.Description>
                </div>
                <div className="flex justify-end gap-2">
                  <AlertDialog.Close className={pill}>Cancel</AlertDialog.Close>
                  <button
                    className="inline-flex h-8 items-center rounded-md bg-playhead/10 px-3 text-[11px] font-semibold text-playhead hover:bg-playhead/15"
                    onClick={() => {
                      removeLane(confirm.kind, confirm.lane)
                      setConfirm({ ...confirm, open: false })
                    }}
                  >
                    Remove track
                  </button>
                </div>
              </>
            )}
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}

// A video clip: repeated thumbnail, its sound in a strip underneath (until unlinked), name.
function ClipBody({ pl, media, width, view }: { pl: Placed; media: Media; width: number; view: [number, number] }) {
  return (
    <div className="relative flex h-full flex-col gap-0.5 overflow-hidden rounded-md bg-white p-1 ring-1 ring-ink/10 group-data-selected:ring-2 group-data-selected:ring-accent">
      <div
        className="min-h-0 flex-1 rounded-xs bg-ink/5 bg-size-[auto_100%] bg-repeat-x"
        style={{ backgroundImage: media.thumb ? `url(${media.thumb})` : undefined }}
      />
      {media.hasAudio && !pl.clip.muted && (
        <div className={`relative h-3 shrink-0 overflow-hidden rounded-xs bg-emerald-50 ${reading(media) ? 'wave-pending' : ''}`}>
          {media.peaks && <Waveform peaks={media.peaks} done={media.peaksDone!} from={pl.clip.in} to={pl.clip.out} width={width} view={view} />}
        </div>
      )}
      <Label>
        {media.name}
        {pl.clip.speed !== 1 && ` · ${pl.clip.speed}×`}
      </Label>
    </div>
  )
}

// Trim handles: white on hover, yellow on the selected clip.
function Handle({ side, onPointerDown }: { side: 'l' | 'r'; onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute top-1/2 z-10 grid h-7 w-2.5 -translate-y-1/2 cursor-ew-resize place-items-center rounded-xs bg-white opacity-0 ring-1 ring-ink/15 group-data-selected:bg-accent group-data-selected:ring-accent transition-opacity group-hover:opacity-100 group-data-selected:opacity-100 ${side === 'l' ? 'left-0' : 'right-0'}`}
    >
      <span className="h-3 w-px bg-ink/40" />
    </div>
  )
}

// An audio clip: waveform of its source range [in, out] and (on free lanes) its name.
function AudioBody({ pl, media, width, view, label }: { pl: Placed; media: Media; width: number; view: [number, number]; label?: boolean }) {
  return (
    <div className={`relative h-full overflow-hidden rounded-md bg-emerald-50 ring-1 ring-emerald-700/15 group-data-selected:ring-2 group-data-selected:ring-accent ${reading(media) ? 'wave-pending' : ''}`}>
      {media.peaks && <Waveform peaks={media.peaks} done={media.peaksDone!} from={pl.clip.in} to={pl.clip.out} width={width} view={view} />}
      {label && (
        <Label>
          <Music size={10} /> {media.name}
          {pl.clip.speed !== 1 && ` · ${pl.clip.speed}×`}
        </Label>
      )}
    </div>
  )
}

// Its waveform is still being read: the strip shimmers and the bars fill in as slices arrive.
const reading = (m: Media) => m.hasAudio && (m.peaksDone ?? 0) < 1

// Mirrored peak bars for source seconds [from, to], stretched over `width` px. Only the tiles inside `view` (clip px) exist.
function Waveform(props: { peaks: Float32Array; done: number; from: number; to: number; width: number; view: [number, number] }) {
  const first = Math.max(0, Math.floor(props.view[0] / TILE))
  const last = Math.min(Math.ceil(props.width / TILE), Math.ceil(props.view[1] / TILE))
  return Array.from({ length: Math.max(0, last - first) }, (_, k) => <WaveTile key={first + k} {...props} x={(first + k) * TILE} />)
}

// One TILE of a waveform, from clip px x. Redraws when its range, the zoom, or the share read (`done`) changes.
function WaveTile({ peaks, done, from, to, width, x }: { peaks: Float32Array; done: number; from: number; to: number; width: number; x: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const w = Math.min(TILE, width - x)
  useLayoutEffect(() => {
    const c = ref.current!
    const W = Math.round(w * devicePixelRatio)
    const H = Math.round(c.clientHeight * devicePixelRatio)
    if (!W || !H) return
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.fillStyle = 'rgb(4 120 87 / 0.5)'
    const perPx = ((to - from) * PEAKS_PER_SEC) / width // peak buckets per css px
    const a = from * PEAKS_PER_SEC + x * perPx
    const per = (w * perPx) / W // peak buckets per canvas column
    g.clearRect(0, 0, W, H)
    for (let i = 0; i < W; i++) {
      let v = -1 // stays -1 where nothing is read yet: leave the column empty
      for (let j = Math.floor(a + i * per), e = Math.max(j + 1, Math.ceil(a + (i + 1) * per)); j < e; j++) v = Math.max(v, peaks[j] ?? -1)
      if (v < 0) continue
      const h = Math.max(devicePixelRatio, v * H * 0.9)
      g.fillRect(i, (H - h) / 2, 1, h)
    }
  }, [peaks, done, from, to, width, x, w])
  return <canvas ref={ref} className="absolute inset-y-0 h-full" style={{ left: x, width: w }} />
}

const Label = ({ children }: { children: ReactNode }) => (
  <span className="pointer-events-none absolute top-1.5 left-2.5 flex max-w-[calc(100%-20px)] items-center gap-1 truncate rounded-sm bg-white/85 px-1.5 py-px text-[10px] font-medium text-ink/80 backdrop-blur-sm">
    {children}
  </span>
)
