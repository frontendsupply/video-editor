// The Select bar under the ruler: drag here to select a range (the timeline's scrub handles that, as on an empty lane).
// The range shows as a block with its times; drag its edges or middle to adjust it, and its tools sit right after it.
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Menu } from '@base-ui/react/menu'
import { play } from 'cuelume'
import { ArrowLeftRight, Crop, Download, Trash2 } from 'lucide-react'
import { lengthLabel, timecode, type ExportPreset, type Media, type Project, type Range } from '@/lib/model'
import { cn } from '@/lib/utils'
import { popup, Tip } from '@/components/ui'
import { ExportItems } from '@/components/export/ExportItems'
import { mini } from './styles'

export function RangeBar(props: {
  range: Range | null
  pps: number
  digits: 0 | 1 | 3
  tools: boolean // not while it's being dragged
  onDrag: (e: ReactPointerEvent, part: 'a' | 'b' | 'both') => void
  onDelete: () => void
  onCrop: () => void
  project: Project
  media: Record<string, Media>
  onExport: (preset: ExportPreset, region: Range) => void
  onFps: (fps: number) => void
}) {
  const { range, pps, digits } = props
  return (
    <div
      className={cn(
        'group/bar relative h-full cursor-col-resize rounded-xs border border-dashed transition-colors',
        range ? 'border-transparent bg-ink/3' : 'border-ink/15 bg-ink/2 hover:border-ink/35 hover:bg-ink/5',
      )}
    >
      {!range && (
        <span className="pointer-events-none sticky left-2 inline-flex h-full items-center gap-1.5 pl-2 text-[11px] whitespace-nowrap text-muted transition-colors group-hover/bar:text-ink/70">
          <ArrowLeftRight size={12} /> Drag here to select a range
        </span>
      )}
      {range && (
        <div
          onPointerDown={e => props.onDrag(e, 'both')}
          className="absolute inset-y-0 z-16 flex cursor-grab items-center justify-center overflow-hidden rounded-xs bg-accent px-2.5 text-[10px] font-semibold text-white tabular-nums active:cursor-grabbing"
          style={{ left: range.a * pps, width: Math.max(2, (range.b - range.a) * pps) }}
        >
          <span className="pointer-events-none truncate">
            {timecode(range.a, digits)} – {timecode(range.b, digits)} · {lengthLabel(range.b - range.a, digits)}
          </span>
          {(['a', 'b'] as const).map(edge => (
            <span
              key={edge}
              onPointerDown={e => props.onDrag(e, edge)}
              className={cn('absolute inset-y-0 grid w-2 cursor-ew-resize place-items-center hover:bg-white/15', edge === 'a' ? 'left-0' : 'right-0')}
            >
              <span className="h-3 w-0.5 rounded-xs bg-white/70" />
            </span>
          ))}
        </div>
      )}
      {range && props.tools && (
        <div
          onPointerDown={e => e.stopPropagation()}
          className="absolute inset-y-0 z-25 ml-1 flex items-center gap-px rounded-sm bg-surface px-px ring-1 ring-line"
          style={{ left: range.b * pps }}
        >
          <Tip label="Delete selected region (⌫)">
            <button className={cn(mini, 'hover:text-playhead')} onClick={props.onDelete} aria-label="Delete selected region">
              <Trash2 size={12} />
            </button>
          </Tip>
          <Tip label="Crop to selected region">
            <button className={mini} onClick={props.onCrop} aria-label="Crop to selected region">
              <Crop size={12} />
            </button>
          </Tip>
          <Menu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
            <Tip label="Export selected region">
              <Menu.Trigger className={cn(mini, 'data-popup-open:bg-ink/5')} aria-label="Export selected region">
                <Download size={12} />
              </Menu.Trigger>
            </Tip>
            <Menu.Portal>
              <Menu.Positioner className="z-20 outline-none" sideOffset={6}>
                <Menu.Popup className={cn(popup, 'w-60')}>
                  <ExportItems project={props.project} media={props.media} onPick={preset => props.onExport(preset, range)} onFps={props.onFps} />
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      )}
    </div>
  )
}
