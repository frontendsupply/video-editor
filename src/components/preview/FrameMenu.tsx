// The output frame, on the preview's header: aspect ratio and what happens when a clip doesn't match it.
import { Menu } from '@base-ui/react/menu'
import { play } from 'cuelume'
import {
  Check,
  ChevronDown,
  Film,
  type LucideIcon,
  RectangleHorizontal,
  RectangleVertical,
  Smartphone,
  Square,
} from 'lucide-react'
import { groupLabel, menuItem, menuSeparator, popup } from '@/components/ui'
import { type Aspect, type Fit, type Media, outputSize, type Project } from '@/lib/model'
import { cn } from '@/lib/utils'

const FRAMES: { value: Aspect; label: string; Icon: LucideIcon }[] = [
  { value: 'original', label: 'Original', Icon: Film }, // follows the first clip
  { value: '16:9', label: '16:9 Landscape', Icon: RectangleHorizontal },
  { value: '9:16', label: '9:16 Portrait', Icon: Smartphone },
  { value: '1:1', label: '1:1 Square', Icon: Square },
  { value: '4:5', label: '4:5 Vertical', Icon: RectangleVertical },
]
const FITS: { value: Fit; label: string; hint: string }[] = [
  { value: 'contain', label: 'Fit', hint: 'Show all, with bars' },
  { value: 'cover', label: 'Fill', hint: 'Crop to the frame' },
]

// The output frame: a label with its icon, aspect, fit and size, opening the aspect ratios (with their icons and sizes)
// and what happens when a clip doesn't match. The menu stays open, so the preview updates behind it.
export function FrameMenu(props: {
  project: Project
  media: Record<string, Media>
  onChange: (patch: { aspect?: Aspect; fit?: Fit }) => void
}) {
  const { project, media } = props
  const [W, H] = outputSize(project, media)
  const Current = FRAMES.find(f => f.value === project.aspect)!.Icon
  const item = cn(menuItem, 'grid grid-cols-[12px_16px_1fr_auto] justify-normal gap-2 py-1.5')
  return (
    <Menu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
      <Menu.Trigger className="flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-ink/65 tabular-nums transition-colors hover:bg-ink/5 hover:text-ink data-popup-open:bg-ink/5 data-popup-open:text-ink">
        <Current size={14} className="opacity-70" />
        {project.aspect === 'original' ? 'Original' : project.aspect} · {project.fit === 'contain' ? 'Fit' : 'Fill'} ·{' '}
        {W}×{H}
        <ChevronDown size={12} className="opacity-60" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-20 outline-none" sideOffset={6} align="end">
          <Menu.Popup className={cn(popup, 'w-64')}>
            <Menu.RadioGroup
              value={project.aspect}
              onValueChange={aspect => {
                play('select', { emphasis: 'subtle' })
                props.onChange({ aspect: aspect as Aspect })
              }}
              aria-label="Frame"
            >
              <div className={groupLabel}>Frame</div>
              {FRAMES.map(f => {
                const [w, h] = outputSize({ ...project, aspect: f.value }, media)
                return (
                  <Menu.RadioItem key={f.value} value={f.value} className={item}>
                    <Menu.RadioItemIndicator>
                      <Check size={12} />
                    </Menu.RadioItemIndicator>
                    <f.Icon size={14} className="col-start-2 text-ink/55" />
                    <span>{f.label}</span>
                    <span className="text-[10px] opacity-55 tabular-nums">
                      {w}×{h}
                    </span>
                  </Menu.RadioItem>
                )
              })}
            </Menu.RadioGroup>
            <Menu.Separator className={menuSeparator} />
            <Menu.RadioGroup
              value={project.fit}
              onValueChange={fit => {
                play('select', { emphasis: 'subtle' })
                props.onChange({ fit: fit as Fit })
              }}
              aria-label="When a clip doesn't match the frame"
            >
              <div className={groupLabel}>When a clip doesn't match</div>
              {FITS.map(f => (
                <Menu.RadioItem key={f.value} value={f.value} className={item}>
                  <Menu.RadioItemIndicator>
                    <Check size={12} />
                  </Menu.RadioItemIndicator>
                  <span className="col-span-2 col-start-2">{f.label}</span>
                  <span className="text-[10px] opacity-55">{f.hint}</span>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
