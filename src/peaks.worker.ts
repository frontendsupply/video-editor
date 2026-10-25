// Reads one slice [from, to) of a file's audio into waveform peaks, off the main thread. computePeaks() runs a few
// of these in parallel. Posts the buckets that are final every ~250 ms, then the rest with done: true.
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny'
import { PEAKS_PER_SEC } from './model'

export type PeaksJob = { file: File; from: number; to: number }
export type PeaksChunk = { at: number; values: Float32Array; read: number; done: boolean } | { error: string }

onmessage = async ({ data: { file, from, to } }: MessageEvent<PeaksJob>) => {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const track = (await input.getPrimaryAudioTrack())!
    const first = Math.floor(from * PEAKS_PER_SEC)
    const peaks = new Float32Array(Math.ceil(to * PEAKS_PER_SEC) + 1 - first)
    let plane = new Float32Array(0)
    let sent = 0
    let shown = performance.now()
    const post = (upTo: number, read: number, done: boolean) => {
      const values = peaks.slice(sent, upTo)
      postMessage({ at: first + sent, values, read, done } satisfies PeaksChunk, { transfer: [values.buffer] })
      sent = upTo
    }
    for await (const s of new AudioSampleSink(track).samples(from, to)) {
      if (plane.length < s.numberOfFrames) plane = new Float32Array(s.numberOfFrames)
      for (let c = 0; c < s.numberOfChannels; c++) {
        s.copyTo(plane, { planeIndex: c, format: 'f32-planar' })
        for (let i = 0; i < s.numberOfFrames; i += 4) { // every 4th sample is plenty for a peak meter
          const b = Math.floor((s.timestamp + i / s.sampleRate) * PEAKS_PER_SEC) - first
          const v = Math.abs(plane[i])
          if (b >= 0 && b < peaks.length && v > peaks[b]) peaks[b] = v
        }
      }
      const read = Math.min(to, s.timestamp + s.duration) - from
      const final = Math.floor(s.timestamp * PEAKS_PER_SEC) - first // later samples can't touch buckets before this one
      s.close()
      if (performance.now() - shown > 250 && final > sent) {
        shown = performance.now()
        post(final, read, false)
      }
    }
    post(peaks.length, to - from, true)
  } catch (e) {
    postMessage({ error: String(e) } satisfies PeaksChunk)
  } finally {
    input.dispose()
  }
}
