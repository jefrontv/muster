// The page outline for an open page; hidden when switched off or the page has under two headings.
import type { Editor } from '@tiptap/react'
import type React from 'react'
import type { RefObject } from 'react'
import { useAppStore } from '@/store'
import { showsPageOutline } from './project-page-outline-model'
import { ProjectPageOutlineRail } from './ProjectPageOutlineRail'
import { usePageOutline } from './use-page-outline'

type Props = {
  getEditor: () => Editor | null
  scrollRef: RefObject<HTMLElement | null>
}

function LivePageOutline({ getEditor, scrollRef }: Props): React.JSX.Element | null {
  const { items, activeIndex, jumpTo } = usePageOutline(getEditor, scrollRef)
  return showsPageOutline(items) ? (
    <ProjectPageOutlineRail items={items} activeIndex={activeIndex} onJump={jumpTo} />
  ) : null
}

export function ProjectPageOutline(props: Props): React.JSX.Element | null {
  const enabled = useAppStore((s) => s.settings?.projectPagesOutline !== false)
  return enabled ? <LivePageOutline {...props} /> : null
}
