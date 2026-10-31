// The media bin: video, image and audio files in three square tabs, as cards, as many across as its width fits. Files
// taken out stay hidden while no clip uses them.
import { Tabs } from '@base-ui/react/tabs'
import { AnimatePresence, motion } from 'motion/react'
import { type CSSProperties, useState } from 'react'
import { usePhone } from '@/hooks/usePhone'
import type { Media } from '@/lib/model'
import { cn } from '@/lib/utils'
import { MediaCard } from './MediaCard'

type Kind = 'video' | 'audio' | 'image'
const KINDS = ['video', 'image', 'audio'] as const
const kindOf = (m: Media): Kind => (m.image ? 'image' : m.hasVideo ? 'video' : 'audio')

export function MediaBin(props: {
  width: number // set by dragging its right edge; a phone stacks the bin full width
  media: Record<string, Media>
  used: Set<string> // files with clips on the timeline
  parked: Set<string> // unchecked files with clips set aside
  onToggle: (m: Media) => void
  onOpen: (m: Media) => void
  onRemove: (m: Media) => void
  onAppendVideo: (m: Media) => void
  onAddAudio: (m: Media) => void
}) {
  const [tab, setTab] = useState<Kind>('video')
  const list = usePhone() // phones list the files, so the bin can stay short and leave room for the tracks
  const files = (kind: Kind) =>
    Object.values(props.media).filter(m => kindOf(m) === kind && (!m.removed || props.used.has(m.id)))
  return (
    <aside
      className="@container flex shrink-0 flex-col overflow-hidden bg-canvas max-md:h-28 md:w-(--bin-w)"
      style={{ '--bin-w': `${props.width}px` } as CSSProperties}
    >
      <Tabs.Root value={tab} onValueChange={v => setTab(v as Kind)} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="flex h-8 border-b border-line bg-chrome">
          {KINDS.map(kind => (
            <Tabs.Tab
              key={kind}
              value={kind}
              data-cuelume-select=""
              className="-mb-px flex items-center gap-1.5 border-r border-line px-3 text-[11px] font-medium whitespace-nowrap text-muted outline-none hover:text-ink data-active:bg-canvas data-active:text-ink"
            >
              <span>
                {kind[0].toUpperCase() + kind.slice(1)}
                <span className="@max-xs:hidden"> files</span>{' '}
                {/* narrower than its default, the bin keeps just the kind */}
              </span>
              <span className="text-[10px] text-muted tabular-nums">{files(kind).length}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {KINDS.map(kind => (
          <Tabs.Panel key={kind} value={kind} className="min-h-0 flex-1 overflow-y-auto outline-none">
            <div
              className={
                list ? 'flex flex-col' : 'grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] content-start gap-2 p-2'
              }
            >
              <AnimatePresence initial={false}>
                {files(kind).map(m => (
                  <motion.div
                    key={m.id}
                    layout="position"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn('group min-w-0', list && 'even:bg-ink/4')}
                  >
                    <MediaCard
                      media={m}
                      used={props.used.has(m.id)}
                      parked={props.parked.has(m.id)}
                      onToggle={() => props.onToggle(m)}
                      onOpen={() => props.onOpen(m)}
                      onRemove={() => props.onRemove(m)}
                      onAppendVideo={() => props.onAppendVideo(m)}
                      onAddAudio={() => props.onAddAudio(m)}
                      list={list}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {!files(kind).length && (
              <p className="px-3 py-2 text-[11px] text-muted">Drop {kind} files anywhere, or use Add media.</p>
            )}
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </aside>
  )
}
