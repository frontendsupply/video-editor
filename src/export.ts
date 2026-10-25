import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input,
  Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, StreamTarget, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
  type InputAudioTrack, type StreamTargetChunk, type WrappedCanvas,
} from 'mediabunny'
import { SimpleFilter, SoundTouch, WebAudioBufferSource } from 'soundtouchjs'
import {
  drawFrame, exportSize, fitRect, laneOf, layoutFree, layoutVideo, projectDuration, sourceTime,
  type ExportPreset, type Media, type Project,
} from './model'

const SAMPLE_RATE = 48000
const QUALITY = { high: QUALITY_HIGH, medium: QUALITY_MEDIUM, low: QUALITY_LOW }

// Renders the timeline to MP4 using the GPU's hardware encoder (WebCodecs).
// With a file handle the output streams straight to disk; otherwise it's built in memory and returned as a Blob.
export async function exportProject(
  p: Project,
  media: Record<string, Media>,
  file: FileSystemFileHandle | null,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  preset: ExportPreset,
  frame = p, // the project whose frame size to use: the whole edit, when exporting part of it
): Promise<Blob | null> {
  const [W, H] = exportSize(frame, media, preset.short)
  const quality = QUALITY[preset.quality]
  const duration = projectDuration(p)
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

  const hasAudio = [...p.video, ...p.overlay, ...p.audio].some(c => media[c.mediaId].hasAudio && c.volume > 0 && !c.muted)
  const audioCodec = hasAudio
    ? await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs(), { numberOfChannels: 2, sampleRate: SAMPLE_RATE })
    : null
  const audio = audioCodec && new AudioBufferSource({ codec: audioCodec, quality })
  if (audio) output.addAudioTrack(audio)

  await output.start()
  try {
    // Audio mixes while video encodes, a chunk at a time; encoded audio is tiny next to video, so the muxer holding it
    // until the video catches up is cheap.
    const encoded = { t: 0 } // how far the video has got, so the audio mix keeps pace
    await Promise.all([
      renderVideo(p, media, canvas.getContext('2d')!, video, duration, onProgress, signal, encoded).then(() => video.close()),
      audio && mixAudio(p, media, duration, audio, signal, encoded).then(() => audio.close()),
    ])
    commit = true
    await output.finalize()
  } catch (e) {
    await output.cancel() // closes the stream uncommitted: no half-written file on disk
    throw e
  }
  return target instanceof BufferTarget ? new Blob([target.buffer!], { type: 'video/mp4' }) : null
}

// One output frame at a time: black, then every active layer (Video 1, then overlays by lane, higher on top).
// Each clip gets its own decoder stream, opened at its first frame and closed after its last, so only the
// clips on screen at once are being decoded.
async function renderVideo(
  p: Project,
  media: Record<string, Media>,
  ctx: OffscreenCanvasRenderingContext2D,
  video: CanvasSource,
  duration: number,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  encoded: { t: number },
) {
  const { width: W, height: H } = ctx.canvas
  const fps = p.fps
  const total = Math.ceil(duration * fps - 1e-6)
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

  try {
    for (let f = 0; f < total; f++) {
      signal.throwIfAborted()
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
      encoded.t = t
      onProgress((f + 1) / total)
    }
  } finally {
    encoded.t = Infinity // done (or failed): the audio needn't wait any more
    for (const l of [...open.keys()]) await close(l) // cancelled mid-export
  }
}

// The mix is rendered CHUNK seconds at a time and handed to the encoder as it goes, so memory stays flat however
// long the edit is (a 2-hour mix in one piece would need ~2.8 GB). Each clip decodes only the slice of its source
// that falls in the chunk, plus PAD seconds of source either side: Web Audio places the slices sample-exactly, and the
// time-stretcher (which holds back its last ~0.1 s of input) has its start-up and tail in the padding, so chunk seams
// don't click or drop out.
const CHUNK = 30
const PAD = 0.5

