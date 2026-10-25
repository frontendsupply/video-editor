// Browser smoke test. With `npm run dev` open, run in the devtools console:
//   await (await import('/test/e2e.js')).run()
// Generates red/green/blue clips + a tone with WebCodecs, drops them on the editor, exports via the
// real Export button, then decodes the MP4 and checks clip order, colors and audio.
import * as mb from 'mediabunny'

export async function makeClip(name, w, h, color, secs, freq) {
  const output = new mb.Output({ format: w ? new mb.Mp4OutputFormat() : new mb.WavOutputFormat(), target: new mb.BufferTarget() })
  let ctx, video, audio
  if (w) {
    ctx = new OffscreenCanvas(w, h).getContext('2d')
    video = new mb.CanvasSource(ctx.canvas, { codec: 'avc', quality: mb.QUALITY_MEDIUM })
    output.addVideoTrack(video, { frameRate: 30 })
  }
  if (freq) {
    const codec = w ? await mb.getFirstEncodableAudioCodec(['aac', 'opus']) : 'pcm-s16'
    audio = new mb.AudioBufferSource({ codec, quality: mb.QUALITY_MEDIUM })
    output.addAudioTrack(audio)
  }
  await output.start()
  if (audio) {
    const sr = 48000
    const buf = new AudioBuffer({ length: secs * sr, numberOfChannels: 2, sampleRate: sr })
    for (let c = 0; c < 2; c++) buf.getChannelData(c).forEach((_, i, d) => (d[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr)))
    await audio.add(buf)
    audio.close()
  }
  for (let f = 0; video && f < secs * 30; f++) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.font = `${h / 8}px sans-serif`
    ctx.fillText(`${name} ${(f / 30).toFixed(1)}s`, 10, h / 8)
    await video.add(f / 30, 1 / 30)
  }
  video?.close()
  await output.finalize()
  return new File([output.target.buffer], name + (w ? '.mp4' : '.wav'), { type: w ? 'video/mp4' : 'audio/wav' })
}

export const fixtures = () =>
  Promise.all([
    makeClip('red', 640, 360, '#c00', 3, 440),
    makeClip('green', 1280, 720, '#0a0', 3, 660),
    makeClip('blue', 360, 640, '#00c', 2, 0),
    makeClip('music', 0, 0, null, 5, 220),
  ])

export async function drop(files) {
  const dt = new DataTransfer()
  files.forEach(f => dt.items.add(f))
  dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }))
  await new Promise(r => setTimeout(r, 1000))
}

// Click Export with the in-memory path and capture the downloaded blob.
export async function exportBlob() {
  const picker = window.showSaveFilePicker
  window.showSaveFilePicker = undefined
  const click = HTMLAnchorElement.prototype.click
  const href = new Promise(ok => (HTMLAnchorElement.prototype.click = function () { ok(this.href) }))
  const t0 = performance.now()
  ;[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export').click() // opens the quality menu
  await new Promise(r => setTimeout(r, 300))
  document.querySelector('[role="menuitem"]').click() // Original
  const url = await href
  HTMLAnchorElement.prototype.click = click
  window.showSaveFilePicker = picker
  return { blob: await (await fetch(url)).blob(), ms: Math.round(performance.now() - t0) }
}

export async function inspect(blob, times) {
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS })
  const video = await input.getPrimaryVideoTrack()
  const audio = await input.getPrimaryAudioTrack()
  const sink = new mb.CanvasSink(video)
  const color = async t => {
    const { canvas } = await sink.getCanvas(t)
    const [r, g, b] = canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height * 0.75, 1, 1).data
    return r > 150 ? 'red' : g > 120 ? 'green' : b > 150 ? 'blue' : r + g + b < 30 ? 'black' : `${r},${g},${b}`
  }
  const rms = async t => {
    const { buffer } = (await new mb.AudioBufferSink(audio).getBuffer(t)) ?? {}
    const d = buffer?.getChannelData(0) ?? []
    return +Math.sqrt(d.reduce((s, x) => s + x * x, 0) / (d.length || 1)).toFixed(3)
  }
  const out = {
    duration: +(await input.computeDuration()).toFixed(2),
    size: [await video.getDisplayWidth(), await video.getDisplayHeight()],
    codecs: [await video.getCodec(), await audio?.getCodec()],
    frames: {},
    audioRms: {},
  }
  for (const t of times) {
    out.frames[t] = await color(t)
    if (audio) out.audioRms[t] = await rms(t)
  }
  input.dispose()
  return out
}

// Drops a restored or waiting project first, so the run starts empty.
export async function fresh() {
  ;[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start fresh')?.click()
  await new Promise(r => setTimeout(r, 300))
}

export async function run() {
  await fresh()
  await drop(await fixtures())
  const { blob, ms } = await exportBlob()
  return { exportMs: ms, bytes: blob.size, ...(await inspect(blob, [1, 4, 7, 7.9])) }
}
