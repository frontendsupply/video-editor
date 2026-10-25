// One file in the bin: its thumbnail and length, a checkbox for whether it's on the timeline, quick add buttons, and
// a right-click menu. Drag it onto any lane; double-click to open it in Clip Preview (not a picture: it has no length).
import { ContextMenu } from '@base-ui/react/context-menu'
import { play } from 'cuelume'
import { Check, Film, MonitorPlay, Music, Trash2 } from 'lucide-react'
import { binLength, clock, type Media } from '@/lib/model'
import { cn } from '@/lib/utils'
import { menuItem, popup, Tip } from '@/components/ui'
import { MEDIA_MIME } from '@/components/timeline/constants'

const quick = 'grid size-5 place-items-center rounded-xs bg-surface text-ink/70 ring-1 ring-line hover:text-ink'

export function MediaCard(props: {
  media: Media
  used: boolean // has clips on the timeline
  parked: boolean // unchecked, with its clips set aside
  onToggle: () => void
  onOpen: () => void
  onRemove: () => void
  onAppendVideo: () => void
  onAddAudio: () => void
}) {
  const { media: m, used, parked } = props
  const reading = m.hasAudio && (m.peaksDone ?? 0) < 1
  return (
    <ContextMenu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
      {/* a native draggable, so the animated wrapper's drag props stay off */}
      <ContextMenu.Trigger
        draggable
        onDoubleClick={m.image ? undefined : props.onOpen}
        onDragStart={e => {
          e.dataTransfer.setData(MEDIA_MIME, m.id)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="relative aspect-video overflow-hidden rounded-sm bg-ink/5 ring-1 ring-line">
          {m.thumb ? (
            <img src={m.thumb} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center bg-emerald-50 text-emerald-700"><Music size={16} /></div>
          )}
          {/* on the timeline or not: uncheck to set its clips aside, check to put them back (or add it) */}
          <Tip label={used ? 'On the timeline · uncheck to set its clips aside' : parked ? 'Set aside · check to put its clips back' : 'Not on the timeline · check to add it'}>
            <button
              onClick={props.onToggle}
              aria-pressed={used}
              aria-label="On the timeline"
              className={cn(
                'absolute top-1 left-1 grid size-4 place-items-center rounded-xs transition-[opacity,color]',
                used ? 'bg-accent text-white' : 'bg-white/90 text-transparent ring-1 ring-ink/25 hover:text-muted',
                !used && !parked && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )}
            >
              <Check size={10} strokeWidth={3} />
            </button>
          </Tip>
          {!m.image && <span className="absolute right-1 bottom-1 rounded-xs bg-white/90 px-1 text-[9px] font-medium tabular-nums">{clock(binLength(m))}</span>}
          <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {m.hasVideo && (
              <Tip label="Append to the video track">
                <button data-cuelume-tap="" className={quick} onClick={props.onAppendVideo}><Film size={10} /></button>
              </Tip>
            )}
            {m.hasAudio && (
              <Tip label="Add audio at the playhead">
                <button data-cuelume-tap="" className={quick} onClick={props.onAddAudio}><Music size={10} /></button>
              </Tip>
            )}
          </div>
          {/* the waveform being read: a thin bar along the bottom, so the card never changes size */}
          {reading && (
            <Tip label={`Reading audio · ${Math.floor((m.peaksDone ?? 0) * 100)}%`}>
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink/10">
                <span className="block h-full bg-emerald-600 transition-[width] duration-200" style={{ width: `${(m.peaksDone ?? 0) * 100}%` }} />
              </span>
            </Tip>
          )}
        </div>
        <div className="mt-1 truncate text-[11px]" title={m.name}>{m.name}</div>
        {m.hasVideo && <div className="text-[10px] text-muted tabular-nums">{m.width}×{m.height}</div>}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-20 outline-none">
          <ContextMenu.Popup className={cn(popup, 'w-48')}>
            {!m.image && (
              <ContextMenu.Item className={menuItem} onClick={props.onOpen}>
                <span className="flex items-center gap-2"><MonitorPlay size={13} /> Open in Clip Preview</span>
              </ContextMenu.Item>
            )}
            <ContextMenu.Item className={menuItem} onClick={props.onRemove}>
              <span className="flex items-center gap-2"><Trash2 size={13} /> Remove file</span>
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
