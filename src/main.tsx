import { Component, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import { Progress } from '@base-ui/react/progress'
import { Tabs } from '@base-ui/react/tabs'
import { Toast } from '@base-ui/react/toast'
import { Tooltip } from '@base-ui/react/tooltip'
import { bind, play } from 'cuelume'
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Film, FilePlus2, History, Maximize2, Music, Pause, Play, Plus, Redo2,
  Scissors, SkipBack, SkipForward, Trash2, Undo2, Upload, ZoomIn, ZoomOut,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { exportProject } from './export'
import { useHistory } from './history'
import { computePeaks, importFile } from './media'
import {
  audio1End, cropRange, digitsFor, emptyProject, findPlaced, gridFor, lengthLabel, newClip, parkMedia, placeClip, trackName,
  projectDuration, removeClip, rippleDelete, sameFile, splitAt, splitRange, timecode, unparkMedia, updateClip,
  type Clip, type DropTarget, type ExportPreset, type Media, type Project, type SplitTarget,
} from './model'
import { Player } from './player'
import { clear, load, readHandles, save, toMedia, type Saved } from './store'
import { MEDIA_MIME, Timeline, zoomToFit, type Range } from './Timeline'
import { dialogBackdrop, dialogPopup, Divider, ExportItems, ghost, FrameMenu, headerBtn, headerIcon, menuItem, pill, popup, Select, Slider, Tip, toast, Toasts } from './ui'
import './styles.css'

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`
const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(s => ({ value: s, label: `${s}×` }))
// Keys inside these belong to the control, not to the editor shortcuts.
const OWN_KEYS = 'input, select, textarea, [role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="tab"], [role="alertdialog"]'
const ZOOM_MIN = 2 // empty timeline; with clips, the zoom-out limit fits the whole edit
const ZOOM_MAX = 200
// What the file picker offers (any file can still be chosen).
const PICK = [{ description: 'Video and audio', accept: { 'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'], 'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'] } }]

type Picked = { file: File; handle?: FileSystemFileHandle }
// The last project, waiting for its files: the ones found so far, and whether the browser was already asked for the rest.
type Restore = { saved: Saved; files: Map<string, File>; asked?: boolean }

function App() {
  const [media, setMedia] = useState<Record<string, Media>>({})
  const [project, setProject, history] = useHistory<Project>(emptyProject())
  const [selected, setSelected] = useState<string | null>(null)
  const [range, setRange] = useState<Range | null>(null)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(40) // px per second as last set; `pps` below keeps it in range
  const [viewW, setViewW] = useState(0) // visible timeline width
  const [timelineH, setTimelineH] = useState(244)
  const [binTab, setBinTab] = useState<'video' | 'audio'>('video')
  const [progress, setProgress] = useState<number | null>(null)
  const [fileOver, setFileOver] = useState(false)
  // A file being removed from the bin while it has clips: closing only flips `open`, so the text stays while it animates out.
  const [removing, setRemoving] = useState<{ id: string; clips: number; open: boolean } | null>(null)
  const [askNew, setAskNew] = useState(false) // confirming New project

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const playheadLabelRef = useRef<HTMLSpanElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const playerRef = useRef<Player>(null)
  const abortRef = useRef<AbortController>(null)
  const seekAfter = useRef<number | undefined>(undefined)

  const duration = projectDuration(project)
  // Fully zoomed out, the whole edit fills 90% of the visible timeline; zooming in goes to at least 4× that.
  // Editing never changes the zoom, so the view holds still while you trim, move or delete: only the zoom controls,
  // the first import and Crop do. If the edit gets shorter the zoom can sit past these limits; the controls start
  // from wherever it is.
  const zoomMin = duration && viewW ? zoomToFit(viewW, duration) : ZOOM_MIN
  const zoomMax = Math.max(ZOOM_MAX, zoomMin * 4)
  const pps = zoom
  const zoomLo = Math.min(zoomMin, pps)
  const zoomHi = Math.max(zoomMax, pps)
  const ppsRef = useRef(pps)
  ppsRef.current = pps
  const viewWRef = useRef(viewW) // visible width of the lanes (the scroll area minus the track names)
  viewWRef.current = viewW
  const digits = digitsFor(gridFor(pps, project.fps, true)) // timeline times show only what the zoom can place
  const digitsRef = useRef(digits)
  digitsRef.current = digits
  const sel = findPlaced(project, selected)
  const used = new Set([...project.video, ...project.overlay, ...project.audio].map(c => c.mediaId))
  const parked = new Set((project.parked ?? []).map(x => x.clip.mediaId)) // unchecked files with clips set aside

  useEffect(() => bind(), []) // sound data attributes on controls play UI sounds

  useEffect(() => {
    const player = new Player(canvasRef.current!)
    player.onPlayingChange = setPlaying
    // Playhead + clock are written straight to the DOM: zero React renders during playback.
    // The timeline refs are null while TimelineBoundary shows its fallback.
    player.onTime = t => {
      const x = t * ppsRef.current
      timeRef.current!.textContent = timecode(t)
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`
      const sc = scrollRef.current
      if (sc && player.playing && (x < sc.scrollLeft || x > sc.scrollLeft + viewWRef.current - 40)) sc.scrollLeft = x - 40
      const label = playheadLabelRef.current
      if (!label || !sc) return
      label.textContent = timecode(t, digitsRef.current && 1) // at most tenths: the clock under the preview has the ms
      // The pill is centred on the playhead (~34 px each side): nudge it (and the mark buttons beside it) to stay inside the
      // visible timeline.
      const left = x - sc.scrollLeft
      playheadRef.current!.style.setProperty('--nudge', `${Math.max(0, 34 - left) - Math.max(0, 34 - (viewWRef.current - left))}px`)
    }
    playerRef.current = player
    // Scrolling moves the visible edges, so re-fit the pill (and remember where zooming starts from).
    const sc = scrollRef.current
    const refit = () => {
      zoomed.current.scroll = sc!.scrollLeft
      player.onTime(player.t)
    }
    sc?.addEventListener('scroll', refit, { passive: true })
    return () => sc?.removeEventListener('scroll', refit)
  }, [])

  useEffect(() => {
    const player = playerRef.current!
    player.setProject(project, media)
    if (seekAfter.current !== undefined) player.seek(seekAfter.current)
    seekAfter.current = undefined
    if (selected && !findPlaced(project, selected)) setSelected(null) // e.g. undo removed it
    if (!duration) setRange(null) // the last clip is gone: nothing left to select
  }, [project, media])

  // Zooming pivots on the playhead: it stays where it was on screen, or comes to the middle if it was out of view.
  // The scroll position before the zoom is remembered, since a shrinking timeline clamps it.
  const zoomed = useRef({ pps, scroll: 0 })
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const before = zoomed.current
    zoomed.current = { pps, scroll: before.scroll }
    if (!sc || before.pps === pps) return
    const t = playerRef.current!.t
    const x = t * before.pps - before.scroll // from the left edge of the visible timeline
    sc.scrollLeft = t * pps - (x >= 0 && x <= viewW ? x : viewW / 2)
    zoomed.current.scroll = sc.scrollLeft
  }, [pps])
  useEffect(() => playerRef.current!.onTime(playerRef.current!.t), [pps])

  const fitZoom = () => setZoom(zoomMin)
  const zoomBy = (f: number) => setZoom(Math.min(zoomHi, Math.max(zoomLo, pps * f)))
  const wasEmpty = useRef(true)
  useEffect(() => {
    if (!viewW) return // fit once the timeline's width is known
    if (wasEmpty.current && duration) fitZoom()
    wasEmpty.current = !duration
  }, [duration, viewW])

  // The project is saved as you go. On load the last one comes back by itself when the browser still lets us read its
  // files; otherwise a panel asks to read them again (or to pick them) or to start fresh. Nothing is saved until that's
  // settled, so the empty editor never overwrites it.
  const [loaded, setLoaded] = useState(false)
  const [restore, setRestore] = useState<Restore | null>(null)
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  useEffect(() => {
    load()
      .then(async saved => {
        if (!saved) return
        const files = await readHandles(saved.media, false)
        if (files.size === saved.media.length) apply(saved, files)
        else setRestore({ saved, files })
      })
      .catch(e => console.warn("Couldn't load the saved project", e))
      .finally(() => setLoaded(true))
  }, [])
  useEffect(() => {
    if (!loaded || restore) return
    const now = () => save(project, media)
    const later = setTimeout(now, 300)
    addEventListener('pagehide', now) // closing the tab inside those 300 ms
    return () => (clearTimeout(later), removeEventListener('pagehide', now))
  }, [project, media, loaded, restore])
  function apply(saved: Saved, files: Map<string, File>) {
    const ms = saved.media.map(m => toMedia(m, files.get(m.id)!))
    setMedia(Object.fromEntries(ms.map(m => [m.id, m])))
    history.reset(saved.project)
    ms.filter(m => m.hasAudio && m.peaksDone !== 1).forEach(readPeaks)
    setRestore(null)
  }
  // One click lets the browser read the saved files again; any it can't reach have to be picked.
  async function reconnect(r: Restore) {
    const files = new Map([...r.files, ...(await readHandles(r.saved.media.filter(m => !r.files.has(m.id)), true))])
    if (files.size === r.saved.media.length) apply(r.saved, files)
    else setRestore({ ...r, files, asked: true })
  }
  // Files picked or dropped while the panel is up are the missing ones, matched by name and size. A new handle is kept,
  // so next time they come back by themselves.
  function locate(r: Restore, items: Picked[]) {
    const files = new Map(r.files)
    const media = r.saved.media.map(m => {
      const found = !files.has(m.id) && items.find(x => sameFile(m, x.file))
      if (!found) return m
      files.set(m.id, found.file)
      return found.handle ? { ...m, handle: found.handle } : m
    })
    const extra = items.filter(x => !media.some(m => files.get(m.id) === x.file)).map(x => x.file.name)
    if (extra.length) toast.add({ title: 'Not in your last project', description: `${extra.join(', ')}. Start fresh to work with new files.` })
    const saved = { ...r.saved, media }
    if (files.size === media.length) apply(saved, files)
    else setRestore({ ...r, saved, files })
  }
  // New project: an empty timeline and bin (the files on disk aren't touched). The old one is gone from storage too.
  const newProject = () => {
    play('close', { emphasis: 'strong' })
    playerRef.current!.pause()
    setMedia({})
    history.reset(emptyProject())
    setSelected(null)
    setRange(null)
  }
  const startFresh = () => {
    play('close')
    clear().catch(() => {})
    setRestore(null)
  }

  const change = (p: Project, seekTo?: number) => {
    seekAfter.current = seekTo
    setProject(p)
  }
  const seek = (t: number) => playerRef.current!.seek(t)
  const patch = (c: Partial<Clip>) => setProject(p => updateClip(p, selected!, c))

  // Split at the playhead, or at both edges of the selected range (unless `here`: the playhead's own scissors).
  const split = (which: SplitTarget, here = false) => {
    const p = range && !here ? splitRange(project, range.a, range.b, which) : splitAt(project, playerRef.current!.t, which)
    if (p === project) return play('error', { emphasis: 'subtle' }) // nothing under the playhead
    play('tap')
    setProject(p)
  }
  // A media file dragged from the bin onto a lane. Video lanes need a picture, audio lanes need sound.
  const place = (mediaId: string, target: DropTarget, t: number) => {
    const m = media[mediaId]
    if (target.kind === 'audio' ? !m.hasAudio : !m.hasVideo) return play('error', { emphasis: 'subtle' })
    play('tap', { emphasis: 'strong' })
    setProject(p => placeClip(p, m, target, t))
  }
  // Removing a file from the bin also removes its clips from the timeline (asking first if it has any). The file stays
  // in memory, hidden, so undo can bring the clips back, and with them the file.
  const removeMedia = (id: string) => {
    play('close', { emphasis: 'strong' })
    setProject(p => {
      const q = [...p.video, ...p.overlay, ...p.audio].filter(c => c.mediaId === id).reduce((q, c) => removeClip(q, c.id), p)
      return { ...q, parked: (q.parked ?? []).filter(x => x.clip.mediaId !== id) }
    })
    setMedia(ms => ({ ...ms, [id]: { ...ms[id], removed: true } }))
  }
  const askRemoveMedia = (id: string) => {
    const clips = [...project.video, ...project.overlay, ...project.audio].filter(c => c.mediaId === id).length
    if (!clips) return removeMedia(id)
    play('open')
    setRemoving({ id, clips, open: true })
  }
  // The bin's checkbox. Unchecking takes a file's clips off the timeline but keeps them aside (cuts, trims, speed and
  // places included), so checking it again puts them back as they were; a file that was never on it is added whole.
  // Each toggle is one undo step.
  const toggleMedia = (m: Media) => {
    const on = used.has(m.id)
    play('toggle', { direction: on ? 'back' : 'forward' })
    setProject(p => (on ? parkMedia(p, m.id) : unparkMedia(p, m)))
  }
  // Delete: the selected range (ripple, all tracks) or else the selected clip.
  const del = () => {
    if (range) {
      play('close', { emphasis: 'strong' })
      change(rippleDelete(project, range.a, range.b), range.a)
      setRange(null)
    } else if (selected) {
      play('close', { emphasis: 'strong' })
      setProject(p => removeClip(p, selected))
      setSelected(null)
    }
  }
  // Crop: keep only the selected range on every track, then zoom to fit what's left.
  const crop = () => {
    if (!range) return
    play('close', { emphasis: 'strong' })
    const next = cropRange(project, range.a, range.b)
    change(next, 0)
    setRange(null)
    if (viewW) setZoom(zoomToFit(viewW, projectDuration(next)))
  }
  const undo = () => history.canUndo && (play('navigate', { direction: 'back', emphasis: 'subtle' }), history.undo())
  const redo = () => history.canRedo && (play('navigate', { direction: 'forward', emphasis: 'subtle' }), history.redo())
  const toggle = () => {
    play('toggle', { direction: playerRef.current!.playing ? 'back' : 'forward', emphasis: 'subtle' })
    playerRef.current!.toggle()
  }
  // I / O mark the range start / end at the playhead.
  const mark = (edge: 'in' | 'out') => {
    const t = playerRef.current!.t
    const r = edge === 'in' ? { a: t, b: Math.max(range?.b ?? duration, t) } : { a: Math.min(range?.a ?? 0, t), b: t }
    setRange(r.b - r.a > 0.01 ? r : null)
  }

  // A file's waveform, read in the background after import (or after a restore, if it wasn't finished).
  function readPeaks(m: Media) {
    const wave = (patch: Partial<Media>) => setMedia(ms => ({ ...ms, [m.id]: { ...ms[m.id], ...patch } }))
    computePeaks(m.file, m.duration, (peaks, done) => wave({ peaks, peaksDone: done }))
      .then(peaks => wave({ peaks, peaksDone: 1 }))
      .catch(() => wave({ peaks: undefined, peaksDone: 1 })) // the waveform is decoration; playback and export don't need it
  }

  // The file picker, with handles where the browser offers them so a saved project can read the files again.
  async function pick() {
    if (!window.showOpenFilePicker) return fileRef.current!.click()
    try {
      const handles = await window.showOpenFilePicker({ multiple: true, types: PICK })
      addFiles(await Promise.all(handles.map(async handle => ({ file: await handle.getFile(), handle }))))
    } catch {
      // dismissed
    }
  }

  async function addFiles(items: Picked[]) {
    if (restoreRef.current) return locate(restoreRef.current, items)
    const results = await Promise.allSettled(items.map(async ({ file, handle }) => ({ ...(await importFile(file)), handle })))
    const ok = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
    const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${items[i].file.name}: ${r.reason?.message ?? r.reason}`] : []))
    if (failed.length) {
      play('error')
      toast.add({ title: "Couldn't import", description: failed.join('\n'), type: 'error', timeout: 0 })
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
      return { ...p, video: [...p.video, ...ok.filter(m => m.hasVideo).map(m => newClip(m))], audio: [...p.audio, ...audio] }
    })
  }

  // Whole-window file drop with a "drop to import" overlay.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const over = (e: DragEvent) => {
      e.preventDefault()
      if (hasFiles(e)) setFileOver(true)
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
        addFiles(files.map((file, i) => ({ file, handle: hs[i]?.kind === 'file' ? (hs[i] as FileSystemFileHandle) : undefined }))),
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

  // Common NLE shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement).closest(OWN_KEYS)) return
      const k = e.key.toLowerCase()
      if (e.metaKey || e.ctrlKey) {
        if (k === 'z') e.shiftKey ? redo() : undo()
        else if (k === 'y') redo()
        else if (k === 'b') split('all')
        else return
        e.preventDefault()
        return
      }
      if (e.altKey) return
      const frame = 1 / project.fps
      if (k === ' ') toggle()
      else if (k === 's') split('all')
      else if (k === 'delete' || k === 'backspace') del()
      else if (k === 'i') mark('in')
      else if (k === 'o') mark('out')
      else if (k === 'escape') (setRange(null), setSelected(null))
      else if (k === 'arrowleft') seek(playerRef.current!.t - (e.shiftKey ? 1 : frame))
      else if (k === 'arrowright') seek(playerRef.current!.t + (e.shiftKey ? 1 : frame))
      else if (k === 'home') seek(0)
      else if (k === 'end') seek(duration)
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // Drag the bar between the preview and the timeline to resize the timeline.
  function resizeTimeline(e: ReactPointerEvent) {
    e.preventDefault()
    const y0 = e.clientY
    const h0 = timelineH
    const move = (ev: PointerEvent) => setTimelineH(Math.round(Math.min(innerHeight * 0.65, Math.max(236, h0 - (ev.clientY - y0)))))
    addEventListener('pointermove', move)
    addEventListener('pointerup', () => removeEventListener('pointermove', move), { once: true })
  }

  // Export the whole edit, or only a range of it.
  async function onExport(preset: ExportPreset, region?: Range) {
    let file: FileSystemFileHandle | null = null
    if (window.showSaveFilePicker) {
      try {
        file = await window.showSaveFilePicker({
          suggestedName: region ? 'selection.mp4' : 'video.mp4',
          types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
        })
      } catch {
        return // picker dismissed
      }
    }
    playerRef.current!.pause()
    const ac = new AbortController()
    abortRef.current = ac
    let last = -1
    setProgress(0)
    play('loading')
    try {
      const t0 = performance.now()
      const blob = await exportProject(region ? cropRange(project, region.a, region.b) : project, media, file, f => {
        const pct = Math.floor(f * 100)
        if (pct !== last) setProgress((last = pct))
      }, ac.signal, preset, project)
      if (blob) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = region ? 'selection.mp4' : 'video.mp4'
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
      }
      const secs = ((performance.now() - t0) / 1000).toFixed(1)
      play('success', { emphasis: 'strong' })
      toast.add({ title: 'Export finished', description: `${file?.name ?? 'video.mp4'} · ${preset.label} · ${fmt(duration)} rendered in ${secs}s` })
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

  const bin = (kind: 'video' | 'audio') => Object.values(media).filter(m => (kind === 'video') === m.hasVideo && (!m.removed || used.has(m.id)))

  return (
    <div className="flex h-full flex-col">
      <input ref={fileRef} type="file" multiple accept="video/*,audio/*" hidden onChange={e => {
        addFiles([...e.target.files!].map(file => ({ file })))
        e.target.value = ''
      }} />

      {/* header: one slim row of small controls */}
      <header className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line bg-chrome px-1.5">
        <Tip label="New project"><button className={headerIcon} onClick={() => (play('open'), setAskNew(true))} disabled={!Object.keys(media).length} aria-label="New project"><FilePlus2 size={13} /></button></Tip>
        <button className={headerBtn} onClick={pick} data-cuelume-open=""><Plus size={13} />Add media</button>
        <Divider />
        <Tip label={`Undo (${MOD}Z)`}><button className={headerIcon} onClick={undo} disabled={!history.canUndo} aria-label="Undo"><Undo2 size={13} /></button></Tip>
        <Tip label={`Redo (⇧${MOD}Z)`}><button className={headerIcon} onClick={redo} disabled={!history.canRedo} aria-label="Redo"><Redo2 size={13} /></button></Tip>
        <Tip label={range ? 'Delete selected region (⌫)' : 'Delete selected clip (⌫)'}>
          <button className={headerIcon} onClick={del} disabled={!range && !selected} aria-label="Delete"><Trash2 size={13} /></button>
        </Tip>
        <div className="flex-1" />
        <Menu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
          <Menu.Trigger
            disabled={!duration || progress !== null}
            className={`${headerBtn} ml-1.5 bg-surface font-semibold text-ink ring-1 ring-line data-popup-open:bg-ink/5`}
          >
            Export <ChevronDown size={12} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-20 outline-none" sideOffset={6} align="end">
              <Menu.Popup className={`${popup} w-60`}>
                <ExportItems project={project} media={media} onPick={preset => onExport(preset)} onFps={fps => setProject(p => ({ ...p, fps }))} />
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* media bin */}
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-line bg-canvas">
          <Tabs.Root value={binTab} onValueChange={v => setBinTab(v as 'video' | 'audio')} className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="flex h-8 border-b border-line bg-chrome">
              {(['video', 'audio'] as const).map(kind => (
                <Tabs.Tab
                  key={kind}
                  value={kind}
                  data-cuelume-select=""
                  className="-mb-px flex items-center gap-1.5 border-r border-line px-3 text-[11px] font-medium text-muted outline-none hover:text-ink data-active:bg-canvas data-active:text-ink"
                >
                  {kind === 'video' ? 'Video files' : 'Audio files'}
                  <span className="text-[10px] text-muted tabular-nums">{bin(kind).length}</span>
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {(['video', 'audio'] as const).map(kind => (
              <Tabs.Panel key={kind} value={kind} className="min-h-0 flex-1 overflow-y-auto outline-none">
                <div className="grid grid-cols-2 content-start gap-2 p-2">
                  <AnimatePresence initial={false}>
                    {bin(kind).map(m => (
                      <motion.div key={m.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group min-w-0">
                        {/* drag onto any timeline lane (a native draggable, so the animated wrapper's drag props stay off);
                            right-click to remove the file */}
                        <ContextMenu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
                        <ContextMenu.Trigger
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData(MEDIA_MIME, m.id)
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                          className="cursor-grab active:cursor-grabbing"
                        >
                        <div className="relative aspect-video overflow-hidden rounded-sm bg-ink/5 ring-1 ring-line">
                          {m.thumb ? (
                            <img src={m.thumb} alt="" className="size-full object-cover" />
                          ) : (
                            <div className="grid size-full place-items-center bg-emerald-50 text-emerald-700"><Music size={16} /></div>
                          )}
                          {/* on the timeline or not: uncheck to set its clips aside, check to put them back (or add it) */}
                          <Tip label={used.has(m.id) ? 'On the timeline · uncheck to set its clips aside' : parked.has(m.id) ? 'Set aside · check to put its clips back' : 'Not on the timeline · check to add it'}>
                            <button
                              onClick={() => toggleMedia(m)}
                              aria-pressed={used.has(m.id)}
                              aria-label={used.has(m.id) ? 'Take off the timeline' : 'Put on the timeline'}
                              className={`absolute top-1 left-1 grid size-4 place-items-center rounded-xs transition-[opacity,color] ${used.has(m.id) ? 'bg-accent text-white' : `bg-white/90 text-transparent ring-1 ring-ink/25 hover:text-muted ${parked.has(m.id) ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}`}
                            >
                              <Check size={10} strokeWidth={3} />
                            </button>
                          </Tip>
                          <span className="absolute right-1 bottom-1 rounded-xs bg-white/90 px-1 text-[9px] font-medium tabular-nums">{fmt(m.duration)}</span>
                          <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            {m.hasVideo && (
                              <Tip label="Append to video track">
                                <button data-cuelume-tap="" className="grid size-5 place-items-center rounded-xs bg-surface text-ink/70 ring-1 ring-line hover:text-ink" onClick={() => setProject(p => ({ ...p, video: [...p.video, newClip(m)] }))}><Film size={10} /></button>
                              </Tip>
                            )}
                            {m.hasAudio && (
                              <Tip label="Add audio at playhead">
                                <button data-cuelume-tap="" className="grid size-5 place-items-center rounded-xs bg-surface text-ink/70 ring-1 ring-line hover:text-ink" onClick={() => setProject(p => ({ ...p, audio: [...p.audio, newClip(m, playerRef.current!.t)] }))}><Music size={10} /></button>
                              </Tip>
                            )}
                          </div>
                          {/* the waveform being read: a thin bar along the bottom, so the card never changes size */}
                          {m.hasAudio && (m.peaksDone ?? 0) < 1 && (
                            <Tip label={`Reading audio · ${Math.floor((m.peaksDone ?? 0) * 100)}%`}>
                              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink/10">
                                <span className="block h-full bg-emerald-600 transition-[width] duration-200" style={{ width: `${(m.peaksDone ?? 0) * 100}%` }} />
                              </span>
                            </Tip>
                          )}
                        </div>
                        <div className="mt-1 truncate text-[11px]" title={m.name}>{m.name}</div>
                        {m.hasVideo && <div className="text-[10px] text-muted tabular-nums">{m.width}×{m.height}</div>}
                        </ContextMenu.Trigger>
                        <ContextMenu.Portal>
                          <ContextMenu.Positioner className="z-20 outline-none">
                            <ContextMenu.Popup className={`${popup} w-44`}>
                              <ContextMenu.Item className={menuItem} onClick={() => askRemoveMedia(m.id)}>
                                <span className="flex items-center gap-2"><Trash2 size={13} /> Remove</span>
                              </ContextMenu.Item>
                            </ContextMenu.Popup>
                          </ContextMenu.Positioner>
                        </ContextMenu.Portal>
                        </ContextMenu.Root>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {!bin(kind).length && <p className="px-3 py-2 text-[11px] text-muted">Drop {kind} files anywhere, or use Add media.</p>}
              </Tabs.Panel>
            ))}
          </Tabs.Root>

        </aside>

        {/* sequence preview with transport and split */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-line bg-canvas px-3 text-[11px]">
            <span className="font-semibold">Sequence preview</span>
            <FrameMenu project={project} media={media} onChange={patch => setProject(p => ({ ...p, ...patch }))} />
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-3 flex items-center justify-center">
              <canvas ref={canvasRef} className={`max-h-full max-w-full rounded-md ring-1 ring-line ${duration ? '' : 'invisible'}`} />
            </div>
            <AnimatePresence>
              {restore ? (
                <motion.div
                  key="restore"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="absolute inset-3 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-line px-6 text-center"
                >
                  <RestorePanel restore={restore} onReconnect={() => reconnect(restore)} onLocate={pick} onFresh={startFresh} />
                </motion.div>
              ) : loaded && !duration && (
                <motion.button
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  onClick={pick}
                  data-cuelume-open=""
                  className="absolute inset-3 flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-line text-ink/60 hover:border-ink/25"
                >
                  <span className="grid size-12 place-items-center rounded-md bg-ink/6"><Upload size={18} /></span>
                  <span className="text-sm font-semibold text-ink">Drop videos & audio here</span>
                  <span className="text-[11px] text-muted">or click to import · files never leave your device</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <div className="flex h-8 shrink-0 items-center gap-2 border-t border-line bg-canvas px-1.5">
            <span ref={timeRef} className="w-28 pl-1 text-[11px] font-semibold tabular-nums">0:00:00.000</span>
            <div className="flex flex-1 items-center justify-center gap-0.5">
              <Tip label="Go to start (Home)"><button className={headerIcon} onClick={() => seek(0)} disabled={!duration} data-cuelume-navigate="back"><SkipBack size={13} /></button></Tip>
              <Tip label="Previous frame (←)"><button className={headerIcon} onClick={() => seek(playerRef.current!.t - 1 / project.fps)} disabled={!duration}><ChevronLeft size={14} /></button></Tip>
              <Tip label={playing ? 'Pause (Space)' : 'Play (Space)'}>
                <button className="grid size-6 place-items-center text-ink transition-colors hover:bg-ink/5 disabled:opacity-40" onClick={toggle} disabled={!duration} aria-label={playing ? 'Pause' : 'Play'}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={playing ? 'pause' : 'play'} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.12 }}>
                      {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="translate-x-px" />}
                    </motion.span>
                  </AnimatePresence>
                </button>
              </Tip>
              <Tip label="Next frame (→)"><button className={headerIcon} onClick={() => seek(playerRef.current!.t + 1 / project.fps)} disabled={!duration}><ChevronRight size={14} /></button></Tip>
              <Tip label="Go to end (End)"><button className={headerIcon} onClick={() => seek(duration)} disabled={!duration} data-cuelume-navigate=""><SkipForward size={13} /></button></Tip>
            </div>
            <span className="w-28 text-right text-[11px] text-muted tabular-nums">{timecode(duration)}</span>
            {/* Split ▾ : main part splits all tracks, the menu picks what to split */}
            <div className="flex items-center">
              <Tip label={range ? 'Split all tracks at selection edges (S)' : 'Split all tracks at playhead (S)'}>
                <button className={headerBtn} onClick={() => split('all')} disabled={!duration}><Scissors size={12} /> Split</button>
              </Tip>
              <Menu.Root onOpenChange={open => open && play('open', { emphasis: 'subtle' })}>
                <Menu.Trigger className={`${headerIcon} data-popup-open:bg-ink/5`} disabled={!duration} aria-label="Split options">
                  <ChevronDown size={12} />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner className="z-20 outline-none" sideOffset={6} align="end">
                    <Menu.Popup className={`${popup} w-60`}>
                      <Menu.Item className={menuItem} disabled={!selected} onClick={() => selected && split(selected)}>Split selected clip</Menu.Item>
                      <Menu.Item className={menuItem} onClick={() => split('all')}>
                        Split all tracks <kbd className="font-sans text-[10px] text-muted">S</kbd>
                      </Menu.Item>
                      <Menu.Separator className="mx-1 my-1 h-px bg-ink/6" />
                      <Menu.Item className={menuItem} disabled={!project.video.length} onClick={() => split('video')}>Split {trackName(project, 'v1')}</Menu.Item>
                      {project.overlayTracks > 0 && (
                        <Menu.Item className={menuItem} disabled={!project.overlay.length} onClick={() => split('overlay')}>Split overlay video tracks</Menu.Item>
                      )}
                      <Menu.Item className={menuItem} disabled={!project.audio.length} onClick={() => split('audio')}>Split audio tracks</Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
          </div>
        </main>
      </div>

      {/* splitter between preview and timeline */}
      <div onPointerDown={resizeTimeline} className="relative z-10 h-px shrink-0 cursor-row-resize bg-line transition-colors hover:bg-ink/40" aria-label="Resize timeline">
        <span className="absolute inset-x-0 -top-1 -bottom-1" /> {/* a wider grab area than the 1px line */}
      </div>

      <TimelineBoundary onUndo={undo}>
        <Timeline
          project={project}
          media={media}
          pps={pps}
          height={timelineH}
          selected={selected}
          range={range}
          onSelect={setSelected}
          onRange={setRange}
          onChange={change}
          onSeek={seek}
          onSplit={split}
          onDeleteRange={del}
          onCrop={crop}
          onExport={onExport}
          onMark={mark}
          playing={playing}
          onPlace={place}
          time={() => playerRef.current!.t}
          viewW={viewW}
          onViewW={setViewW}
          onAdd={pick}
          playheadRef={playheadRef}
          playheadLabelRef={playheadLabelRef}
          scrollRef={scrollRef}
          footer={
            <>
              {sel && !range ? (
                // the selected clip, in one row: name and times, then its settings
                <div className="flex min-w-0 items-center gap-1.5 pl-1 text-[11px]">
                  {media[sel.clip.mediaId].hasVideo ? <Film size={12} className="shrink-0 text-muted" /> : <Music size={12} className="shrink-0 text-muted" />}
                  <span className="max-w-48 truncate font-medium" title={media[sel.clip.mediaId].name}>{media[sel.clip.mediaId].name}</span>
                  <span className="shrink-0 text-[10px] text-muted tabular-nums">{timecode(sel.start, digits)} → {timecode(sel.end, digits)}</span>
                  <Divider />
                  <Select label="Speed" value={sel.clip.speed} items={SPEEDS} onChange={speed => patch({ speed })} />
                  {media[sel.clip.mediaId].hasAudio && !sel.clip.muted && (
                    <>
                      <Divider />
                      <Slider label="Volume" value={sel.clip.volume} onChange={volume => patch({ volume })} format={{ style: 'percent' }} width="w-20" />
                    </>
                  )}
                </div>
              ) : (
                <span className="truncate pl-1 text-[10px] text-muted">
                  {range ? `Selection ${timecode(range.a, digits)} – ${timecode(range.b, digits)} (${lengthLabel(range.b - range.a, digits)}) · S split · ⌫ delete · right-click for more` : duration ? 'Drag in the Select bar to pick a range · click the ruler to move the playhead · I / O mark in / out' : 'Add videos or audio to start editing'}
                </span>
              )}
              <div className="flex-1" />
              <Tip label="Zoom to fit"><button className={ghost} onClick={fitZoom} disabled={!duration} data-cuelume-tap="" data-cuelume-emphasis="subtle"><Maximize2 size={13} /></button></Tip>
              <Tip label="Zoom out"><button className={ghost} onClick={() => zoomBy(1 / 1.5)} disabled={!duration}><ZoomOut size={14} /></button></Tip>
              <Slider label="Zoom" value={Math.log(pps)} min={Math.log(zoomLo)} max={Math.log(zoomHi)} step={0.01} onChange={v => setZoom(Math.exp(v))} disabled={!duration} />
              <Tip label="Zoom in"><button className={ghost} onClick={() => zoomBy(1.5)} disabled={!duration}><ZoomIn size={14} /></button></Tip>
            </>
          }
        />
      </TimelineBoundary>

      <AnimatePresence>
        {fileOver && (
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

      {/* Closing (Cancel or Esc) aborts the export; finishing closes it from state. */}
      <AlertDialog.Root open={!!removing?.open} onOpenChange={open => !open && setRemoving(r => r && { ...r, open: false })}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={dialogBackdrop} />
          <AlertDialog.Popup className={dialogPopup}>
            {removing && (
              <>
                <div className="grid gap-1">
                  <AlertDialog.Title className="truncate text-sm font-semibold">Remove {media[removing.id]?.name}?</AlertDialog.Title>
                  <AlertDialog.Description className="text-[11px] text-muted">
                    It's used by {removing.clips} {removing.clips === 1 ? 'clip' : 'clips'} on the timeline, which will be removed too. You can undo this.
                  </AlertDialog.Description>
                </div>
                <div className="flex justify-end gap-2">
                  <AlertDialog.Close className={pill}>Cancel</AlertDialog.Close>
                  <button
                    className="inline-flex h-8 items-center rounded-md bg-playhead/10 px-3 text-[11px] font-semibold text-playhead hover:bg-playhead/15"
                    onClick={() => {
                      removeMedia(removing.id)
                      setRemoving({ ...removing, open: false })
                    }}
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root open={askNew} onOpenChange={setAskNew}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={dialogBackdrop} />
          <AlertDialog.Popup className={dialogPopup}>
            <div className="grid gap-1">
              <AlertDialog.Title className="text-sm font-semibold">Start a new project?</AlertDialog.Title>
              <AlertDialog.Description className="text-[11px] text-muted">
                This clears the timeline and the media bin. Your files on disk aren't touched.
              </AlertDialog.Description>
            </div>
            <div className="flex justify-end gap-2">
              <AlertDialog.Close className={pill}>Cancel</AlertDialog.Close>
              <button
                className="inline-flex h-8 items-center rounded-md bg-playhead/10 px-3 text-[11px] font-semibold text-playhead hover:bg-playhead/15"
                onClick={() => (newProject(), setAskNew(false))}
              >
                New project
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root open={progress !== null} onOpenChange={open => !open && abortRef.current?.abort()}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={dialogBackdrop} />
          <AlertDialog.Popup className={dialogPopup}>
            <div className="grid gap-1">
              <AlertDialog.Title className="text-sm font-semibold">Exporting video</AlertDialog.Title>
              <AlertDialog.Description className="text-[11px] text-muted">Encoding on your device's GPU. Nothing is uploaded.</AlertDialog.Description>
            </div>
            <Progress.Root className="grid grid-cols-[1fr_auto] gap-2" value={progress ?? 100}>
              <Progress.Label className="text-[11px] font-medium text-muted">Progress</Progress.Label>
              <Progress.Value className="text-[11px] font-semibold tabular-nums" />
              <Progress.Track className="col-span-2 h-1.5 overflow-hidden rounded-xs bg-ink/10">
                <Progress.Indicator className="block h-full rounded-xs bg-accent transition-[width] duration-150" />
              </Progress.Track>
            </Progress.Root>
            <AlertDialog.Close className={`${pill} justify-self-end`}>Cancel</AlertDialog.Close>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}

// The last project, waiting for its files: let the browser read them again (one click), or pick the ones it can't
// reach, or drop it and start over.
function RestorePanel({ restore: { saved, files, asked }, onReconnect, onLocate, onFresh }: {
  restore: Restore
  onReconnect: () => void
  onLocate: () => void
  onFresh: () => void
}) {
  const missing = saved.media.filter(m => !files.has(m.id))
  const ask = !asked && missing.some(m => m.handle)
  const names = missing.slice(0, 3).map(m => m.name).join(', ') + (missing.length > 3 ? ` and ${missing.length - 3} more` : '')
  const clips = saved.project.video.length + saved.project.overlay.length + saved.project.audio.length
  const when = new Date(saved.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <>
      <span className="grid size-12 place-items-center bg-ink/6"><History size={18} /></span>
      <div className="grid gap-1">
        <span className="text-sm font-semibold">Pick up where you left off</span>
        <span className="text-[11px] text-muted">{clips} {clips === 1 ? 'clip' : 'clips'} · saved {when}</span>
      </div>
      <span className="max-w-96 text-[11px] text-muted">
        {ask
          ? `Allow the browser to read ${missing.length === 1 ? 'its file' : `its ${missing.length} files`} again. They never leave your device.`
          : `Pick ${names} again (or drop ${missing.length === 1 ? 'it' : 'them'} here) to reconnect.`}
      </span>
      <div className="flex items-center gap-1">
        <button className={headerBtn} onClick={onFresh}>Start fresh</button>
        <button className={`${headerBtn} bg-surface font-semibold text-ink ring-1 ring-line`} onClick={ask ? onReconnect : onLocate} data-cuelume-open="">
          {ask ? 'Reconnect files' : 'Locate files'}
        </button>
      </div>
    </>
  )
}

// A render error in the timeline shows this instead of unmounting the app. The project lives in App, so it survives,
// and undoing the edit that broke the timeline usually brings it back.
class TimelineBoundary extends Component<{ onUndo: () => void; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) }
  }
  render() {
    if (this.state.error === null) return this.props.children
    return (
      <div className="grid h-60 shrink-0 place-content-center justify-items-center gap-3 bg-surface p-4 text-center">
        <div className="grid gap-1">
          <span className="text-xs font-semibold">The timeline hit an error</span>
          <span className="text-[11px] text-ink/55">{this.state.error}. Your project is still here.</span>
        </div>
        <button className={pill} onClick={() => (this.props.onUndo(), this.setState({ error: null }))}>Undo last change</button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <Toast.Provider toastManager={toast}>
    <Tooltip.Provider delay={400}>
      <App />
    </Tooltip.Provider>
    <Toasts />
  </Toast.Provider>,
)
