// Notices at the bottom right: toast.add({ title, description, type }) from anywhere, shown by <Toasts />. A toast with
// `data: { progress }` (0..1) shows a progress bar under its text, and `actionProps` a button (e.g. Cancel). A loading
// toast spins and can't be dismissed (no close button, swipe or Esc): it stays until its work is done or cancelled.
import { Progress } from '@base-ui/react/progress'
import { Toast } from '@base-ui/react/toast'
import { LoaderCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { card, headerBtn } from './classes'

export const toast = Toast.createToastManager()

export function Toasts() {
  const { toasts } = Toast.useToastManager()
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 w-85">
        {toasts.map(t => (
          <Toast.Root
            key={t.id}
            toast={t}
            swipeDirection={t.type === 'loading' ? [] : undefined}
            onKeyDown={e => t.type === 'loading' && e.key === 'Escape' && e.preventBaseUIHandler()}
            className={cn('toast', card, 'select-none')}
          >
            <Toast.Content className="flex items-start gap-3 overflow-hidden p-3.5 transition-opacity duration-250 data-behind:opacity-0 data-expanded:opacity-100">
              <span className="mt-0.5 grid size-3 shrink-0 place-items-center">
                {t.type === 'loading' ? (
                  <LoaderCircle size={12} className="animate-spin text-muted" />
                ) : (
                  <span className={cn('size-2 rounded-xs', t.type === 'error' ? 'bg-playhead' : 'bg-emerald-500')} />
                )}
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <Toast.Title className="text-xs font-semibold" />
                <Toast.Description className="text-[11px] wrap-break-word whitespace-pre-line text-muted" />
                {typeof t.data?.progress === 'number' && (
                  <Progress.Root
                    value={Math.round(t.data.progress * 100)}
                    aria-label="Progress"
                    className="mt-1.5 flex items-center gap-2"
                  >
                    <Progress.Track className="h-1 flex-1 overflow-hidden bg-ink/10">
                      <Progress.Indicator className="block h-full bg-accent transition-[width] duration-150" />
                    </Progress.Track>
                    <Progress.Value className="text-[10px] text-muted tabular-nums" />
                  </Progress.Root>
                )}
              </div>
              <Toast.Action className={cn(headerBtn, 'shrink-0')} />
              {t.type !== 'loading' && (
                <Toast.Close
                  aria-label="Dismiss notification"
                  className="grid size-6 shrink-0 place-items-center rounded-sm text-muted hover:bg-ink/5 hover:text-ink"
                >
                  <X size={13} />
                </Toast.Close>
              )}
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
