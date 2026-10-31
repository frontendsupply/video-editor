// Exporting to MP4, the page's side: starts the export worker and renders the audio mix for it. Also saves one clip's sound.
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, type InputAudioTrack } from 'mediabunny'
import { SimpleFilter, SoundTouch, WebAudioBufferSource } from 'soundtouchjs'
import {
  type ExportPreset,
  layoutFree,
  layoutVideo,
  type Media,
  MIX_RATE,
  type Project,
  projectDuration,
  sourceTime,
} from '@/lib/model'
import type { FromAudioWorker, ToAudioWorker } from './audio.worker'
import type { ExportMedia, FromWorker, ToWorker } from './export.worker'

// Renders the timeline to MP4 using the GPU's hardware encoder (WebCodecs). The video, muxing and file writing run in
// a worker (export.worker.ts), so the editor stays responsive; the audio mix stays here, since it needs Web Audio.
// With a file handle the output streams straight to disk; otherwise it's built in memory and returned as a Blob.
// `lossless`: the video was copied from the files as it was (see export.worker.ts), not re-encoded.
export async function exportProject(
  p: Project,
  media: Record<string, Media>,
  file: FileSystemFileHandle | null,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  preset: ExportPreset,
  frame = p, // the project whose frame size to use: the whole edit, when exporting part of it
): Promise<{ blob: Blob | null; lossless: boolean }> {
  const audio = [...p.video, ...p.overlay, ...p.audio].some(c => media[c.mediaId].hasAudio && c.volume > 0 && !c.muted)
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' })
  const send = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, { transfer })
  const encoded = { t: 0 } // how far the video has got, so the audio mix keeps pace
  // Progress is the slower of the two: a copied video can be done long before a long mix is.
  const share = { video: 0, audio: audio ? 0 : 1 }
  const report = () => onProgress(Math.min(share.video, share.audio))
  let next = () => {}
  const done = new Promise<{ blob: Blob | null; lossless: boolean }>((ok, fail) => {
    worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
      if (data.type === 'progress') (encoded.t = data.t), (share.video = data.fraction), report()
      else if (data.type === 'audio-ok') next()
      else if (data.type === 'done')
        ok({ blob: data.buffer && new Blob([data.buffer], { type: 'video/mp4' }), lossless: data.lossless })
      else fail(signal.aborted ? signal.reason : new Error(data.message))
    }
    worker.onerror = e => fail(new Error(e.message))
  })
  const cancel = () => send({ type: 'cancel' })
  signal.addEventListener('abort', cancel)
  // The worker needs only the files and their sizes, not thumbnails or waveforms.
  const files = Object.fromEntries(
    Object.entries(media).map(([id, m]) => [
      id,
      { file: m.file, width: m.width, height: m.height, image: m.image } satisfies ExportMedia,
    ]),
  )
  send({ type: 'start', job: { p, media: files, file, preset, frame, audio } })
  try {
    // Audio mixes while the video encodes, a chunk at a time; each chunk waits for the encoder to take the last one.
    const chunk = (buf: AudioBuffer, timestamp: number) =>
      new Promise<void>(ok => {
        next = () => ((share.audio = (timestamp + buf.duration) / projectDuration(p)), report(), ok())
        const data = new Float32Array(buf.length * 2) // planar stereo
        data.set(buf.getChannelData(0))
        data.set(buf.getChannelData(1), buf.length)
        send({ type: 'audio', data, timestamp }, [data.buffer])
      })
    const mixed =
      audio && mixAudio(p, media, projectDuration(p), chunk, signal, encoded).then(() => send({ type: 'audio-end' }))
    return (await Promise.all([done, mixed]))[0]
  } finally {
    signal.removeEventListener('abort', cancel)
    worker.terminate() // after an error or cancel too: an uncommitted file stream is discarded with it
  }
}

// One clip's sound, `start`–`end` of its file in source seconds, as an audio file (.m4a), made in a worker
// (audio.worker.ts). Streams to the file handle, or returns a Blob. Aborting settles at once; the worker drops the
// unfinished file (a file stream only commits when it's closed) and then stops.
export function saveClipAudio(
  file: File,
  start: number,
  end: number,
  handle: FileSystemFileHandle | null,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<Blob | null> {
  const worker = new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' })
  const send = (m: ToAudioWorker) => worker.postMessage(m)
  return new Promise<Blob | null>((ok, fail) => {
    signal.addEventListener('abort', () => (send({ type: 'cancel' }), fail(signal.reason)), { once: true })
    worker.onmessage = ({ data }: MessageEvent<FromAudioWorker>) => {
      if (data.type === 'progress') return signal.aborted || onProgress(data.fraction)
      worker.terminate() // finished, failed, or cancelled and the file let go
      if (data.type === 'done') ok(data.buffer && new Blob([data.buffer], { type: 'audio/mp4' }))
      else fail(new Error(data.message))
    }
    worker.onerror = e => (worker.terminate(), fail(new Error(e.message)))
    send({ type: 'start', job: { file, start, end, handle } })
  })
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
  out: (buf: AudioBuffer, timestamp: number) => Promise<void>,
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
      const ctx = new OfflineAudioContext(2, Math.max(1, Math.round((t1 - t0) * MIX_RATE)), MIX_RATE)
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
      await out(await ctx.startRendering(), t0) // waits while the encoder is busy
    }
  } finally {
    for (const { input } of inputs.values()) input.dispose()
  }
}

// Decode only [from, to) of an audio track into one AudioBuffer.
async function decodeRange(track: InputAudioTrack, from: number, to: number): Promise<AudioBuffer> {
  const rate = await track.getSampleRate()
  const channels = await track.getNumberOfChannels()
  const out = new AudioBuffer({
    length: Math.max(1, Math.round((to - from) * rate)),
    numberOfChannels: channels,
    sampleRate: rate,
  })
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
