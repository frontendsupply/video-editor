// A tooltip on any element: wraps it as the trigger.
import type { ReactElement } from 'react'
import { Tooltip } from '@base-ui/react/tooltip'

export function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8} className="z-30">
          <Tooltip.Popup className="origin-(--transform-origin) rounded-md bg-surface px-2 py-1 text-[11px] font-medium text-ink ring-1 ring-line transition-[opacity,scale] duration-100 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
