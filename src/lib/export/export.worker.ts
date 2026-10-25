// Export runs here, off the page, so the editor stays smooth: decoding, drawing and encoding every video frame (on
// the GPU's hardware encoder), muxing, and writing the file. Web Audio, which the mix needs, doesn't exist in workers,
// so the page renders the audio in chunks and posts them in (see export.ts).
import {
  ALL_FORMATS, AudioSample, AudioSampleSource, BlobSource, BufferTarget, CanvasSink, EncodedPacketSink, EncodedVideoPacketSource, Input,
  Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, StreamTarget, VideoSample, VideoSampleSink, VideoSampleSource,
  getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, type EncodedPacket, type StreamTargetChunk, type VideoCodec, type WrappedCanvas,
} from 'mediabunny'
import {
  MIX_RATE, drawFrame, exportSize, fitRect, laneOf, layoutFree, layoutVideo, plainCuts, projectDuration, sourceTime,
  type ExportPreset, type Media, type Placed, type Project,
} from '@/lib/model'

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
  | { type: 'done'; buffer: ArrayBuffer | null; lossless: boolean } // lossless: the video was copied, not re-encoded
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

    // Copy the video as it is when the edit and the files allow it (and the preset asks for full quality anyway).
    const plan = preset.quality === 'high' ? await copyPlan(p, media, W, H) : null
    let video: VideoSampleSource | EncodedVideoPacketSource
    let canvas: OffscreenCanvas | null = null
    if (plan) output.addVideoTrack((video = new EncodedVideoPacketSource(plan.codec))) // the files' own timing
    else {
      const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: W, height: H, frameRate: p.fps, quality })
      if (!videoCodec) throw new Error(`This browser can't encode ${W}×${H} video. Choose a smaller size, such as 720p, and export again.`)
      canvas = new OffscreenCanvas(W, H)
      output.addVideoTrack((video = new VideoSampleSource({ codec: videoCodec, quality })), { frameRate: p.fps })
    }
    // No audio encoder in this browser: the mix is still taken, and dropped.
    const audioCodec = withAudio && (await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs(), { numberOfChannels: 2, sampleRate: MIX_RATE }))
    if (audioCodec) output.addAudioTrack((audio = new AudioSampleSource({ codec: audioCodec, quality })))

    await output.start()
    started()
    try {
      if (plan) await copyVideo(plan, video as EncodedVideoPacketSource, projectDuration(p))
      else await renderVideo(p, media, canvas!.getContext('2d')!, video as VideoSampleSource)
      video.close()
      if (withAudio) await mixDone
      commit = true
      await output.finalize()
    } catch (e) {
      await output.cancel() // closes the stream uncommitted: no half-written file on disk
      throw e
    } finally {
      plan?.dispose()
    }
    const buffer = target instanceof BufferTarget ? target.buffer! : null
    post({ type: 'done', buffer, lossless: !!plan }, buffer ? [buffer] : [])
  } catch (e) {
    post({ type: 'error', message: (e as Error).message })
  }
}

// Lossless copy. When the edit only cuts files that share one video encoding (see plainCuts), at the output's size and
// frame rate, and every piece starts on a key frame, the encoded packets are copied as they are: no decoding, no
// re-encoding, no quality lost, at disk speed. A track holds one encoding, so it's the whole video or none of it.
// Pieces may end anywhere when the file has no B-frames (frames come in the order they show); with B-frames, only at
// the file's end, since a cut could drop a frame that earlier ones are built from.
type Piece = { pl: Placed; sink: EncodedPacketSink; key: EncodedPacket }
type Plan = { codec: VideoCodec; config: VideoDecoderConfig; pieces: Piece[]; dispose: () => void }

async function copyPlan(p: Project, media: Record<string, ExportMedia>, W: number, H: number): Promise<Plan | null> {
  if (!plainCuts(p)) return null
  const inputs = new Map<File, Input>()
  const dispose = () => inputs.forEach(i => i.dispose())
  const near = 0.5 / p.fps // half a frame
  try {
    let first: { codec: VideoCodec; config: VideoDecoderConfig } | undefined
    const pieces: Piece[] = []
    for (const pl of layoutVideo(p.video)) {
      const file = media[pl.clip.mediaId].file
      let input = inputs.get(file)
      if (!input) inputs.set(file, (input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })))
      const track = await input.getPrimaryVideoTrack()
      if (!track || (await track.getRotation()) || (await track.getDisplayWidth()) !== W || (await track.getDisplayHeight()) !== H) return dispose(), null
      const config = await track.getDecoderConfig()
      if (!config || (first && !sameConfig(first.config, config))) return dispose(), null
      first ??= { codec: (await track.getCodec())!, config }
      if (Math.abs((await track.computePacketStats(120)).averagePacketRate - p.fps) > p.fps / 100) return dispose(), null
      const sink = new EncodedPacketSink(track)
      const key = await sink.getKeyPacket(pl.clip.in + near, { verifyKeyPackets: true })
      if (!key || Math.abs(key.timestamp - pl.clip.in) > near) return dispose(), null
      if (pl.clip.out < (await track.computeDuration()) - near) {
        let last = -Infinity
        for await (const pkt of sink.packets(key, undefined, { metadataOnly: true })) {
          if (pkt.timestamp >= pl.clip.out - near) break
          if (pkt.timestamp < last) return dispose(), null // B-frames: this cut can't be copied
          last = pkt.timestamp
        }
      }
      pieces.push({ pl, sink, key })
    }
    return { ...first!, pieces, dispose }
  } catch {
    dispose()
    return null // anything unexpected in a file: re-encode instead
  }
}

