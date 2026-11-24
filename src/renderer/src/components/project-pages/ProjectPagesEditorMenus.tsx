// Floating menus over the page editor: blocks on "/" and page links on "[[".
import type { Editor } from '@tiptap/react'
import { FileText } from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { ProjectPagesSlashMenu } from './ProjectPagesSlashMenu'
import { pageTitle } from './project-pages-tree-model'
import type { ProjectPagesEditorMenus as Menus } from './use-project-pages-editor-menus'

export function ProjectPagesEditorMenus({
  editor,
  menus
}: {
  editor: Editor | null
  menus: Menus
}): React.JSX.Element | null {
  if (menus.slashMenu) {
    return <ProjectPagesSlashMenu editor={editor} menu={menus.slashMenu} menus={menus} />
  }
  const menu = menus.linkMenu
  if (!menu) {
    return null
  }
  return (
    <div
      className="rich-markdown-slash-menu"
      style={{ left: menu.left, top: menu.top }}
      role="dialog"
      aria-label={translate('auto.components.projectPages.linkMenu', 'Link to a page')}
    >
      <div className="rich-markdown-slash-results scrollbar-sleek" role="listbox">
        {menus.linkTargets.length === 0 ? (
          <div className="rich-markdown-slash-empty">
            {translate('auto.components.projectPages.linkMenuEmpty', 'No pages match')}
          </div>
        ) : (
          menus.linkTargets.map((page, index) => (
            <button
              key={page.id}
              type="button"
              role="option"
              aria-selected={index === menus.selected}
              className={cn('rich-markdown-slash-item', index === menus.selected && 'is-active')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor && menus.insertPageLink(editor, menu, page)}
            >
              <span className="rich-markdown-slash-icon">
                <FileText className="size-3.5" />
              </span>
              <span className="truncate text-[13px] font-medium leading-5">{pageTitle(page)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
