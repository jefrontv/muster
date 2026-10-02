/** "4.2s", "38s", "2m 05s": short enough to trail a tool row. */
export function formatToolElapsed(ms: number): string {
  const seconds = Math.max(0, ms / 1000)
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`
}
