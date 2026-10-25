// Timeline data model + pure timing math. No DOM/runtime imports so it can be checked with plain `node`.

export type Fit = 'contain' | 'cover'
export type Aspect = 'original' | '16:9' | '9:16' | '1:1' | '4:5'

export type Media = {
  id: string
  file: File
  url: string // blob: URL, the file never leaves the machine
  name: string
  duration: number
  width: number // display size after rotation, 0 for audio-only
  height: number
  hasVideo: boolean
  hasAudio: boolean
  thumb?: string
  peaks?: Float32Array // waveform: loudest sample per 1/PEAKS_PER_SEC s, filled in after import (-1 = not read yet)
  peaksDone?: number // share of the audio read into peaks, 0..1 (1 also when reading failed)
  removed?: boolean // taken out of the bin; kept in memory so undo can bring its clips back (which shows it again)
  handle?: FileSystemFileHandle // where the file is on disk (Chromium), to read it again after a reload
  range?: [number, number] // a clip saved from Clip Preview: just this part of the file (source seconds)
  converted?: string // a playable copy made on this device of a file the browser couldn't decode (its folder, see convert.ts)
}

// How long a bin entry is: the whole file, or the part a saved clip covers.
export const binLength = (m: Media) => (m.range ? m.range[1] - m.range[0] : m.duration)

// The same file picked again: name and size match (copies get a new modified time).
export const sameFile = (a: { name: string; size: number }, b: { name: string; size: number }) => a.name === b.name && a.size === b.size

export const PEAKS_PER_SEC = 50
export const MIX_RATE = 48000 // Hz: the exported sound

export type Clip = {
  id: string
  mediaId: string
  start: number // timeline seconds, for free-placed clips (Video 1 is packed back to back)
  lane?: number // free-placed clips: which lane of their kind, 0 = Video 2 / Audio 1
  gap?: number // Video 1: empty seconds before the clip (it moves the clips after it too)
  in: number // source seconds
  out: number
  speed: number
  volume: number // 0..1
  muted?: boolean // a video clip whose sound was unlinked into its own audio clip
}

// Video 1 is magnetic. Overlay clips (Video 2, 3, …) and audio clips (Audio 1, 2, …) are placed freely in lanes.
// A video clip carries its own sound until it's unlinked. Higher video lanes draw on top.
export type Project = {
  video: Clip[]
  overlay: Clip[]
  audio: Clip[]
  overlayTracks: number // number of Video 2+ lanes (0 = only Video 1)
  audioTracks: number // number of audio lanes (at least 1)
  aspect: Aspect
  fit: Fit
  fps: number
  // Clips of files unchecked in the bin, set aside with where they were (start = timeline time) until it's checked again.
  parked?: { track: 'video' | 'overlay' | 'audio'; clip: Clip }[]
  // Tracks the user renamed, by trackKey; the rest keep their default name.
  names?: Record<string, string>
}

export const emptyProject = (): Project => ({
  video: [], overlay: [], audio: [], overlayTracks: 0, audioTracks: 1, aspect: 'original', fit: 'contain', fps: 30,
})

export const laneOf = (c: Clip) => c.lane ?? 0

export type Placed = { clip: Clip; start: number; end: number }

export const clipLength = (c: Clip) => (c.out - c.in) / c.speed

