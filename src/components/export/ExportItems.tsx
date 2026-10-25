// The export menu's contents, shared by the header's Export and the selected range's export.
import { Menu } from '@base-ui/react/menu'
import { play } from 'cuelume'
import { EXPORT_PRESETS, exportSize, outputSize, type ExportPreset, type Media, type Project } from '@/lib/model'
import { cn } from '@/lib/utils'
import { groupLabel, menuItem, menuSeparator } from '@/components/ui'

const FPS = [24, 25, 30, 60]

// The export menu's contents, for the header Export and the selection's: frame rate (stays open while you pick),
// then the quality choices with their output size (picking one exports).
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
      >
        <div className={groupLabel}>Frame rate</div>
        <div className="mx-1.5 mb-1.5 flex rounded-md bg-ink/5 p-0.5">
          {FPS.map(fps => (
            <Menu.RadioItem
              key={fps}
              value={fps}
              className="h-6 flex-1 cursor-default rounded-sm text-center text-[11px] leading-6 font-medium text-ink/55 tabular-nums outline-none select-none data-checked:bg-surface data-checked:text-ink data-checked:ring-1 data-checked:ring-line data-highlighted:text-ink"
            >
              {fps}
            </Menu.RadioItem>
          ))}
        </div>
      </Menu.RadioGroup>
      <Menu.Separator className={menuSeparator} />
      <Menu.Group>
        <Menu.GroupLabel className={groupLabel}>Export quality</Menu.GroupLabel>
        {EXPORT_PRESETS.filter(x => !x.short || x.short < Math.min(W, H)).map(preset => {
          const [w, h] = exportSize(project, media, preset.short)
          return (
            <Menu.Item key={preset.label} onClick={() => onPick(preset)} className={cn(menuItem, 'grid grid-cols-[1fr_auto] py-2')}>
              <span className="font-semibold">{preset.label}</span>
              <span className="text-[10px] opacity-55 tabular-nums">{w}×{h}</span>
              <span className="col-span-2 text-[11px] opacity-55">{preset.hint}</span>
            </Menu.Item>
          )
        })}
      </Menu.Group>
    </>
  )
}
