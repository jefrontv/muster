// Slash menu and the page/tag picker ("[[", "@", "#") for the page editor. ProseMirror keeps the
// first key handler, so everything it reads goes through refs.
import type { Editor } from '@tiptap/react'
import { useMemo, useRef, useState } from 'react'
import { pageLinkHref } from '../../../../shared/project-pages-plain-text'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import type { SlashCommand, SlashMenuState } from '../editor/rich-markdown-slash-command-primitives'
import { runSlashCommand, syncSlashMenu } from '../editor/rich-markdown-slash-commands'
import {
  pagePickerItems,
  syncPagePicker,
  type PagePickerItem,
  type PagePickerState
} from './project-pages-editor-triggers'
import { filterPageSlashItems, type PageSlashItem } from './project-pages-slash-items'
import { pageTitle } from './project-pages-tree-model'

type MenuOptions = {
  pages: readonly ProjectPageMeta[]
  pageId: string
  extraCommands: readonly SlashCommand[]
  tags: readonly string[]
  /** Makes a page for "Create page" in the picker; null when that failed. */
  onCreatePage: (title: string) => Promise<ProjectPageMeta | null>
}

export function useProjectPagesEditorMenus({
  pages,
  pageId,
  extraCommands,
  tags,
  onCreatePage
}: MenuOptions) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null)
  const [picker, setPicker] = useState<PagePickerState | null>(null)
  const [selected, setSelected] = useState(0)
  const [levels, setLevels] = useState<Record<string, number>>({})

  const matches = useMemo(
    () => filterPageSlashItems(extraCommands, slashMenu?.query ?? ''),
    [extraCommands, slashMenu?.query]
  )
  const commands = matches.map((match) => match.item)
  const levelOf = (index: number): number =>
    levels[matches[index]?.item.key] ?? matches[index]?.level ?? 0
  const pickerItems = useMemo(
    () => pagePickerItems(picker, pages, pageId, tags),
    [picker, pages, pageId, tags]
  )

  const live = useRef({ slashMenu, picker, commands, pickerItems, selected, levelOf, onCreatePage })
  live.current = { slashMenu, picker, commands, pickerItems, selected, levelOf, onCreatePage }

  function sync(editor: Editor): void {
    const next = syncPagePicker(editor, rootRef.current)
    setPicker(next)
    if (next) {
      setSlashMenu(null)
    } else {
      syncSlashMenu(editor, rootRef.current, setSlashMenu)
    }
    setSelected(0)
    setLevels({})
  }

  function runItem(editor: Editor, menu: SlashMenuState, item: PageSlashItem, level: number): void {
    runSlashCommand(editor, menu, item.variants[level] ?? item.variants[0])
    setSlashMenu(null)
  }

  /** Plain text nodes: a link mark would spread onto the trailing space, and HTML trims it. */
  function replaceRange(editor: Editor, menu: PagePickerState, text: string, href?: string): void {
    const { state } = editor
    const marks = href ? [state.schema.marks.link.create({ href })] : []
    const tr = state.tr.replaceWith(menu.from, menu.to, state.schema.text(text, marks))
    tr.insert(menu.from + text.length, state.schema.text(' '))
    tr.setStoredMarks([])
    editor.view.dispatch(tr)
    editor.commands.focus()
  }

  function insertLink(editor: Editor, menu: PagePickerState, page: ProjectPageMeta): void {
    replaceRange(editor, menu, pageTitle(page), pageLinkHref(page.id))
  }

  async function pick(editor: Editor, menu: PagePickerState, item: PagePickerItem): Promise<void> {
    setPicker(null)
    if (item.kind === 'tag') {
      replaceRange(editor, menu, `#${item.label}`)
    } else if (item.kind === 'page') {
      insertLink(editor, menu, item.page)
    } else {
      const page = await live.current.onCreatePage(item.title)
      if (page && !editor.isDestroyed) {
        insertLink(editor, menu, page)
      }
    }
  }

  /** True when a menu consumed the key. */
  function handleKeyDown(editor: Editor | null, event: KeyboardEvent): boolean {
    const state = live.current
    if (!editor || (!state.picker && !state.slashMenu)) {
      return false
    }
    const count = state.picker ? state.pickerItems.length : state.commands.length
    if (event.key === 'Escape') {
      setPicker(null)
      setSlashMenu(null)
      return true
    }
    if (count === 0) {
      return false
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1
      setSelected((index) => (index + step + count) % count)
      return true
    }
    const row = state.slashMenu ? state.commands[Math.min(state.selected, count - 1)] : null
    if (
      row &&
      row.variants.length > 1 &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      const step = event.key === 'ArrowRight' ? 1 : -1
      const next =
        (state.levelOf(state.selected) + step + row.variants.length) % row.variants.length
      setLevels((current) => ({ ...current, [row.key]: next }))
      return true
    }
    if (event.key !== 'Enter' && event.key !== 'Tab') {
      return false
    }
    const index = Math.min(state.selected, count - 1)
    if (state.picker) {
      void pick(editor, state.picker, state.pickerItems[index])
    } else if (state.slashMenu) {
      runItem(editor, state.slashMenu, state.commands[index], state.levelOf(index))
    }
    return true
  }

  return {
    rootRef,
    slashMenu,
    picker,
    commands,
    pickerItems,
    selected,
    levelOf,
    runItem,
    pick,
    sync,
    handleKeyDown
  }
}

export type ProjectPagesEditorMenus = ReturnType<typeof useProjectPagesEditorMenus>
