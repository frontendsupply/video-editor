import { Film, History, Image, Music } from 'lucide-react'
import { headerBtn, primaryBtn } from '@/components/ui'
import type { Restore } from '@/hooks/useProjectStorage'
import { cn, list, plural } from '@/lib/utils'

// The last project, waiting for its files: let the browser read them again (one click), or pick the ones it can't
// reach, or drop it and start over. Phones get it left-aligned, the missing files as a striped list.
export function RestorePanel({
  restore: { saved, files, asked },
  onReconnect,
  onLocate,
  onFresh,
}: {
  restore: Restore
  onReconnect: () => void
  onLocate: () => void
  onFresh: () => void
}) {
  const lost = saved.media.filter(m => !files.has(m.id))
  const ask = !asked && lost.some(m => m.handle)
  const missingFiles = [...new Map(lost.map(m => [m.fileName ?? m.name, m])).values()] // a file and the clips saved from it count once
  const missing = missingFiles.map(m => m.fileName ?? m.name)
  const names = list(missing.length > 3 ? [...missing.slice(0, 3), `${missing.length - 3} more`] : missing)
  const clips = saved.project.video.length + saved.project.overlay.length + saved.project.audio.length
  const when = new Date(saved.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <>
      <span className="grid size-12 shrink-0 place-items-center bg-ink/6 max-md:hidden">
        <History size={18} />
      </span>
      <div className="grid gap-1">
        <span className="text-sm font-semibold">Pick up where you left off</span>
        <span className="text-[11px] text-muted">
          {plural(clips, { one: '# clip', other: '# clips' })} · saved {when}
        </span>
      </div>
      <span className={cn('max-w-96 text-[11px] text-muted', !ask && 'max-md:hidden')}>
        {ask
          ? plural(missing.length, {
              one: 'Allow the browser to read its file again. It never leaves your device.',
              other: 'Allow the browser to read its # files again. They never leave your device.',
            })
          : plural(missing.length, {
              one: `Choose ${names} again, or drop it here, to reconnect.`,
              other: `Choose ${names} again, or drop them here, to reconnect.`,
            })}
      </span>
      <ul className="border border-line md:hidden">
        {missingFiles.map(m => {
          const Icon = m.image ? Image : m.hasVideo ? Film : Music
          return (
            <li key={m.id} className="flex h-7 items-center gap-2 px-2 text-[11px] even:bg-ink/4">
              <Icon size={12} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{m.fileName ?? m.name}</span>
              <span className="text-[10px] text-muted">Missing</span>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-1 max-md:justify-end">
        <button className={headerBtn} onClick={onFresh}>
          Start fresh
        </button>
        <button className={primaryBtn} onClick={ask ? onReconnect : onLocate} data-cuelume-open="">
          {ask ? 'Reconnect files' : 'Locate files'}
        </button>
      </div>
    </>
  )
}
