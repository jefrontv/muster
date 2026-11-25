// One page in the tree, with its children when expanded.
import { ChevronRight, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
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
import { ProjectPageKindIcon } from './ProjectPageKindIcon'
import type { ProjectPagesTreeDrag } from './use-project-pages-tree-drag'

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
  /** Absent while the tree is filtered. */
  drag?: ProjectPagesTreeDrag | null
  /** Pages an agent changed since the user last opened them. */
  changedIds?: ReadonlySet<string>
}

function changedInside(node: PageTreeNode, changed: ReadonlySet<string>): boolean {
  return node.children.some((child) => changed.has(child.page.id) || changedInside(child, changed))
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
    onTrash,
    drag,
    changedIds
  } = props
  const { page, children } = node
  const open = forceExpanded || expanded.has(page.id)
  const selected = selectedId === page.id
  const zone = drag?.over?.id === page.id ? drag.over.zone : null
  const changed =
    changedIds !== undefined &&
    (changedIds.has(page.id) || (!open && changedInside(node, changedIds)))
  const changedBy = page.editedBy.kind === 'agent' ? page.editedBy.agent : null
  return (
    <>
      <div
        {...drag?.rowProps(page.id)}
        className={cn(
          'group relative flex h-7 items-center gap-1 rounded-md pr-1 text-sm',
          selected ? 'bg-accent text-accent-foreground' : 'text-foreground/80 hover:bg-accent/60',
          drag?.dragId === page.id && 'opacity-50',
          zone === 'inside' && 'bg-accent ring-1 ring-ring ring-inset'
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {zone === 'before' || zone === 'after' ? (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute right-1 h-0.5 rounded-full bg-ring',
              zone === 'before' ? '-top-px' : '-bottom-px'
            )}
            style={{ left: 4 + depth * 14 }}
          />
        ) : null}
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
          onClick={() => {
            onSelect(page.id)
            // Opening a folder also expands it; only the chevron collapses.
            if (page.folder && children.length > 0 && !open) {
              onToggle(page.id)
            }
          }}
        >
          {page.icon ? (
            <span className="w-4 shrink-0 text-center text-sm leading-none">{page.icon}</span>
          ) : (
            <ProjectPageKindIcon
              page={page}
              open={open}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
          <span className={cn('truncate', !page.title && 'text-muted-foreground')}>
            {pageTitle(page)}
          </span>
          {changed ? (
            <span
              className="mr-1 ml-auto size-1.5 shrink-0 rounded-full bg-status-attention"
              title={
                changedIds?.has(page.id) && changedBy
                  ? translate('auto.components.projectPages.changedBy', 'Changed by {{agent}}', {
                      agent: changedBy
                    })
                  : translate('auto.components.projectPages.changedInside', 'Changed by an agent')
              }
            />
          ) : null}
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
