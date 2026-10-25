// Run: pnpm test
import {
  layoutVideo, projectDuration, sourceTime, splitAt, cropRange, layoutFree, splitRange, rippleDelete, timecode, gridFor, digitsFor, lengthLabel, trimClip, moveClip, fitRect, outputSize, exportSize,
  addTrack, removeTrack, placeClip, emptyProject, laneOf, moveVideoClip, unlinkAudio, slideVideoClip, removeClip, layoutAll, trimVideoIn, parkMedia, unparkMedia, snapPoints, snapShift, renameTrack, trackName, sameFile, newClip, binLength, plainCuts,
  type Clip, type Project,
} from './model.ts'

const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
}
const clip = (id: string, o: Partial<Clip> = {}): Clip =>
  ({ id, mediaId: 'm', start: 0, in: 0, out: 10, speed: 1, volume: 1, ...o })
const proj = (video: Clip[], audio: Clip[] = [], overlay: Clip[] = []): Project =>
  ({ ...emptyProject(), video, audio, overlay, overlayTracks: overlay.length ? 2 : 0, audioTracks: 2 })

// layout: back to back, speed shortens
const p = proj([clip('a'), clip('b', { in: 2, out: 6, speed: 2 }), clip('c')], [clip('m', { start: 15, out: 20 })])
eq(layoutVideo(p.video).map(x => [x.start, x.end]), [[0, 10], [10, 12], [12, 22]], 'layout')
eq(projectDuration(p), 35, 'duration includes audio')
eq(sourceTime(layoutVideo(p.video)[1], 11), 4, 'sourceTime with speed')


// split keeps total length and continuity
const s = splitAt(p, 5)
eq(s.video.map(c => [c.in, c.out]), [[0, 5], [5, 10], [2, 6], [0, 10]], 'split all tracks under playhead')
eq(projectDuration(s), projectDuration(p), 'split keeps duration')
eq(splitAt(p, 11, 'b').video.map(c => [c.in, c.out]), [[0, 10], [2, 4], [4, 6], [0, 10]], 'split sped-up clip')
eq(splitAt(p, 20, 'm').audio.map(c => [c.start, c.in, c.out]), [[15, 0, 5], [20, 5, 20]], 'split one audio clip')
eq(splitAt(p, 0.01), p, 'split at edge is a no-op')
const both = splitAt(p, 17)
eq([both.video.length, both.audio.length], [4, 2], 'split all cuts video and audio')
eq([splitAt(p, 17, 'video').audio.length, splitAt(p, 17, 'audio').video.length], [1, 3], 'split one track only')
eq(splitRange(p, 2, 4, 'video').video.map(c => [c.in, c.out]).slice(0, 3), [[0, 2], [2, 4], [4, 10]], 'split at range edges')

// ripple delete removes a range from every track and closes the gap
const r = rippleDelete(p, 5, 11)
eq(r.video.map(c => [c.in, c.out]), [[0, 5], [4, 6], [0, 10]], 'ripple: video pieces kept')
eq(r.audio.map(c => c.start), [9], 'ripple: later audio slides left')
eq(projectDuration(r), projectDuration(p) - 6, 'ripple: shorter by the range')
const r2 = rippleDelete(p, 17, 19)
eq(r2.audio.map(c => [c.start, c.in, c.out]), [[15, 0, 2], [17, 4, 20]], 'ripple: cuts through an audio clip')
eq(projectDuration(r2), projectDuration(p) - 2, 'ripple: audio-only tail shortened')

// trim clamps to media bounds; anchored left trim keeps content in place
eq(trimClip(clip('t'), 'out', 5, 12, false).out, 12, 'trim out clamps to media end')
eq(trimClip(clip('t'), 'in', -3, 12, false).in, 0, 'trim in clamps to 0')
const at = trimClip(clip('t', { start: 4 }), 'in', 2, 10, true)
eq([at.in, at.start], [2, 6], 'anchored trim moves start')
eq(trimClip(clip('t', { start: 1, in: 3 }), 'in', -5, 10, true).start, 0, 'anchored trim stops at 0')

// move: audio is free but clamps at 0
eq(moveClip(p, 'm', 2).audio[0].start, 17, 'audio moves')
eq(moveClip(p, 'm', -100).audio[0].start, 0, 'audio clamps at 0')

// geometry
eq(fitRect(1920, 1080, 1080, 1920, 'contain'), { x: 0, y: 656.25, w: 1080, h: 607.5 }, 'contain')
eq(fitRect(100, 100, 200, 100, 'cover'), { x: 0, y: -50, w: 200, h: 200 }, 'cover')
eq(outputSize({ ...p, aspect: 'original' }, { m: { width: 1081, height: 721 } as never }), [1080, 720], 'even size')

