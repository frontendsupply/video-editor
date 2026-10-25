// Times as people read them, and the time grid edits land on at a zoom.

// 0:00:02.034: h:mm:ss plus `digits` decimals, rounded at that precision (so 2.034 doesn't print as 2.033)
export function timecode(t: number, digits: 0 | 1 | 3 = 3) {
  const scale = 10 ** digits
  const total = Math.round((Math.max(0, t) || 0) * scale) // NaN shows as 0
  const secs = Math.floor(total / scale)
  const base = `${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  return digits ? `${base}.${String(total % scale).padStart(digits, '0')}` : base
}

// Seconds between ruler labels at a zoom (pixels per second): at least 90 px apart, with a minor tick every fifth.
export const tickStep = (pps: number) => [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 14400].find(s => s * pps >= 90) ?? 28800
// The time grid mouse edits land on at a zoom. Snapping on: the ruler's minor ticks, so times come out round. Off: the
// finest of a frame, 0.1 s, 0.5 s, 1 s, 5 s, … that's at least 3 px wide. Zoomed out, the extra digits would only be
// noise from the mouse position; milliseconds (frames) come in once a frame is wide enough to aim at.
export const gridFor = (pps: number, fps: number, snapping = false) =>
  snapping ? tickStep(pps) / 5 : ([1 / fps, 0.1, 0.5, 1, 5, 10, 30, 60, 300, 600].find(u => u * pps >= 3) ?? 3600)
// Decimals worth showing for times on that grid.
export const digitsFor = (unit: number): 0 | 1 | 3 => (unit >= 1 ? 0 : unit >= 0.1 ? 1 : 3)
// A length: seconds under a minute ("3.28s"), else h:mm:ss.
export const lengthLabel = (s: number, digits: 0 | 1 | 3) =>
  +s.toFixed(Math.min(digits, 2)) < 60 ? `${s.toFixed(Math.min(digits, 2))}s` : timecode(s, digits) // 59.999 is a minute

// A short clock for files and lengths: m:ss.ss, or h:mm:ss.ss from an hour on.
export function clock(t: number) {
  const cs = Math.round(t * 100)
  const m = Math.floor(cs / 6000)
  const ss = `${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
  return m < 60 ? `${m}:${ss}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}`
}
