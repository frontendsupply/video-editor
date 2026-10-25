// A labelled slider for a toolbar row: the label, a thin neutral track, and (with `format`) the value after it.
import { Slider as BaseSlider } from '@base-ui/react/slider'
import { play } from 'cuelume'
import { cn } from '@/lib/utils'
import { fieldLabel } from './classes'

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
      <BaseSlider.Label className={fieldLabel}>{props.label}</BaseSlider.Label>
      <BaseSlider.Control className={cn('flex h-4 w-28 touch-none items-center select-none', props.width)}>
        <BaseSlider.Track className="relative h-0.5 w-full rounded-xs bg-ink/10">
          <BaseSlider.Indicator className="rounded-xs bg-ink/40" />
          <BaseSlider.Thumb className="size-3 rounded-xs bg-surface ring-1 ring-ink/25 transition-shadow hover:ring-ink/45 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink" />
        </BaseSlider.Track>
      </BaseSlider.Control>
      {props.format && <BaseSlider.Value className="w-8 text-[11px] text-ink/60 tabular-nums" />}
    </BaseSlider.Root>
  )
}
