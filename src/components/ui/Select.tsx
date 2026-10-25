// A labelled dropdown that fits in a one-row toolbar: the label, then the value with a small chevron.
import { Select as BaseSelect } from '@base-ui/react/select'
import { play } from 'cuelume'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldLabel, popup } from './classes'

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
        <BaseSelect.Label className={fieldLabel}>{props.label}</BaseSelect.Label>
        <BaseSelect.Trigger className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors hover:bg-ink/5 data-popup-open:bg-ink/5">
          <BaseSelect.Value />
          <BaseSelect.Icon className="opacity-50">
            <ChevronsUpDown size={12} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-20 outline-none" sideOffset={6}>
          <BaseSelect.Popup
            className={cn(
              popup,
              'min-w-(--anchor-width) data-[side=none]:transition-none data-[side=none]:data-starting-style:scale-100 data-[side=none]:data-starting-style:opacity-100',
            )}
          >
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
