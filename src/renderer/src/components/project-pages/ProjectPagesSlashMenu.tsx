// The Pages "/" menu. Same look as the file editor's, plus level chips on heading rows.
import type { Editor } from '@tiptap/react'
import { Search } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SlashMenuState } from '../editor/rich-markdown-slash-command-primitives'
import type { ProjectPagesEditorMenus as Menus } from './use-project-pages-editor-menus'

export function ProjectPagesSlashMenu({
  editor,
  menu,
  menus
}: {
  editor: Editor | null
  menu: SlashMenuState
  menus: Menus
}): React.JSX.Element {
  let group: string | null = null
  const keep = (event: React.MouseEvent): void => event.preventDefault()
  return (
    <div
      className="rich-markdown-slash-menu"
      style={{ left: menu.left, top: menu.top }}
      role="dialog"
      aria-label={translate(
        'auto.components.editor.RichMarkdownSlashMenu.2e0400b958',
        'Slash commands'
      )}
    >
      <div className="rich-markdown-slash-search" onMouseDown={keep}>
        <Search className="size-3.5" />
        <input
          aria-label={translate(
            'auto.components.editor.RichMarkdownSlashMenu.550189b06c',
            'Search blocks'
          )}
          readOnly
          type="text"
          value={menu.query}
          placeholder={translate(
            'auto.components.editor.RichMarkdownSlashMenu.dbdd2ad15f',
            'Search blocks…'
          )}
        />
      </div>
      <div className="rich-markdown-slash-results scrollbar-sleek" role="listbox">
        {menus.commands.length === 0 ? (
          <div className="rich-markdown-slash-empty">
            {translate(
              'auto.components.editor.RichMarkdownSlashMenu.82c6816ff8',
              'No blocks found'
            )}
          </div>
        ) : (
          menus.commands.map((item, index) => {
            const showGroup = item.group !== group
            group = item.group
            const level = menus.levelOf(index)
            return (
              <React.Fragment key={item.key}>
                {showGroup ? <div className="rich-markdown-slash-section">{item.group}</div> : null}
                <div
                  role="option"
                  aria-selected={index === menus.selected}
                  className={cn(
                    'rich-markdown-slash-item',
                    index === menus.selected && 'is-active'
                  )}
                  onMouseDown={keep}
                  onClick={() => editor && menus.runItem(editor, menu, item, level)}
                >
                  <span className="rich-markdown-slash-icon">
                    {item.icon.kind === 'component' ? (
                      <item.icon.component className="size-3.5" />
                    ) : (
                      <span className="text-sm leading-none">{item.icon.value}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5">
                    {item.label}
                  </span>
                  {item.variants.length > 1 ? (
                    <span className="flex shrink-0 gap-0.5">
                      {item.variants.map((variant, n) => (
                        <button
                          key={variant.id}
                          type="button"
                          title={variant.label}
                          className={cn(
                            'rounded px-1.5 text-[11px] leading-5 text-muted-foreground hover:bg-accent hover:text-foreground',
                            n === level && 'bg-accent text-foreground'
                          )}
                          onMouseDown={keep}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (editor) {
                              menus.runItem(editor, menu, item, n)
                            }
                          }}
                        >
                          H{n + 1}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </div>
              </React.Fragment>
            )
          })
        )}
      </div>
    </div>
  )
}
