// The export menu's contents, shared by the header's Export and the selected range's export.
import { Menu } from '@base-ui/react/menu'
import { play } from 'cuelume'
import { menuItem, menuSeparator } from '@/components/ui'
import {
  EXPORT_PRESETS,
  type ExportPreset,
  exportSize,
  FRAME_RATES,
  type Media,
  outputSize,
  type Project,
} from '@/lib/model'
import { cn } from '@/lib/utils'

// The export menu's contents, for the header Export and the selection's: the file name (focused, selected, ready to
// type over), frame rate in one row (stays open while you pick), then the sizes to export at, each with its output
// size (picking one exports).
export function ExportItems(props: {
  project: Project
  media: Record<string, Media>
  onPick: (preset: ExportPreset) => void
  onFps: (fps: number) => void
  name: string
  onName: (name: string) => void
}) {
  const { project, media, onPick } = props
  const [W, H] = outputSize(project, media)
  return (
    <>
      <label className="mx-1 mt-0.5 mb-1 flex h-6 items-center rounded-sm bg-canvas ring-1 ring-line ring-inset focus-within:ring-ink/35">
        <input
          autoFocus
          aria-label="File name"
          value={props.name}
          onChange={e => props.onName(e.target.value)}
          onFocus={e => e.target.select()}
          // typing is for the name, not the menu's jump-to-item; Esc and Tab still close it
          onKeyDown={e => e.key !== 'Escape' && e.key !== 'Tab' && e.stopPropagation()}
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent pl-2 text-[12px] outline-none"
        />
        <span className="pr-2 text-[11px] text-muted">.mp4</span>
      </label>
      <Menu.Separator className={menuSeparator} />
      <Menu.RadioGroup
        value={project.fps}
        onValueChange={fps => {
          play('select', { emphasis: 'subtle' })
          props.onFps(fps as number)
        }}
        aria-label="Frame rate"
        className="flex items-center justify-between gap-3 py-0.5 pr-1 pl-2.5"
      >
        <span className="text-muted">Frame rate</span>
        <div className="flex gap-px">
          {FRAME_RATES.map(fps => (
            <Menu.RadioItem
              key={fps}
              value={fps}
              className="h-5 cursor-default rounded-sm px-1.5 text-[11px] leading-5 text-muted tabular-nums outline-none select-none data-checked:bg-ink/6 data-checked:font-medium data-checked:text-ink data-highlighted:text-ink"
            >
              {fps}
            </Menu.RadioItem>
          ))}
        </div>
      </Menu.RadioGroup>
      <Menu.Separator className={menuSeparator} />
      {EXPORT_PRESETS.filter(x => !x.short || x.short < Math.min(W, H)).map(preset => {
        const [w, h] = exportSize(project, media, preset.short)
        return (
          <Menu.Item key={preset.label} onClick={() => onPick(preset)} className={cn(menuItem, 'py-1')}>
            {preset.label}
            <span className="text-[10px] text-muted tabular-nums">
              {w}×{h}
            </span>
          </Menu.Item>
        )
      })}
    </>
  )
}
