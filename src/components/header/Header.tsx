// The header: one slim row of small controls. New project and Add media, undo, redo and delete, then Export.

import { Menu } from '@base-ui/react/menu'
import { play } from 'cuelume'
import { ChevronDown, FilePlus2, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { ExportItems } from '@/components/export/ExportItems'
import { Divider, headerBtn, headerIcon, popup, primaryBtn, Tip } from '@/components/ui'
import { cn, MOD } from '@/lib/utils'

const DELETING = { region: 'Delete selection', clip: 'Delete selected clip', clips: 'Delete selected clips' }

export function Header(props: {
  onNewProject: (() => void) | null // null when there's nothing to clear
  onAddMedia: () => void
  onUndo: (() => void) | null
  onRedo: (() => void) | null
  onDelete: (() => void) | null
  deleting: 'region' | 'clip' | 'clips'
  exporting: ComponentProps<typeof ExportItems> | null
}) {
  return (
    <header className="flex h-[calc(2rem+env(safe-area-inset-top))] shrink-0 items-center gap-0.5 border-b border-line bg-chrome px-1.5 pt-[env(safe-area-inset-top)]">
      <Tip label="New project">
        <button
          className={headerIcon}
          onClick={() => (play('open'), props.onNewProject?.())}
          disabled={!props.onNewProject}
          aria-label="New project"
        >
          <FilePlus2 size={13} />
        </button>
      </Tip>
      <button className={headerBtn} onClick={props.onAddMedia} data-cuelume-open="">
        <Plus size={13} />
        Add media
      </button>
      <Divider />
      <Tip label={`Undo (${MOD}Z)`}>
        <button className={headerIcon} onClick={() => props.onUndo?.()} disabled={!props.onUndo} aria-label="Undo">
          <Undo2 size={13} />
        </button>
      </Tip>
      <Tip label={`Redo (⇧${MOD}Z)`}>
        <button className={headerIcon} onClick={() => props.onRedo?.()} disabled={!props.onRedo} aria-label="Redo">
          <Redo2 size={13} />
        </button>
      </Tip>
      <Tip label={`${DELETING[props.deleting]} (⌫)`}>
        <button
          className={headerIcon}
          onClick={() => props.onDelete?.()}
          disabled={!props.onDelete}
          aria-label={DELETING[props.deleting]}
        >
          <Trash2 size={13} />
        </button>
      </Tip>
      <div className="flex-1" />
      <Menu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
        <Menu.Trigger disabled={!props.exporting} className={cn(primaryBtn, 'ml-1.5 data-popup-open:bg-ink/5')}>
          Export <ChevronDown size={12} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-20 outline-none" sideOffset={6} align="end">
            <Menu.Popup className={cn(popup, 'w-52')}>
              {props.exporting && <ExportItems {...props.exporting} />}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </header>
  )
}
