// Waveforms: each file's loudness over time, read by workers in the background.
import { PEAKS_PER_SEC } from '@/lib/model'
import type { PeaksChunk, PeaksJob } from './peaks.worker'

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
  const workers = Array.from(
    { length: ways },
    () => new Worker(new URL('./peaks.worker.ts', import.meta.url), { type: 'module' }),
  )
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