// export presets cap the short edge, keep aspect, stay even, never upscale
const sq = { m: { width: 2160, height: 2160 } as never }
eq(exportSize(p, sq), [2160, 2160], 'original size')
eq(exportSize(p, sq, 720), [720, 720], '720p square')
eq(exportSize({ ...p, aspect: '9:16' }, sq, 480), [480, 852], '480p portrait')
eq(exportSize({ ...p, aspect: '16:9' }, sq, 1080), [1920, 1080], 'no upscale')

// overlay + audio lanes
const o = proj([clip('a')], [clip('m', { start: 2, out: 4 })], [clip('x', { start: 3, out: 4, lane: 1 })])
eq(projectDuration(o), 10, 'duration includes overlays')
eq(splitAt(o, 8).overlay.length, 1, 'split misses an overlay not under the playhead')
eq(splitAt(o, 5, 'overlay').video.length, 1, 'split overlay leaves Video 1 alone')
eq(splitAt(o, 5.5, 'all').overlay.map(c => [c.start, c.in, c.out]), [[3, 0, 2.5], [5.5, 2.5, 4]], 'split all cuts overlays')
eq(rippleDelete(o, 0, 1).overlay[0].start, 2, 'ripple shifts overlays')
eq(laneOf(moveClip(o, 'x', 1, 5).overlay[0]), 1, 'move clamps to the top lane')
eq([laneOf(moveClip(o, 'm', 0, 1).audio[0]), moveClip(o, 'm', 1, 1).audio[0].start], [1, 3], 'move to the next audio lane')
const t3 = addTrack(addTrack(o, 'overlay'), 'audio')
eq([t3.overlayTracks, t3.audioTracks], [3, 3], 'add tracks')
const rm = removeTrack({ ...o, overlay: [clip('y'), clip('z', { lane: 1 })] }, 'overlay', 0)
eq([rm.overlayTracks, rm.overlay.map(c => [c.id, laneOf(c)])], [1, [['z', 0]]], 'remove a lane and its clips, shift the rest down')
eq(removeTrack(proj([]), 'audio', 0).audioTracks, 1, 'always keep one audio lane')
const media = { id: 'n', duration: 2 } as never
eq(placeClip(p, media, { kind: 'video' }, 11.5).video.map(c => c.mediaId === 'n'), [false, false, true, false], 'drop on Video 1 slots in by position')
eq(placeClip(o, media, { kind: 'overlay', lane: 1 }, 4).overlay.map(c => [c.start, laneOf(c)]), [[3, 1], [4, 1]], 'drop on an overlay lane')

// moving between Video 1 and overlay lanes
const out = moveVideoClip(p, 'b', 0, 4) // b (2s long) leaves Video 1 for Video 2 at 4s
eq([out.video.map(c => c.id), layoutVideo(out.video).map(x => x.start)], [['a', 'c'], [0, 10]], 'leaving Video 1 closes the gap')
eq(out.overlay.map(c => [c.id, c.start, laneOf(c)]), [['b', 4, 0]], 'lands on the overlay lane at t')
eq(moveVideoClip(out, 'b', -1, 9.5).video.map(c => c.id), ['a', 'b', 'c'], 'back into Video 1, slotted by its middle')
eq([moveVideoClip(out, 'b', -1, 9.5).overlay.length, laneOf(moveVideoClip(out, 'b', -1, 9.5).video[1])], [0, 0], 'leaves the overlay lane')
eq(moveVideoClip(p, 'nope', 0, 1), p, 'unknown clip is a no-op')

// crop keeps only the range on every track, starting at 0
const cr = cropRange(p, 5, 18)
eq([layoutVideo(cr.video).map(x => [x.start, x.end, x.clip.in]), layoutFree(cr.audio).map(x => [x.start, x.end, x.clip.in])],
  [[[0, 5, 5], [5, 7, 2], [7, 13, 0]], [[10, 13, 0]]], 'crop range')
eq(projectDuration(cr), 13, 'crop: duration is the range')
eq(projectDuration(cropRange(p, 0, projectDuration(p))), projectDuration(p), 'crop the whole edit: no-op')

