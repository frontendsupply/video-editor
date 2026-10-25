// The timeline's one right-click menu: inside the selected range it acts on the range, on a clip on that clip.
import { ContextMenu } from '@base-ui/react/context-menu'
import { ChevronRight, Crop, Download, FileAudio, Scissors, Trash2, Unlink } from 'lucide-react'
import type { Clip, ExportPreset, Media, Placed, Project, Range } from '@/lib/model'
import { cn } from '@/lib/utils'
import { kbd, menuItem, popup } from '@/components/ui'
import { ExportItems } from '@/components/export/ExportItems'

export function TimelineMenu(props: {
  target: Placed | 'range' | null
  range: Range | null
  project: Project
  media: Record<string, Media>
  onSplit: () => void
  onDeleteRange: () => void
  onCrop: () => void
  onExport: (preset: ExportPreset, region: Range) => void
  onFps: (fps: number) => void
  name: string
  onName: (name: string) => void
  onUnlink: (id: string) => void
  onSaveAudio: (clip: Clip) => void
  onDeleteClip: (id: string) => void
}) {
  const { target, range, project, media } = props
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner className="z-20 outline-none">
        <ContextMenu.Popup className={cn(popup, 'w-56')}>
          {target === 'range' && range ? (
            <>
              <ContextMenu.Item className={menuItem} onClick={props.onSplit}>
                <span className="flex items-center gap-2"><Scissors size={13} /> Split all tracks</span><kbd className={kbd}>S</kbd>
              </ContextMenu.Item>
              <ContextMenu.Item className={menuItem} onClick={props.onDeleteRange}>
                <span className="flex items-center gap-2"><Trash2 size={13} /> Delete selection</span><kbd className={kbd}>⌫</kbd>
              </ContextMenu.Item>
              <ContextMenu.Item className={menuItem} onClick={props.onCrop}>
                <span className="flex items-center gap-2"><Crop size={13} /> Crop to selection</span>
              </ContextMenu.Item>
              <ContextMenu.SubmenuRoot>
                <ContextMenu.SubmenuTrigger className={cn(menuItem, 'data-popup-open:bg-ink/6')}>
                  <span className="flex items-center gap-2"><Download size={13} /> Export selection</span>
                  <ChevronRight size={12} className="text-muted" />
                </ContextMenu.SubmenuTrigger>
                <ContextMenu.Portal>
                  <ContextMenu.Positioner className="z-20 outline-none" sideOffset={4}>
                    <ContextMenu.Popup className={cn(popup, 'w-52')}>
                      <ExportItems project={project} media={media} onPick={preset => props.onExport(preset, range)} onFps={props.onFps} name={props.name} onName={props.onName} />
                    </ContextMenu.Popup>
                  </ContextMenu.Positioner>
                </ContextMenu.Portal>
              </ContextMenu.SubmenuRoot>
            </>
          ) : target && target !== 'range' ? (
            <>
              <ContextMenu.Item
                className={menuItem}
                // only a video clip that still carries its sound can unlink it
                disabled={!media[target.clip.mediaId].hasAudio || !!target.clip.muted || project.audio.some(c => c.id === target.clip.id)}
                onClick={() => props.onUnlink(target.clip.id)}
              >
                <span className="flex items-center gap-2"><Unlink size={13} /> Unlink audio</span>
              </ContextMenu.Item>
              {/* a video's sound, unlinked onto an audio track */}
              {media[target.clip.mediaId].hasVideo && project.audio.some(c => c.id === target.clip.id) && (
                <ContextMenu.Item className={menuItem} onClick={() => props.onSaveAudio(target.clip)}>
                  <span className="flex items-center gap-2"><FileAudio size={13} /> Save audio clip as new file</span>
                </ContextMenu.Item>
              )}
              <ContextMenu.Item className={menuItem} onClick={() => props.onDeleteClip(target.clip.id)}>
                <span className="flex items-center gap-2"><Trash2 size={13} /> Delete clip</span><kbd className={kbd}>⌫</kbd>
              </ContextMenu.Item>
            </>
          ) : null}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  )
}
