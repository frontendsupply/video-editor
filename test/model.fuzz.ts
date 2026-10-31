// Random edit sequences against the timeline model, checking invariants after every step.
// Run: pnpm fuzz [runs] [steps]
import * as M from '../src/lib/model/index.ts'

type P = M.Project

const media: Record<string, M.Media> = Object.fromEntries(
  [
    ['a', 3, true, true],
    ['b', 7.5, true, true],
    ['c', 12, true, false],
    ['m', 30, false, true],
    ['n', 4.2, false, true],
  ].map(([id, duration, hasVideo, hasAudio]) => [
    id,
    {
      id,
      duration,
      hasVideo,
      hasAudio,
      width: 640,
      height: 360,
      name: `${id}`,
      url: '',
      file: null,
    } as unknown as M.Media,
  ]),
)
const vids = ['a', 'b', 'c']
const auds = ['a', 'b', 'm', 'n']

let seed = 1
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
const time = (p: P) => rnd() * (M.projectDuration(p) + 2) - 0.5

const all = (p: P) => [...p.video, ...p.overlay, ...p.audio]
// What plays at t, per track: "track:media@source" (muted video clips marked).
function content(p: P, t: number) {
  const out: string[] = []
  for (const x of M.layoutVideo(p.video))
    if (t >= x.start && t < x.end)
      out.push(`v:${x.clip.mediaId}@${M.sourceTime(x, t).toFixed(4)}${x.clip.muted ? 'm' : ''}`)
  for (const x of M.layoutFree(p.overlay))
    if (t >= x.start && t < x.end) out.push(`o${M.laneOf(x.clip)}:${x.clip.mediaId}@${M.sourceTime(x, t).toFixed(4)}`)
  for (const x of M.layoutFree(p.audio))
    if (t >= x.start && t < x.end) out.push(`a${M.laneOf(x.clip)}:${x.clip.mediaId}@${M.sourceTime(x, t).toFixed(4)}`)
  return out.sort().join(' ')
}
// Points in time at least `margin` away from every clip edge (so EDGE-snapping and rounding don't count as changes).
// Same thing playing on every track, sources within 3 ms (ripple delete and crop cut within 1 ms of where asked).
const sameContent = (x: string, y: string) => {
  const parse = (s: string) =>
    s
      .split(' ')
      .filter(Boolean)
      .map(e => {
        const [k, v] = e.split('@')
        return [k, parseFloat(v), e.endsWith('m')] as const
      })
  const [a, b] = [parse(x), parse(y)]
  return (
    a.length === b.length && a.every(([k, v, m], i) => k === b[i][0] && m === b[i][2] && Math.abs(v - b[i][1]) < 0.003)
  )
}
const edges = (p: P) => M.layoutAll(p).flatMap(x => [x.start, x.end])
const clearOf = (es: number[], t: number, margin = 0.06) => es.every(e => Math.abs(e - t) > margin)

function check(p: P, op: string) {
  const fail = (msg: string) => {
    throw new Error(`${op}: ${msg}`)
  }
  const ids = new Set<string>()
  for (const c of [...all(p), ...(p.parked ?? []).map(x => x.clip)]) {
    for (const k of ['start', 'in', 'out', 'speed', 'volume'] as const)
      if (!Number.isFinite(c[k])) fail(`clip ${c.id} ${k}=${c[k]}`)
    if (c.gap !== undefined && !(c.gap > 0 && Number.isFinite(c.gap))) fail(`gap ${c.gap}`)
    if (c.in < -1e-9) fail(`in ${c.in} < 0`)
    if (c.out - c.in < 1e-6) fail(`empty clip ${c.in}..${c.out}`)
    if (c.out > media[c.mediaId].duration + 1e-6) fail(`out ${c.out} past media ${media[c.mediaId].duration}`)
    if (c.start < -1e-9) fail(`start ${c.start} < 0`)
    if (ids.has(c.id)) fail(`duplicate id ${c.id}`)
    ids.add(c.id)
  }
  for (const c of p.overlay)
    if (M.laneOf(c) < 0 || M.laneOf(c) >= p.overlayTracks) fail(`overlay lane ${M.laneOf(c)} of ${p.overlayTracks}`)
  for (const c of p.audio)
    if (M.laneOf(c) < 0 || M.laneOf(c) >= p.audioTracks) fail(`audio lane ${M.laneOf(c)} of ${p.audioTracks}`)
  for (const c of p.video) if (c.lane !== undefined) fail(`Video 1 clip with lane ${c.lane}`)
  if (p.audioTracks < 1 || p.overlayTracks < 0) fail('track counts')
  if (!Number.isFinite(M.projectDuration(p))) fail('duration')
  const vs = M.layoutVideo(p.video)
  vs.forEach((x, i) => i && x.start < vs[i - 1].end - 1e-9 && fail('Video 1 overlap'))
}

