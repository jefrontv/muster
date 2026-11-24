// Floating menus over the page editor: blocks on "/", pages on "[[" or "@", tags on "#".
import type { Editor } from '@tiptap/react'
import { FilePlus, FileText, Hash } from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { PagePickerItem } from './project-pages-editor-triggers'
import { ProjectPagesActiveCollabPicker } from './ProjectPagesActiveCollabPicker'
import { ProjectPagesSlashMenu } from './ProjectPagesSlashMenu'
import { pageTitle } from './project-pages-tree-model'
import type { ProjectPagesEditorMenus as Menus } from './use-project-pages-editor-menus'

function itemKey(item: PagePickerItem): string {
  return item.kind === 'page'
    ? item.page.id
    : `${item.kind}:${item.kind === 'tag' ? item.label : item.title}`
}

function ItemBody({ item }: { item: PagePickerItem }): React.JSX.Element {
  const Icon = item.kind === 'tag' ? Hash : item.kind === 'create' ? FilePlus : FileText
  const label =
    item.kind === 'page'
      ? pageTitle(item.page)
      : item.kind === 'tag'
        ? item.label
        : `${translate('auto.components.projectPages.linkMenuCreate', 'Create page')} "${item.title}"`
  return (
    <>
      <span className="rich-markdown-slash-icon">
        <Icon className="size-3.5" />
      </span>
      <span className="truncate text-[13px] font-medium leading-5">{label}</span>
    </>
  )
}

export function ProjectPagesEditorMenus(props: {
  editor: Editor | null
  menus: Menus
}): React.JSX.Element {
  return (
    <>
      <FloatingMenu {...props} />
      <ProjectPagesActiveCollabPicker />
    </>
  )
}

function FloatingMenu({
  editor,
  menus
}: {
  editor: Editor | null
  menus: Menus
}): React.JSX.Element | null {
  if (menus.slashMenu) {
    return <ProjectPagesSlashMenu editor={editor} menu={menus.slashMenu} menus={menus} />
  }
  const menu = menus.picker
  if (!menu || (menu.kind === 'tag' && menus.pickerItems.length === 0)) {
    return null
  }
  return (
    <div
      className="rich-markdown-slash-menu"
      style={{ left: menu.left, top: menu.top }}
      role="dialog"
      aria-label={
        menu.kind === 'tag'
          ? translate('auto.components.projectPages.tagMenu', 'Tags')
          : translate('auto.components.projectPages.linkMenu', 'Link to a page')
      }
    >
      <div className="rich-markdown-slash-results scrollbar-sleek" role="listbox">
        {menus.pickerItems.length === 0 ? (
          <div className="rich-markdown-slash-empty">
            {translate('auto.components.projectPages.linkMenuEmpty', 'No pages yet')}
          </div>
        ) : (
          menus.pickerItems.map((item, index) => (
            <button
              key={itemKey(item)}
              type="button"
              role="option"
              aria-selected={index === menus.selected}
              className={cn('rich-markdown-slash-item', index === menus.selected && 'is-active')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor && void menus.pick(editor, menu, item)}
            >
              <ItemBody item={item} />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
