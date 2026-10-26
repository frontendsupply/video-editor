import { useLayoutEffect, useRef } from 'react'
import { PEAKS_PER_SEC } from '@/lib/model'
import { cssColor, useDark } from '@/lib/theme'
import { TILE } from './constants'

// Mirrored peak bars for source seconds [from, to], stretched over `width` px. Only the tiles inside `view` (clip px) exist.
export function Waveform(props: { peaks: Float32Array; done: number; from: number; to: number; width: number; view: [number, number] }) {
  const first = Math.max(0, Math.floor(props.view[0] / TILE))
  const last = Math.min(Math.ceil(props.width / TILE), Math.ceil(props.view[1] / TILE))
  return Array.from({ length: Math.max(0, last - first) }, (_, k) => <WaveTile key={first + k} {...props} x={(first + k) * TILE} />)
}

// One TILE of a waveform, from clip px x. Redraws when its range, the zoom, the share read (`done`) or the theme changes.
function WaveTile({ peaks, done, from, to, width, x }: { peaks: Float32Array; done: number; from: number; to: number; width: number; x: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const w = Math.min(TILE, width - x)
  const dark = useDark()
  useLayoutEffect(() => {
    const c = ref.current!
    const W = Math.round(w * devicePixelRatio)
    const H = Math.round(c.clientHeight * devicePixelRatio)
    if (!W || !H) return
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.fillStyle = cssColor('--color-audio')
    g.globalAlpha = 0.5
    const perPx = ((to - from) * PEAKS_PER_SEC) / width // peak buckets per css px
    const a = from * PEAKS_PER_SEC + x * perPx
    const per = (w * perPx) / W // peak buckets per canvas column
    g.clearRect(0, 0, W, H)
    for (let i = 0; i < W; i++) {
      let v = -1 // stays -1 where nothing is read yet: leave the column empty
      for (let j = Math.floor(a + i * per), e = Math.max(j + 1, Math.ceil(a + (i + 1) * per)); j < e; j++) v = Math.max(v, peaks[j] ?? -1)
      if (v < 0) continue
      const h = Math.max(devicePixelRatio, v * H * 0.9)
      g.fillRect(i, (H - h) / 2, 1, h)
    }
  }, [peaks, done, from, to, width, x, w, dark])
  return <canvas ref={ref} className="absolute inset-y-0 h-full" style={{ left: x, width: w }} />
}
