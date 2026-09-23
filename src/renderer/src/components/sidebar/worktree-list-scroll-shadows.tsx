import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type ScrollEdges = { top: boolean; bottom: boolean }

const NO_EDGES: ScrollEdges = { top: false, bottom: false }

/** Which ends of the list have more rows past them. Re-read on scroll and when the content resizes. */
export function useScrollEdges(node: HTMLElement | null): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES)

  useEffect(() => {
    if (!node) {
      setEdges(NO_EDGES)
      return
    }
    let frame = 0
    const read = (): void => {
      frame = 0
      const top = node.scrollTop > 1
      const bottom = node.scrollTop + node.clientHeight < node.scrollHeight - 1
      setEdges((current) =>
        current.top === top && current.bottom === bottom ? current : { top, bottom }
      )
    }
    const schedule = (): void => {
      if (frame === 0) {
        frame = requestAnimationFrame(read)
      }
    }
    read()
    node.addEventListener('scroll', schedule, { passive: true })
    // The virtualizer grows its inner box as rows are measured, so watch that as well as the viewport.
    const resize = new ResizeObserver(schedule)
    resize.observe(node)
    if (node.firstElementChild) {
      resize.observe(node.firstElementChild)
    }
    return () => {
      node.removeEventListener('scroll', schedule)
      resize.disconnect()
      if (frame !== 0) {
        cancelAnimationFrame(frame)
      }
    }
  }, [node])

  return edges
}

export function WorktreeListScrollShadows({ edges }: { edges: ScrollEdges }): React.JSX.Element {
  return (
    <>
      <div
        aria-hidden
        className={cn('worktree-list-edge-shadow top-0', edges.top && 'is-visible')}
        data-worktree-list-edge-shadow="top"
      />
      <div
        aria-hidden
        className={cn(
          'worktree-list-edge-shadow worktree-list-edge-shadow--bottom bottom-0',
          edges.bottom && 'is-visible'
        )}
        data-worktree-list-edge-shadow="bottom"
      />
    </>
  )
}
