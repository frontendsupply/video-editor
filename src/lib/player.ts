// The preview engine: plays the project through media elements onto a canvas, with its own clock.
import {
  drawFrame, laneOf, layerRect, layoutFree, layoutVideo, outputSize, projectDuration, sourceTime,
  type Clip, type Media, type Placed, type Project,
} from '@/lib/model'

const PREVIEW_MAX = 1280 // preview canvas long edge; export always renders full size
const PREROLL = 1 // s: a clip starting this soon already has its element parked at its in-point

// A media element and the clip borrowing it (null = free). key = element tag + source file.
type Slot = { el: HTMLMediaElement; key: string; clip: string | null }

// Preview engine. Clips borrow <video>/<audio> elements (hardware-decoded by the browser) from a pool per source
// file: one for each clip playing now or starting within PREROLL, parked at its in-point so clip changes start
// instantly. Splitting a file into a hundred clips still needs only as many elements as overlap that window.
// Each animation frame the active Video 1 clip, then any active overlay clips (Video 2, 3, …), are drawn onto a
// canvas with the same drawFrame() that export uses. Pictures need no playing: one <img> per file, drawn as it is.
// Runs outside React: no re-renders while playing.
export class Player {
  t = 0
  playing = false
  onTime = (_t: number) => {}
  private watchers = new Set<(t: number) => void>() // more listeners for the time, see watch()
  onPlayingChange = (_playing: boolean) => {}

  private ctx: CanvasRenderingContext2D
  private slots: Slot[] = []
  private pictures = new Map<string, HTMLImageElement>() // by media id
  private media: Record<string, Media> = {}
  private sound = new Set<string>() // clips on audio lanes borrow <audio>, the rest <video>
  private layers: Placed[] = [] // drawn in this order: Video 1, then overlays by lane
  private all: Placed[] = []
  private project: Project | null = null
  private duration = 0
  private wall = 0
  private raf = 0

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  setProject(p: Project, media: Record<string, Media>) {
    this.project = p
    this.media = media
    this.sound = new Set(p.audio.map(c => c.id))
    const overlays = layoutFree(p.overlay).sort((a, b) => laneOf(a.clip) - laneOf(b.clip))
    this.layers = [...layoutVideo(p.video), ...overlays]
    this.all = [...this.layers, ...layoutFree(p.audio)]
    this.duration = projectDuration(p)

    const [W, H] = outputSize(p, media)
    const s = Math.min(1, PREVIEW_MAX / Math.max(W, H))
    const canvas = this.ctx.canvas
    if (canvas.width !== Math.round(W * s) || canvas.height !== Math.round(H * s)) {
      canvas.width = Math.round(W * s)
      canvas.height = Math.round(H * s)
    }

    // Unload the elements of files no clip uses any more.
    const used = new Set(this.all.map(x => this.key(x.clip)))
    for (const { el, key } of this.slots) {
      if (used.has(key)) continue
      el.pause()
      el.removeAttribute('src')
      el.load() // frees the decoder
    }
    this.slots = this.slots.filter(s => used.has(s.key))
    for (const id of this.pictures.keys()) if (!this.all.some(x => x.clip.mediaId === id)) this.pictures.delete(id)

    this.t = Math.min(this.t, this.duration)
    this.sync()
    this.draw()
    this.tick()
  }

  play() {
    if (this.playing || !this.duration) return
    if (this.t >= this.duration) this.t = 0
    this.playing = true
    this.wall = performance.now() - this.t * 1000
    this.onPlayingChange(true)
    this.loop()
  }

  pause() {
    if (!this.playing) return
    this.playing = false
    cancelAnimationFrame(this.raf)
    this.sync()
    this.draw()
    this.tick()
    this.onPlayingChange(false)
  }

