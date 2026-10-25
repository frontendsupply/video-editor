// Notices at the bottom right: toast.add({ title, description, type }) from anywhere, shown by <Toasts />.
import { Toast } from '@base-ui/react/toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { card } from './classes'

export const toast = Toast.createToastManager()

export function Toasts() {
  const { toasts } = Toast.useToastManager()
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 w-85">
        {toasts.map(t => (
          <Toast.Root key={t.id} toast={t} className={cn('toast', card, 'select-none')}>
            <Toast.Content className="flex items-start gap-3 overflow-hidden p-3.5 transition-opacity duration-250 data-behind:opacity-0 data-expanded:opacity-100">
              <span className={cn('mt-1 size-2 shrink-0 rounded-xs', t.type === 'error' ? 'bg-playhead' : 'bg-emerald-500')} />
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
