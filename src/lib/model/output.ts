// The frame the edit is shown and exported in, the export presets, and drawing one layer of a frame.
import { projectDuration } from './layout.ts'
import type { ExportPreset, Fit, Project } from './types.ts'
import { layoutVideo } from './video1.ts'

export const MIX_RATE = 48000 // Hz: the exported sound

const PRESETS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] } as const

export function outputSize(p: Project, media: Record<string, { width: number; height: number }>): [number, number] {
  if (p.aspect !== 'original') return [...PRESETS[p.aspect]]
  const m = media[p.video[0]?.mediaId]
  return m ? [m.width & ~1, m.height & ~1] : [1920, 1080] // encoders want even sizes
}

// The frame rates offered. A new project takes the one nearest its first video's, so that a plain cut of it can be
// copied as it is (see plainCuts) instead of every frame being re-encoded.
export const FRAME_RATES = [24, 25, 30, 60]
export const nearestRate = (fps: number) => FRAME_RATES.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a))

// Export quality: Original keeps the full output size; the rest cap the short edge and lower the bitrate.

export const EXPORT_PRESETS: ExportPreset[] = [
  { label: 'Original', quality: 'high' },
  { label: '1080p', short: 1080, quality: 'high' },
  { label: '720p', short: 720, quality: 'medium' },
]

export function exportSize(p: Project, media: Record<string, { width: number; height: number }>, short?: number): [number, number] {
  const [W, H] = outputSize(p, media)
  const s = short ? Math.min(1, short / Math.min(W, H)) : 1
  return [Math.round(W * s) & ~1, Math.round(H * s) & ~1]
}

export function fitRect(sw: number, sh: number, W: number, H: number, fit: Fit) {
  const s = fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)
  const w = sw * s
  const h = sh * s
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}

// One layer of the composition. Shared by preview and export: what you see is what you export.
// The base layer clears to black; overlays (clear = false) draw on top, so their bars show the layer below.
export function drawFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  src: CanvasImageSource | null,
  sw: number,
  sh: number,
  fit: Fit,
  clear = true,
) {
  const { width: W, height: H } = ctx.canvas
  if (clear) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
  }
  if (!src || !sw || !sh) return
  const r = fitRect(sw, sh, W, H, fit)
  ctx.drawImage(src, r.x, r.y, r.w, r.h)
}

// An edit whose video could be copied as it is, without re-encoding: Video 1 only, at normal speed, with no gaps, and
// the video lasting as long as the edit. (Whether the files allow it is checked in export.worker.ts.)
export const plainCuts = (p: Project) =>
  p.video.length > 0 &&
  !p.overlay.length &&
  p.video.every(c => c.speed === 1 && !c.gap) &&
  layoutVideo(p.video).at(-1)!.end >= projectDuration(p) - 1e-6
