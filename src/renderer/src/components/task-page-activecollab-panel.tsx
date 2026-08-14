// The ActiveCollab branch of the Tasks page: connection gate, assigned-task list, detail pane.
//
// Why a component rather than JSX inside TaskPage.tsx: that file is already 12k lines and carries a
// grandfathered max-lines suppression, so every branch added inline makes it worse. Composition
// lives here and TaskPage keeps one line per provider.
//
// Selection is routed through here, not through either child, because the list and the detail pane
// must not know about each other — the list reports a ref, the pane renders one, and this is the
// only place that knows they are two halves of the same surface. The state itself lives in the
// store (activecollab-task-page-view): held locally it died with every trip to another view, so
// coming back from a chat or a workspace dumped the user at the bare list.

import React, { useCallback, useEffect } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ActiveCollabTaskList } from '@/components/task-page-activecollab-task-list'
import { ActiveCollabTaskWorkspace } from '@/components/ActiveCollabTaskWorkspace'
import { TaskPageActiveCollabSetup } from '@/components/task-page-activecollab-setup'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { getActiveCollabReadScope } from '@/store/slices/activecollab-cache'
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
  const statusContextKey = useAppStore((s) => s.activeCollabStatusContextKey)
  const lastFailureKind = useAppStore((s) => s.activeCollabLastFailureKind)
  const settings = useAppStore((s) => s.settings)
  const checkConnection = useAppStore((s) => s.checkActiveCollabConnection)
  // Read defensively (like openRequest below): several suites mount this panel against partial
  // store stand-ins that predate this slice.
  const storedView = useAppStore((s) => s.activeCollabTaskPageView ?? null)
  const setSelection = useAppStore((s) => s.setActiveCollabTaskPageSelection)
  const setProjectView = useAppStore((s) => s.setActiveCollabTaskPageProject)
  // Same scope the reads cache under, so a runtime switch never reopens another host's task ids.
  const viewScope = getActiveCollabReadScope(settings, sourceContext).cachePrefix
  const view = storedView?.scope === viewScope ? storedView : null
  const selected = view?.selected ?? null
  const openProject = view?.openProject ?? null

  // Why the context key and not `statusChecked` alone: the flag stays true after the runtime changes,
  // so a stale answer from the previous host would read as resolved and could flash the setup screen
  // at a connected user. Unknown means "not yet answered for THIS runtime".
  const statusUnknown =
    !statusChecked || statusContextKey !== getProviderRuntimeContextKey(settings)

  // Why: nothing else probes the connection on this route. The settings pane has its own refresh
  // hook, so without this the panel gates on unknown status forever and renders a spinner that
  // never resolves. Guarded so it runs once per unresolved mount, not per render.
  useEffect(() => {
    if (statusUnknown) {
      void checkConnection()
    }
  }, [checkConnection, statusUnknown])

  // Why useCallback: the list re-renders per row, and a fresh handler identity each render would
  // defeat any memoisation added to the row later.
  const handleSelect = useCallback(
    (ref: ActiveCollabTaskRef) => {
      setSelection?.(viewScope, ref)
    },
    [setSelection, viewScope]
  )

  const handleOpenProject = useCallback(
    (id: number, name: string) => {
      setProjectView?.(viewScope, { id, name })
    },
    [setProjectView, viewScope]
  )
  const handleCloseProject = useCallback(
    () => setProjectView?.(viewScope, null),
    [setProjectView, viewScope]
  )

  // Honours a notification click. The request lives in the store rather than being passed down
  // because the click usually arrives while this panel is unmounted, so it has to survive until
  // the view switch brings the panel up. Cleared as soon as it is applied: leaving it set would
  // drag the user back to this task every later visit to Tasks.
  // Read defensively: this panel is mounted against partial store stand-ins in several suites, and
  // a bare read of an absent slice would take the whole Tasks surface down rather than merely
  // skipping a feature no stand-in exercises.
  const openRequest = useAppStore((s) => s.activeCollabTaskOpenRequest ?? null)
  const clearOpenRequest = useAppStore((s) => s.clearActiveCollabTaskOpenRequest)
  useEffect(() => {
    if (openRequest === null) {
      return
    }
    setSelection?.(viewScope, openRequest)
    clearOpenRequest?.()
  }, [openRequest, clearOpenRequest, setSelection, viewScope])

  if (statusUnknown) {
    return (
      <div className="mt-4 flex items-center justify-center py-14">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // A refused token still sits on disk, so `configured` cannot see it — the status read never leaves
  // the machine. Without the kind check a rejected credential would leave the user staring at a task
  // list that only errors, with no route back to the sign-in form. `configured` is required for the
  // reconnect wording so a stale auth verdict cannot tell someone to reconnect a token that is gone.
  const credentialRejected = status.configured && lastFailureKind === 'auth'
  if (!status.configured || credentialRejected) {
    return (
      <TaskPageActiveCollabSetup
        mode={credentialRejected ? 'reconnect' : 'connect'}
        onConnect={onConnect}
        reason={credentialRejected ? undefined : status.reason}
      />
    )
  }

  const hasSelection = selected !== null

  return (
    // Full bleed: the page gutter is dropped for ActiveCollab, so rounding, an outer border and a
    // shadow would only redraw the inset card that removing the gutter was meant to eliminate. The
    // two columns are separated by a single divider instead of a gap.
    <div className="flex min-h-0 max-h-full flex-1 overflow-hidden">
      <div className="flex min-h-0 max-h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <ActiveCollabTaskList
          onSelect={handleSelect}
          selectedTaskId={selected?.taskId ?? null}
          sourceContext={sourceContext}
          openProject={openProject}
          onOpenProject={handleOpenProject}
          onCloseProject={handleCloseProject}
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
        <aside className="flex min-h-0 max-h-full w-[42%] min-w-[320px] max-w-[620px] shrink-0 flex-col overflow-hidden border-l border-border/60 bg-background duration-200 animate-in fade-in slide-in-from-right-4 motion-reduce:animate-none">
          <ActiveCollabTaskWorkspace
            projectId={selected.projectId}
            taskId={selected.taskId}
            onOpenProject={handleOpenProject}
            onClose={() => setSelection?.(viewScope, null)}
          />
        </aside>
      ) : null}
    </div>
  )
}
