// Export runs here, off the page, so the editor stays smooth: decoding, drawing and encoding every video frame (on
// the GPU's hardware encoder), muxing, and writing the file. Web Audio, which the mix needs, doesn't exist in workers,
// so the page renders the audio in chunks and posts them in (see export.ts).
import {
  ALL_FORMATS, AudioSample, AudioSampleSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input,
  Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, StreamTarget, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
  type StreamTargetChunk, type WrappedCanvas,
} from 'mediabunny'
import {
  MIX_RATE, drawFrame, exportSize, fitRect, laneOf, layoutFree, layoutVideo, projectDuration, sourceTime,
  type ExportPreset, type Media, type Project,
} from './model'

export type ExportMedia = Pick<Media, 'file' | 'width' | 'height'>
export type ExportJob = {
  p: Project
  media: Record<string, ExportMedia>
  file: FileSystemFileHandle | null // stream to disk, else build in memory
  preset: ExportPreset
  frame: Project // the project whose frame size to use: the whole edit, when exporting part of it
  audio: boolean // the page will post the mix
}
export type ToWorker =
  | { type: 'start'; job: ExportJob }
  | { type: 'audio'; data: Float32Array; timestamp: number } // planar stereo at MIX_RATE
  | { type: 'audio-end' }
  | { type: 'cancel' }
export type FromWorker =
  | { type: 'progress'; fraction: number; t: number } // t: video encoded up to here, so the mix keeps pace
  | { type: 'audio-ok' } // ready for the next chunk
  | { type: 'done'; buffer: ArrayBuffer | null }
  | { type: 'error'; message: string }

const QUALITY = { high: QUALITY_HIGH, medium: QUALITY_MEDIUM, low: QUALITY_LOW }
const post = (m: FromWorker, transfer: Transferable[] = []) => postMessage(m, { transfer })

const ac = new AbortController()
let audio: AudioSampleSource | null = null
let started = () => {}
let chain = new Promise<void>(ok => (started = ok)) // mix chunks queue up until the output has started
let mixed = () => {}
const mixDone = new Promise<void>(ok => (mixed = ok))

onmessage = ({ data }: MessageEvent<ToWorker>) => {
  if (data.type === 'start') run(data.job)
  else if (data.type === 'cancel') ac.abort()
  else if (data.type === 'audio-end') chain = chain.then(() => (audio?.close(), mixed()))
  else {
    const sample = new AudioSample({ data: data.data, format: 'f32-planar', numberOfChannels: 2, sampleRate: MIX_RATE, timestamp: data.timestamp })
    chain = chain.then(async () => {
      if (audio) await audio.add(sample) // waits while the encoder is busy
      sample.close()
      post({ type: 'audio-ok' })
    })
  }
}

async function run({ p, media, file, preset, frame, audio: withAudio }: ExportJob) {
  try {
    const [W, H] = exportSize(frame, media, preset.short)
    const quality = QUALITY[preset.quality]
    const format = new Mp4OutputFormat()
    // Disk writes only commit on close(); the muxer closes on cancel too, so only commit once we got to finalize.
    let commit = false
    const fileStream = file && (await file.createWritable())
    const writable = fileStream && new WritableStream<StreamTargetChunk>({
      write: chunk => fileStream.write(chunk),
      close: () => (commit ? fileStream.close() : fileStream.abort()),
      abort: () => fileStream.abort(),
    })
    const target = writable ? new StreamTarget(writable, { chunked: true }) : new BufferTarget()
    const output = new Output({ format, target })

    const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: W, height: H, frameRate: p.fps, quality })
    if (!videoCodec) throw new Error(`This browser can't encode ${W}×${H} video`)
    const canvas = new OffscreenCanvas(W, H)
    const video = new CanvasSource(canvas, { codec: videoCodec, quality })
    output.addVideoTrack(video, { frameRate: p.fps })
    // No audio encoder in this browser: the mix is still taken, and dropped.
    const audioCodec = withAudio && (await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs(), { numberOfChannels: 2, sampleRate: MIX_RATE }))
    if (audioCodec) output.addAudioTrack((audio = new AudioSampleSource({ codec: audioCodec, quality })))

    await output.start()
    started()
    try {
      await renderVideo(p, media, canvas.getContext('2d')!, video).then(() => video.close())
      if (withAudio) await mixDone
      commit = true
      await output.finalize()
    } catch (e) {
      await output.cancel() // closes the stream uncommitted: no half-written file on disk
      throw e
    }
    const buffer = target instanceof BufferTarget ? target.buffer! : null
    post({ type: 'done', buffer }, buffer ? [buffer] : [])
  } catch (e) {
    post({ type: 'error', message: (e as Error).message })
  }
}

