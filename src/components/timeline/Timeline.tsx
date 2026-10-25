// The timeline: the ruler and the Select bar, Video 1, the overlay and audio tracks, and every way of editing on them
// with the mouse (scrubbing, selecting a range, trimming, moving and dropping clips). The project lives in the app;
// edits come back through onChange.
import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { ScrollArea } from '@base-ui/react/scroll-area'
import type { BaseUIEvent } from '@base-ui/react/types'
import { play } from 'cuelume'
import { ArrowLeftRight, Film, Layers, Music, Plus } from 'lucide-react'
import {
  addTrack, clipLength, digitsFor, findPlaced, gridFor, laneOf, layoutFree, layoutVideo, moveClip, moveVideoClip, projectDuration, removeClip,
  removeTrack, renameTrack, slideVideoClip, snapPoints, snapShift, tickStep, timecode, trackKey, trackName, trimClip, trimVideoIn, unlinkAudio,
  updateClip, type Clip, type DropTarget, type ExportPreset, type LaneKind, type Media, type Placed, type Project, type Range, type SplitTarget,
} from '@/lib/model'
import { cn, plural } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui'
import { AudioBody, ClipBody, Handle } from './ClipBody'
import { FIT, HEAD, MEDIA_MIME, ROOM, SNAP_PX, STEP, TILE } from './constants'
import { track } from './drag'
import { Playhead } from './Playhead'
import { RangeBar } from './RangeBar'
import { Ruler } from './Ruler'
import { hint, lane, rowHead } from './styles'
import { TimelineMenu } from './TimelineMenu'
import { TrackControls } from './TrackControls'
import { TrackName } from './TrackName'

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
  exportName: string
  onExportName: (name: string) => void
  onSaveAudio: (clip: Clip) => void
  onMark: (edge: 'in' | 'out') => void
  playing: boolean
  onPlace: (mediaId: string, target: DropTarget, t: number) => void
  onAdd: () => void
  time: () => number // the playhead, which clips also snap to
  viewW: number // visible width of the lanes, reported through onViewW
  onViewW: (w: number) => void
  footer: ReactNode
  playheadRef: RefObject<HTMLDivElement | null>
  playheadLabelRef: RefObject<HTMLSpanElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
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
  // Mouse edits land on the ruler ticks (single frames while Alt is held), and times show just the digits those need.
  const digits = digitsFor(gridFor(pps, project.fps, true))
  // Shift needed to line any of `edges` up with the nearest point (Alt places freely); with nothing in reach, the first
  // edge lands on the grid instead.
  const snapper = (points: number[]) => (edges: number[], ev: { altKey: boolean }) => {
    const on = !ev.altKey
    const r = on ? snapShift(edges, points, SNAP_PX / pps) : { shift: 0, at: null }
    showGuide(r.at)
    const grid = gridFor(pps, project.fps, on)
    return r.at !== null ? r.shift : Math.round(edges[0] / grid) * grid - edges[0]
  }
  const [selecting, setSelecting] = useState(false)
  const [moving, setMoving] = useState<'a' | 'b'>('b') // the range edge being dragged
  const [marking, setMarking] = useState(false) // a click placed the playhead: offer the start/end mark buttons there
  const [menu, setMenu] = useState<Placed | 'range' | null>(null) // what the right-click menu acts on
  const contentRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<HTMLSpanElement>(null)
  const timeAt = (clientX: number) => (clientX - contentRef.current!.getBoundingClientRect().left) / pps
  const inRange = (clientX: number) => !!range && timeAt(clientX) >= range.a && timeAt(clientX) <= range.b
  const [tile, setTile] = useState(0) // the TILE the view's left edge is in
  // Content always fills the visible width, and only scrolls when the clips don't fit.
  useEffect(() => {
    const el = props.scrollRef.current!
    const ro = new ResizeObserver(() => props.onViewW(el.clientWidth - HEAD))
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
  const empty = !duration // nothing on the timeline yet: no playhead, ruler clicks or selecting
  useEffect(() => void (empty && setMarking(false)), [empty])
  // Past the last clip there's room for the + tile and dragging; fully zoomed out that's the 10% left, so nothing scrolls.
  const width = Math.max(viewW, duration * pps + Math.min(ROOM, (1 - FIT) * viewW))
  const step = tickStep(pps)
  const firstTick = Math.max(0, Math.floor(near[0] / (step * pps)))
  const ticks = Math.max(0, Math.min(Math.ceil(width / pps / step), Math.ceil(near[1] / (step * pps))) - firstTick)

  // Ruler: click or drag moves the playhead (a selected range stays). Empty lane: a click moves the playhead and clears
  // the selection; a drag selects a time range across all tracks, the playhead following the moving edge.
  function scrub(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button || e.ctrlKey || empty) return // right-click: the context menu
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
    el.style.display = e && !empty ? 'block' : 'none'
    if (!e || empty) return
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
    const free = !project.video.includes(clip)
    const sound = project.audio.includes(clip)
    const base = project // every move re-derives from the drag start, so edits never accumulate error
    const i = project.video.indexOf(clip)
    // skip this clip, and on Video 1 the clips after it too: they move with its right edge
    const snap = snapper(snapPoints(base, c => c === clip || (i >= 0 && base.video.indexOf(c) > i), [props.time()]))
    // The dragged edge follows the mouse. A left edge keeps the content in place (on Video 1 the start moves into the
    // gap in front, the clips after it stay put); a right edge on Video 1 carries the clips after it along.
    const trimmed = (d: number) => {
      const dur = media[clip.mediaId].duration
      const c = !free && edge === 'in' ? trimVideoIn(clip, d, dur) : trimClip(clip, edge, d, dur, free)
      const start = free ? c.start : pl.start - (clip.gap ?? 0) + (c.gap ?? 0)
      return { c, start, edgeAt: edge === 'in' ? start : start + clipLength(c) }
    }
    pick(clip.id)
    track(
      e,
      (dx, _, ev) => {
        let d = dx / pps
        d += snap([trimmed(d).edgeAt], ev)
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
  const dropRing = (key: string) => dropKey === key && 'bg-accent/5 ring-2 ring-accent'

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
        className={cn('group absolute top-0 bottom-0 cursor-grab px-0.5 data-selected:z-10', d && 'z-30')}
        style={{ left: pl.start * pps, width: w, transform: d ? `translate(${d.dx}px, ${d.dy}px)` : undefined }}
      >
        {kind === 'overlay' ? (
          <ClipBody pl={pl} media={media[pl.clip.mediaId]} width={w} view={nearClip(pl)} />
        ) : (
          <AudioBody pl={pl} media={media[pl.clip.mediaId]} width={w} view={nearClip(pl)} label />
        )}
        {handles(pl)}
      </div>
    )
  }

  // − removes the last added track of a kind (Video 2+, Audio 2+); Video 1 and Audio 1 always stay.
  const lastLane = (kind: LaneKind) => (kind === 'overlay' ? project.overlayTracks - 1 : project.audioTracks > 1 ? project.audioTracks - 1 : -1)
  const nameOf = (kind: LaneKind, l: number) => trackName(project, trackKey(kind, l))
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
    return (
      <TrackControls kind={kind} removable={l < 0 ? null : nameOf(kind, l)} onRemove={() => askRemove(kind)} onAdd={() => onChange(addTrack(project, kind))} />
    )
  }
  // A track header: its icon and name, click the name to rename it.
  const named = (key: string, icon: ReactNode, tip?: string) => (
    <div className={rowHead}>
      {icon}
      <TrackName name={trackName(project, key)} tip={`${tip ? `${tip}. ` : ''}Click to rename`} onRename={name => onChange(renameTrack(project, key, name))} />
    </div>
  )
  const setFps = (fps: number) => onChange({ ...project, fps })

  const main = layoutVideo(project.video)
  const slid = slide ? main.findIndex(x => x.clip.id === slide.id) : -1
  const rows: Row[] = [
    // nothing to select until there's something on the timeline
    ...(empty
      ? []
      : [{
          key: 'sel',
          size: 'mt-1 h-5.5',
          header: <div className={rowHead}><ArrowLeftRight size={13} /> Select</div>,
          lane: (
            <RangeBar
              range={range}
              pps={pps}
              digits={digits}
              tools={!selecting}
              onDrag={dragRange}
              onDelete={props.onDeleteRange}
              onCrop={props.onCrop}
              project={project}
              media={media}
              onExport={props.onExport}
              onFps={setFps}
              name={props.exportName}
              onName={props.onExportName}
            />
          ),
        }]),
    {
      key: 'v1',
      size: 'mt-1.5 h-14',
      header: named('v1', <Film size={13} className="shrink-0" />),
      lane: (
        // Video 1: magnetic, each clip right after the one before plus its gap; a sideways drag slides or moves a clip
        <div className={cn('relative flex h-full items-stretch', lane, dropRing('v1'))} {...dropProps('v1', { kind: 'video' })}>
          {main.map((pl, i) => {
            const moved = slide && (pl.clip.id === slide.id || (!slide.insert && i > slid))
            const w = (pl.end - pl.start) * pps
            return (
              <div
                key={pl.clip.id}
                data-clip={pl.clip.id}
                data-selected={selected === pl.clip.id || undefined}
                onPointerDown={e => grabMain(e, pl)}
                className={cn(
                  'group relative h-full shrink-0 cursor-grab px-0.5 outline-none active:cursor-grabbing data-selected:z-10',
                  drag?.id === pl.clip.id && 'opacity-40',
                  moved && 'z-30',
                )}
                style={{ width: w, marginLeft: (pl.clip.gap ?? 0) * pps, transform: moved ? `translateX(${(slide.start - main[slid].start) * pps}px)` : undefined }}
              >
                <ClipBody pl={pl} media={media[pl.clip.mediaId]} width={w} view={nearClip(pl)} />
                {handles(pl)}
                {slide?.id === pl.clip.id && (
                  <span className="pointer-events-none absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-sm bg-surface px-1.5 py-0.5 text-[10px] whitespace-nowrap tabular-nums ring-1 ring-line">
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
            className="ml-1 grid w-16 shrink-0 place-items-center rounded-md border border-dashed border-ink/20 text-muted transition-colors hover:border-ink/40 hover:text-ink"
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
      header: named(`o${l}`, <Layers size={13} className="shrink-0" />, `Drawn on top of ${l ? nameOf('overlay', l - 1) : trackName(project, 'v1')}`),
      lane: (
        <div className={cn('relative h-full', lane, dropRing(`o${l}`))} {...dropProps(`o${l}`, { kind: 'overlay', lane: l })}>
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
      header: named(`a${l}`, <Music size={13} className="shrink-0" />),
      lane: (
        <div className={cn('relative h-full', lane, dropRing(`a${l}`))} {...dropProps(`a${l}`, { kind: 'audio', lane: l })}>
          {!project.audio.some(c => laneOf(c) === l) && <span className={hint}>Drag audio from the media bin here to mix it in</span>}
          {layoutFree(project.audio).filter(pl => laneOf(pl.clip) === l).map(pl => freeClip(pl, 'audio'))}
        </div>
      ),
    })),
    { key: 'add-a', size: 'mt-1.5 h-7', header: trackControls('audio'), lane: null, band: true },
  ]

  return (
    <div className="flex shrink-0 flex-col overflow-hidden bg-surface select-none" style={{ height: props.height }}>
      {/* One scroll area for both directions: the track names stay pinned on the left, and the scrollbars sit in their
          own thin strips along the bottom and right edges, outside the tracks, so they're always in reach. */}
      <ScrollArea.Root className="relative min-h-0 flex-1 pr-2 pb-2">
        {/* the track-name column's background runs to the bottom however tall the panel is */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-28 border-r border-line bg-canvas" />
        <ScrollArea.Viewport ref={props.scrollRef} className="h-full overscroll-none">
          <ScrollArea.Content className="flex">
            <div className="sticky left-0 z-40 w-28 shrink-0 border-r border-line bg-canvas pb-8 text-[11px] font-medium text-ink/60">
              <div className="flex h-6 items-center border-b border-line px-2.5 text-[10px] tracking-wide text-muted uppercase">Timeline</div>
              {rows.map(r => <div key={r.key} className={cn(r.size, r.band && 'border-y border-line')}>{r.header}</div>)}
            </div>

            <ContextMenu.Root>
              <ContextMenu.Trigger
                ref={contentRef}
                className={cn('relative shrink-0 pb-8', !empty && 'cursor-text')}
                style={{ width }}
                onPointerDown={scrub}
                onContextMenu={openMenu}
              >
                <Ruler pps={pps} step={step} first={firstTick} count={ticks} interactive={!empty} onHover={hover} />

                {rows.map(r => (
                  <div key={r.key} className={cn(r.size, r.band && 'border-y border-line')}>
                    {r.lane}
                  </div>
                ))}

                {/* snap guide: the exact time a dragged edge has locked onto */}
                {guide !== null && <div className="pointer-events-none absolute top-0 bottom-0 z-25 -ml-px w-px bg-accent" style={{ left: guide * pps }} />}

                {/* time under the mouse on the ruler */}
                <span
                  ref={hoverRef}
                  className="pointer-events-none absolute top-6.5 z-30 hidden -translate-x-1/2 rounded-sm bg-surface px-1.5 py-0.5 text-[10px] whitespace-nowrap tabular-nums ring-1 ring-line"
                />

                {/* selected time range tinted across all tracks and the ruler; Start/End beside the moving edge while dragging */}
                {range && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-15 border-x border-accent bg-accent/8"
                    style={{ left: range.a * pps, width: (range.b - range.a) * pps }}
                  >
                    <div className="h-6 bg-accent/25" />
                    {selecting && (
                      <span
                        className={cn(
                          'absolute top-13 grid rounded-sm bg-surface px-1.5 py-1 text-[10px] leading-snug whitespace-nowrap tabular-nums ring-1 ring-line',
                          moving === 'b' ? 'left-full ml-1.5' : 'right-full mr-1.5',
                        )}
                      >
                        <span>Selection Start: {timecode(range.a, digits)}</span>
                        <span>Selection End: {timecode(range.b, digits)}</span>
                      </span>
                    )}
                  </div>
                )}

                <Playhead
                  ref={props.playheadRef}
                  labelRef={props.playheadLabelRef}
                  hidden={empty}
                  marking={marking && !props.playing}
                  onMark={edge => (props.onMark(edge), setMarking(false))}
                  onSplit={() => props.onSplit('all', true)}
                />
              </ContextMenu.Trigger>
              <TimelineMenu
                target={menu}
                range={range}
                project={project}
                media={media}
                onSplit={() => props.onSplit('all')}
                onDeleteRange={props.onDeleteRange}
                onCrop={props.onCrop}
                onExport={props.onExport}
                onFps={setFps}
                name={props.exportName}
                onName={props.onExportName}
                onUnlink={id => {
                  play('tap', { emphasis: 'strong' })
                  onChange(unlinkAudio(project, id))
                }}
                onSaveAudio={props.onSaveAudio}
                onDeleteClip={id => {
                  play('close', { emphasis: 'strong' })
                  onChange(removeClip(project, id))
                  onSelect(null)
                }}
              />
            </ContextMenu.Root>
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="horizontal" className="mb-0.5 h-1.5 rounded-xs bg-ink/4" style={{ insetInlineStart: HEAD }}>
          <ScrollArea.Thumb className="h-full rounded-xs bg-ink/25 transition-colors hover:bg-ink/45 active:bg-ink/50" />
        </ScrollArea.Scrollbar>
        <ScrollArea.Scrollbar orientation="vertical" className="mr-0.5 w-1.5 rounded-xs bg-ink/4">
          <ScrollArea.Thumb className="w-full rounded-xs bg-ink/25 transition-colors hover:bg-ink/45 active:bg-ink/50" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      <div className="flex h-8 shrink-0 items-center gap-1 border-t border-line bg-chrome px-2">{props.footer}</div>

      <ConfirmDialog
        open={!!confirm?.open}
        onOpenChange={open => !open && setConfirm(c => c && { ...c, open: false })}
        title={confirm && `Remove ${nameOf(confirm.kind, confirm.lane)}?`}
        description={confirm && `It has ${plural(confirm.clips, { one: '# clip', other: '# clips' })}, which will be removed with the track. You can undo this.`}
        confirm="Remove track"
        onConfirm={() => confirm && removeLane(confirm.kind, confirm.lane)}
      />
    </div>
  )
}
