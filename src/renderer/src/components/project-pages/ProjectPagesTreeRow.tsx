// One page in the tree, with its children when expanded.
import { ChevronRight, FileText, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { pageTitle, type PageTreeNode } from './project-pages-tree-model'

type Props = {
  node: PageTreeNode
  depth: number
  selectedId: string | null
  expanded: ReadonlySet<string>
  forceExpanded: boolean
  onToggle: (pageId: string) => void
  onSelect: (pageId: string) => void
  onAddChild: (pageId: string) => void
  onTrash: (pageId: string) => void
}

export function ProjectPagesTreeRow(props: Props): React.JSX.Element {
  const {
    node,
    depth,
    selectedId,
    expanded,
    forceExpanded,
    onToggle,
    onSelect,
    onAddChild,
    onTrash
  } = props
  const { page, children } = node
  const open = forceExpanded || expanded.has(page.id)
  const selected = selectedId === page.id
  return (
    <>
      <div
        className={cn(
          'group flex h-7 items-center gap-1 rounded-md pr-1 text-sm',
          selected ? 'bg-accent text-accent-foreground' : 'text-foreground/80 hover:bg-accent/60'
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          aria-label={
            open
              ? translate('auto.components.projectPages.collapse', 'Collapse')
              : translate('auto.components.projectPages.expand', 'Expand')
          }
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-foreground/10',
            children.length === 0 && 'invisible'
          )}
          onClick={() => onToggle(page.id)}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <button
          type="button"
          aria-current={selected ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => onSelect(page.id)}
        >
          {page.icon ? (
            <span className="w-4 shrink-0 text-center text-sm leading-none">{page.icon}</span>
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={cn('truncate', !page.title && 'text-muted-foreground')}>
            {pageTitle(page)}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={translate('auto.components.projectPages.addSubpage', 'Add a page inside')}
          onClick={() => onAddChild(page.id)}
        >
          <Plus className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={translate('auto.components.projectPages.pageActions', 'Page actions')}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onTrash(page.id)}>
              <Trash2 className="size-3.5" />
              {translate('auto.components.projectPages.moveToTrash', 'Move to trash')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open
        ? children.map((child) => (
            <ProjectPagesTreeRow key={child.page.id} {...props} node={child} depth={depth + 1} />
          ))
        : null}
    </>
  )
}
