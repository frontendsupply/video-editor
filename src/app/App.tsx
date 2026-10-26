// The editor: the header, the media bin, the preview and the timeline, wired to the hooks that hold the project, play
// it, save it, bring files in and export.
import { useEffect, useRef, useState } from 'react'
import { bind, play } from 'cuelume'
import { digitsFor, findPlaced, gridFor, projectDuration, trackName, updateClip, type Crop, type Media } from '@/lib/model'
import type { Player } from '@/lib/player'
import { plural } from '@/lib/utils'
import { useClipPreview } from '@/hooks/useClipPreview'
import { useEditor } from '@/hooks/useEditor'
import { useExport } from '@/hooks/useExport'
import { useImport } from '@/hooks/useImport'
import { useMedia } from '@/hooks/useMedia'
import { usePlayer } from '@/hooks/usePlayer'
import { useProjectStorage } from '@/hooks/useProjectStorage'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useZoom } from '@/hooks/useZoom'
import { ConfirmDialog, ResizeHandle } from '@/components/ui'
import { MediaBin } from '@/components/bin/MediaBin'
import { ExportProgress } from '@/components/export/ExportProgress'
import { FileDropOverlay } from '@/components/FileDropOverlay'
import { Header } from '@/components/header/Header'
import { ClipPreview } from '@/components/preview/ClipPreview'
import { CropBar, NO_CROP } from '@/components/preview/CropBox'
import { FrameMenu } from '@/components/preview/FrameMenu'
import { MonitorTabs } from '@/components/preview/MonitorTabs'
import { SequenceView } from '@/components/preview/SequenceView'
import { Transport } from '@/components/preview/Transport'
import { Timeline } from '@/components/timeline/Timeline'
import { TimelineBoundary } from '@/components/timeline/TimelineBoundary'
import { TimelineFooter } from '@/components/timeline/TimelineFooter'

