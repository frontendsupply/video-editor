// Exporting the edit, or a range of it: asks where to save (streaming straight to disk where the browser can), shows
// the progress, and reports how it went.
import { useRef, useState, type RefObject } from 'react'
import { play } from 'cuelume'
import { exportProject } from '@/lib/export/export'
import { clock, cropRange, projectDuration, type ExportPreset, type Media, type Project, type Range } from '@/lib/model'
import type { Player } from '@/lib/player'
import { toast } from '@/components/ui'

export function useExport({ project, media, playerRef }: { project: Project; media: Record<string, Media>; playerRef: RefObject<Player | null> }) {
  const [progress, setProgress] = useState<number | null>(null) // percent, while exporting
  const abort = useRef<AbortController>(null)

  async function start(preset: ExportPreset, region?: Range) {
    const name = region ? 'selection.mp4' : 'video.mp4'
    let file: FileSystemFileHandle | null = null
    if (window.showSaveFilePicker) {
      try {
        file = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] })
      } catch {
        return // picker dismissed
      }
    }
    playerRef.current!.pause()
    const ac = new AbortController()
    abort.current = ac
    let last = -1
    setProgress(0)
    play('loading')
    try {
      const t0 = performance.now()
      const edit = region ? cropRange(project, region.a, region.b) : project
      const { blob, lossless } = await exportProject(edit, media, file, f => {
        const pct = Math.floor(f * 100)
        if (pct !== last) setProgress((last = pct))
      }, ac.signal, preset, project)
      if (blob) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
      }
      const secs = ((performance.now() - t0) / 1000).toFixed(1)
      play('success', { emphasis: 'strong' })
      const how = lossless ? `in ${secs}s · video copied without re-encoding` : `rendered in ${secs}s`
      toast.add({ title: 'Export finished', description: `${file?.name ?? name} · ${preset.label} · ${clock(projectDuration(edit))} ${how}` })
    } catch (e) {
      if (ac.signal.aborted) play('close')
      else {
        play('error')
        toast.add({ title: 'Export failed', description: (e as Error).message, type: 'error', timeout: 0 })
      }
    } finally {
      setProgress(null)
    }
  }

  return { progress, start, cancel: () => abort.current?.abort() }
}
