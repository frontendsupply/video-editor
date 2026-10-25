// Styled UI primitives, shared class strings, and UI sounds.
import { useId, type ReactElement } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Slider as BaseSlider } from '@base-ui/react/slider'
import { Toast } from '@base-ui/react/toast'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { Tooltip } from '@base-ui/react/tooltip'
import { play } from 'cuelume'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { motion } from 'motion/react'
import { EXPORT_PRESETS, exportSize, outputSize, type ExportPreset, type Media, type Project } from './model'

export const card = 'rounded-lg bg-white ring-1 ring-ink/8'
export const pill =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-ink/6 text-[11px] font-medium text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink disabled:opacity-40 disabled:pointer-events-none'
export const ghost =
  'inline-flex items-center gap-1.5 h-7.5 px-2.5 rounded-md text-[11px] text-ink/55 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35 disabled:pointer-events-none'
// Ribbon button: icon over a small label.
export const ribbon =
  'flex h-11 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[10px] text-ink/65 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35 disabled:pointer-events-none'
export const popup =
  'origin-(--transform-origin) rounded-lg bg-white p-1 ring-1 ring-ink/10 outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'
// Centered dialog (AlertDialog) over a dimmed, lightly blurred page.
export const dialogBackdrop =
  'fixed inset-0 bg-ink/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0'
export const dialogPopup = `${card} fixed top-1/2 left-1/2 grid w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 p-5 outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0`
export const menuItem =
  'flex cursor-default items-center justify-between gap-4 rounded-sm px-2.5 py-1.5 outline-none select-none data-disabled:opacity-40 data-highlighted:bg-ink/6'
const label = 'text-[11px] font-medium text-ink/50'
const spring = { type: 'spring', bounce: 0.15, duration: 0.35 } as const

export function Select<T>(props: {
  label: string
  value: T
  items: { value: T; label: string }[]
  onChange: (value: T) => void
  compact?: boolean // inline "30 FPS" trigger for the header bar
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
      <div className={props.compact ? 'flex items-center' : 'flex flex-col gap-1.5'}>
        <BaseSelect.Label className={props.compact ? 'sr-only' : label}>{props.label}</BaseSelect.Label>
        <BaseSelect.Trigger
          className={
            props.compact
              ? 'flex h-8 items-center gap-1.5 rounded-md px-3 text-[10px] font-bold tracking-wide text-ink/55 uppercase hover:bg-ink/5 hover:text-ink data-popup-open:bg-ink/5 data-popup-open:text-ink'
              : 'flex h-8 items-center justify-between gap-2 rounded-md bg-ink/6 px-3 font-medium hover:bg-ink/10 data-popup-open:bg-ink/10'
          }
        >
          <BaseSelect.Value />
          {props.compact && <span>{props.label}</span>}
          <BaseSelect.Icon className="opacity-50">
            <ChevronsUpDown size={12} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-20 outline-none" sideOffset={6}>
          <BaseSelect.Popup className="min-w-(--anchor-width) origin-(--transform-origin) rounded-lg bg-white p-1 ring-1 ring-ink/10 outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-[side=none]:transition-none data-[side=none]:data-starting-style:scale-100 data-[side=none]:data-starting-style:opacity-100">
            <BaseSelect.List className="max-h-(--available-height) overflow-y-auto">
              {props.items.map(it => (
                <BaseSelect.Item
                  key={String(it.value)}
                  value={it.value}
                  className="grid cursor-default grid-cols-[14px_1fr] items-center gap-1.5 rounded-sm py-1.5 pr-3 pl-2 outline-none select-none data-highlighted:bg-ink/6"
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

// Segmented control; the white active pill slides between options.
export function Segmented<T extends string>(props: {
  label: string
  value: T
  items: { value: T; label: string; tip?: string }[]
  onChange: (value: T) => void
}) {
  const pillId = useId()
  return (
    <ToggleGroup
      aria-label={props.label}
      value={[props.value]}
      onValueChange={([v]) => v && props.onChange(v as T)}
      className="flex rounded-md bg-ink/5 p-0.5"
    >
      {props.items.map(it => {
        const toggle = (
          <Toggle
            key={it.value}
            value={it.value}
            data-cuelume-select=""
            className="relative h-7 rounded-sm px-3 text-[10px] font-bold tracking-wide text-ink/45 uppercase hover:text-ink/80 data-pressed:text-ink"
          >
            {it.value === props.value && (
              <motion.span
                layoutId={pillId}
                transition={spring}
                className="absolute inset-0 rounded-sm bg-white ring-1 ring-ink/10"
              />
            )}
            <span className="relative">{it.label}</span>
          </Toggle>
        )
        return it.tip ? <Tip key={it.value} label={it.tip}>{toggle}</Tip> : toggle
      })}
    </ToggleGroup>
  )
}

export function Slider(props: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  format?: Intl.NumberFormatOptions // shows the formatted value next to the label
  inline?: boolean
  disabled?: boolean
}) {
  return (
    <BaseSlider.Root
      disabled={props.disabled}
      className={`${props.inline ? 'flex items-center gap-2' : 'grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2'} data-disabled:opacity-40`}
      value={props.value}
      onValueChange={v => props.onChange(v as number)}
      onValueCommitted={() => !props.inline && play('select', { emphasis: 'subtle' })}
      min={props.min ?? 0}
      max={props.max ?? 1}
      step={props.step ?? 0.01}
      format={props.format}
    >
      <BaseSlider.Label className={label}>{props.label}</BaseSlider.Label>
      {props.format && <BaseSlider.Value className="text-[11px] text-ink/70 tabular-nums" />}
      <BaseSlider.Control className={`flex h-4 touch-none items-center select-none ${props.inline ? 'w-28' : 'col-span-2'}`}>
        <BaseSlider.Track className="relative h-1 w-full rounded-xs bg-ink/10">
          <BaseSlider.Indicator className="rounded-xs bg-accent" />
          <BaseSlider.Thumb className="h-4 w-2.5 rounded-xs bg-white ring-1 ring-ink/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}

// Export quality choices with their output size, for the header Export menu and the selection's Export.
export function ExportItems({ project, media, onPick }: { project: Project; media: Record<string, Media>; onPick: (preset: ExportPreset) => void }) {
  const [W, H] = outputSize(project, media)
  return (
    <Menu.Group>
      <Menu.GroupLabel className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wide text-ink/40 uppercase">Export quality</Menu.GroupLabel>
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
  )
}

export function Tip({ label: text, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8} className="z-30">
          <Tooltip.Popup className="origin-(--transform-origin) rounded-md bg-white px-2 py-1 text-[11px] font-medium text-ink ring-1 ring-ink/10 transition-[opacity,scale] duration-100 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0">
            {text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export const Divider = ({ tall }: { tall?: boolean }) => <div className={`mx-1 w-px shrink-0 bg-ink/10 ${tall ? 'h-7' : 'h-4'}`} />

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
              <Toast.Close aria-label="Dismiss" className="grid size-6 shrink-0 place-items-center rounded-sm text-ink/40 hover:bg-ink/5 hover:text-ink">
                <X size={13} />
              </Toast.Close>
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
