// The timeline's footer, in one row: the selected clip (name, times, Crop, speed and volume; a moved or resized
// picture's Reset), or several selected clips and Merge, or the selected range, or a hint; then the zoom controls and
// the light / dark toggle. On phones the selection's tools fold into a ⋯ popover, so the footer stays one row.

import { Popover } from '@base-ui/react/popover'
import { play } from 'cuelume'
import { Crop, Ellipsis, Film, ImageIcon, Maximize2, Merge, Moon, Music, Sun, ZoomIn, ZoomOut } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Divider, ghost, popup, Select, Slider, Tip } from '@/components/ui'
import { usePhone } from '@/hooks/usePhone'
import { type Clip, lengthLabel, type Media, type Placed, type Range, timecode } from '@/lib/model'
import { cssColor, setDark, useDark } from '@/lib/theme'
import { cn, MAC, MOD, plural } from '@/lib/utils'

const tools = 'flex min-w-0 items-center gap-1.5 pl-1 text-[11px]'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(s => ({ value: s, label: `${s}×` }))

export function TimelineFooter(props: {
  selected: Placed | null // when it's the only one
  count: number // clips selected
  onMerge: (() => void) | null // when they can be merged
  media: Record<string, Media>
  range: Range | null
  digits: 0 | 1 | 3
  empty: boolean
  onPatch: (c: Partial<Clip>) => void
  onCrop: (() => void) | null // a clip with a picture, while it isn't being cropped
  zoom: { pps: number; lo: number; hi: number; set: (pps: number) => void; fit: () => void; by: (f: number) => void }
}) {
  const { selected: sel, range, digits, zoom } = props
  const m = sel && props.media[sel.clip.mediaId]
  const phone = usePhone()
  const sep = !phone && <Divider />
  // the tools in the row, or on a phone behind ⋯, stacked
  const fold = (label: string, content: ReactNode) =>
    phone ? (
      <Popover.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
        <Popover.Trigger className={cn(ghost, 'size-6 shrink-0 justify-center p-0')} aria-label={label}>
          <Ellipsis size={14} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="z-20 outline-none" side="top" align="start" sideOffset={6}>
            <Popover.Popup className={cn(popup, 'flex flex-col items-start gap-1 p-1.5 text-[11px] *:px-2')}>
              {content}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    ) : (
      content
    )
  return (
    <>
      {props.count > 1 && !range ? (
        <div className={tools}>
          <span className="shrink-0 font-medium">{plural(props.count, { other: '# clips selected' })}</span>
          {props.onMerge ? (
            <>
              {sep}
              {fold(
                'Selection tools',
                <Tip label={`Join them into one clip (${MOD}J)`}>
                  {/* ctrl is ⌘ on a Mac */}
                  <button className={cn(ghost, 'h-6 px-2')} onClick={props.onMerge} aria-keyshortcuts="ctrl+j">
                    <Merge size={12} /> Merge clips
                  </button>
                </Tip>,
              )}
              {!phone && <span className="truncate text-[10px] text-muted">⌫ delete</span>}
            </>
          ) : (
            !phone && (
              <span className="truncate text-[10px] text-muted">
                ⌫ delete · to merge, select pieces of a split clip that sit side by side
              </span>
            )
          )}
        </div>
      ) : sel && m && !range ? (
        <div className={tools}>
          {m.image ? (
            <ImageIcon size={12} className="shrink-0 text-muted" />
          ) : m.hasVideo ? (
            <Film size={12} className="shrink-0 text-muted" />
          ) : (
            <Music size={12} className="shrink-0 text-muted" />
          )}
          <span className="max-w-48 truncate font-medium" title={m.name}>
            {m.name}
          </span>
          {fold(
            'Clip tools',
            <>
              <span className="shrink-0 text-[10px] text-muted tabular-nums max-md:py-1">
                {timecode(sel.start, digits)} → {timecode(sel.end, digits)}
              </span>
              {props.onCrop && (
                <>
                  {sep}
                  <Tip label="Choose the part of the picture to keep">
                    <button className={cn(ghost, 'h-6 px-2')} onClick={props.onCrop}>
                      <Crop size={12} /> Crop
                    </button>
                  </Tip>
                </>
              )}
              {m.image && sel.clip.transform && (
                <>
                  {sep}
                  <Tip label="Reset position and size">
                    <button className={cn(ghost, 'h-6 px-2')} onClick={() => props.onPatch({ transform: undefined })}>
                      Reset
                    </button>
                  </Tip>
                </>
              )}
              {!m.image && ( // a picture looks the same at any speed
                <>
                  {sep}
                  <Select
                    label="Speed"
                    value={sel.clip.speed}
                    items={SPEEDS}
                    onChange={speed => props.onPatch({ speed })}
                  />
                </>
              )}
              {m.hasAudio && !sel.clip.muted && (
                <>
                  {sep}
                  <Slider
                    label="Volume"
                    value={sel.clip.volume}
                    onChange={volume => props.onPatch({ volume })}
                    format={{ style: 'percent' }}
                    width="w-20"
                  />
                </>
              )}
            </>,
          )}
        </div>
      ) : (
        <span className="truncate pl-1 text-[10px] text-muted">
          {range
            ? `Selection ${timecode(range.a, digits)} – ${timecode(range.b, digits)} (${lengthLabel(range.b - range.a, digits)}) · S split · ⌫ delete · right-click for more`
            : props.empty
              ? 'Add media to start editing'
              : `Drag the bar under the ruler to select · click the ruler to move the playhead · I / O mark the selection start / end · ⇧ or ${MAC ? '⌘' : 'Ctrl'}-click clips to select several`}
        </span>
      )}
      <div className="flex-1" />
      <Tip label="Zoom to fit">
        <button
          className={ghost}
          onClick={zoom.fit}
          disabled={props.empty}
          data-cuelume-tap=""
          data-cuelume-emphasis="subtle"
        >
          <Maximize2 size={13} />
        </button>
      </Tip>
      <Tip label="Zoom out">
        <button className={ghost} onClick={() => zoom.by(1 / 1.5)} disabled={props.empty}>
          <ZoomOut size={14} />
        </button>
      </Tip>
      <Slider
        label="Zoom"
        value={Math.log(zoom.pps)}
        min={Math.log(zoom.lo)}
        max={Math.log(zoom.hi)}
        step={0.01}
        onChange={v => zoom.set(Math.exp(v))}
        disabled={props.empty}
        width="max-md:w-14" // room for the clip's name on a phone
      />
      <Tip label="Zoom in">
        <button className={ghost} onClick={() => zoom.by(1.5)} disabled={props.empty}>
          <ZoomIn size={14} />
        </button>
      </Tip>
      <Divider />
      <ThemeToggle />
    </>
  )
}

// Light or dark, for the whole app. The browser's own bar (theme-color) follows the header's color.
function ThemeToggle() {
  const dark = useDark()
  useEffect(
    () => document.querySelector('meta[name=theme-color]')?.setAttribute('content', cssColor('--color-chrome')),
    [dark],
  )
  return (
    <Tip label={dark ? 'Light mode' : 'Dark mode'}>
      <button
        className={cn(ghost, 'size-6 justify-center p-0')}
        onClick={() => (play('toggle', { direction: dark ? 'back' : 'forward', emphasis: 'subtle' }), setDark(!dark))}
        aria-label={dark ? 'Light mode' : 'Dark mode'}
      >
        {dark ? <Sun size={12} /> : <Moon size={12} />}
      </button>
    </Tip>
  )
}
