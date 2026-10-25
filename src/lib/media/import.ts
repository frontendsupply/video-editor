// Bringing a file in: probing it (tracks, size, length, a thumbnail) without reading it all. Pictures are read whole.
import { ALL_FORMATS, BlobSource, CanvasSink, Input, UnsupportedInputFormatError, type InputVideoTrack } from 'mediabunny'
import { IMAGE_LENGTH, type Media } from '@/lib/model'

// A file to import, with its handle when the browser gives one; a converted copy also keeps the original's name.
export type Picked = { file: File; handle?: FileSystemFileHandle; name?: string; converted?: string }

// A file this browser can't fully decode: convert.ts makes a playable copy, re-encoding the video, or (when only the
// sound is the problem) just the sound.
export class NeedsConversion extends Error {
  video: 'encode' | 'copy'
  constructor(video: 'encode' | 'copy') {
    super("this browser can't decode it")
    this.video = video
  }
}

// Probe a local file. Only the bytes needed are read (headers + one frame), never the whole file.
export async function importFile(file: File): Promise<Media> {
  if (!file.size) throw new Error('The file is empty. Check that it finished copying or downloading, then add it again.')
  if (file.type.startsWith('image/')) return importImage(file)
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]).catch(e => {
      if (!(e instanceof UnsupportedInputFormatError)) throw e
      // A container it can't read, like AVI, goes to the converter; a file that isn't media at all doesn't.
      if (file.type && !/^(video|audio)\//.test(file.type)) throw new Error('Only video, audio and image files can be added.')
      throw new NeedsConversion('encode')
    })
    if (!video && !audio) throw new Error("No video or audio found in it. If it's still being recorded or copied, add it again once that's done.")
    if (video && !(await video.canDecode())) throw new NeedsConversion('encode')
    if (audio && !(await audio.canDecode())) throw new NeedsConversion('copy')
    const duration = await input.computeDuration()
    const media: Media = {
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      duration,
      width: video ? await video.getDisplayWidth() : 0,
      height: video ? await video.getDisplayHeight() : 0,
      hasVideo: !!video,
      hasAudio: !!audio,
      fps: video ? (await video.computePacketStats(120)).averagePacketRate : undefined,
    }
    if (video) media.thumb = await frameAt(video, Math.min(1, duration / 2))
    return media
  } finally {
    input.dispose()
  }
}

// A picture: its size (turned upright, as its EXIF says) and a small thumbnail, kept as PNG so transparency shows.
async function importImage(file: File): Promise<Media> {
  const read = (o?: ImageBitmapOptions) =>
    createImageBitmap(file, o).catch(() => {
      throw new Error("This image can't be opened here. Save it again as JPEG or PNG and add that.")
    })
  const [full, small] = [await read(), await read({ resizeHeight: 96, resizeQuality: 'high' })]
  const canvas = new OffscreenCanvas(small.width, small.height)
  canvas.getContext('2d')!.drawImage(small, 0, 0)
  const media: Media = {
    id: crypto.randomUUID(),
    file,
    url: URL.createObjectURL(file),
    name: file.name,
    duration: IMAGE_LENGTH,
    width: full.width,
    height: full.height,
    hasVideo: true,
    hasAudio: false,
    image: true,
    thumb: URL.createObjectURL(await canvas.convertToBlob()),
  }
  full.close()
  small.close()
  return media
}

// A small JPEG of the frame at `t` (a blob: URL), for bin cards.
const frameAt = async (video: InputVideoTrack, t: number) => {
  const frame = await new CanvasSink(video, { height: 96 }).getCanvas(t)
  return frame ? URL.createObjectURL(await toBlob(frame.canvas)) : undefined
}
export async function thumbnail(file: File, t: number) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    return video ? await frameAt(video, t) : undefined
  } finally {
    input.dispose()
  }
}

const toBlob = (c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> =>
  c instanceof OffscreenCanvas
    ? c.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
    : new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error("Couldn't read its first frame. Try adding it again."))), 'image/jpeg', 0.7))
