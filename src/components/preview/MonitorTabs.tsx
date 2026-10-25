// The preview panel's tabs: Sequence preview, and Clip Preview while a file is open in it (closable). The output
// frame menu sits on the right while the sequence shows.
import type { ReactNode } from 'react'
import { MonitorPlay, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui'

const tab = '-mb-px flex items-center border-r border-line px-3 font-medium text-muted hover:text-ink'
const active = 'bg-surface text-ink'

export function MonitorTabs(props: {
  showing: 'sequence' | 'clip'
  clip: string | null // the name of the file open in Clip Preview
  onShow: (which: 'sequence' | 'clip') => void
  onCloseClip: () => void
  frameMenu: ReactNode
}) {
  return (
    <div className="flex h-8 shrink-0 items-stretch border-b border-line bg-canvas text-[11px]">
      <button onClick={() => props.onShow('sequence')} className={cn(tab, props.showing === 'sequence' && active)}>
        Sequence preview
      </button>
      {props.clip && (
        <div className={cn(tab, 'gap-1 pr-1', props.showing === 'clip' && active)}>
          <button onClick={() => props.onShow('clip')} className="flex min-w-0 items-center gap-1.5">
            <MonitorPlay size={12} className="shrink-0" />
            <span className="max-w-48 truncate">{props.clip}</span>
          </button>
          <Tip label="Close Clip Preview">
            <button onClick={props.onCloseClip} aria-label="Close Clip Preview" className="grid size-4 place-items-center text-muted hover:bg-ink/10 hover:text-ink">
              <X size={11} />
            </button>
          </Tip>
        </div>
      )}
      <div className="flex-1" />
      {props.showing === 'sequence' && <div className="flex items-center px-3">{props.frameMenu}</div>}
    </div>
  )
}
