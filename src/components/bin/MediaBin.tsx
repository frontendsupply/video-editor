// The media bin: video, audio and image files in three square tabs, as cards. Files taken out stay hidden while no clip
// uses them.
import { Tabs } from '@base-ui/react/tabs'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { Media } from '@/lib/model'
import { MediaCard } from './MediaCard'

type Kind = 'video' | 'audio' | 'image'
const KINDS = ['video', 'audio', 'image'] as const
const kindOf = (m: Media): Kind => (m.image ? 'image' : m.hasVideo ? 'video' : 'audio')

export function MediaBin(props: {
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
  const files = (kind: Kind) => Object.values(props.media).filter(m => kindOf(m) === kind && (!m.removed || props.used.has(m.id)))
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-line bg-canvas">
      <Tabs.Root value={tab} onValueChange={v => setTab(v as Kind)} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="flex h-8 border-b border-line bg-chrome">
          {KINDS.map(kind => (
            <Tabs.Tab
              key={kind}
              value={kind}
              data-cuelume-select=""
              className="-mb-px flex items-center gap-1.5 border-r border-line px-3 text-[11px] font-medium text-muted outline-none hover:text-ink data-active:bg-canvas data-active:text-ink"
            >
              {kind[0].toUpperCase() + kind.slice(1)} files
              <span className="text-[10px] text-muted tabular-nums">{files(kind).length}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {KINDS.map(kind => (
          <Tabs.Panel key={kind} value={kind} className="min-h-0 flex-1 overflow-y-auto outline-none">
            <div className="grid grid-cols-2 content-start gap-2 p-2">
              <AnimatePresence initial={false}>
                {files(kind).map(m => (
                  <motion.div key={m.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group min-w-0">
                    <MediaCard
                      media={m}
                      used={props.used.has(m.id)}
                      parked={props.parked.has(m.id)}
                      onToggle={() => props.onToggle(m)}
                      onOpen={() => props.onOpen(m)}
                      onRemove={() => props.onRemove(m)}
                      onAppendVideo={() => props.onAppendVideo(m)}
                      onAddAudio={() => props.onAddAudio(m)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {!files(kind).length && <p className="px-3 py-2 text-[11px] text-muted">Drop {kind} files anywhere, or use Add media.</p>}
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </aside>
  )
}
