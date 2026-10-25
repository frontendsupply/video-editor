// Styled UI primitives, shared class strings, and UI sounds.
import type { ReactElement } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Slider as BaseSlider } from '@base-ui/react/slider'
import { Toast } from '@base-ui/react/toast'
import { Tooltip } from '@base-ui/react/tooltip'
import { play } from 'cuelume'
import { Check, ChevronDown, ChevronsUpDown, Film, RectangleHorizontal, RectangleVertical, Smartphone, Square, X, type LucideIcon } from 'lucide-react'
import { EXPORT_PRESETS, exportSize, outputSize, type Aspect, type ExportPreset, type Fit, type Media, type Project } from './model'

export const card = 'bg-surface ring-1 ring-line' // dialogs and toasts
export const pill =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-ink/6 text-[11px] font-medium text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink disabled:opacity-40 disabled:pointer-events-none'
export const ghost =
  'inline-flex items-center gap-1.5 h-7.5 px-2.5 rounded-md text-[11px] text-ink/55 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40 disabled:pointer-events-none'
// Header controls: one slim row, small text and icons.
export const headerBtn =
  'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40 disabled:pointer-events-none'
export const headerIcon =
  'grid size-6 place-items-center rounded-md text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40 disabled:pointer-events-none'
export const popup =
  'origin-(--transform-origin) rounded-lg bg-surface p-1 ring-1 ring-line outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'
// Centered dialog (AlertDialog) over a dimmed, lightly blurred page.
export const dialogBackdrop =
  'fixed inset-0 bg-ink/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0'
export const dialogPopup = `${card} fixed top-1/2 left-1/2 grid w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 p-5 outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0`
export const menuItem =
  'flex cursor-default items-center justify-between gap-4 rounded-sm px-2.5 py-1.5 outline-none select-none data-disabled:opacity-40 data-highlighted:bg-ink/6'
const label = 'text-[11px] text-muted'
const groupLabel = 'px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wide text-muted uppercase'
const FPS = [24, 25, 30, 60]

