// The playhead: a red line with its time in the ruler and a split button at its foot (kept in view when the tracks are
// taller than the timeline). The player moves it through the DOM (`ref`, `labelRef`), so playing never re-renders.
import type { Ref } from 'react'
import { play } from 'cuelume'
import { ArrowLeftFromLine, ArrowRightFromLine, Scissors } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui'
import { floating, mini } from './styles'

export function Playhead(props: {
  ref: Ref<HTMLDivElement>
  labelRef: Ref<HTMLSpanElement>
  hidden: boolean // nothing on the timeline yet
  marking: boolean // a click just placed it: offer to mark the selection's start or end here
  onMark: (edge: 'in' | 'out') => void
  onSplit: () => void
}) {
  return (
    <div
      ref={props.ref}
      className={cn('pointer-events-none absolute top-0 bottom-0 left-0 z-20 -ml-px flex w-0.5 flex-col justify-end bg-playhead', props.hidden && 'hidden')}
    >
      <span
        ref={props.labelRef}
        style={{ transform: 'translateX(var(--nudge, 0px))' }}
        className="absolute top-1 left-1/2 -translate-x-1/2 rounded-sm bg-surface px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-playhead tabular-nums ring-1 ring-playhead/25"
      >
        0:00:00.0
      </span>
      {props.marking && (
        <div onPointerDown={e => e.stopPropagation()} style={{ transform: 'translateX(var(--nudge, 0px))' }} className={cn(floating, 'left-1/2 ml-9')}>
          {(['in', 'out'] as const).map(edge => (
            <Tip key={edge} label={edge === 'in' ? 'Mark selection start here (I)' : 'Mark selection end here (O)'}>
              <button
                className={mini}
                onClick={() => {
                  play('select', { emphasis: 'subtle' })
                  props.onMark(edge)
                }}
                aria-label={edge === 'in' ? 'Mark selection start' : 'Mark selection end'}
              >
                {edge === 'in' ? <ArrowRightFromLine size={12} /> : <ArrowLeftFromLine size={12} />}
              </button>
            </Tip>
          ))}
        </div>
      )}
      {!props.hidden && (
        <Tip label="Split all tracks at playhead (S)">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={props.onSplit}
            aria-label="Split all tracks at playhead"
            className="pointer-events-auto sticky bottom-1 mb-1 ml-1 grid size-6 shrink-0 place-items-center self-start rounded-sm bg-surface text-ink/70 ring-1 ring-line hover:text-ink hover:ring-ink/30"
          >
            <Scissors size={12} />
          </button>
        </Tip>
      )}
    </div>
  )
}
