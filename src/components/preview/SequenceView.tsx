// The sequence preview: the player's canvas with the picture handles (or, while a clip is being cropped, its crop box)
// over it, or in its place the restore panel (a saved project waiting for its files) or the empty state (drop or pick
// files).
import type { ComponentProps, RefObject } from 'react'
import { Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { Restore } from '@/hooks/useProjectStorage'
import { CropBox } from './CropBox'
import { PictureBox } from './PictureBox'
import { RestorePanel } from './RestorePanel'

export function SequenceView(props: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  pictures: Omit<ComponentProps<typeof PictureBox>, 'canvasRef'>
  cropping: Omit<ComponentProps<typeof CropBox>, 'canvasRef'> | null
  hidden: boolean // Clip Preview is showing instead (the canvas stays, the player keeps drawing into it)
  empty: boolean
  loaded: boolean // the saved project has been looked for: until then neither panel shows
  restore: Restore | null
  onPick: () => void
  onReconnect: () => void
  onStartFresh: () => void
}) {
  return (
    <div className={cn('relative min-h-0 flex-1', props.hidden && 'hidden')}>
      <div className="absolute inset-3 flex items-center justify-center">
        <canvas ref={props.canvasRef} className={cn('max-h-full max-w-full rounded-md ring-1 ring-line', props.empty && 'invisible')} />
        {props.cropping ? (
          <CropBox canvasRef={props.canvasRef} {...props.cropping} />
        ) : (
          <PictureBox canvasRef={props.canvasRef} {...props.pictures} />
        )}
      </div>
      <AnimatePresence>
        {props.restore ? (
          <motion.div
            key="restore"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-3 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-line px-6 text-center"
          >
            <RestorePanel restore={props.restore} onReconnect={props.onReconnect} onLocate={props.onPick} onFresh={props.onStartFresh} />
          </motion.div>
        ) : (
          props.loaded &&
          props.empty && (
            <motion.button
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              onClick={props.onPick}
              data-cuelume-open=""
              className="absolute inset-3 flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-line text-muted hover:border-ink/25"
            >
              <span className="grid size-12 place-items-center rounded-md bg-ink/6"><Upload size={18} /></span>
              <span className="text-sm font-semibold text-ink">Drop video, audio and image files here</span>
              <span className="text-[11px] text-muted">or click to add media · files never leave your device</span>
            </motion.button>
          )
        )}
      </AnimatePresence>
    </div>
  )
}
