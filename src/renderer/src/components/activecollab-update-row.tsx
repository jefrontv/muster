// One row of the "My Updates" bell: what changed, on which task, where, and when.
//
// Split out of the bell so both files stay under the line gate, and so the row's own rule is
// testable on its own: a MENTION leads and is the only phrase that gets colour. Everything else on
// this line is muted context, because a row where every part shouts is a row you cannot scan.

import React from 'react'
import { AtSign } from 'lucide-react'

import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabObjectUpdate } from '../../../shared/activecollab-types'
import { activeCollabStamp } from './activecollab-task-timestamps'
import { activeCollabUpdateKindLabel } from './activecollab-update-kind-label'

/** Mention first, then the rest in the order the codec reported them. Unnameable kinds drop out. */
function orderedKindLabels(update: ActiveCollabObjectUpdate): {
  mention: string | null
  rest: string[]
} {
  let mention: string | null = null
  const rest: string[] = []
  for (const entry of update.kinds) {
    const label = activeCollabUpdateKindLabel(entry.kind, entry.count)
    if (label === null) {
      continue
    }
    if (entry.kind === 'mention') {
      mention = label
    } else {
      rest.push(label)
    }
  }
  return { mention, rest }
}

export function ActiveCollabUpdateRow({
  onPick,
  unread,
  update
}: {
  onPick: (update: ActiveCollabObjectUpdate) => void
  /**
   * Whether the user has yet to OPEN this task in Muster, from the same per-task model the task
   * rows and the sidebar badge draw from — deliberately not the row's own `kinds`.
   *
   * ActiveCollab's `kinds` and `total_unread` answer "unread in ActiveCollab", which this build
   * cannot rely on: measured against a live instance, all 29 rows came back with `updates: []`
   * while `total_unread` read 1, so every row would recede and nothing would stand out. Muster's
   * own model answers the question the user is actually asking of this panel, and it keeps the
   * bell agreeing with the list underneath it rather than contradicting it.
   */
  unread: boolean
  update: ActiveCollabObjectUpdate
}): React.JSX.Element {
  const stamp = activeCollabStamp(update.lastUpdateOn, 'relative')
  const { mention, rest } = orderedKindLabels(update)
  // ActiveCollab's own panel puts source and recency on one muted line under the name. An absent
  // project name drops the comma with it rather than leaving a dangling separator.
  //
  // Unread leads, because the receding treatment that carries it on screen is a COLOUR, and colour
  // alone tells a screen-reader user nothing about which of thirty rows still wants them.
  const context = [
    unread ? translate('auto.components.activecollab.my_work.update_unread', 'Unread') : null,
    update.projectName,
    stamp?.label,
    mention,
    ...rest
  ]
    .filter((part) => Boolean(part))
    .join(', ')
  return (
    <li>
      <button
        type="button"
        aria-label={context ? `${update.name} — ${context}` : update.name}
        onClick={() => onPick(update)}
        data-unread={unread ? 'true' : undefined}
        className="block w-full px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {mention === null ? null : (
            <AtSign aria-hidden="true" className="size-3 shrink-0 text-primary" />
          )}
          <span
            className={cn(
              'min-w-0 truncate text-[13px]',
              unread ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            {update.name}
          </span>
        </span>
        <span
          className={cn(
            'mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px]',
            unread ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}
        >
          {update.projectName ? <span className="truncate">{update.projectName}</span> : null}
          {stamp ? (
            <>
              {update.projectName ? <span aria-hidden="true">·</span> : null}
              <time dateTime={stamp.iso} className="shrink-0">
                {stamp.label}
              </time>
            </>
          ) : null}
          {mention === null ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 font-medium text-primary">{mention}</span>
            </>
          )}
          {rest.map((label) => (
            <React.Fragment key={label}>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{label}</span>
            </React.Fragment>
          ))}
        </span>
      </button>
    </li>
  )
}
