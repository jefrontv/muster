// Keeps the page outline in step with the editor: rebuilt once per frame after edits, with a
// scroll spy for the section in view and a jump that lands the caret on the heading.
import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { findRichMarkdownTocHeadingTarget } from '../editor/rich-markdown-toc-heading-target'
import {
  buildPageOutline,
  collectPageOutlineHeadings,
  pageOutlineActiveIndex,
  samePageOutline,
  type PageOutlineItem
} from './project-page-outline-model'

const LANDING_OFFSET_PX = 24

function offsetWithin(container: HTMLElement, element: HTMLElement): number {
  return (
    element.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  )
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

// The editor is created after this mounts, so look for it until it shows up.
function useLiveEditor(getEditor: () => Editor | null): Editor | null {
  const getEditorRef = useRef(getEditor)
  getEditorRef.current = getEditor
  const [editor, setEditor] = useState<Editor | null>(null)
  useEffect(() => {
    let frame = 0
    const find = (): void => {
      const found = getEditorRef.current()
      if (found) {
        setEditor(found)
      } else {
        frame = requestAnimationFrame(find)
      }
    }
    find()
    return () => cancelAnimationFrame(frame)
  }, [])
  return editor
}

export function usePageOutline(
  getEditor: () => Editor | null,
  scrollRef: RefObject<HTMLElement | null>
): { items: PageOutlineItem[]; activeIndex: number; jumpTo: (index: number) => void } {
  const editor = useLiveEditor(getEditor)
  const [items, setItems] = useState<PageOutlineItem[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const itemsRef = useRef<PageOutlineItem[]>([])

  useEffect(() => {
    const container = scrollRef.current
    if (!editor || !container) {
      return
    }
    let tops: number[] = []
    let rebuildFrame = 0
    let spyFrame = 0
    const spy = (): void => {
      spyFrame = 0
      setActiveIndex(
        pageOutlineActiveIndex({
          tops,
          scrollTop: container.scrollTop,
          viewportHeight: container.clientHeight,
          scrollHeight: container.scrollHeight
        })
      )
    }
    const rebuild = (): void => {
      rebuildFrame = 0
      if (editor.isDestroyed) {
        return
      }
      const next = buildPageOutline(collectPageOutlineHeadings(editor.state.doc))
      if (!samePageOutline(itemsRef.current, next)) {
        itemsRef.current = next
        setItems(next)
      }
      tops = next.map((item) => {
        const heading = findRichMarkdownTocHeadingTarget(editor.view.dom, next, item.id)
        return heading ? offsetWithin(container, heading) : Number.POSITIVE_INFINITY
      })
      spy()
    }
    const scheduleRebuild = (): void => {
      rebuildFrame ||= requestAnimationFrame(rebuild)
    }
    const onScroll = (): void => {
      spyFrame ||= requestAnimationFrame(spy)
    }
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (transaction.docChanged) {
        scheduleRebuild()
      }
    }
    editor.on('transaction', onTransaction)
    container.addEventListener('scroll', onScroll, { passive: true })
    // Images loading and width changes move headings without touching the document.
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleRebuild)
    resize?.observe(container)
    resize?.observe(editor.view.dom)
    scheduleRebuild()
    return () => {
      editor.off('transaction', onTransaction)
      container.removeEventListener('scroll', onScroll)
      resize?.disconnect()
      cancelAnimationFrame(rebuildFrame)
      cancelAnimationFrame(spyFrame)
    }
  }, [editor, scrollRef])

  const jumpTo = useCallback(
    (index: number) => {
      const container = scrollRef.current
      const item = itemsRef.current[index]
      if (!editor || editor.isDestroyed || !container || !item) {
        return
      }
      const heading = findRichMarkdownTocHeadingTarget(editor.view.dom, itemsRef.current, item.id)
      if (!heading) {
        return
      }
      editor.commands.setTextSelection(editor.view.posAtDOM(heading, 0))
      editor.view.dom.focus({ preventScroll: true })
      container.scrollTo({
        top: Math.max(0, offsetWithin(container, heading) - LANDING_OFFSET_PX),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      })
    },
    [editor, scrollRef]
  )

  return { items, activeIndex, jumpTo }
}