// Same codec, size and codec setup bytes: packets from either decode with one decoder.
const sameConfig = (a: VideoDecoderConfig, b: VideoDecoderConfig) => {
  const bytes = (d?: AllowSharedBufferSource) =>
    !d ? new Uint8Array() : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d)
  const [x, y] = [bytes(a.description), bytes(b.description)]
  return a.codec === b.codec && a.codedWidth === b.codedWidth && a.codedHeight === b.codedHeight && x.length === y.length && x.every((v, i) => v === y[i])
}

async function copyVideo({ config, pieces }: Plan, video: EncodedVideoPacketSource, duration: number) {
  let meta: EncodedVideoChunkMetadata | undefined = { decoderConfig: config } // with the first packet
  let shown = 0
  try {
    for (const { pl, sink, key } of pieces) {
      const { in: a, out: b } = pl.clip
      for await (const pkt of sink.packets(key)) {
        ac.signal.throwIfAborted()
        if (pkt.timestamp >= b - 1e-6) break
        if (pkt.timestamp < a - 1e-6) continue // a frame from before the cut, shown earlier
        const t = pl.start + (pkt.timestamp - a)
        await video.add(pkt.clone({ timestamp: t, duration: Math.min(pkt.duration, b - pkt.timestamp) }), meta)
        meta = undefined
        if (performance.now() - shown > 50) {
          shown = performance.now()
          post({ type: 'progress', fraction: t / duration, t })
        }
      }
    }
  } finally {
    post({ type: 'progress', fraction: 1, t: Infinity }) // done (or failed): the mix needn't wait any more
  }
}

// One output frame at a time: black, then every active layer (Video 1, then overlays by lane, higher on top).
// Each clip gets its own decoder stream, opened at its first frame and closed after its last, so only the
// clips on screen at once are being decoded.
// A frame that is a file's own frame as it is (an upright file at the output size, nothing on top) skips the canvas:
// the encoder reading a canvas back costs ~3 ms a frame, which held small exports to ~330 fps, and the round trip
// through the canvas softens colour detail. Only when the edit is Video 1 alone, so the picture can't soften as an
// overlay comes and goes; between clips it changes anyway.
async function renderVideo(p: Project, media: Record<string, ExportMedia>, ctx: OffscreenCanvasRenderingContext2D, video: VideoSampleSource) {
  const { width: W, height: H } = ctx.canvas
  const fps = p.fps
  const total = Math.ceil(projectDuration(p) * fps - 1e-6)
  const frameAt = (t: number) => Math.ceil(t * fps - 1e-6) // frame f shows timeline time f / fps
  const overlays = layoutFree(p.overlay).sort((a, b) => laneOf(a.clip) - laneOf(b.clip))
  const layers = [...layoutVideo(p.video), ...overlays]
    .map(pl => ({ pl, m: media[pl.clip.mediaId], first: frameAt(pl.start), end: Math.min(total, frameAt(pl.end)) }))
    .filter(l => l.end > l.first)
  const video1Only = layers.every(l => p.video.includes(l.pl.clip))
  type Stream = { input: Input; frames: AsyncGenerator<VideoSample | WrappedCanvas | null, void, unknown> }
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
      let decoded: VideoSample | null = null
      for (const l of layers) {
        if (f < l.first || f >= l.end) continue
        let s = open.get(l)
        if (!s) {
          const input = new Input({ source: new BlobSource(l.m.file), formats: ALL_FORMATS })
          const track = (await input.getPrimaryVideoTrack())!
          // Constant output frame rate: one source lookup per output frame (handles speed up and slow-mo alike).
          const times = Array.from({ length: l.end - l.first }, (_, i) => sourceTime(l.pl, (l.first + i) / fps))
          const asIs = video1Only && !(await track.getRotation()) && !(await track.getFlip()) &&
            [await track.getCodedWidth(), await track.getCodedHeight(), await track.getDisplayWidth(), await track.getDisplayHeight()].join() === [W, H, W, H].join()
          if (asIs) s = { input, frames: new VideoSampleSink(track).samplesAtTimestamps(times) }
          else {
            // Decode straight to the final on-screen size (GPU resize + rotation) so big sources stay cheap.
            const r = fitRect(l.m.width, l.m.height, W, H, p.fit)
            const sink = new CanvasSink(track, { width: Math.round(r.w), height: Math.round(r.h), fit: 'fill', poolSize: 2 })
            s = { input, frames: sink.canvasesAtTimestamps(times) }
          }
          open.set(l, s)
        }
        const { value: frame } = await s.frames.next()
        if (!(frame instanceof VideoSample)) drawFrame(ctx, frame?.canvas ?? null, l.m.width, l.m.height, p.fit, false)
        else if (frame.format === 'I420' || frame.format === 'NV12') decoded = frame // no alpha, nothing to convert
        else drawFrame(ctx, frame.toCanvasImageSource(), W, H, p.fit, false), frame.close()
        if (f === l.end - 1) await close(l)
      }
      const sample = decoded ?? new VideoSample(ctx.canvas, { timestamp: t })
      sample.setTimestamp(t)
      sample.setDuration(1 / fps)
      try {
        await video.add(sample) // resolves when the encoder is ready for more (backpressure)
      } finally {
        sample.close()
      }
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