// gaps on Video 1: a clip's gap moves it and everything after it
const starts = (q: Project) => layoutVideo(q.video).map(x => [x.start, x.end])
const g = slideVideoClip(p, 'b', 15) // b was 10-12
eq([starts(g), g.video[1].gap], [[[0, 10], [15, 17], [17, 27]], 5], 'slide: gap before, later clips ride along')
eq(starts(slideVideoClip(g, 'b', 4)), starts(p), 'slide: never before the clip in front ends')
eq(starts(rippleDelete(g, 8, 12)), [[0, 8], [11, 13], [13, 23]], 'ripple delete shortens a gap it covers')
eq(starts(removeClip(g, 'b')), [[0, 10], [15, 25]], 'removing a clip keeps the empty space before it')
eq([starts(splitAt(g, 16)), splitAt(g, 16).video[2].gap], [[[0, 10], [15, 16], [16, 17], [17, 27]], undefined], 'split: the second part follows on')
const gapC = slideVideoClip(p, 'c', 20) // a 0-10, b 10-12, gap, c 20-30
// b leaving its slot closes up its 2 s (c: 20 -> 18), then it lands at t inside the gap without pushing c
eq(starts(moveVideoClip(gapC, 'b', -1, 14)), [[0, 10], [14, 16], [18, 28]], 'move into a gap: lands at t')
eq(starts(moveVideoClip(gapC, 'b', -1, 0)), [[0, 2], [2, 12], [18, 28]], 'move to the front: pushes the first clip')
eq(layoutAll(g).length, layoutAll(p).length, 'gaps add no clips')

// Video 1 left trim: the left edge follows the drag, the clip's end and the clips after it stay put
const withB = (q: Project, b: Clip) => ({ ...q, video: q.video.map(c => (c.id === 'b' ? b : c)) })
const tIn = withB(p, trimVideoIn(p.video[1], 0.5, 10)) // b was 10-12 (in 2, speed 2)
eq([starts(tIn), tIn.video[1].in], [[[0, 10], [10.5, 12], [12, 22]], 3], 'left trim in: start moves right, end stays')
eq(starts(withB(p, trimVideoIn(p.video[1], -1, 10))), starts(p), "left trim out: can't grow over the clip in front")
const tOut = withB(g, trimVideoIn(g.video[1], -2, 10)) // b at 15-17 with a 5 s gap
eq([starts(tOut), tOut.video[1].in], [[[0, 10], [14, 17], [17, 27]], 0], 'left trim out: grows into the gap, limited by the source (2 s at 2x)')

// unchecking a file sets its clips aside; checking it again puts them back exactly
const multi = { ...proj([clip('a'), clip('b', { mediaId: 'n', in: 2, out: 6, speed: 2 }), clip('c')], [clip('m', { mediaId: 'n', start: 15, out: 20, lane: 1 })]), overlayTracks: 0 }
const multiG = slideVideoClip(multi, 'b', 13) // a 0-10, gap 3, b 13-15, c 15-25
const off = parkMedia(multiG, 'n')
eq([starts(off), off.audio.map(c => c.id), off.parked?.map(x => [x.track, x.clip.id, x.clip.start])], [[[0, 10], [13, 23]], [], [['video', 'b', 13], ['audio', 'm', 15]]], 'park: clips off, gap kept, set aside with times')
const on = unparkMedia({ ...off, audioTracks: 1 }, { id: 'n', hasVideo: true, duration: 10 } as never)
eq([starts(on), layoutFree(on.audio).map(x => [x.clip.id, x.start, laneOf(x.clip)]), on.audioTracks, on.parked], [starts(multiG), [['m', 15, 1]], 2, []], 'unpark: back exactly, track re-added')
const fresh = unparkMedia(p, { id: 'z', hasVideo: false, duration: 4 } as never) // Audio 1 has m at 15-35
eq(layoutFree(fresh.audio).filter(x => x.clip.mediaId === 'z').map(x => [x.start, laneOf(x.clip)]), [[35, 0]], 'never on the timeline: a sound goes after the last clip on Audio 1')
eq(parkMedia(multi, 'nope'), multi, 'park a file with no clips: no-op')
// two pieces of one file with a gap between them: the clip after them must not end up in between
const pieces = slideVideoClip(proj([clip('r1', { mediaId: 'r', out: 1.5 }), clip('r2', { mediaId: 'r', in: 1.5, out: 3 }), clip('g', { mediaId: 'g' })]), 'r2', 2.5)
eq(starts(unparkMedia(parkMedia(pieces, 'r'), { id: 'r', hasVideo: true, duration: 3 } as never)), starts(pieces), 'unpark split pieces in their order')
eq(unparkMedia(parkMedia(pieces, 'r'), { id: 'r', hasVideo: true, duration: 3 } as never).video.map(c => c.id), ['r1', 'r2', 'g'], 'unpark keeps the order')

// unlinking a video clip's sound into its own audio clip
const u = unlinkAudio(p, 'b')
eq([u.video[1].muted, u.audio.map(c => [c.start, c.in, c.out, c.speed, laneOf(c)])], [true, [[15, 0, 20, 1, 0], [10, 2, 6, 2, 0]]], 'unlink: same time and source range')
eq(unlinkAudio(p, 'c').audio.map(laneOf), [0, 1], 'unlink: first audio lane free at that time')
eq(unlinkAudio({ ...p, audioTracks: 1 }, 'c').audioTracks, 2, 'unlink: adds a lane when none is free')
eq([unlinkAudio(u, 'b'), unlinkAudio(p, 'm')], [u, p], 'unlink: already unlinked, or not a video clip')