export function Select<T>(props: {
  label: string
  value: T
  items: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <BaseSelect.Root
      items={props.items}
      value={props.value}
      onOpenChange={open => open && play('open', { emphasis: 'subtle' })}
      onValueChange={v => {
        if (v === null) return
        play('select')
        props.onChange(v as T)
      }}
    >
      <div className="flex items-center gap-1.5">
        <BaseSelect.Label className={label}>{props.label}</BaseSelect.Label>
        <BaseSelect.Trigger className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors hover:bg-ink/5 data-popup-open:bg-ink/5">
          <BaseSelect.Value />
          <BaseSelect.Icon className="opacity-50">
            <ChevronsUpDown size={12} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-20 outline-none" sideOffset={6}>
          <BaseSelect.Popup className="min-w-(--anchor-width) origin-(--transform-origin) rounded-lg bg-surface p-1 ring-1 ring-line outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-[side=none]:transition-none data-[side=none]:data-starting-style:scale-100 data-[side=none]:data-starting-style:opacity-100">
            <BaseSelect.List className="max-h-(--available-height) overflow-y-auto">
              {props.items.map(it => (
                <BaseSelect.Item
                  key={String(it.value)}
                  value={it.value}
                  className="grid cursor-default grid-cols-[14px_1fr] items-center gap-1.5 rounded-sm py-1 pr-3 pl-2 text-[11px] outline-none select-none data-highlighted:bg-ink/6"
                >
                  <BaseSelect.ItemIndicator className="col-start-1">
                    <Check size={12} />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2">{it.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

export function Slider(props: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  format?: Intl.NumberFormatOptions // shows the formatted value after the track
  width?: string // the track's width class
  disabled?: boolean
}) {
  return (
    <BaseSlider.Root
      disabled={props.disabled}
      className="flex items-center gap-2 data-disabled:opacity-40"
      value={props.value}
      onValueChange={v => props.onChange(v as number)}
      onValueCommitted={() => play('select', { emphasis: 'subtle' })}
      min={props.min ?? 0}
      max={props.max ?? 1}
      step={props.step ?? 0.01}
      format={props.format}
    >
      <BaseSlider.Label className={label}>{props.label}</BaseSlider.Label>
      <BaseSlider.Control className={`flex h-4 touch-none items-center select-none ${props.width ?? 'w-28'}`}>
        <BaseSlider.Track className="relative h-0.5 w-full rounded-xs bg-ink/10">
          <BaseSlider.Indicator className="rounded-xs bg-ink/40" />
          <BaseSlider.Thumb className="size-3 rounded-xs bg-surface ring-1 ring-ink/25 transition-shadow hover:ring-ink/45 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink" />
        </BaseSlider.Track>
      </BaseSlider.Control>
      {props.format && <BaseSlider.Value className="w-8 text-[11px] text-ink/60 tabular-nums" />}
    </BaseSlider.Root>
  )
}

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
      <Menu.Separator className="mx-1 my-1 h-px bg-ink/6" />
      <Menu.Group>
        <Menu.GroupLabel className={groupLabel}>Export quality</Menu.GroupLabel>
        {EXPORT_PRESETS.filter(x => !x.short || x.short < Math.min(W, H)).map(preset => {
          const [w, h] = exportSize(project, media, preset.short)
          return (
            <Menu.Item key={preset.label} onClick={() => onPick(preset)} className={`${menuItem} grid grid-cols-[1fr_auto] py-2`}>
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
export function FrameMenu(props: { project: Project; media: Record<string, Media>; onChange: (patch: { aspect?: Aspect; fit?: Fit }) => void }) {
  const { project, media } = props
  const [W, H] = outputSize(project, media)
  const Current = FRAMES.find(f => f.value === project.aspect)!.Icon
  const item = `${menuItem} grid grid-cols-[12px_16px_1fr_auto] justify-normal gap-2 py-1.5`
  return (
    <Menu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
      <Menu.Trigger className="flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-ink/65 tabular-nums transition-colors hover:bg-ink/5 hover:text-ink data-popup-open:bg-ink/5 data-popup-open:text-ink">
        <Current size={14} className="opacity-70" />
        {project.aspect === 'original' ? 'Original' : project.aspect} · {project.fit === 'contain' ? 'Fit' : 'Fill'} · {W}×{H}
        <ChevronDown size={12} className="opacity-60" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-20 outline-none" sideOffset={6} align="end">
          <Menu.Popup className={`${popup} w-64`}>
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
                    <Menu.RadioItemIndicator><Check size={12} /></Menu.RadioItemIndicator>
                    <f.Icon size={14} className="col-start-2 text-ink/55" />
                    <span>{f.label}</span>
                    <span className="text-[10px] opacity-55 tabular-nums">{w}×{h}</span>
                  </Menu.RadioItem>
                )
              })}
            </Menu.RadioGroup>
            <Menu.Separator className="mx-1 my-1 h-px bg-ink/6" />
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
                  <Menu.RadioItemIndicator><Check size={12} /></Menu.RadioItemIndicator>
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

export function Tip({ label: text, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8} className="z-30">
          <Tooltip.Popup className="origin-(--transform-origin) rounded-md bg-surface px-2 py-1 text-[11px] font-medium text-ink ring-1 ring-line transition-[opacity,scale] duration-100 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0">
            {text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export const Divider = () => <div className="mx-1 h-4 w-px shrink-0 bg-ink/10" />

// Global toast queue: toast.add({ title, description, type }) from anywhere, rendered by <Toasts />.
export const toast = Toast.createToastManager()

export function Toasts() {
  const { toasts } = Toast.useToastManager()
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 w-85">
        {toasts.map(t => (
          <Toast.Root key={t.id} toast={t} className={`toast ${card} select-none`}>
            <Toast.Content className="flex items-start gap-3 overflow-hidden p-3.5 transition-opacity duration-250 data-behind:opacity-0 data-expanded:opacity-100">
              <span className={`mt-1 size-2 shrink-0 rounded-xs ${t.type === 'error' ? 'bg-playhead' : 'bg-emerald-500'}`} />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <Toast.Title className="text-xs font-semibold" />
                <Toast.Description className="text-[11px] wrap-break-word whitespace-pre-line text-ink/55" />
              </div>
              <Toast.Close aria-label="Dismiss" className="grid size-6 shrink-0 place-items-center rounded-sm text-muted hover:bg-ink/5 hover:text-ink">
                <X size={13} />
              </Toast.Close>
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
