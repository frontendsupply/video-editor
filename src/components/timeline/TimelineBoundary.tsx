import { Component, type ReactNode } from 'react'
import { pill } from '@/components/ui'

// A render error in the timeline shows this instead of unmounting the app. The project lives in App, so it survives,
// and undoing the edit that broke the timeline usually brings it back.
export class TimelineBoundary extends Component<{ onUndo: () => void; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) }
  }
  render() {
    if (this.state.error === null) return this.props.children
    return (
      <div className="grid h-60 shrink-0 place-content-center justify-items-center gap-3 bg-surface p-4 text-center">
        <div className="grid gap-1">
          <span className="text-xs font-semibold">The timeline couldn't be shown</span>
          <span className="text-[11px] text-muted">{this.state.error}. Your project is safe, and undoing the last change usually brings the timeline back.</span>
        </div>
        <button className={pill} onClick={() => (this.props.onUndo(), this.setState({ error: null }))}>Undo last change</button>
      </div>
    )
  }
}
