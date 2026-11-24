import { MessageSquarePlus } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { PageCommentController } from './use-page-comment-controller'

/** Floats above a text selection; mouse down keeps the selection so it becomes the quote. */
export function ProjectPageCommentBubble({
  controller
}: {
  controller: PageCommentController
}): React.JSX.Element | null {
  const at = controller.bubble
  if (!at) {
    return null
  }
  return (
    <div className="absolute z-30" style={{ top: at.top, left: at.left }}>
      <Button
        size="xs"
        variant="outline"
        className="-translate-x-1/2 bg-popover shadow-floating"
        title={controller.shortcutLabel}
        onMouseDown={(event) => {
          event.preventDefault()
          controller.startComment()
        }}
      >
        <MessageSquarePlus className="size-3.5" />
        {translate('auto.components.projectPages.comments.new', 'Comment')}
      </Button>
    </div>
  )
}