  toggle() {
    if (this.playing) this.pause()
    else this.play()
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.duration, t))
    this.wall = performance.now() - this.t * 1000
    this.sync()
    this.draw()
    this.tick()
  }

  private loop = () => {
    this.t = (performance.now() - this.wall) / 1000
    if (this.t >= this.duration) {
      this.t = this.duration
      this.pause()
      return
    }
    this.sync()
    this.draw()
    this.tick()
    this.raf = requestAnimationFrame(this.loop)
  }

  // Wall clock is the master (steady rate, music never stutters). Elements follow it and are only
  // re-seeked on real drift; the ~0.1-0.2s an element needs to start playing stays under the threshold.
  private sync() {
    const t = this.t
    const soon = this.all.filter(pl => !this.media[pl.clip.mediaId].image && pl.start < t + PREROLL && t < pl.end)
    const ids = new Set(soon.map(pl => pl.clip.id))
    for (const s of this.slots) {
      if (!s.clip || ids.has(s.clip)) continue
      s.clip = null // hand it back first, so a clip starting now can take it
      s.el.pause()
    }
    for (const pl of soon) {
      const active = t >= pl.start
      const want = active ? sourceTime(pl, t) : pl.clip.in
      const el = this.borrow(pl.clip, want)
      el.playbackRate = pl.clip.speed // preservesPitch is on by default, same as export
      el.volume = active && !pl.clip.muted ? pl.clip.volume : 0
      if (active && this.playing) {
        if (Math.abs(el.currentTime - want) > (el.paused ? 0.1 : 0.5)) el.currentTime = want
        if (el.paused) el.play().catch(() => {})
      } else {
        if (!el.paused) el.pause()
        if (Math.abs(el.currentTime - want) > 0.01) el.currentTime = want
      }
    }
  }

  private key = (c: Clip) => `${this.sound.has(c.id) ? 'audio' : 'video'} ${c.mediaId}`

  // The element a clip plays from: the one it already has, else the free one of its file parked nearest `at`, else a new one.
  private borrow(c: Clip, at: number) {
    const key = this.key(c)
    let free: Slot | undefined
    for (const s of this.slots) {
      if (s.clip === c.id) return s.el
      if (!s.clip && s.key === key && (!free || Math.abs(s.el.currentTime - at) < Math.abs(free.el.currentTime - at))) free = s
    }
    if (!free) {
      const el = document.createElement(this.sound.has(c.id) ? 'audio' : 'video')
      el.preload = 'auto'
      el.src = this.media[c.mediaId].url
      el.addEventListener('seeked', () => !this.playing && this.draw())
      el.addEventListener('loadeddata', () => !this.playing && this.draw())
      free = { el, key, clip: null }
      this.slots.push(free)
    }
    free.clip = c.id
    return free.el
  }

  // Calls `f` with the time whenever it changes (playing, seeking, a new project); returns the unsubscribe.
  watch(f: (t: number) => void) {
    this.watchers.add(f)
    return () => void this.watchers.delete(f)
  }

  private tick() {
    this.onTime(this.t)
    this.watchers.forEach(f => f(this.t))
  }

  // The topmost picture on screen under a point of the frame (shares of its width and height), for the preview's
  // handles. Its whole box counts, transparent parts too.
  pictureAt(u: number, v: number): Placed | null {
    if (!this.project) return null
    const { width: W, height: H } = this.ctx.canvas
    const on = this.layers.filter(x => this.t >= x.start && this.t < x.end && this.media[x.clip.mediaId].image)
    for (const pl of on.reverse()) {
      const m = this.media[pl.clip.mediaId]
      const r = layerRect(m.width, m.height, W, H, this.project.fit, pl.clip.transform)
      if (u * W >= r.x && u * W <= r.x + r.w && v * H >= r.y && v * H <= r.y + r.h) return pl
    }
    return null
  }

  private picture(id: string) {
    let img = this.pictures.get(id)
    if (!img) {
      img = document.createElement('img')
      img.src = this.media[id].url
      img.onload = () => !this.playing && this.draw()
      this.pictures.set(id, img)
    }
    return img
  }

  private draw() {
    if (!this.project) return
    const active = this.layers.filter(x => this.t >= x.start && this.t < x.end)
    // every active video clip is in sync()'s `soon`, so it holds an element; a picture has its <img>
    const els = active.map(pl =>
      this.media[pl.clip.mediaId].image ? this.picture(pl.clip.mediaId) : (this.slots.find(s => s.clip === pl.clip.id)!.el as HTMLVideoElement),
    )
    const transforms = active.map(pl => pl.clip.transform)
    // mid-seek or still loading: keep the last frame instead of flashing black
    if (els.some(el => (el instanceof HTMLImageElement ? !el.complete : el.readyState < 2))) return
    drawFrame(this.ctx, null, 0, 0, this.project.fit) // black base
    els.forEach((el, i) => {
      const [w, h] = el instanceof HTMLImageElement ? [el.naturalWidth, el.naturalHeight] : [el.videoWidth, el.videoHeight]
      drawFrame(this.ctx, el, w, h, this.project!.fit, false, transforms[i])
    })
  }
}
