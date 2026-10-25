declare module 'soundtouchjs'

// File System Access API (Chromium only), lets export stream straight to disk.
interface Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<FileSystemFileHandle>
}
