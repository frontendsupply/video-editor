// Under the sequence preview, in one row: the clock, the playback buttons, the edit's length, and Split ▾ (the main
// part splits every track, the menu picks what to split).
import type { Ref } from 'react'
import { Menu } from '@base-ui/react/menu'
import { play } from 'cuelume'
import { ChevronDown, ChevronLeft, ChevronRight, Pause, Play, Scissors, SkipBack, SkipForward } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { timecode, type SplitTarget } from '@/lib/model'
import { cn } from '@/lib/utils'
import { headerBtn, headerIcon, kbd, menuItem, menuSeparator, popup, Tip } from '@/components/ui'

export function Transport(props: {
  clockRef: Ref<HTMLSpanElement> // the player writes the time here
  hidden: boolean
  duration: number
  playing: boolean
  frame: number // seconds per frame
  hasRange: boolean
  onToggle: () => void
  onSeekBy: (seconds: number) => void
  onSeekTo: (where: 'start' | 'end') => void
  onSplit: (which: SplitTarget) => void
  split: { selected: string | null; video1: string; video: boolean; overlays: boolean | null; audio: boolean } // what there is to split
}) {
  const off = !props.duration
  const { split } = props
  return (
    <div className={cn('flex h-8 shrink-0 items-center gap-2 border-t border-line bg-canvas px-1.5', props.hidden && 'hidden')}>
      <span ref={props.clockRef} className="w-28 pl-1 text-[11px] font-semibold tabular-nums">0:00:00.000</span>
      <div className="flex flex-1 items-center justify-center gap-0.5">
        <Tip label="Go to start (Home)">
          <button className={headerIcon} onClick={() => props.onSeekTo('start')} disabled={off} data-cuelume-navigate="back"><SkipBack size={13} /></button>
        </Tip>
        <Tip label="Previous frame (←)">
          <button className={headerIcon} onClick={() => props.onSeekBy(-props.frame)} disabled={off}><ChevronLeft size={14} /></button>
        </Tip>
        <Tip label={props.playing ? 'Pause (Space)' : 'Play (Space)'}>
          <button className="grid size-6 place-items-center text-ink transition-colors hover:bg-ink/5 disabled:opacity-40" onClick={props.onToggle} disabled={off} aria-label={props.playing ? 'Pause' : 'Play'}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={props.playing ? 'pause' : 'play'}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {props.playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="translate-x-px" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </Tip>
        <Tip label="Next frame (→)">
          <button className={headerIcon} onClick={() => props.onSeekBy(props.frame)} disabled={off}><ChevronRight size={14} /></button>
        </Tip>
        <Tip label="Go to end (End)">
          <button className={headerIcon} onClick={() => props.onSeekTo('end')} disabled={off} data-cuelume-navigate=""><SkipForward size={13} /></button>
        </Tip>
      </div>
      <span className="w-28 text-right text-[11px] text-muted tabular-nums">{timecode(props.duration)}</span>
      <div className="flex items-center">
        <Tip label={props.hasRange ? 'Split all tracks at selection edges (S)' : 'Split all tracks at playhead (S)'}>
          <button className={headerBtn} onClick={() => props.onSplit('all')} disabled={off}><Scissors size={12} /> Split</button>
        </Tip>
        <Menu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
          <Menu.Trigger className={cn(headerIcon, 'data-popup-open:bg-ink/5')} disabled={off} aria-label="Split options">
            <ChevronDown size={12} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-20 outline-none" sideOffset={6} align="end">
              <Menu.Popup className={cn(popup, 'w-60')}>
                <Menu.Item className={menuItem} disabled={!split.selected} onClick={() => split.selected && props.onSplit(split.selected)}>Split selected clip</Menu.Item>
                <Menu.Item className={menuItem} onClick={() => props.onSplit('all')}>
                  Split all tracks <kbd className={kbd}>S</kbd>
                </Menu.Item>
                <Menu.Separator className={menuSeparator} />
                <Menu.Item className={menuItem} disabled={!split.video} onClick={() => props.onSplit('video')}>Split {split.video1}</Menu.Item>
                {split.overlays !== null && (
                  <Menu.Item className={menuItem} disabled={!split.overlays} onClick={() => props.onSplit('overlay')}>Split overlay video tracks</Menu.Item>
                )}
                <Menu.Item className={menuItem} disabled={!split.audio} onClick={() => props.onSplit('audio')}>Split audio tracks</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
  )
}
