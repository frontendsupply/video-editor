// Timeline sizes and limits, shared with the zoom controls and the media bin.

// dataTransfer type for dragging a media item from the bin onto a lane
export const MEDIA_MIME = 'application/x-editor-media'

export const HEAD = 112 // the track-name column (w-28), pinned on the left while the lanes scroll under it
export const ROOM = 160 // px past the last clip: the "+" tile and room to drag
export const FIT = 0.9 // fully zoomed out, the whole edit fills this much of the visible timeline
// Pixels per second at which the whole edit fills FIT of the visible timeline: the zoom-out limit.
export const zoomToFit = (viewW: number, duration: number) => (FIT * viewW) / duration
export const STEP = { overlay: 56 + 6, audio: 36 + 6 } // lane height + gap: how far a clip moves to change lane
export const SNAP_PX = 8 // edges within this many screen pixels lock together, at any zoom
// The ruler and waveforms only render TILE-wide pieces near the visible part, so a 4-hour clip at full zoom
// (millions of px wide) costs the same as a short one. Scrolling re-renders once per tile crossed.
export const TILE = 1024
