// The ActiveCollab branch of the Tasks page: connection gate, assigned-task list, detail pane.
//
// Why a component rather than JSX inside TaskPage.tsx: that file is already 12k lines and carries a
// grandfathered max-lines suppression, so every branch added inline makes it worse. Composition
// lives here and TaskPage keeps one line per provider.
//
// Selection is owned here, not by either child, because the list and the detail pane must not know
// about each other — the list reports a ref, the pane renders one, and this is the only place that
// knows they are two halves of the same surface.

import React, { useCallback, useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { ActiveCollabTaskList } from '@/components/task-page-activecollab-task-list'
import { ActiveCollabTaskWorkspace } from '@/components/ActiveCollabTaskWorkspace'
import { ActiveCollabProjectBindingBar } from '@/components/task-page-activecollab-binding-bar'
import { useActiveCollabBindingTargetProject } from '@/hooks/useActiveCollabBindingTargetProject'
import { useActiveCollabProjectBinding } from '@/hooks/useActiveCollabProjectBinding'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { ActiveCollabTaskRef } from '../../../shared/activecollab-api-types'

type TaskPageActiveCollabPanelProps = {
  /** Opens the credential-exchange dialog; owned by TaskPage so every provider shares one chrome. */
  onConnect: () => void
  sourceContext?: TaskSourceContext | null
}

export function TaskPageActiveCollabPanel({
  onConnect,
  sourceContext = null
}: TaskPageActiveCollabPanelProps): React.JSX.Element {
  const status = useAppStore((s) => s.activeCollabStatus)
  const statusChecked = useAppStore((s) => s.activeCollabStatusChecked)
  const checkConnection = useAppStore((s) => s.checkActiveCollabConnection)
  const [selected, setSelected] = useState<ActiveCollabTaskRef | null>(null)

  // Why: nothing else probes the connection on this route. The settings pane has its own refresh
  // hook, so without this the panel gates on `statusChecked` forever and renders a spinner that
  // never resolves. Guarded on the flag so it runs once per unchecked mount, not per render.
  useEffect(() => {
    if (!statusChecked) {
      void checkConnection()
    }
  }, [checkConnection, statusChecked])

  // Why useCallback: the list re-renders per row, and a fresh handler identity each render would
  // defeat any memoisation added to the row later.
  const handleSelect = useCallback((ref: ActiveCollabTaskRef) => {
    setSelected(ref)
  }, [])

  // The binding is resolved here rather than inside the list because two children need it: the bar
  // that names and edits it, and the list that scopes its rows to it. The Tasks page reports on
  // whatever project the app is pointed at; the sidebar is where a project is aimed at explicitly.
  const binding = useActiveCollabProjectBinding(useActiveCollabBindingTargetProject())

  if (!statusChecked) {
    return (
      <div className="mt-4 flex items-center justify-center py-14">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!status.configured) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-6 py-14 text-center shadow-sm">
        <ActiveCollabIcon className="mb-4 size-8 text-muted-foreground/60" />
        <p className="text-base font-medium text-foreground">
          {translate(
            'auto.components.TaskPageActiveCollabPanel.connectHeading',
            'Connect your ActiveCollab account'
          )}
        </p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {translate(
            'auto.components.TaskPageActiveCollabPanel.connectBody',
            'Browse and start work on your assigned ActiveCollab tasks directly from here.'
          )}
        </p>
        <Button className="mt-5" onClick={onConnect}>
          {translate('auto.components.TaskPageActiveCollabPanel.connectAction', 'Connect')}
        </Button>
      </div>
    )
  }

  const hasSelection = selected !== null

  return (
    <div className="flex min-h-0 max-h-full flex-1 gap-3 overflow-hidden">
      <div className="flex min-h-0 max-h-full min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm">
        <ActiveCollabProjectBindingBar {...binding} />
        <ActiveCollabTaskList
          bindingStatus={binding.status}
          onSelect={handleSelect}
          selectedTaskId={selected?.taskId ?? null}
          sourceContext={sourceContext}
        />
      </div>
      {hasSelection ? (
        // Why NO `key` here: keying on the task id remounts the pane on every switch, which throws
        // away the detail cache that suppresses the loading skeleton for an already-read task. The
        // slide belongs to the panel ARRIVING (no selection -> selection), not to its contents
        // changing, so mounting once and letting the pane swap tasks in place is both correct and
        // what the skeleton work depends on.
        // Why a bounded width: the pane's own class list is `h-full` with no basis, so as a bare
        // flex sibling it sized to its content and a long task body pushed the list off-screen.
        <aside className="flex min-h-0 max-h-full w-[42%] min-w-[320px] max-w-[620px] shrink-0 flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm duration-200 animate-in fade-in slide-in-from-right-4 motion-reduce:animate-none">
          <ActiveCollabTaskWorkspace projectId={selected.projectId} taskId={selected.taskId} />
        </aside>
      ) : null}
    </div>
  )
}