// Ops: each returns the new project and, where it should hold, a property to check against the old one.
type Op = (p: P) => [string, P, ((q: P, p: P) => void)?]
const same =
  (label: string, f: (t: number) => number = t => t) =>
  (q: P, p: P) => {
    const es = [...edges(p), ...edges(q).map(e => e)]
    for (let i = 0; i < 40; i++) {
      const t = rnd() * (M.projectDuration(q) + 1)
      if (!clearOf(es, t) || !clearOf(edges(p), f(t))) continue
      const [now, was] = [content(q, t), content(p, f(t))]
      if (!sameContent(now, was))
        throw new Error(`${label}: at ${t.toFixed(3)} plays "${now}", before "${was}" (at ${f(t).toFixed(3)})`)
    }
  }
const ops: Op[] = [
  p => {
    const m = media[pick(vids)]
    return ['append video', { ...p, video: [...p.video, M.newClip(m)] }]
  },
  p => {
    const m = media[pick(auds)]
    return [
      'add audio',
      { ...p, audio: [...p.audio, { ...M.newClip(m, Math.max(0, time(p))), lane: Math.floor(rnd() * p.audioTracks) }] },
    ]
  },
  p => {
    const m = media[pick(vids)]
    const t = time(p)
    return ['place video', M.placeClip(p, m, { kind: 'video' }, t)]
  },
  p =>
    p.overlayTracks
      ? [
          'place overlay',
          M.placeClip(p, media[pick(vids)], { kind: 'overlay', lane: Math.floor(rnd() * p.overlayTracks) }, time(p)),
        ]
      : ['add overlay track', M.addTrack(p, 'overlay')],
  p => {
    const t = time(p)
    return [`split ${t.toFixed(4)}`, M.splitAt(p, t, pick(['all', 'video', 'overlay', 'audio'])), same('split')]
  },
  p => {
    const a = time(p),
      b = a + rnd() * 4
    return [`splitRange ${a.toFixed(4)}-${b.toFixed(4)}`, M.splitRange(p, a, b), same('splitRange')]
  },
  p => {
    const a = Math.max(0, time(p)),
      b = a + 0.1 + rnd() * 5
    return [
      `rippleDelete ${a.toFixed(4)}-${b.toFixed(4)}`,
      M.rippleDelete(p, a, b),
      (q, p) => {
        for (let i = 0; i < 40; i++) {
          const t = rnd() * (M.projectDuration(q) + 1)
          const src = t < a ? t : t + (b - a)
          if (!clearOf([...edges(p), a, b], src) || !clearOf(edges(q), t)) continue
          if (!sameContent(content(q, t), content(p, src)))
            throw new Error(`rippleDelete: at ${t.toFixed(3)} plays "${content(q, t)}", want "${content(p, src)}"`)
        }
      },
    ]
  },
  p => {
    const d = M.projectDuration(p)
    if (d < 0.5) return ['noop', p]
    const a = rnd() * d * 0.8,
      b = a + 0.2 + rnd() * (d - a)
    return [
      `crop ${a.toFixed(4)}-${b.toFixed(4)}`,
      M.cropRange(p, a, b),
      (q, p) => {
        for (let i = 0; i < 40; i++) {
          const t = rnd() * (b - a)
          if (!clearOf([...edges(p), a, b], t + a) || !clearOf(edges(q), t)) continue
          if (!sameContent(content(q, t), content(p, t + a)))
            throw new Error(`crop: at ${t.toFixed(3)} plays "${content(q, t)}", want "${content(p, t + a)}"`)
        }
      },
    ]
  },
  p => {
    const c = pick(all(p))
    if (!c) return ['noop', p]
    const audio = p.audio.includes(c)
    return [
      'trim',
      M.updateClip(p, c.id, M.trimClip(c, pick(['in', 'out']), (rnd() - 0.5) * 6, media[c.mediaId].duration, audio)),
    ]
  },
  p => {
    const c = pick(p.video)
    return c
      ? ['trimVideoIn', M.updateClip(p, c.id, M.trimVideoIn(c, (rnd() - 0.5) * 6, media[c.mediaId].duration))]
      : ['noop', p]
  },
  p => {
    const c = pick([...p.overlay, ...p.audio])
    return c ? ['move free', M.moveClip(p, c.id, (rnd() - 0.5) * 8, Math.floor(rnd() * 3) - 1)] : ['noop', p]
  },
  p => {
    const c = pick([...p.video, ...p.overlay])
    return c
      ? ['moveVideoClip', M.moveVideoClip(p, c.id, Math.floor(rnd() * (p.overlayTracks + 1)) - 1, time(p))]
      : ['noop', p]
  },
  p => {
    const c = pick(p.video)
    return c ? ['slide', M.slideVideoClip(p, c.id, time(p))] : ['noop', p]
  },
  p => {
    const c = pick([...p.video, ...p.overlay].filter(c => media[c.mediaId].hasAudio))
    return c ? ['unlink', M.unlinkAudio(p, c.id)] : ['noop', p]
  },
  p => {
    const c = pick(all(p))
    return c ? ['remove clip', M.removeClip(p, c.id)] : ['noop', p]
  },
  p => {
    const c = pick(all(p))
    return c ? ['speed', M.updateClip(p, c.id, { speed: pick([0.25, 0.5, 1, 1.5, 2, 4]) })] : ['noop', p]
  },
  p => ['add audio track', M.addTrack(p, 'audio')],
  p => {
    const kind = pick(['overlay', 'audio'] as const)
    const n = kind === 'overlay' ? p.overlayTracks : p.audioTracks
    return n > (kind === 'audio' ? 1 : 0)
      ? ['remove track', M.removeTrack(p, kind, Math.floor(rnd() * n))]
      : ['noop', p]
  },
  p => {
    const m = media[pick(Object.keys(media))]
    if (!all(p).some(c => c.mediaId === m.id)) return ['noop', p]
    // Unchecking then checking a file gives the same timeline back.
    return [
      'park+unpark',
      M.unparkMedia(M.parkMedia(p, m.id), m),
      (q, p) => {
        const key = (x: P) =>
          [
            ...M.layoutVideo(x.video).map(y => `${y.clip.id}@${y.start.toFixed(4)}`),
            ...[...x.overlay, ...x.audio].map(c => `${c.id}@${c.start.toFixed(4)}`),
          ]
            .sort()
            .join()
        if (key(q) !== key(p)) throw new Error(`park+unpark changed the timeline:\n  ${key(p)}\n  ${key(q)}`)
      },
    ]
  },
  p => {
    const m = media[pick(Object.keys(media))]
    return ['park', M.parkMedia(p, m.id)]
  },
  p => {
    const m = media[pick(Object.keys(media))]
    return ['unpark', M.unparkMedia(p, m)]
  },
]