// One output frame at a time: black, then every active layer (Video 1, then overlays by lane, higher on top).
// Each clip gets its own decoder stream, opened at its first frame and closed after its last, so only the
// clips on screen at once are being decoded.
async function renderVideo(p: Project, media: Record<string, ExportMedia>, ctx: OffscreenCanvasRenderingContext2D, video: CanvasSource) {
  const { width: W, height: H } = ctx.canvas
  const fps = p.fps
  const total = Math.ceil(projectDuration(p) * fps - 1e-6)
  const frameAt = (t: number) => Math.ceil(t * fps - 1e-6) // frame f shows timeline time f / fps
  const overlays = layoutFree(p.overlay).sort((a, b) => laneOf(a.clip) - laneOf(b.clip))
  const layers = [...layoutVideo(p.video), ...overlays]
    .map(pl => ({ pl, m: media[pl.clip.mediaId], first: frameAt(pl.start), end: Math.min(total, frameAt(pl.end)) }))
    .filter(l => l.end > l.first)
  type Stream = { input: Input; frames: AsyncGenerator<WrappedCanvas | null, void, unknown> }
  const open = new Map<(typeof layers)[number], Stream>()
  const close = async (l: (typeof layers)[number]) => {
    const s = open.get(l)!
    open.delete(l)
    await s.frames.return(undefined)
    s.input.dispose()
  }

  let shown = 0
  try {
    for (let f = 0; f < total; f++) {
      ac.signal.throwIfAborted()
      const t = f / fps
      drawFrame(ctx, null, 0, 0, p.fit) // black base (also the tail when audio outlasts the video)
      for (const l of layers) {
        if (f < l.first || f >= l.end) continue
        let s = open.get(l)
        if (!s) {
          const input = new Input({ source: new BlobSource(l.m.file), formats: ALL_FORMATS })
          const track = (await input.getPrimaryVideoTrack())!
          // Decode straight to the final on-screen size (GPU resize + rotation) so big sources stay cheap.
          const r = fitRect(l.m.width, l.m.height, W, H, p.fit)
          const sink = new CanvasSink(track, { width: Math.round(r.w), height: Math.round(r.h), fit: 'fill', poolSize: 2 })
          // Constant output frame rate: one source lookup per output frame (handles speed up and slow-mo alike).
          const times = Array.from({ length: l.end - l.first }, (_, i) => sourceTime(l.pl, (l.first + i) / fps))
          s = { input, frames: sink.canvasesAtTimestamps(times) }
          open.set(l, s)
        }
        const { value: frame } = await s.frames.next()
        drawFrame(ctx, frame?.canvas ?? null, l.m.width, l.m.height, p.fit, false)
        if (f === l.end - 1) await close(l)
      }
      await video.add(t, 1 / fps) // resolves when the encoder is ready for more (backpressure)
      if (f === total - 1 || performance.now() - shown > 50) {
        shown = performance.now()
        post({ type: 'progress', fraction: (f + 1) / total, t })
      }
    }
  } finally {
    post({ type: 'progress', fraction: 1, t: Infinity }) // done (or failed): the mix needn't wait any more
    for (const l of [...open.keys()]) await close(l) // cancelled mid-export
  }
}