// snapping: clip edges on every track, 0 and extras; the nearest edge within tolerance wins
const snapped = (...a: Parameters<typeof snapShift>) => { const r = snapShift(...a); return { shift: +r.shift.toFixed(6), at: r.at } }
eq(snapPoints(o, c => c.id === 'x', [5.5]).sort((a, b) => a - b), [0, 2, 5.5, 6, 10], 'snap points skip the dragged clip')
eq(snapped([9.8, 13.8], [0, 10, 14.3], 0.3), { shift: 0.2, at: 10 }, 'start snaps to the nearest edge')
eq(snapped([13.9, 17.9], [0, 14.3], 0.5), { shift: 0.4, at: 14.3 }, 'align a clip start to another clip end')
eq(snapped([3, 7], [7.1, 2.95], 0.2), { shift: -0.05, at: 2.95 }, 'closest of both edges wins')
eq(snapped([5], [6], 0.5), { shift: 0, at: null }, 'nothing within tolerance')

// timecode
eq([timecode(2.034), timecode(3725.5), timecode(59.9996), timecode(65, 0), timecode(2.96, 1), timecode(2724.6, 0)], ['0:00:02.034', '1:02:05.500', '0:01:00.000', '0:01:05', '0:00:03.0', '0:45:25'], 'timecode')

// zoom grid: frames only once they're wide enough to aim at
eq([gridFor(0.06, 30), gridFor(1, 30), gridFor(10, 30), gridFor(40, 30), gridFor(200, 30)], [60, 5, 0.5, 0.1, 1 / 30], 'grid by zoom')
eq([digitsFor(60), digitsFor(0.5), digitsFor(1 / 30)], [0, 1, 3], 'digits by grid')
// Snapping on: edits land on the ruler's minor ticks (labels 1 s apart at 115 px/s, ticks every 0.2 s), never frames.
eq([gridFor(115, 30, true), gridFor(200, 30, true), gridFor(1, 30, true)], [0.2, 0.1, 24], 'snap grid is the ruler ticks')
eq(digitsFor(gridFor(115, 30, true)), 1, 'snapped times show tenths')
eq([lengthLabel(3.284, 3), lengthLabel(3.284, 1), lengthLabel(5520, 0)], ['3.28s', '3.3s', '1:32:00'], 'length label')

// Track names: renamed ones stick, empty or default goes back, and a removed track takes its name along.
{
  const p = renameTrack(renameTrack(renameTrack({ ...emptyProject(), overlayTracks: 2, audioTracks: 2 }, 'o0', ' B-roll '), 'o1', 'Titles'), 'a1', 'Voice')
  eq(['v1', 'o0', 'o1', 'a0', 'a1'].map(k => trackName(p, k)), ['Video 1', 'B-roll', 'Titles', 'Audio 1', 'Voice'], 'track names')
  eq([renameTrack(p, 'o0', '  ').names, renameTrack(p, 'o0', 'Video 2').names], [{ o1: 'Titles', a1: 'Voice' }, { o1: 'Titles', a1: 'Voice' }], 'empty or default name resets')
  eq(removeTrack(p, 'overlay', 0).names, { o0: 'Titles', a1: 'Voice' }, 'names move down with their tracks')
  eq(removeTrack(p, 'audio', 1).names, { o0: 'B-roll', o1: 'Titles' }, 'a removed track loses its name')
}

// A saved project finds its files again by name and size.
eq([sameFile({ name: 'a.mp4', size: 10 }, { name: 'a.mp4', size: 10 }), sameFile({ name: 'a.mp4', size: 10 }, { name: 'a.mp4', size: 11 }), sameFile({ name: 'a.mp4', size: 10 }, { name: 'b.mp4', size: 10 })], [true, false, false], 'same file')

// A clip saved from Clip Preview is just its part of the file, on the timeline and in the bin.
{
  const part = { id: 'p', duration: 10, range: [2, 5.5] } as never
  const c = newClip(part)
  eq([c.in, c.out, binLength(part), binLength({ duration: 10 } as never)], [2, 5.5, 3.5, 10], 'saved clip range')
}

// Copyable edits: plain cuts on Video 1 that last as long as the edit.
eq(
  [
    plainCuts(proj([clip('a'), clip('b', { in: 2 })], [clip('m', { out: 18 })])),
    plainCuts(proj([clip('a', { speed: 2 })])),
    plainCuts(proj([clip('a'), clip('b', { gap: 1 })])),
    plainCuts(proj([clip('a')], [], [clip('o', { lane: 0 })])),
    plainCuts(proj([clip('a')], [clip('m', { start: 5, out: 10 })])), // music runs past the video
    plainCuts(proj([])),
  ],
  [true, false, false, false, false, false],
  'plain cuts',
)

console.log('model ok')
