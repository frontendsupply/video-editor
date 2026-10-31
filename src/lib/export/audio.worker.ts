// Saving one clip's sound as an audio file runs here, off the page: reading through a long file's packets would
// otherwise hold up the editor for seconds (see saveClipAudio in export.ts).
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny'

export type AudioJob = { file: File; start: number; end: number; handle: FileSystemFileHandle | null } // start–end: source seconds
export type ToAudioWorker = { type: 'start'; job: AudioJob } | { type: 'cancel' }
export type FromAudioWorker =
  | { type: 'progress'; fraction: number } // posted once per percent
  | { type: 'done'; buffer: ArrayBuffer | null }
  | { type: 'error'; message: string }

const post = (m: FromAudioWorker, transfer: Transferable[] = []) => postMessage(m, { transfer })
const stop = new AbortController() // one job per worker
const SLICE = 60 // seconds of output per run, see below

onmessage = async ({ data }: MessageEvent<ToAudioWorker>) => {
  if (data.type === 'cancel') return stop.abort()
  const { file, start, end, handle } = data.job
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  const stream = handle && (await handle.createWritable())
  const target = stream
    ? new StreamTarget(new WritableStream({ write: chunk => stream.write(chunk) }), { chunked: true })
    : new BufferTarget()
  try {
    const output = new Output({ format: new Mp4OutputFormat(), target })
    // The sound is copied as it is where the format allows (nearly always), otherwise re-encoded.
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      trim: { start, end },
      showWarnings: false,
    })
    if (!conversion.isValid) throw new Error("This browser can't write this file's audio format.")
    let pct = -1
    conversion.onProgress = f =>
      Math.floor(f * 100) !== pct && post({ type: 'progress', fraction: (pct = Math.floor(f * 100)) / 100 })
    stop.signal.throwIfAborted()
    stop.signal.addEventListener('abort', () => (stream?.abort().catch(() => {}), conversion.cancel()))
    // A slice at a time, giving the message queue a turn in between: the copy otherwise runs straight through, and a
    // cancel would only get in once it was done.
    for (let until = SLICE; conversion.state !== 'done'; until += SLICE) {
      await conversion.execute({ until })
      await new Promise(r => setTimeout(r))
      stop.signal.throwIfAborted()
    }
    await stream?.close()
    const buffer = stream ? null : (target as BufferTarget).buffer!
    post({ type: 'done', buffer }, buffer ? [buffer] : [])
  } catch (e) {
    await stream?.abort().catch(() => {}) // no half-written file on disk (on cancel, already let go of)
    post({ type: 'error', message: (e as Error).message })
  } finally {
    input.dispose()
  }
}
