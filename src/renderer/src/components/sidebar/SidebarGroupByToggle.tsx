import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { WorktreeGroupBy } from './worktree-list-groups'
import { GROUP_BY_OPTIONS } from './sidebar-workspace-option-items'

type SidebarGroupByToggleProps = {
  groupBy: WorktreeGroupBy
  setGroupBy: (groupBy: WorktreeGroupBy) => void
}

export function SidebarGroupByToggle({ groupBy, setGroupBy }: SidebarGroupByToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={groupBy}
      onValueChange={(value) => {
        if (value) {
          setGroupBy(value as WorktreeGroupBy)
        }
      }}
      variant="segmented"
      size="sm"
    >
      {GROUP_BY_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.id}
          value={option.id}
          // Why: inside the dropdown menu, Radix can focus a toggle item without
          // committing ToggleGroup's value change; capture the pointer intent
          // before the menu's roving-focus handling turns it into a no-op.
          onPointerDownCapture={() => setGroupBy(option.id)}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
