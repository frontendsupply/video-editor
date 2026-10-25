// The export menu's contents, shared by the header's Export and the selected range's export.
import { Menu } from '@base-ui/react/menu'
import { play } from 'cuelume'
import { EXPORT_PRESETS, FRAME_RATES, exportSize, outputSize, type ExportPreset, type Media, type Project } from '@/lib/model'
import { cn } from '@/lib/utils'
import { menuItem, menuSeparator } from '@/components/ui'

// The export menu's contents, for the header Export and the selection's: frame rate in one row (stays open while you
// pick), then the sizes to export at, each with its output size (picking one exports).
export function ExportItems(props: {
  project: Project
  media: Record<string, Media>
  onPick: (preset: ExportPreset) => void
  onFps: (fps: number) => void
}) {
  const { project, media, onPick } = props
  const [W, H] = outputSize(project, media)
  return (
    <>
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
            <span className="text-[10px] text-muted tabular-nums">{w}×{h}</span>
          </Menu.Item>
        )
      })}
    </>
  )
}
