import React from 'react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type {
  DropdownActionKind,
  DropdownEntry,
  DropdownItem
} from './source-control-dropdown-items'
import { toDropdownMenuNodes } from './source-control-dropdown-layout'
import {
  resolveDropdownRowHint,
  shouldShowDropdownRowTooltip
} from './source-control-dropdown-row-hint'

type ReasonDisplay = 'tooltip' | 'title'

type SourceControlDropdownMenuEntriesProps = {
  entries: DropdownEntry[]
  isBusy: boolean
  onAction: (kind: DropdownActionKind) => void
  // Why: the commit area shows full reasons in a side tooltip; the review composer keeps native titles.
  reasonDisplay?: ReasonDisplay
}

export function SourceControlDropdownMenuEntries({
  entries,
  isBusy,
  onAction,
  reasonDisplay = 'tooltip'
}: SourceControlDropdownMenuEntriesProps): React.JSX.Element {
  return (
    <>
      {toDropdownMenuNodes(entries).map((node, index) => {
        if (node.kind === 'separator') {
          return <DropdownMenuSeparator key={`sep-${index}`} />
        }
        if (node.kind === 'submenu') {
          return (
            <DropdownMenuSub key={`submenu-${node.id}`}>
              <DropdownMenuSubTrigger>
                {translate('auto.components.right.sidebar.source.control.dropdown.more', 'More')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[12rem]">
                {node.items.map((item) => (
                  <DropdownRow
                    key={item.kind}
                    entry={item}
                    isBusy={isBusy}
                    onAction={onAction}
                    reasonDisplay={reasonDisplay}
                  />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        }
        return (
          <DropdownRow
            key={node.kind}
            entry={node}
            isBusy={isBusy}
            onAction={onAction}
            reasonDisplay={reasonDisplay}
          />
        )
      })}
    </>
  )
}

function DropdownRow({
  entry,
  isBusy,
  onAction,
  reasonDisplay
}: {
  entry: DropdownItem
  isBusy: boolean
  onAction: (kind: DropdownActionKind) => void
  reasonDisplay: ReasonDisplay
}): React.JSX.Element {
  const inlineHint = resolveDropdownRowHint(entry, isBusy)
  const showReason = shouldShowDropdownRowTooltip(entry, inlineHint)
  const item = (
    <DropdownMenuItem
      disabled={entry.disabled}
      variant={entry.variant}
      className="w-full"
      title={reasonDisplay === 'title' && showReason ? entry.title : undefined}
      onSelect={(event) => {
        if (entry.disabled) {
          event.preventDefault()
          return
        }
        onAction(entry.kind)
      }}
    >
      <span className="flex min-w-0 flex-col">
        <span>{entry.label}</span>
        {inlineHint ? (
          <span className="max-w-60 text-[11px] leading-4 text-muted-foreground">{inlineHint}</span>
        ) : null}
      </span>
    </DropdownMenuItem>
  )
  if (reasonDisplay === 'title') {
    return item
  }
  // Why: disabled menu items swallow pointer events, so the tooltip anchors on a wrapper.
  const row = <div className="block">{item}</div>
  if (!showReason) {
    return row
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="left" sideOffset={8} className="max-w-72">
        {entry.title}
      </TooltipContent>
    </Tooltip>
  )
}
