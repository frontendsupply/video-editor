// The open project is kept in IndexedDB, so a reload or a closed tab picks up where you left off. Files stay where
// they are on disk: each one keeps a file handle (Chromium) to read it again, or is matched by name and size when
// it's picked again. Thumbnails and finished waveforms are stored too, so nothing is read twice.
import { sameFile, type Media, type Project } from './model'

export type SavedMedia = Omit<Media, 'file' | 'url' | 'thumb'> & { size: number; lastModified: number; thumb?: Blob }
export type Saved = { project: Project; media: SavedMedia[]; savedAt: number }

const STATE = 'state'
const MEDIA = 'media'
let db: Promise<IDBDatabase> | undefined
const open = () =>
  (db ??= new Promise((ok, fail) => {
    const r = indexedDB.open('video-editor', 1)
    r.onupgradeneeded = () => (r.result.createObjectStore(STATE), r.result.createObjectStore(MEDIA))
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  }))
const req = <T>(r: IDBRequest<T>) => new Promise<T>((ok, fail) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => fail(r.error))))
const done = (tx: IDBTransaction) => new Promise<void>((ok, fail) => ((tx.oncomplete = () => ok()), (tx.onerror = tx.onabort = () => fail(tx.error))))

// A file's record is rewritten only when what's stored changes: removed or not, waveform finished or not.
const written = new Map<string, string>()
const sig = (m: { removed?: boolean; peaksDone?: number }) => `${+!!m.removed}${+(m.peaksDone === 1)}`

async function toSaved({ file, url: _, thumb, ...m }: Media): Promise<SavedMedia> {
  const finished = m.peaksDone === 1
  return {
    ...m,
    peaks: finished ? m.peaks : undefined,
    peaksDone: finished ? 1 : 0, // half-read waveforms are read again after a restore
    size: file.size,
    lastModified: file.lastModified,
    thumb: thumb ? await (await fetch(thumb)).blob() : undefined,
  }
}

// Saves run one after another, so a slow one (fetching thumbnails) can't land after a newer one.
let queue = Promise.resolve()
export const save = (project: Project, media: Record<string, Media>) =>
  (queue = queue.then(() => write(project, media)).catch(e => console.warn("Couldn't save the project", e)))

async function write(project: Project, media: Record<string, Media>) {
  // Files taken out of the bin are kept only while a clip still uses them.
  const used = new Set([...project.video, ...project.overlay, ...project.audio, ...(project.parked ?? []).map(x => x.clip)].map(c => c.mediaId))
  const keep = Object.values(media).filter(m => !m.removed || used.has(m.id))
  const rows = await Promise.all(keep.filter(m => written.get(m.id) !== sig(m)).map(toSaved))
  const tx = (await open()).transaction([STATE, MEDIA], 'readwrite')
  tx.objectStore(STATE).put({ project, ids: keep.map(m => m.id), savedAt: Date.now() }, 'current')
  for (const r of rows) tx.objectStore(MEDIA).put(r, r.id)
  const ids = new Set(keep.map(m => m.id))
  for (const id of await req(tx.objectStore(MEDIA).getAllKeys())) if (!ids.has(String(id))) tx.objectStore(MEDIA).delete(id)
  await done(tx)
  written.clear()
  for (const m of keep) written.set(m.id, sig(m))
}

// The last saved project, or null when there's none (or it has nothing in it).
export async function load(): Promise<Saved | null> {
  const tx = (await open()).transaction([STATE, MEDIA])
  const [state, rows] = await Promise.all([
    req(tx.objectStore(STATE).get('current')) as Promise<{ project: Project; ids: string[]; savedAt: number } | undefined>,
    req(tx.objectStore(MEDIA).getAll()) as Promise<SavedMedia[]>,
  ])
  const byId = new Map(rows.map(r => [r.id, r]))
  if (!state?.ids.length || !state.ids.every(id => byId.has(id))) return null
  // Nothing counts as written yet: the first save rewrites every record, with any handle found again since.
  return { project: state.project, media: state.ids.map(id => byId.get(id)!), savedAt: state.savedAt }
}

export const clear = async () => {
  written.clear()
  const tx = (await open()).transaction([STATE, MEDIA], 'readwrite')
  tx.objectStore(STATE).clear()
  tx.objectStore(MEDIA).clear()
  await done(tx)
}

// The saved files that can be read through their handles. Without `ask` only ones already allowed; with it (inside a
// click) the browser may ask the user once to allow reading them again.
export async function readHandles(media: SavedMedia[], ask: boolean): Promise<Map<string, File>> {
  const files = new Map<string, File>()
  for (const m of media) {
    if (!m.handle) continue
    try {
      let state = await m.handle.queryPermission({ mode: 'read' })
      if (state === 'prompt' && ask) state = await m.handle.requestPermission({ mode: 'read' })
      if (state !== 'granted') continue
      const file = await m.handle.getFile()
      if (sameFile(m, file)) files.set(m.id, file)
    } catch {
      // moved or deleted on disk: it has to be picked again
    }
  }
  return files
}

// Media again, from a saved record and its file.
export const toMedia = ({ size: _, lastModified: __, thumb, ...m }: SavedMedia, file: File): Media => ({
  ...m,
  file,
  url: URL.createObjectURL(file),
  thumb: thumb && URL.createObjectURL(thumb),
})
