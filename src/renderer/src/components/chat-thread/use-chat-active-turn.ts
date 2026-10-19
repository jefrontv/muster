import { useEffect, useState } from 'react'
import { FOLLOW_THRESHOLD_PX } from './chat-scroll-follow'
import { activeTurnIndex } from './chat-turn-navigator-model'

/**
 * The turn under the reading line (index into the full order) and the height
 * of the band between the top of the transcript and the composer seat.
 */
export function useChatActiveTurn(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  seatRef: React.RefObject<HTMLDivElement | null>,
  order: string[]
): { activeIndex: number; bandHeight: number } {
  const [activeIndex, setActiveIndex] = useState(order.length - 1)
  const [bandHeight, setBandHeight] = useState(0)

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) {
      return
    }
    const indexById = new Map(order.map((turnId, index) => [turnId, index]))
    let frame = 0
    let fallback = 0
    const measure = (): void => {
      cancelAnimationFrame(frame)
      window.clearTimeout(fallback)
      frame = 0
      fallback = 0
      const band = scroller.clientHeight - (seatRef.current?.offsetHeight ?? 0)
      setBandHeight(band)
      const origin = scroller.getBoundingClientRect().top - scroller.scrollTop
      const sections = [...scroller.querySelectorAll<HTMLElement>('section[data-turn-id]')]
      const tops = sections.map((section) => section.getBoundingClientRect().top - origin)
      if (sections.length === 0) {
        return
      }
      const atEnd =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= FOLLOW_THRESHOLD_PX
      const local = activeTurnIndex(tops, scroller.scrollTop, band, atEnd)
      setActiveIndex(indexById.get(sections[local]!.dataset.turnId!) ?? order.length - 1)
    }
    const schedule = (): void => {
      if (frame === 0) {
        frame = requestAnimationFrame(measure)
        // A hidden window paints no frames, and the rail would never size.
        fallback = window.setTimeout(measure, 100)
      }
    }
    schedule()
    scroller.addEventListener('scroll', schedule, { passive: true })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resize?.observe(scroller)
    if (seatRef.current) {
      resize?.observe(seatRef.current)
    }
    return () => {
      scroller.removeEventListener('scroll', schedule)
      resize?.disconnect()
      cancelAnimationFrame(frame)
      window.clearTimeout(fallback)
    }
  }, [scrollRef, seatRef, order])

  return { activeIndex, bandHeight }
}
