// What a clip looks like on its lane: video clips (thumbnails, their sound, the name) and audio clips (the waveform),
// and the trim handles on their edges.
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Music } from 'lucide-react'
import type { Media, Placed } from '@/lib/model'
import { cn } from '@/lib/utils'
import { Waveform } from './Waveform'

// A video clip: repeated thumbnail, its sound in a strip underneath (until unlinked), name.
export function ClipBody({ pl, media, width, view }: { pl: Placed; media: Media; width: number; view: [number, number] }) {
  return (
    <div className="relative flex h-full flex-col gap-0.5 overflow-hidden rounded-md bg-surface p-1 ring-1 ring-line group-data-selected:ring-2 group-data-selected:ring-accent">
      <div
        className="min-h-0 flex-1 rounded-xs bg-ink/5 bg-size-[auto_100%] bg-repeat-x"
        style={{ backgroundImage: media.thumb ? `url(${media.thumb})` : undefined }}
      />
      {media.hasAudio && !pl.clip.muted && (
        <div className={cn('relative h-3 shrink-0 overflow-hidden rounded-xs bg-audio-bg', reading(media) && 'wave-pending')}>
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

// Trim handles: light on hover, red on the selected clip.
export function Handle({ side, onPointerDown }: { side: 'l' | 'r'; onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        'absolute top-1/2 z-10 grid h-7 w-2.5 -translate-y-1/2 cursor-ew-resize place-items-center rounded-xs bg-surface opacity-0 ring-1 ring-line transition-opacity group-hover:opacity-100 group-data-selected:bg-accent group-data-selected:opacity-100 group-data-selected:ring-accent',
        side === 'l' ? 'left-0' : 'right-0',
      )}
    >
      <span className="h-3 w-px bg-ink/40 group-data-selected:bg-white" />
    </div>
  )
}

// An audio clip: waveform of its source range [in, out] and (on free lanes) its name.
export function AudioBody({ pl, media, width, view, label }: { pl: Placed; media: Media; width: number; view: [number, number]; label?: boolean }) {
  return (
    <div className={cn('relative h-full overflow-hidden rounded-md bg-audio-bg ring-1 ring-audio/15 group-data-selected:ring-2 group-data-selected:ring-accent', reading(media) && 'wave-pending')}>
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

const Label = ({ children }: { children: ReactNode }) => (
  <span className="pointer-events-none absolute top-1.5 left-2.5 flex max-w-[calc(100%-20px)] items-center gap-1 truncate rounded-sm bg-surface/85 px-1.5 py-px text-[10px] font-medium text-ink/80 backdrop-blur-sm">
    {children}
  </span>
)
