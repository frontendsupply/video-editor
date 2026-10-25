import { ALL_FORMATS, BlobSource, CanvasSink, Input, UnsupportedInputFormatError, type InputVideoTrack } from 'mediabunny'
import { PEAKS_PER_SEC, type Media } from './model'
import type { PeaksChunk, PeaksJob } from './peaks.worker'

// A file this browser can't fully decode: convert.ts makes a playable copy, re-encoding the video, or (when only the
// sound is the problem) just the sound.
export class NeedsConversion extends Error {
  video: 'encode' | 'copy'
  constructor(video: 'encode' | 'copy') {
    super("this browser can't decode it")
    this.video = video
  }
}

// Probe a local file. Only the bytes needed are read (headers + one frame), never the whole file.
export async function importFile(file: File): Promise<Media> {
  if (!file.size) throw new Error('the file is empty')
  if (file.type.startsWith('image/')) throw new Error("pictures aren't supported, only video and sound")
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]).catch(e => {
      if (!(e instanceof UnsupportedInputFormatError)) throw e
      // A container it can't read, like AVI, goes to the converter; a file that isn't media at all doesn't.
      if (file.type && !/^(video|audio)\//.test(file.type)) throw new Error("it isn't a video or sound file")
      throw new NeedsConversion('encode')
    })
    if (!video && !audio) throw new Error('no video or sound found in it (it may be damaged, or still being written)')
    if (video && !(await video.canDecode())) throw new NeedsConversion('encode')
    if (audio && !(await audio.canDecode())) throw new NeedsConversion('copy')
    const duration = await input.computeDuration()
    const media: Media = {
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      duration,
      width: video ? await video.getDisplayWidth() : 0,
      height: video ? await video.getDisplayHeight() : 0,
      hasVideo: !!video,
      hasAudio: !!audio,
    }
    if (video) media.thumb = await frameAt(video, Math.min(1, duration / 2))
    return media
  } finally {
    input.dispose()
  }
}

// A small JPEG of the frame at `t` (a blob: URL), for bin cards.
const frameAt = async (video: InputVideoTrack, t: number) => {
  const frame = await new CanvasSink(video, { height: 96 }).getCanvas(t)
  return frame ? URL.createObjectURL(await toBlob(frame.canvas)) : undefined
}
export async function thumbnail(file: File, t: number) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    return video ? await frameAt(video, t) : undefined
  } finally {
    input.dispose()
  }
}

// Loudest |sample| per 1/PEAKS_PER_SEC s, for waveforms (a 3-minute file is ~9k floats). Runs after import so the
// clip appears immediately. Workers read the audio, a long file as parallel slices, so it scales with cores and the
// UI never waits. Buckets not read yet are -1; onProgress(peaks, share read) fires as the slices report in.
export function computePeaks(
  file: File,
  duration: number,
  onProgress: (peaks: Float32Array, done: number) => void,
  ways = Math.max(1, Math.min(8, Math.floor(duration / 30), (navigator.hardwareConcurrency || 4) - 2)), // spare 2 cores for the UI
): Promise<Float32Array> {
  const peaks = new Float32Array(Math.ceil(duration * PEAKS_PER_SEC) + 1).fill(-1)
  const read = new Float64Array(ways) // seconds read per slice
  const workers = Array.from({ length: ways }, () => new Worker(new URL('./peaks.worker.ts', import.meta.url), { type: 'module' }))
  let shown = 0
  return new Promise<Float32Array>((resolve, reject) => {
    let left = ways
    workers.forEach((w, k) => {
      w.onmessage = ({ data }: MessageEvent<PeaksChunk>) => {
        if ('error' in data) return reject(new Error(data.error))
        data.values.forEach((v, i) => v > peaks[data.at + i] && (peaks[data.at + i] = v)) // slices share their edge bucket
        read[k] = data.read
        if (data.done && !--left) return resolve(peaks.map(v => Math.max(0, v))) // silence where no sample landed
        if (performance.now() - shown < 250) return
        shown = performance.now()
        onProgress(peaks, read.reduce((a, b) => a + b, 0) / duration)
      }
      w.onerror = e => reject(new Error(e.message))
      w.postMessage({ file, from: (duration * k) / ways, to: (duration * (k + 1)) / ways } satisfies PeaksJob)
    })
  }).finally(() => workers.forEach(w => w.terminate()))
}

const toBlob = (c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> =>
  c instanceof OffscreenCanvas
    ? c.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
    : new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('thumbnail failed'))), 'image/jpeg', 0.7))
