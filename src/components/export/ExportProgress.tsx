// The export's progress. Closing it (Cancel or Esc) cancels the export; finishing closes it from state.
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Progress } from '@base-ui/react/progress'
import { cn } from '@/lib/utils'
import { dialogBackdrop, dialogPopup, pill } from '@/components/ui'

export function ExportProgress({ progress, onCancel }: { progress: number | null; onCancel: () => void }) {
  return (
    <AlertDialog.Root open={progress !== null} onOpenChange={open => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogBackdrop} />
        <AlertDialog.Popup className={dialogPopup}>
          <div className="grid gap-1">
            <AlertDialog.Title className="text-sm font-semibold">Exporting video</AlertDialog.Title>
            <AlertDialog.Description className="text-[11px] text-muted">Rendering on this device. Nothing is uploaded.</AlertDialog.Description>
          </div>
          <Progress.Root className="grid grid-cols-[1fr_auto] gap-2" value={progress ?? 100}>
            <Progress.Label className="text-[11px] font-medium text-muted">Progress</Progress.Label>
            <Progress.Value className="text-[11px] font-semibold tabular-nums" />
            <Progress.Track className="col-span-2 h-1.5 overflow-hidden rounded-xs bg-ink/10">
              <Progress.Indicator className="block h-full rounded-xs bg-accent transition-[width] duration-150" />
            </Progress.Track>
          </Progress.Root>
          <AlertDialog.Close className={cn(pill, 'justify-self-end')}>Cancel</AlertDialog.Close>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
