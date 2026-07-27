import React from 'react'

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

// `motion-reduce:animate-none` belongs on EVERY bone: miss one and a reduced-motion user gets a
// single blinking bar instead of a calm placeholder.
const BONE = 'animate-pulse rounded bg-muted/70 motion-reduce:animate-none'
const BONE_SOFT = 'animate-pulse rounded bg-muted/50 motion-reduce:animate-none'

// Enough fixed widths to give the pane a sensible intrinsic width while it holds no text; the long
// body lines stay proportional so they reflow with the real content's column.
const META_LABEL_BONE = cn(BONE_SOFT, 'h-2.5 w-14')

/**
 * First-load stand-in for {@link ActiveCollabTaskWorkspace}, mirroring its bands — title, metadata
 * rows, body lines, discussion — so landing content replaces bones in place instead of pushing the
 * pane around. The root class list is deliberately identical to the loaded pane's.
 */
export function ActiveCollabTaskSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="activecollab-task-skeleton"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    >
      <span className="sr-only">
        {translate('auto.components.activecollab.task_workspace.loading', 'Loading task')}
      </span>

      <div aria-hidden="true" className="flex-none border-b border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <div className={cn(BONE, 'mt-px size-[18px] shrink-0 rounded-full')} />
          <div className="min-w-0 flex-1">
            <div className={cn(BONE, 'h-4 w-60')} />
            <div className={cn(BONE_SOFT, 'mt-2.5 h-3 w-44')} />
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="grid flex-none grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-b border-border/60 px-4 py-3"
      >
        <div className={META_LABEL_BONE} />
        <div className={cn(BONE, 'h-5 w-36')} />
        <div className={META_LABEL_BONE} />
        <div className={cn(BONE, 'h-5 w-28')} />
        <div className={META_LABEL_BONE} />
        <div className={cn(BONE, 'h-5 w-40')} />
      </div>

      <div aria-hidden="true" className="min-h-0 flex-1 overflow-hidden">
        <div className="border-b border-border/40 px-4 py-4">
          <div className={cn(BONE_SOFT, 'h-2.5 w-20')} />
          <div className="mt-3 flex flex-col gap-2">
            <div className={cn(BONE, 'h-3 w-full')} />
            <div className={cn(BONE, 'h-3 w-11/12')} />
            <div className={cn(BONE, 'h-3 w-4/5')} />
            <div className={cn(BONE, 'h-3 w-2/3')} />
          </div>
        </div>

        <div className="px-4 py-4">
          <div className={cn(BONE_SOFT, 'h-2.5 w-24')} />
          <div className="mt-3 flex flex-col gap-2.5">
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <div className={cn(BONE, 'size-5 shrink-0 rounded-full')} />
                <div className={cn(BONE, 'h-3 w-24')} />
              </div>
              <div className={cn(BONE_SOFT, 'mt-2.5 h-3 w-11/12')} />
            </div>
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <div className={cn(BONE, 'size-5 shrink-0 rounded-full')} />
                <div className={cn(BONE, 'h-3 w-20')} />
              </div>
              <div className={cn(BONE_SOFT, 'mt-2.5 h-3 w-3/4')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
