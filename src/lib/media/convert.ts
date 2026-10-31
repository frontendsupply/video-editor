// Files the browser can't decode (an AVI, an old codec in an MKV, ProRes or HEVC where there's no decoder) are
// converted once, on this device, into an MP4 it can play: H.264 video and AAC sound. That takes a software decoder:
// a WebAssembly build (~30 MB, fetched only when such a file comes along). When only the sound is
// the problem, the video is copied as it is, which is quick. The copy goes into the browser's private storage, so a
// saved project finds it again after a reload.

import coreURL from '@ffmpeg/core?url'
import { FFFSType, FFmpeg } from '@ffmpeg/ffmpeg'
import { convertedDir } from '@/lib/store'

// Over the host's 25 MiB per-file limit, so it's fetched from the npm CDN at the installed version, not bundled.
const wasmURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm'

export type Converted = { file: File; handle: FileSystemFileHandle; folder: string }

export async function convert(
  file: File,
  video: 'encode' | 'copy',
  onProgress: (share: number) => void,
  signal: AbortSignal,
): Promise<Converted> {
  const ffmpeg = new FFmpeg()
  ffmpeg.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress))))
  try {
    await ffmpeg.load({ coreURL, wasmURL }, { signal })
    await ffmpeg.createDir('/in')
    await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, '/in') // read in place, not copied into memory
    const encode = [
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    ] // 8-bit, even size
    const run = (v: string[]) =>
      ffmpeg.exec(
        [
          '-y',
          '-i',
          `/in/${file.name}`,
          '-map',
          '0:v:0?',
          '-map',
          '0:a:0?',
          ...v,
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '/out.mp4',
        ],
        -1,
        { signal },
      )
    // A copied video that MP4 can't hold is re-encoded after all.
    if ((video === 'copy' ? await run(['-c:v', 'copy']) : 1) !== 0 && (await run(encode)) !== 0)
      throw new Error(
        "It may be damaged, or in a format even the converter can't read. Save it again as MP4 and add that copy.",
      )
    const data = (await ffmpeg.readFile('/out.mp4')) as Uint8Array<ArrayBuffer>
    const folder = crypto.randomUUID()
    const dir = await (await convertedDir()).getDirectoryHandle(folder, { create: true })
    const handle = await dir.getFileHandle(`${file.name.replace(/\.[^.]*$/, '')}.mp4`, { create: true })
    const out = await handle.createWritable()
    await out.write(data)
    await out.close()
    return { file: await handle.getFile(), handle, folder }
  } finally {
    ffmpeg.terminate()
  }
}
