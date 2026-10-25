// Shown over the whole window while files are dragged over it.
import { Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

export function FileDropOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-canvas/70 p-1.5 backdrop-blur-sm"
        >
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="grid size-full place-items-center rounded-lg border-2 border-dashed border-ink/25">
            <span className="flex items-center gap-2 text-sm font-semibold"><Upload size={16} /> Drop to add to your timeline</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
