// Class recipes shared by the controls. Combine them with cn(), so a class added after a recipe wins over its own.
import { cn } from '@/lib/utils'

export const card = 'bg-surface ring-1 ring-line' // dialogs and toasts
export const pill =
  'inline-flex h-8 items-center gap-1.5 rounded-md bg-ink/6 px-3 text-[11px] font-medium text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink disabled:pointer-events-none disabled:opacity-40'
export const ghost =
  'inline-flex h-7.5 items-center gap-1.5 rounded-md px-2.5 text-[11px] text-ink/55 transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-40'
// Header-sized controls: one slim row, small text and icons.
export const headerBtn =
  'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-40'
export const headerIcon =
  'grid size-6 place-items-center rounded-md text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-40'
// The one action that matters most where it sits (Export, Add to timeline, Reconnect files).
export const primaryBtn = cn(headerBtn, 'bg-surface font-semibold text-ink ring-1 ring-line')
// The confirming button of a dialog that removes something.
export const dangerBtn =
  'inline-flex h-8 items-center rounded-md bg-playhead/10 px-3 text-[11px] font-semibold text-playhead hover:bg-playhead/15'
export const popup =
  'origin-(--transform-origin) rounded-lg bg-surface p-1 ring-1 ring-line outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'
export const menuItem =
  'flex cursor-default items-center justify-between gap-4 rounded-sm px-2.5 py-1.5 outline-none select-none data-disabled:opacity-40 data-highlighted:bg-ink/6'
export const menuSeparator = 'mx-1 my-1 h-px bg-ink/6'
export const groupLabel = 'px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wide text-muted uppercase'
export const fieldLabel = 'text-[11px] text-muted'
export const kbd = 'font-sans text-[10px] text-muted'
// Centered dialog (AlertDialog) over a dimmed, lightly blurred page.
export const dialogBackdrop =
  'fixed inset-0 bg-ink/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0'
export const dialogPopup = cn(
  card,
  'fixed top-1/2 left-1/2 grid w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 p-5 outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
)