// 0:00:02.034: h:mm:ss plus `digits` decimals, rounded at that precision (so 2.034 doesn't print as 2.033)
export function timecode(t: number, digits: 0 | 1 | 3 = 3) {
  const scale = 10 ** digits
  const total = Math.round(Math.max(0, t) * scale)
  const secs = Math.floor(total / scale)
  const base = `${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  return digits ? `${base}.${String(total % scale).padStart(digits, '0')}` : base
}

// Seconds between ruler labels at a zoom (pixels per second): at least 90 px apart, with a minor tick every fifth.
export const tickStep = (pps: number) => [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(s => s * pps >= 90) ?? 1200
// The time grid mouse edits land on at a zoom. Snapping on: the ruler's minor ticks, so times come out round. Off: the
// finest of a frame, 0.1 s, 0.5 s, 1 s, 5 s, … that's at least 3 px wide. Zoomed out, the extra digits would only be
// noise from the mouse position; milliseconds (frames) come in once a frame is wide enough to aim at.
export const gridFor = (pps: number, fps: number, snapping = false) =>
  snapping ? tickStep(pps) / 5 : ([1 / fps, 0.1, 0.5, 1, 5, 10, 30, 60, 300, 600].find(u => u * pps >= 3) ?? 3600)
// Decimals worth showing for times on that grid.
export const digitsFor = (unit: number): 0 | 1 | 3 => (unit >= 1 ? 0 : unit >= 0.1 ? 1 : 3)
// A length: seconds under a minute ("3.28s"), else h:mm:ss.
export const lengthLabel = (s: number, digits: 0 | 1 | 3) => (s < 60 ? `${s.toFixed(Math.min(digits, 2))}s` : timecode(s, digits))

// Video 1 is magnetic: clips play in array order, each right after the one before it plus its own gap.
export function layoutVideo(video: Clip[]): Placed[] {
  let t = 0
  return video.map(clip => {
    const start = t + (clip.gap ?? 0)
    t = start + clipLength(clip)
    return { clip, start, end: t }
  })
}

// Rebuild Video 1 from wanted start times, in order: each clip starts at its wanted time or right after the clip before
// it, whichever is later (so nothing overlaps), and the empty space before it becomes its gap.
function packVideo(items: { clip: Clip; start: number }[]): Clip[] {
  let end = 0
  return items.map(({ clip, start }) => {
    const s = Math.max(end, start)
    const gap = s - end > 1e-6 ? s - end : undefined
    end = s + clipLength(clip)
    return { ...clip, gap }
  })
}

// Take a clip out of Video 1: the clips after it close up its length, the empty space before it stays.
function withoutVideo(video: Clip[], id: string): Clip[] {
  const out = layoutVideo(video).find(x => x.clip.id === id)
  if (!out) return video
  const len = out.end - out.start
  return packVideo(layoutVideo(video).filter(x => x !== out && x.clip.id !== id).map(x => ({ clip: x.clip, start: x.start >= out.end ? x.start - len : x.start })))
}

// Put a clip into Video 1 at time t, slotted between the clips by where `at` lands (by default its middle). It never
// starts before the clip in front of it ends or after the clip behind it starts; that one is pushed later only if
// they'd overlap.
function insertVideo(video: Clip[], clip: Clip, t: number, at = t + clipLength(clip) / 2): Clip[] {
  const placed = layoutVideo(video)
  const k = placed.filter(x => (x.start + x.end) / 2 < at).length
  const start = Math.max(k ? placed[k - 1].end : 0, Math.min(t, placed[k]?.start ?? Infinity))
  return packVideo([...placed.slice(0, k), { clip: { ...clip, lane: undefined }, start }, ...placed.slice(k)])
}

// Put a clip back into Video 1 at time t, the exact inverse of taking it out: everything from t on moves right by its
// length. (If something has since come to overlap t, the clip goes right after it.)
function restoreVideo(video: Clip[], clip: Clip, t: number): Clip[] {
  const len = clipLength(clip)
  const items = layoutVideo(video).map(x => ({ clip: x.clip, start: x.start >= t - 1e-6 ? x.start + len : x.start }))
  const k = items.filter(x => x.start < t - 1e-6).length
  return packVideo([...items.slice(0, k), { clip, start: t }, ...items.slice(k)])
}

// Slide a Video 1 clip so it starts at `start` (not before the clip in front of it ends); the clips after it ride along.
export function slideVideoClip(p: Project, id: string, start: number): Project {
  const placed = layoutVideo(p.video)
  const i = placed.findIndex(x => x.clip.id === id)
  if (i < 0) return p
  const gap = start - (i ? placed[i - 1].end : 0)
  return updateClip(p, id, { gap: gap > 1e-6 ? gap : undefined })
}

// Overlay and audio lanes: each clip sits at its own start.
export const layoutFree = (clips: Clip[]): Placed[] =>
  clips.map(clip => ({ clip, start: clip.start, end: clip.start + clipLength(clip) }))

export const layoutAll = (p: Project) => [...layoutVideo(p.video), ...layoutFree(p.overlay), ...layoutFree(p.audio)]

export const projectDuration = (p: Project) => Math.max(0, ...layoutAll(p).map(x => x.end))

export const sourceTime = (pl: Placed, t: number) => pl.clip.in + (t - pl.start) * pl.clip.speed


const PRESETS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] } as const

export function outputSize(p: Project, media: Record<string, { width: number; height: number }>): [number, number] {
  if (p.aspect !== 'original') return [...PRESETS[p.aspect]]
  const m = media[p.video[0]?.mediaId]
  return m ? [m.width & ~1, m.height & ~1] : [1920, 1080] // encoders want even sizes
}

// Export quality: Original keeps the full output size; the rest cap the short edge and lower the bitrate.
export type ExportPreset = { label: string; hint: string; short?: number; quality: 'high' | 'medium' | 'low' }
export const EXPORT_PRESETS: ExportPreset[] = [
  { label: 'Original', hint: 'Best quality', quality: 'high' },
  { label: '1080p', hint: 'High quality', short: 1080, quality: 'high' },
  { label: '720p', hint: 'Smaller file', short: 720, quality: 'medium' },
  { label: '480p', hint: 'Smallest file', short: 480, quality: 'low' },
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

// ---- edits (all return a new Project) ----

export const newClip = (m: Media, start = 0): Clip => ({
  id: crypto.randomUUID(),
  mediaId: m.id,
  start,
  in: m.range?.[0] ?? 0,
  out: m.range?.[1] ?? m.duration,
  speed: 1,
  volume: 1,
})

const mapClips = (p: Project, f: (c: Clip) => Clip[]): Project => ({
  ...p,
  video: p.video.flatMap(f),
  overlay: p.overlay.flatMap(f),
  audio: p.audio.flatMap(f),
})

export const updateClip = (p: Project, id: string, patch: Partial<Clip>) =>
  mapClips(p, c => (c.id === id ? [{ ...c, ...patch }] : [c]))

export const removeClip = (p: Project, id: string) => ({ ...mapClips(p, c => (c.id === id ? [] : [c])), video: withoutVideo(p.video, id) })

export const findPlaced = (p: Project, id: string | null) => layoutAll(p).find(x => x.clip.id === id)

// What a split cuts: every track, one kind of track, or one clip (by id). 'video' is Video 1.
export type SplitTarget = 'all' | 'video' | 'overlay' | 'audio' | (string & {})
const EDGE = 0.05 // never leave slivers shorter than this at a clip edge

// Cut every targeted clip that t falls inside. Timeline positions don't change.
export function splitAt(p: Project, t: number, which: SplitTarget = 'all'): Project {
  const cuts = new Map<Clip, Clip[]>()
  const visit = (track: 'video' | 'overlay' | 'audio') => (x: Placed) => {
    if (which !== 'all' && which !== track && which !== x.clip.id) return
    if (t <= x.start + EDGE || t >= x.end - EDGE) return
    const at = sourceTime(x, t)
    cuts.set(x.clip, [
      { ...x.clip, out: at },
      { ...x.clip, id: crypto.randomUUID(), in: at, start: t, gap: undefined }, // on Video 1 it follows straight on
    ])
  }
  layoutVideo(p.video).forEach(visit('video'))
  layoutFree(p.overlay).forEach(visit('overlay'))
  layoutFree(p.audio).forEach(visit('audio'))
  return cuts.size ? mapClips(p, c => cuts.get(c) ?? [c]) : p
}

export const splitRange = (p: Project, a: number, b: number, which: SplitTarget = 'all') =>
  splitAt(splitAt(p, a, which), b, which)

// Remove [a, b) from every track and close the gap.
export function rippleDelete(p: Project, a: number, b: number): Project {
  const q = splitRange(p, a, b)
  const inside = (x: Placed) => x.start >= a - EDGE && x.end <= b + EDGE
  const free = (clips: Clip[]) =>
    layoutFree(clips)
      .filter(x => !inside(x))
      .map(x => (x.start >= b - EDGE ? { ...x.clip, start: Math.max(0, x.clip.start - (b - a)) } : x.clip))
  return {
    ...q,
    video: packVideo(layoutVideo(q.video).filter(x => !inside(x)).map(x => ({ clip: x.clip, start: x.start >= b - EDGE ? x.start - (b - a) : x.start }))),
    overlay: free(q.overlay),
    audio: free(q.audio),
  }
}

// Keep only [a, b] of every track: everything after b and before a is cut away, and what's left starts at 0.
export const cropRange = (p: Project, a: number, b: number) => rippleDelete(rippleDelete(p, b, projectDuration(p)), 0, a)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MIN_LEN = 0.1

// Drag a clip edge by d timeline-seconds. anchor=true (audio track) keeps content in place when trimming the left edge.
export function trimClip(c: Clip, edge: 'in' | 'out', d: number, mediaDuration: number, anchor: boolean): Clip {
  if (edge === 'out') return { ...c, out: clamp(c.out + d * c.speed, c.in + MIN_LEN * c.speed, mediaDuration) }
  const lo = anchor ? Math.max(0, c.in - c.start * c.speed) : 0
  const inn = clamp(c.in + d * c.speed, lo, c.out - MIN_LEN * c.speed)
  return { ...c, in: inn, start: anchor ? c.start + (inn - c.in) / c.speed : c.start }
}

// Drag a Video 1 clip's left edge by d timeline-seconds: its start moves into (or back out of) the gap in front of it,
// while its end and every clip after it stay put. It can't grow past the clip in front.
export function trimVideoIn(c: Clip, d: number, mediaDuration: number): Clip {
  const t = trimClip({ ...c, start: c.gap ?? 0 }, 'in', d, mediaDuration, true)
  return { ...c, in: t.in, gap: t.start > 1e-6 ? t.start : undefined }
}

// Free clips (overlay / audio) move in time and across lanes of their kind. Video 1 clips slide or move with slideVideoClip / moveVideoClip.
export function moveClip(p: Project, id: string, d: number, laneDelta = 0): Project {
  const kind = p.overlay.some(c => c.id === id) ? 'overlay' : 'audio'
  const c = p[kind].find(c => c.id === id)!
  const lanes = kind === 'overlay' ? p.overlayTracks : p.audioTracks
  return updateClip(p, id, { start: Math.max(0, c.start + d), lane: clamp(laneOf(c) + laneDelta, 0, lanes - 1) })
}

// Move a video clip to Video 1 (lane -1, also within it) or an overlay lane so it starts at timeline time t.
// Leaving its place on Video 1 closes up its length; on Video 1 it slots in by where its middle lands, at t if there's room.
export function moveVideoClip(p: Project, id: string, lane: number, t: number): Project {
  const clip = p.video.find(c => c.id === id) ?? p.overlay.find(c => c.id === id)
  if (!clip) return p
  const rest = { ...p, video: withoutVideo(p.video, id), overlay: p.overlay.filter(c => c.id !== id) }
  if (lane >= 0) return { ...rest, overlay: [...rest.overlay, { ...clip, start: Math.max(0, t), lane, gap: undefined }] }
  return { ...rest, video: insertVideo(rest.video, clip, Math.max(0, t)) }
}

// Move a video clip's sound into its own audio clip, at the same time on the first audio lane that's free there
// (a new lane if none is), and mute the video clip. From then on they move, trim and split separately.
export function unlinkAudio(p: Project, id: string): Project {
  const pl = layoutAll(p).find(x => x.clip.id === id)
  if (!pl || p.audio.includes(pl.clip) || pl.clip.muted) return p
  const taken = (l: number) => layoutFree(p.audio).some(x => laneOf(x.clip) === l && x.start < pl.end && pl.start < x.end)
  let lane = 0
  while (lane < p.audioTracks && taken(lane)) lane++
  return {
    ...updateClip(p, id, { muted: true }),
    audio: [...p.audio, { ...pl.clip, id: crypto.randomUUID(), start: pl.start, lane, gap: undefined }],
    audioTracks: Math.max(p.audioTracks, lane + 1),
  }
}

// ---- snapping ----

// Where a dragged edge can lock on: every clip's start and end on every track, 0, and any extra times (the playhead).
export function snapPoints(p: Project, skip: (c: Clip) => boolean, extra: number[] = []): number[] {
  const points = new Set([0, ...extra])
  for (const x of layoutAll(p)) if (!skip(x.clip)) points.add(x.start).add(x.end)
  return [...points]
}

// The nearest point within `tol` of any moving edge: how far to shift so they line up, and where the guide goes.
export function snapShift(edges: number[], points: number[], tol: number): { shift: number; at: number | null } {
  let best = { shift: 0, at: null as number | null }
  let dist = tol
  for (const e of edges)
    for (const pt of points)
      if (Math.abs(pt - e) <= dist) {
        dist = Math.abs(pt - e)
        best = { shift: pt - e, at: pt }
      }
  return best
}

export type LaneKind = 'overlay' | 'audio'

export const addTrack = (p: Project, kind: LaneKind): Project =>
  kind === 'overlay' ? { ...p, overlayTracks: p.overlayTracks + 1 } : { ...p, audioTracks: p.audioTracks + 1 }

// Remove a lane and its clips; lanes above it move down one, taking their names along.
export function removeTrack(p: Project, kind: LaneKind, lane: number): Project {
  const clips = p[kind].filter(c => laneOf(c) !== lane).map(c => (laneOf(c) > lane ? { ...c, lane: laneOf(c) - 1 } : c))
  const k = kind[0]
  const names = Object.fromEntries(
    Object.entries(p.names ?? {}).flatMap(([key, n]) => {
      const l = Number(key.slice(1))
      return key[0] !== k ? [[key, n]] : l === lane ? [] : [[l > lane ? `${k}${l - 1}` : key, n]]
    }),
  )
  return kind === 'overlay'
    ? { ...p, overlay: clips, overlayTracks: Math.max(0, p.overlayTracks - 1), names }
    : { ...p, audio: clips, audioTracks: Math.max(1, p.audioTracks - 1), names }
}

// Track names: 'v1' is Video 1, 'o<lane>' the overlays (Video 2, 3, …), 'a<lane>' Audio 1, 2, …
export const trackKey = (kind: 'video' | LaneKind, lane = 0) => (kind === 'video' ? 'v1' : `${kind[0]}${lane}`)
const defaultName = (key: string) => (key === 'v1' ? 'Video 1' : `${key[0] === 'o' ? 'Video' : 'Audio'} ${Number(key.slice(1)) + (key[0] === 'o' ? 2 : 1)}`)
export const trackName = (p: Project, key: string) => p.names?.[key] ?? defaultName(key)
// An empty name (or the default one) goes back to the default.
export function renameTrack(p: Project, key: string, name: string): Project {
  const { [key]: _, ...names } = p.names ?? {}
  const n = name.trim()
  return { ...p, names: n && n !== defaultName(key) ? { ...names, [key]: n } : names }
}

// Drop a media file on a lane at timeline time t. On Video 1 it slots in between the clips nearest t.
export type DropTarget = { kind: 'video' } | { kind: LaneKind; lane: number }
export function placeClip(p: Project, m: Media, target: DropTarget, t: number): Project {
  if (target.kind === 'video') {
    return { ...p, video: insertVideo(p.video, newClip(m), Math.max(0, t), t) }
  }
  return { ...p, [target.kind]: [...p[target.kind], { ...newClip(m, Math.max(0, t)), lane: target.lane }] }
}

// Where a new sound goes on Audio 1: right after the last clip there.
export const audio1End = (p: Project) => Math.max(0, ...layoutFree(p.audio.filter(c => !laneOf(c))).map(x => x.end))

// Uncheck a file in the bin: take its clips off the timeline (Video 1 closes up as when deleting them) but set them
// aside with where they were, so checking it again puts them back.
export function parkMedia(p: Project, mediaId: string): Project {
  const mine = (c: Clip) => c.mediaId === mediaId
  const parked = [
    ...layoutVideo(p.video).filter(x => mine(x.clip)).map(x => ({ track: 'video' as const, clip: { ...x.clip, start: x.start } })),
    ...p.overlay.filter(mine).map(clip => ({ track: 'overlay' as const, clip })),
    ...p.audio.filter(mine).map(clip => ({ track: 'audio' as const, clip })),
  ]
  if (!parked.length) return p
  const q = parked.reduce((q, x) => removeClip(q, x.clip.id), p)
  return { ...q, parked: [...(p.parked ?? []).filter(x => !mine(x.clip)), ...parked] }
}

// Check a file in the bin: put its set-aside clips back where they were (Video 1 clips slot in at their old times, the
// others return to their tracks, re-adding a track if it was removed since). A file that was never on the timeline is
// added whole, as an import would: a video at the end of Video 1, a sound after the last clip on Audio 1.
export function unparkMedia(p: Project, m: Media): Project {
  const mine = (p.parked ?? []).filter(x => x.clip.mediaId === m.id)
  const rest = { ...p, parked: (p.parked ?? []).filter(x => x.clip.mediaId !== m.id) }
  if (!mine.length) return m.hasVideo ? { ...rest, video: [...rest.video, newClip(m)] } : { ...rest, audio: [...rest.audio, newClip(m, audio1End(rest))] }
  const back = (track: 'video' | 'overlay' | 'audio') => mine.filter(x => x.track === track).map(x => x.clip)
  const video = back('video').sort((a, b) => a.start - b.start).reduce((v, c) => restoreVideo(v, c, c.start), rest.video)
  const [overlay, audio] = [back('overlay'), back('audio')]
  return {
    ...rest,
    video,
    overlay: [...rest.overlay, ...overlay],
    audio: [...rest.audio, ...audio],
    overlayTracks: Math.max(rest.overlayTracks, ...overlay.map(c => laneOf(c) + 1)),
    audioTracks: Math.max(rest.audioTracks, ...audio.map(c => laneOf(c) + 1)),
  }
}
