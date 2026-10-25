// The − + row under a group of tracks: − removes the last added track of the kind, + adds one.
import { play } from 'cuelume'
import { Minus, Plus } from 'lucide-react'
import type { LaneKind } from '@/lib/model'
import { Tip } from '@/components/ui'

const btn = 'grid size-5 place-items-center rounded-sm text-muted hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-40'

export function TrackControls(props: { kind: LaneKind; removable: string | null; onRemove: () => void; onAdd: () => void }) {
  const noun = props.kind === 'overlay' ? 'video' : 'audio'
  return (
    <div className="flex h-full items-center justify-end gap-0.5 px-1.5">
      <Tip label={props.removable ? `Remove ${props.removable}` : `No added ${noun} track to remove`}>
        <button className={btn} disabled={!props.removable} onClick={props.onRemove} aria-label={`Remove ${noun} track`}>
          <Minus size={13} />
        </button>
      </Tip>
      <Tip label={`Add ${noun} track`}>
        <button
          className={btn}
          onClick={() => {
            play('open', { emphasis: 'subtle' })
            props.onAdd()
          }}
          aria-label={`Add ${noun} track`}
        >
          <Plus size={13} />
        </button>
      </Tip>
    </div>
  )
}
