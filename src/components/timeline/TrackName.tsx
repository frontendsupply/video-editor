import { useState } from 'react'
import { Tip } from '@/components/ui'

// A track's name, edited in place: hovering draws a dashed outline (with a text cursor), a click edits it. Enter or
// clicking away keeps it, Esc cancels, empty brings the default back.
export function TrackName({ name, tip, onRename }: { name: string; tip: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (!editing)
    return (
      <Tip label={tip}>
        <button className="-mx-1 h-5 min-w-0 flex-1 cursor-text truncate px-1 text-left hover:text-ink hover:outline-1 hover:outline-ink/40 hover:outline-dashed" onClick={() => setEditing(true)}>
          {name}
        </button>
      </Tip>
    )
  return (
    <input
      autoFocus
      defaultValue={name}
      aria-label="Track name"
      onFocus={e => e.currentTarget.select()}
      onBlur={e => {
        setEditing(false)
        if (e.currentTarget.value.trim() !== name) onRename(e.currentTarget.value)
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') e.currentTarget.value = name
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
      className="-mx-1 h-5 min-w-0 flex-1 bg-surface px-1 text-ink ring-1 ring-accent outline-none select-text"
    />
  )
}
