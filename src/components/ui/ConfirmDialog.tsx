// "Remove …?" and the like: a title, what will happen, Cancel and a confirming button. Closing (Cancel, Esc or the
// backdrop) only reports open = false; the caller keeps its text until the dialog has animated out.

import { AlertDialog } from '@base-ui/react/alert-dialog'
import type { ReactNode } from 'react'
import { dangerBtn, dialogBackdrop, dialogPopup, pill } from './classes'

export function ConfirmDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirm: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogBackdrop} />
        <AlertDialog.Popup className={dialogPopup}>
          <div className="grid gap-1">
            <AlertDialog.Title className="truncate text-sm font-semibold">{props.title}</AlertDialog.Title>
            <AlertDialog.Description className="text-[11px] text-muted">{props.description}</AlertDialog.Description>
          </div>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close className={pill}>Cancel</AlertDialog.Close>
            <button className={dangerBtn} onClick={() => (props.onConfirm(), props.onOpenChange(false))}>
              {props.confirm}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
