// "3 selected — send to…". The delivery lives in TasksPanelSendMenu, which the task detail's
// toolbar button shares.

import { LoaderCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { TasksPanelSendMenu } from './tasks-panel-send-menu'
import type { TaskSendTarget } from './tasks-panel-send-targets'

export function TasksPanelSendBar({
  targets,
  count,
  onClear,
  buildPrompt
}: {
  targets: readonly TaskSendTarget[]
  count: number
  onClear: () => void
  buildPrompt: () => string | null
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-3 py-2">
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
        {translate('auto.components.right.sidebar.tasks.selected', '{{count}} selected').replace(
          '{{count}}',
          String(count)
        )}
      </span>
      <Button variant="ghost" size="xs" onClick={onClear}>
        {translate('auto.components.right.sidebar.tasks.clear', 'Clear')}
      </Button>
      <TasksPanelSendMenu targets={targets} buildPrompt={buildPrompt} onSent={onClear}>
        {({ sending, disabled }) => (
          <Button size="xs" disabled={disabled}>
            {sending ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
            {translate('auto.components.right.sidebar.tasks.send', 'Send to…')}
          </Button>
        )}
      </TasksPanelSendMenu>
    </div>
  )
}
