import React, { useCallback, useMemo, useState } from 'react'
import { Link2, Link2Off, Unlink } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { activeCollabProjectSiteKey } from '../../../shared/activecollab-project-site'
import { resolveActiveCollabSiteBinding } from '@/lib/activecollab-site-binding'

/** Past this many sites, scanning beats reading, so the picker grows a filter. */
const SITE_FILTER_THRESHOLD = 8

/**
 * Links an ActiveCollab project to a local site.
 *
 * Sits beside the collapse toggle in the group header rather than inside it: the toggle is the
 * row-wide button, and nesting a control in a button is invalid and unreachable by keyboard.
 */
export function ActiveCollabBindSiteButton({
  projectId,
  projectName
}: {
  projectId: number
  projectName: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // Read defensively throughout: this row is mounted against partial store stand-ins in several
  // suites, and a bare read of an absent slice takes the whole Tasks list down rather than just
  // disabling one control.
  const sites = useAppStore((s) => s.sites)
  const bindings = useAppStore((s) => s.settings?.activeCollabProjectSites)
  const instanceUrl = useAppStore((s) => s.activeCollabStatus?.connection?.instanceUrl ?? null)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const siteList = useMemo(() => sites ?? [], [sites])
  const bindingMap = useMemo(() => bindings ?? {}, [bindings])

  const binding = useMemo(
    () =>
      resolveActiveCollabSiteBinding({
        bindings: bindingMap,
        sites: siteList,
        instanceUrl,
        projectId
      }),
    [bindingMap, instanceUrl, projectId, siteList]
  )

  const boundSite = binding.kind === 'ready' || binding.kind === 'needs-repo' ? binding.site : null

  const writeBinding = useCallback(
    (siteId: string | null) => {
      const key = activeCollabProjectSiteKey(instanceUrl, projectId)
      const next = { ...bindingMap }
      if (siteId === null) {
        // Delete rather than assign undefined: a null-ish value would survive in memory and then
        // be dropped by the load-time sanitiser, leaving the UI disagreeing with disk until restart.
        delete next[key]
      } else {
        next[key] = siteId
      }
      void updateSettings?.({ activeCollabProjectSites: next })
      setOpen(false)
    },
    [bindingMap, instanceUrl, projectId, updateSettings]
  )

  const label = boundSite
    ? translate('auto.components.activecollab.bind_site.linked', 'Linked to {{value0}}', {
        value0: boundSite.displayName
      })
    : binding.kind === 'missing-site'
      ? translate(
          'auto.components.activecollab.bind_site.missing',
          'Linked site is missing — pick another'
        )
      : translate('auto.components.activecollab.bind_site.link', 'Link this project to a site')

  const Icon = boundSite ? Link2 : Link2Off

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* A native `title` rather than the Radix Tooltip on purpose: nothing else in the task list
          tree mounts a TooltipProvider, so using one here would impose that provider on the whole
          list — it broke 33 existing list tests on contact. `aria-label` is what assistive tech
          reads either way, and `title` covers sighted hover. */}
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          title={label}
          className={boundSite ? 'shrink-0 text-foreground' : 'shrink-0 text-muted-foreground'}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          {siteList.length > SITE_FILTER_THRESHOLD ? (
            <CommandInput
              placeholder={translate(
                'auto.components.activecollab.bind_site.filter',
                'Filter sites…'
              )}
            />
          ) : null}
          <CommandList>
            <CommandEmpty>
              {translate('auto.components.activecollab.bind_site.empty', 'No sites found.')}
            </CommandEmpty>
            {siteList.map((summary) => (
              <CommandItem
                key={summary.site.id}
                value={`${summary.site.displayName} ${summary.site.path}`}
                onSelect={() => writeBinding(summary.site.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{summary.site.displayName}</span>
                  {/* Display names repeat across clients, so the path is what disambiguates. */}
                  <span className="truncate text-xs text-muted-foreground">
                    {summary.site.path}
                  </span>
                </span>
              </CommandItem>
            ))}
            {binding.kind === 'unbound' ? null : (
              <CommandItem value="__unbind__" onSelect={() => writeBinding(null)}>
                <Unlink aria-hidden="true" className="size-3.5" />
                <span>
                  {translate('auto.components.activecollab.bind_site.unbind', 'Unlink {{value0}}', {
                    value0: projectName
                  })}
                </span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