async function mixAudio(
  p: Project,
  media: Record<string, Media>,
  duration: number,
  out: AudioBufferSource,
  signal: AbortSignal,
  encoded: { t: number },
) {
  const parts = [...layoutVideo(p.video), ...layoutFree(p.overlay), ...layoutFree(p.audio)].filter(
    ({ clip }) => media[clip.mediaId].hasAudio && clip.volume > 0 && !clip.muted,
  )
  // One demuxer per file for the whole export (saved clips of a file share it).
  const inputs = new Map<File, { input: Input; track: Promise<InputAudioTrack | null> }>()
  const trackOf = (file: File) => {
    let r = inputs.get(file)
    if (!r) {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      inputs.set(file, (r = { input, track: input.getPrimaryAudioTrack() }))
    }
    return r.track
  }
  try {
    for (let t0 = 0; t0 < duration; t0 += CHUNK) {
      // The mix stays at most a chunk ahead of the video: the muxer holds audio until the video reaches it.
      while (encoded.t < t0 - CHUNK) {
        signal.throwIfAborted()
        await new Promise(r => setTimeout(r, 100))
      }
      signal.throwIfAborted()
      const t1 = Math.min(duration, t0 + CHUNK)
      const ctx = new OfflineAudioContext(2, Math.max(1, Math.round((t1 - t0) * SAMPLE_RATE)), SAMPLE_RATE)
      for (const pl of parts) {
        const a = Math.max(pl.start, t0)
        const b = Math.min(pl.end, t1)
        if (b <= a) continue
        const track = await trackOf(media[pl.clip.mediaId].file)
        if (!track) continue
        const { speed, volume } = pl.clip
        const from = sourceTime(pl, a)
        const s0 = Math.max(0, from - PAD)
        let buf = await decodeRange(track, s0, sourceTime(pl, b) + PAD)
        if (speed !== 1) buf = timeStretch(buf, speed)
        const src = new AudioBufferSourceNode(ctx, { buffer: buf })
        src.connect(new GainNode(ctx, { gain: volume })).connect(ctx.destination)
        src.start(a - t0, (from - s0) / speed, b - a)
      }
      await out.add(await ctx.startRendering()) // waits while the encoder is busy
    }
  } finally {
    for (const { input } of inputs.values()) input.dispose()
  }
}

// Decode only [from, to) of an audio track into one AudioBuffer.
async function decodeRange(track: InputAudioTrack, from: number, to: number): Promise<AudioBuffer> {
  const rate = await track.getSampleRate()
  const channels = await track.getNumberOfChannels()
  const out = new AudioBuffer({ length: Math.max(1, Math.round((to - from) * rate)), numberOfChannels: channels, sampleRate: rate })
  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(from, to)) {
    const skip = Math.round((from - timestamp) * rate) // > 0 when the first packet starts before `from`
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1))
      if (skip > 0) out.copyToChannel(data.subarray(skip), c, 0)
      else if (-skip < out.length) out.copyToChannel(data, c, -skip)
    }
  }
  return out
}

// Pitch-preserving tempo change (WSOLA), so 2x speech sounds like 2x speech, not chipmunks.
// ponytail: runs on the main thread; move to a worker if long sped-up clips make the UI stutter during export.
function timeStretch(buf: AudioBuffer, speed: number) {
  const st = new SoundTouch()
  st.tempo = speed
  const filter = new SimpleFilter(new WebAudioBufferSource(buf), st)
  const length = Math.max(1, Math.floor(buf.length / speed))
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: buf.sampleRate })
  const L = out.getChannelData(0)
  const R = out.getChannelData(1)
  const chunk = new Float32Array(8192 * 2) // interleaved stereo
  for (let n = 0, got = 0; n < length && (got = filter.extract(chunk, 8192)); n += got)
    for (let i = 0; i < got && n + i < length; i++) {
      L[n + i] = chunk[2 * i]
      R[n + i] = chunk[2 * i + 1]
    }
  return out
}
