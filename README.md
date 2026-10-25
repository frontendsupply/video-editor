# Local Video Editor

Browser video editor that never uploads anything. Files are read straight from disk, and decoding/encoding runs on the GPU's hardware video engine.

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # timeline model self-check
pnpm build
```

Browser smoke test (generates clips, edits, exports, verifies the MP4): with the dev server open, run `await (await import('/test/e2e.js')).run()` in the devtools console.

## Why it's fast

| Choice | Why |
|---|---|
| **WebCodecs** for decoding and encoding | Runs on the hardware video engine, with no download and no memory cap |
| Lazy reads from the file on disk | A 5 GB file costs a few MB of RAM |
| `<video>` elements drawn to a `<canvas>` for preview | Native hardware playback; the next clip is pre-parked at its in-point for instant cuts |
| Playback loop outside React | Playhead and clock are written straight to the DOM: zero re-renders while playing |
| Shared `drawFrame()` | What you see in the preview is exactly what you export |
| Decode straight to output size | 4K sources stay cheap when exporting 1080p |
| Audio mixed (`OfflineAudioContext`) in parallel with video encoding | Export time ≈ video encode time |
| Stream to disk (`showSaveFilePicker`, Chrome/Edge) | Long exports don't fill RAM; cancel discards the partial file |
| Timeline renders only what's near the view | Zooming into a multi-hour clip costs the same as a short one |
| Waveforms read in Web Workers, in parallel slices | A 4-hour file's waveform is ready in seconds without blocking the UI |

## Files

- `src/model.ts`: project data, timing math, edits (split/ripple delete/crop/trim/move/gaps), timecode, `drawFrame`. Pure, no DOM.
- `src/history.ts`: undo/redo state hook (one gesture is one step).
- `src/media.ts`: probe an imported file (tracks, size, duration, thumbnail) and read its waveform.
- `src/peaks.worker.ts`: reads one slice of a file's audio into waveform peaks, off the main thread.
- `src/player.ts`: preview engine (media elements + canvas + clock).
- `src/export.ts`: MP4 export (video render, audio mix, pitch-preserving speed).
- `src/main.tsx`, `src/Timeline.tsx`: UI.
- `src/ui.tsx`: UI primitives (Select, Segmented, Slider, Tooltip, Toast, export quality list) and shared class strings.
- `src/styles.css`: theme tokens and base styles; `src/fonts`: the variable UI font.

## Features

Import (drag-drop/picker) into a tabbed media bin. Each file's checkbox shows whether it's on the timeline: uncheck it to set its clips aside (cuts, trims, speed and places included), check it again to put them back as they were, or to add a file that was never on it. Right-click a file to remove it (its clips leave the timeline too, after a confirmation; undo brings them back). Also: magnetic video track (slide clips to leave gaps, or move them by drag), audio track (free placement), trim handles, per-clip speed 0.25–4× (pitch preserved), volume, aspect presets 16:9 / 9:16 / 1:1 / 4:5 with fit or fill, 24–60 fps, MP4 export at Original, 1080p, 720p or 480p (H.264/AAC, falls back to other codecs the browser can encode). Resizable timeline, undo/redo.

**Selecting and cutting**: drag in the **Select** bar under the ruler (or on any empty lane) to select a time range across all tracks (live Selection Start/End beside the moving edge, the playhead follows it). The range shows in the bar as a block with its times and length: drag its edges to resize it or its middle to move it. Click or drag the ruler to move the playhead (hover shows the time; a selection stays); a click offers two small buttons at the playhead to mark the selection start or end there. Tools right after the block delete, crop or export it, and right-clicking inside it opens Split All Tracks / Delete / Crop / Export Selected Region. Zooming pivots on the playhead: it stays put on screen, or comes to the middle if it was out of view. Editing never changes the zoom, so the view holds still while you trim, move or delete. Delete closes the gap on every track (ripple delete); Crop keeps only the selection and zooms to fit; Export writes just that part, at the edit's frame size.

**Tracks**: Video 1 is the magnetic main track: clips follow each other, plus any gap you leave. Drag a Video 1 clip sideways to slide it and everything after it (the gap opens in front of it; an Offset readout shows its new start); drag it left until its middle passes the clip in front and it's carried alone, dropping in where you let go (at that time if there's room, pushing later clips only if they'd overlap). Gaps play and export as black. Every video clip shows its own sound as a waveform strip under its thumbnails, so the sound moves, trims, splits and deletes with it. Right-click a clip → **Unlink audio** to move that sound into its own clip on the first free audio lane (the video clip goes silent); from then on they edit separately. The **− +** row under each group removes or adds a track: Video 2, 3, … are overlay tracks drawn on top of the ones below (in Fit mode their bars show the layer underneath), and Audio 1, 2, … hold music, voiceover and unlinked sound. Drag media from the bin onto any lane, drag clips up or down to change lanes (between Video 1 and the overlay tracks too: leaving Video 1 closes up the clip's length, entering it slots the clip in). **−** removes the last added track and asks first (alert dialog) if it still has clips; Video 1 and Audio 1 always stay. Waveforms are read once per file right after import, in Web Workers (long files as parallel slices, one per spare core: a 4-hour video takes ~5 s); until done the strip shimmers, the bars fill in and a thin bar fills along the bottom of the file's thumbnail in the bin.

**Snapping**: while you move or trim a clip, select a range or drop from the bin, edges within 8 px lock onto other clips' starts and ends (on every track), the playhead and 0:00, and an amber guide line shows the exact time. With nothing to snap to, edits land on a grid that follows the zoom (whole minutes when far out, then seconds, tenths, and single frames when zoomed in), and timeline times show only the digits that grid can place. Toggle snapping with the magnet in the timeline footer or **N**; hold **⌥ Alt** to drag freely.

**Splitting**: the scissors at the playhead's foot, or the Split ▾ button under the preview (split selected clip / all tracks / Video 1 / overlay tracks / audio tracks). With a range selected, splits happen at both of its edges.

## Shortcuts

| Key | Action |
|---|---|
| Space | Play / pause |
| S or ⌘/Ctrl+B | Split all tracks at the playhead (or at the selection edges) |
| Delete / Backspace | Delete the selected range (ripple) or the selected clip |
| I / O | Mark range start / end at the playhead |
| ← / → | Previous / next frame (with Shift: 1 second) |
| Home / End | Go to start / end |
| ⌘/Ctrl+Z, ⇧⌘/Ctrl+Z | Undo, redo |
| Esc | Clear selection |
| N | Snapping on / off (hold ⌥ while dragging to bypass) |

## Roadmap

1. **Clip Preview (source monitor)**: trim a file with Start/End markers before placing it, and split it into new bin clips.
2. **Long exports**: mix audio in chunks, so multi-hour exports don't run out of memory.
3. **Lossless fast path**: untouched stretches copy packets without re-encoding.
4. **Text overlays**: add a layer to `drawFrame()`; preview and export get it for free.
5. **Save/restore projects**: IndexedDB + File System Access handles, so nothing is re-imported.
6. **Export in a Worker**: keeps the UI fully smooth during long exports.
7. **Software decoding fallback**, only for codecs the browser can't decode (e.g. some AVI/MKV).
