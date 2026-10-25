// Bringing files in: the picker, dropping anywhere on the window, probing them, and converting the ones the browser
// can't decode. New files go on the timeline too: videos and pictures at the end of Video 1, sounds after the last one
// on Audio 1.
// The first video in an empty project sets its frame rate.
import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react'
import { play } from 'cuelume'
import { importFile, NeedsConversion, type Picked } from '@/lib/media/import'
import { audio1End, nearestRate, newClip, type Media, type Project } from '@/lib/model'
import { plural } from '@/lib/utils'
import { toast } from '@/components/ui'
import { useLatest } from './useLatest'

// What the file picker offers (any file can still be chosen).
const PICK = [
  {
    description: 'Video, audio and images',
    accept: {
      'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'],
      'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'],
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'],
    },
  },
]

export function useImport({ setMedia, setProject, readPeaks, locate }: {
  setMedia: Dispatch<SetStateAction<Record<string, Media>>>
  setProject: (u: (p: Project) => Project) => void
  readPeaks: (m: Media) => void
  locate: (items: Picked[]) => boolean // a saved project waiting for its files takes them instead
}) {
  const [fileOver, setFileOver] = useState(false) // files dragged over the window
  const inputRef = useRef<HTMLInputElement>(null) // the plain picker, where the browser has no handle-giving one

  async function addFiles(items: Picked[]) {
    if (locate(items)) return
    const results = await Promise.allSettled(
      items.map(async ({ file, handle, name, converted }) => ({ ...(await importFile(file)), handle, ...(converted && { name, converted }) })),
    )
    const ok = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
    // Files the browser can't decode get a playable copy made in the background, then come in like the rest.
    const convertible = (r: PromiseSettledResult<unknown>, i: number) => r.status === 'rejected' && r.reason instanceof NeedsConversion && !items[i].converted
    results.forEach((r, i) => convertible(r, i) && convertFile(items[i].file, ((r as PromiseRejectedResult).reason as NeedsConversion).video))
    const failed = results.flatMap((r, i) => (r.status === 'rejected' && !convertible(r, i) ? [`${items[i].file.name}: ${r.reason?.message ?? r.reason}`] : []))
    if (failed.length) {
      play('error')
      toast.add({ title: plural(failed.length, { one: "Couldn't add # file", other: "Couldn't add # files" }), description: failed.join('\n'), type: 'error', timeout: 0 })
    }
    if (!ok.length) return
    play('success', { emphasis: 'subtle' })
    setMedia(m => ({ ...m, ...Object.fromEntries(ok.map(x => [x.id, x])) }))
    ok.filter(m => m.hasAudio).forEach(readPeaks)
    setProject(p => {
      let audioEnd = audio1End(p)
      const audio = ok.filter(m => !m.hasVideo).map(m => {
        const c = newClip(m, audioEnd)
        audioEnd += m.duration
        return c
      })
      const first = !p.video.length && ok.find(m => m.hasVideo && m.fps)
      return {
        ...p,
        ...(first && { fps: nearestRate(first.fps!) }),
        video: [...p.video, ...ok.filter(m => m.hasVideo).map(m => newClip(m))],
        audio: [...p.audio, ...audio],
      }
    })
  }
  const add = useLatest(addFiles) // for the window's drop listener, registered once

  // Converting a file the browser can't decode: a toast shows how far it's got (closing it cancels), then the copy is
  // imported under the file's own name. One at a time: each holds a decoder and its finished copy in memory, so a pile
  // of big files at once could run out.
  const converting = useRef(Promise.resolve())
  async function convertFile(file: File, video: 'encode' | 'copy') {
    const ac = new AbortController()
    const turn = converting.current
    let next = () => {}
    converting.current = new Promise<void>(ok => (next = ok))
    const id = toast.add({
      title: `Waiting to convert ${file.name}`,
      description:
        video === 'copy'
          ? "Its audio can't be played here, so it's being converted. The video is copied as it is."
          : "This browser can't decode it, so a playable copy is being made on this device. Long videos take a while.",
      timeout: 0,
      onClose: () => ac.abort(),
    })
    let shown = -1
    try {
      await turn
      ac.signal.throwIfAborted()
      toast.update(id, { title: `Converting ${file.name}` })
      const { convert } = await import('@/lib/media/convert') // the software decoder loads only now
      const c = await convert(file, video, share => {
        const pct = Math.floor(share * 100)
        if (pct !== shown) toast.update(id, { title: `Converting ${file.name} · ${(shown = pct)}%` })
      }, ac.signal)
      toast.close(id)
      add.current([{ file: c.file, handle: c.handle, name: file.name, converted: c.folder }])
    } catch (e) {
      if (ac.signal.aborted) return
      toast.close(id)
      play('error')
      toast.add({ title: `Couldn't convert ${file.name}`, description: (e as Error).message, type: 'error', timeout: 0 })
    } finally {
      next()
    }
  }

  // The file picker, with handles where the browser offers them so a saved project can read the files again.
  async function pick() {
    if (!window.showOpenFilePicker) return inputRef.current!.click()
    try {
      const handles = await window.showOpenFilePicker({ multiple: true, types: PICK })
      addFiles(await Promise.all(handles.map(async handle => ({ file: await handle.getFile(), handle }))))
    } catch {
      // dismissed
    }
  }
  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles([...e.target.files!].map(file => ({ file })))
    e.target.value = ''
  }

  // Whole-window file drop, with a "drop to import" overlay while files are over it.
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) setFileOver(true)
    }
    const leave = (e: DragEvent) => !e.relatedTarget && setFileOver(false)
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setFileOver(false)
      const dt = e.dataTransfer
      if (!dt?.files.length) return
      const files = [...dt.files]
      // Handles can only be asked for while the drop event runs.
      const handles = [...dt.items].filter(i => i.kind === 'file').map(i => i.getAsFileSystemHandle?.().catch(() => null) ?? null)
      Promise.all(handles).then(hs =>
        add.current(files.map((file, i) => ({ file, handle: hs[i]?.kind === 'file' ? (hs[i] as FileSystemFileHandle) : undefined }))),
      )
    }
    addEventListener('dragover', over)
    addEventListener('dragleave', leave)
    addEventListener('drop', drop)
    return () => {
      removeEventListener('dragover', over)
      removeEventListener('dragleave', leave)
      removeEventListener('drop', drop)
    }
  }, [])

  return { pick, fileOver, input: { ref: inputRef, onChange: onInputChange } }
}