export function App() {
  const playerRef = useRef<Player>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const playheadLabelRef = useRef<HTMLSpanElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const seekAfter = useRef<number | undefined>(undefined)
  const [viewW, setViewW] = useState(0) // visible width of the timeline's lanes
  const [timelineH, setTimelineH] = useState(244)
  const [binW, setBinW] = useState(320)
  // Confirmations: a file with clips being removed, and New project. Closing only flips `open`, so the text stays
  // while the dialog animates out.
  const [removing, setRemoving] = useState<{ media: Media; clips: number; open: boolean } | null>(null)
  const [askNew, setAskNew] = useState(false)
  const [cropping, setCropping] = useState<{ id: string; crop: Crop } | null>(null) // a clip's crop being set, not yet kept
  const time = () => playerRef.current!.t

  const { media, setMedia, readPeaks } = useMedia()
  const editor = useEditor({ playerRef, media, setMedia, seekAfter: t => (seekAfter.current = t), onCropped: next => zoom.fitTo(projectDuration(next)) })
  const { project, setProject, duration, range, selected } = editor
  const zoom = useZoom({ duration, viewW, scrollRef, time })
  const digits = digitsFor(gridFor(zoom.pps, project.fps, true)) // timeline times show only what the zoom can place
  const { playing } = usePlayer({ playerRef, canvasRef, clockRef, playheadRef, playheadLabelRef, scrollRef, seekAfter, project, media, pps: zoom.pps, viewW, digits })
  const storage = useProjectStorage({ project, media, setMedia, reset: editor.history.reset, readPeaks })
  const importer = useImport({ setMedia, setProject, readPeaks, locate: storage.locate })
  const clip = useClipPreview({ media, setMedia, setProject, playerRef })
  const exporter = useExport({ project, media, playerRef })

  useEffect(() => bind(), []) // sound data attributes on controls play UI sounds

  const seek = (t: number) => playerRef.current!.seek(t)
  const seekBy = (d: number) => seek(time() + d)
  const seekTo = (where: 'start' | 'end') => seek(where === 'start' ? 0 : duration)
  const togglePlay = () => {
    play('toggle', { direction: playerRef.current!.playing ? 'back' : 'forward', emphasis: 'subtle' })
    playerRef.current!.toggle()
  }
  const askRemoveMedia = (m: Media) => {
    const clips = editor.clipsOf(m.id)
    if (!clips) return editor.removeMedia(m.id)
    play('open')
    setRemoving({ media: m, clips, open: true })
  }
  const clearSelection = () => (editor.setRange(null), editor.setSelected(null))

  // Cropping the selected clip: its crop is set on the preview and kept with Done (one undo step), or dropped with
  // Cancel, Esc, or selecting something else.
  const sel = findPlaced(project, selected)
  const startCrop = () => {
    if (time() < sel!.start || time() >= sel!.end) seek(sel!.start) // its picture on screen
    setCropping({ id: sel!.clip.id, crop: sel!.clip.crop ?? NO_CROP })
  }
  const keepCrop = () => {
    if (!cropping) return
    const { id, crop } = cropping
    setProject(p => updateClip(p, id, { crop: Object.values(crop).some(Boolean) ? crop : undefined }))
    setCropping(null)
  }
  useEffect(() => playerRef.current!.crop(cropping?.id ?? null), [cropping?.id])
  useEffect(() => setCropping(c => (c?.id === selected ? c : null)), [selected])

  useShortcuts({
    undo: editor.undo,
    redo: editor.redo,
    split: () => editor.split('all'),
    togglePlay,
    del: editor.del,
    mark: editor.mark,
    clear: () => (cropping ? setCropping(null) : clearSelection()),
    confirm: keepCrop,
    seekBy,
    seekTo,
    frame: 1 / project.fps,
  })

  const parked = new Set((project.parked ?? []).map(x => x.clip.mediaId)) // unchecked files with clips set aside
  const exportTo = { project, media, onPick: exporter.start, onFps: (fps: number) => setProject(p => ({ ...p, fps })), name: exporter.name, onName: exporter.setName }

  return (
    <div className="flex h-full flex-col">
      <input type="file" multiple accept="video/*,audio/*,image/*" hidden {...importer.input} />
      <Header
        onNewProject={Object.keys(media).length ? () => setAskNew(true) : null}
        onAddMedia={importer.pick}
        onUndo={editor.history.canUndo ? editor.undo : null}
        onRedo={editor.history.canRedo ? editor.redo : null}
        onDelete={range || selected ? editor.del : null}
        deleting={range ? 'region' : 'clip'}
        exporting={duration > 0 && exporter.progress === null ? exportTo : null}
      />

      <div className="flex min-h-0 flex-1">
        <MediaBin
          width={binW}
          media={media}
          used={editor.used}
          parked={parked}
          onToggle={editor.toggleMedia}
          onOpen={clip.open}
          onRemove={askRemoveMedia}
          onAppendVideo={editor.appendVideo}
          onAddAudio={editor.addAudio}
        />
        <ResizeHandle size={binW} edge="right" min={220} max={innerWidth * 0.4} label="Resize media bin" onResize={setBinW} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-content">
          <MonitorTabs
            showing={clip.monitor}
            clip={clip.file?.name ?? null}
            onShow={clip.show}
            onCloseClip={clip.close}
            frameMenu={
              cropping && sel ? (
                <CropBar media={media[sel.clip.mediaId]} crop={cropping.crop} onCrop={crop => setCropping({ ...cropping, crop })} onCancel={() => setCropping(null)} onDone={keepCrop} />
              ) : (
                <FrameMenu project={project} media={media} onChange={patch => setProject(p => ({ ...p, ...patch }))} />
              )
            }
          />
          {clip.monitor === 'clip' && clip.file && (
            <ClipPreview key={clip.file.id} media={clip.file} marks={clip.marks!} fps={project.fps} onMarks={clip.setMarks} onAdd={clip.add} onSave={clip.saveToBin} />
          )}
          <SequenceView
            canvasRef={canvasRef}
            pictures={{
              playerRef,
              project,
              media,
              selected,
              onSelect: editor.setSelected,
              onTransform: (id, transform) => setProject(p => updateClip(p, id, { transform })),
            }}
            cropping={
              cropping && sel
                ? { playerRef, placed: sel, media: media[sel.clip.mediaId], crop: cropping.crop, onCrop: crop => setCropping({ ...cropping, crop }) }
                : null
            }
            hidden={clip.monitor === 'clip'}
            empty={!duration}
            loaded={storage.loaded}
            restore={storage.restore}
            onPick={importer.pick}
            onReconnect={storage.reconnect}
            onStartFresh={storage.startFresh}
          />
          <Transport
            clockRef={clockRef}
            hidden={clip.monitor === 'clip'}
            duration={duration}
            playing={playing}
            frame={1 / project.fps}
            hasRange={!!range}
            onToggle={togglePlay}
            onSeekBy={seekBy}
            onSeekTo={seekTo}
            onSplit={editor.split}
            split={{
              selected,
              video1: trackName(project, 'v1'),
              video: project.video.length > 0,
              overlays: project.overlayTracks > 0 ? project.overlay.length > 0 : null,
              audio: project.audio.length > 0,
            }}
          />
        </main>
      </div>

      <ResizeHandle size={timelineH} edge="top" min={236} max={innerHeight * 0.65} label="Resize timeline" onResize={setTimelineH} />

      <TimelineBoundary onUndo={editor.undo}>
        <Timeline
          project={project}
          media={media}
          pps={zoom.pps}
          height={timelineH}
          selected={selected}
          range={range}
          onSelect={editor.setSelected}
          onRange={editor.setRange}
          onChange={editor.change}
          onSeek={seek}
          onSplit={editor.split}
          onDeleteRange={editor.del}
          onCrop={editor.crop}
          onExport={exporter.start}
          exportName={exporter.name}
          onExportName={exporter.setName}
          onSaveAudio={exporter.saveAudio}
          onMark={editor.mark}
          playing={playing}
          onPlace={editor.place}
          time={time}
          viewW={viewW}
          onViewW={setViewW}
          onAdd={importer.pick}
          playheadRef={playheadRef}
          playheadLabelRef={playheadLabelRef}
          scrollRef={scrollRef}
          footer={
            <TimelineFooter
              selected={sel ?? null}
              media={media}
              range={range}
              digits={digits}
              empty={!duration}
              onPatch={editor.patch}
              // the sound of a video, unlinked onto an audio track, has no picture to crop
              onCrop={sel && !cropping && media[sel.clip.mediaId].hasVideo && !project.audio.includes(sel.clip) ? startCrop : null}
              zoom={zoom}
            />
          }
        />
      </TimelineBoundary>

      <FileDropOverlay show={importer.fileOver} />

      <ConfirmDialog
        open={!!removing?.open}
        onOpenChange={open => !open && setRemoving(r => r && { ...r, open: false })}
        title={`Remove ${removing?.media.name}?`}
        description={removing && `It's used by ${plural(removing.clips, { one: '# clip', other: '# clips' })} on the timeline, which will be removed too. You can undo this.`}
        confirm="Remove file"
        onConfirm={() => removing && editor.removeMedia(removing.media.id)}
      />
      <ConfirmDialog
        open={askNew}
        onOpenChange={setAskNew}
        title="Start a new project?"
        description="This clears the timeline and the media bin, and can't be undone. Your files on disk stay as they are."
        confirm="Start new project"
        onConfirm={editor.newProject}
      />
      <ExportProgress progress={exporter.progress} onCancel={exporter.cancel} />
    </div>
  )
}