const argv = (globalThis as unknown as { process: { argv: string[] } }).process.argv // run by node, type-checked with the app
const runs = Number(argv[2] ?? 2000)
const steps = Number(argv[3] ?? 60)
const failures = new Map<string, { seed: number; step: number; trail: string[] }>()
for (let r = 1; r <= runs; r++) {
  seed = r * 7919
  let p: P = M.emptyProject()
  const trail: string[] = []
  for (let s = 0; s < steps; s++) {
    const [name, q, prop] = pick(ops)(p)
    trail.push(name)
    try {
      check(q, name)
      prop?.(q, p)
    } catch (e) {
      const msg =
        (e as Error).message.split(':')[0] +
        ': ' +
        (e as Error).message
          .split(':')
          .slice(1)
          .join(':')
          .replace(/[\d.]+/g, '#')
          .slice(0, 80)
      if (!failures.has(msg))
        failures.set(msg, { seed: r, step: s, trail: [...trail.slice(-6), `→ ${(e as Error).message}`] })
      break
    }
    p = q
  }
}
console.log(`${runs} runs × ${steps} steps: ${failures.size} distinct failures`)
for (const [msg, f] of failures) console.log(`\n# ${msg}\n  run ${f.seed} step ${f.step}\n  ${f.trail.join('\n  ')}`)
