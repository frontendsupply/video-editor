// The editor's data: files, clips, the project, and the small types the edits pass around.

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

export type Placed = { clip: Clip; start: number; end: number }

// A stretch of the timeline, in seconds (a selection, an exported region)
export type Range = { a: number; b: number }

// Export quality: Original keeps the full output size; the rest cap the short edge and lower the bitrate.
export type ExportPreset = { label: string; hint: string; short?: number; quality: 'high' | 'medium' | 'low' }

// What a split cuts: every track, one kind of track, or one clip (by id). 'video' is Video 1.
export type SplitTarget = 'all' | 'video' | 'overlay' | 'audio' | (string & {})

export type LaneKind = 'overlay' | 'audio'

// Where a file dropped from the bin goes: Video 1, or a free lane of a kind
export type DropTarget = { kind: 'video' } | { kind: LaneKind; lane: number }
