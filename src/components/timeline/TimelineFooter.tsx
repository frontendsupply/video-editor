// The timeline's footer, in one row: the selected clip (name, times, speed and volume), or the selected range, or a
// hint; then the zoom controls.
import { Film, Maximize2, Music, ZoomIn, ZoomOut } from 'lucide-react'
import { lengthLabel, timecode, type Clip, type Media, type Placed, type Range } from '@/lib/model'
import { Divider, ghost, Select, Slider, Tip } from '@/components/ui'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(s => ({ value: s, label: `${s}×` }))

export function TimelineFooter(props: {
  selected: Placed | null
  media: Record<string, Media>
  range: Range | null
  digits: 0 | 1 | 3
  empty: boolean
  onPatch: (c: Partial<Clip>) => void
  zoom: { pps: number; lo: number; hi: number; set: (pps: number) => void; fit: () => void; by: (f: number) => void }
}) {
  const { selected: sel, range, digits, zoom } = props
  const m = sel && props.media[sel.clip.mediaId]
  return (
    <>
      {sel && m && !range ? (
        <div className="flex min-w-0 items-center gap-1.5 pl-1 text-[11px]">
          {m.hasVideo ? <Film size={12} className="shrink-0 text-muted" /> : <Music size={12} className="shrink-0 text-muted" />}
          <span className="max-w-48 truncate font-medium" title={m.name}>{m.name}</span>
          <span className="shrink-0 text-[10px] text-muted tabular-nums">{timecode(sel.start, digits)} → {timecode(sel.end, digits)}</span>
          <Divider />
          <Select label="Speed" value={sel.clip.speed} items={SPEEDS} onChange={speed => props.onPatch({ speed })} />
          {m.hasAudio && !sel.clip.muted && (
            <>
              <Divider />
              <Slider label="Volume" value={sel.clip.volume} onChange={volume => props.onPatch({ volume })} format={{ style: 'percent' }} width="w-20" />
            </>
          )}
        </div>
      ) : (
        <span className="truncate pl-1 text-[10px] text-muted">
          {range
            ? `Selection ${timecode(range.a, digits)} – ${timecode(range.b, digits)} (${lengthLabel(range.b - range.a, digits)}) · S split · ⌫ delete · right-click for more`
            : props.empty
              ? 'Add media to start editing'
              : 'Drag in the Select bar to select · click the ruler to move the playhead · I / O mark the selection start / end'}
        </span>
      )}
      <div className="flex-1" />
      <Tip label="Zoom to fit">
        <button className={ghost} onClick={zoom.fit} disabled={props.empty} data-cuelume-tap="" data-cuelume-emphasis="subtle"><Maximize2 size={13} /></button>
      </Tip>
      <Tip label="Zoom out">
        <button className={ghost} onClick={() => zoom.by(1 / 1.5)} disabled={props.empty}><ZoomOut size={14} /></button>
      </Tip>
      <Slider label="Zoom" value={Math.log(zoom.pps)} min={Math.log(zoom.lo)} max={Math.log(zoom.hi)} step={0.01} onChange={v => zoom.set(Math.exp(v))} disabled={props.empty} />
      <Tip label="Zoom in">
        <button className={ghost} onClick={() => zoom.by(1.5)} disabled={props.empty}><ZoomIn size={14} /></button>
      </Tip>
    </>
  )
}
