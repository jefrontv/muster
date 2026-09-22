// The project picker for the panel's unbound state: a visible field, open from the start.
//
// Not `ActiveCollabProjectSearchControl`. That one is a magnifier that expands into a field, which
// is right for the Tasks page header where the list is already on screen and search is an extra.
// Here the field IS the screen, and collapsing it to an icon on a dark panel made it read as
// decoration — the whole reason this component exists.

import { useActiveCollabProjectCatalog } from '@/components/activecollab-project-picker'
import { ActiveCollabProjectCommandList } from '@/components/activecollab-project-picker'
import type { ActiveCollabProjectPick } from '@/components/activecollab-project-picker'
import { Command, CommandInput } from '@/components/ui/command'
import { translate } from '@/i18n/i18n'

export function TasksPanelProjectPicker({
  onSelect
}: {
  onSelect: (project: ActiveCollabProjectPick) => void
}): React.JSX.Element {
  const { projects } = useActiveCollabProjectCatalog(true)

  return (
    <Command className="overflow-hidden rounded-md border border-border bg-background">
      <CommandInput
        autoFocus
        className="h-8 text-xs"
        placeholder={translate(
          'auto.components.right.sidebar.tasks.search_projects',
          'Search projects…'
        )}
      />
      <ActiveCollabProjectCommandList projects={projects} onSelect={onSelect} />
    </Command>
  )
}
