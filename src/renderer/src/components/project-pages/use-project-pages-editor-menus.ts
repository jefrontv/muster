// Slash menu and [[ page-link menu for the page editor. ProseMirror keeps the first key handler,
// so everything it reads goes through refs.
import type { Editor } from '@tiptap/react'
import { useMemo, useRef, useState } from 'react'
import { pageLinkHref } from '../../../../shared/project-pages-plain-text'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import type { SlashCommand, SlashMenuState } from '../editor/rich-markdown-slash-command-primitives'
import { runSlashCommand, syncSlashMenu } from '../editor/rich-markdown-slash-commands'
import { filterPageSlashItems, type PageSlashItem } from './project-pages-slash-items'
import { pageTitle } from './project-pages-tree-model'

const LINK_TRIGGER = /\[\[([^[\]\n\uFFFC]{0,60})$/

export type PageLinkMenuState = SlashMenuState

function syncPageLinkMenu(editor: Editor, root: HTMLElement | null): PageLinkMenuState | null {
  const { selection } = editor.state
  if (!root || !selection.empty || !selection.$from.parent.isTextblock) {
    return null
  }
  const { $from } = selection
  const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\uFFFC')
  const match = before.match(LINK_TRIGGER)
  if (!match) {
    return null
  }
  const coords = editor.view.coordsAtPos(selection.from)
  const rect = root.getBoundingClientRect()
  return {
    query: match[1],
    from: selection.from - match[0].length,
    to: selection.from,
    left: coords.left - rect.left,
    top: coords.bottom - rect.top + 8
  }
}

export function useProjectPagesEditorMenus(
  pages: readonly ProjectPageMeta[],
  pageId: string,
  extraCommands: readonly SlashCommand[]
) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null)
  const [linkMenu, setLinkMenu] = useState<PageLinkMenuState | null>(null)
  const [selected, setSelected] = useState(0)
  const [levels, setLevels] = useState<Record<string, number>>({})

  const matches = useMemo(
    () => filterPageSlashItems(extraCommands, slashMenu?.query ?? ''),
    [extraCommands, slashMenu?.query]
  )
  const commands = matches.map((match) => match.item)
  const levelOf = (index: number): number =>
    levels[matches[index]?.item.key] ?? matches[index]?.level ?? 0
  const linkTargets = useMemo(() => {
    const query = (linkMenu?.query ?? '').trim().toLowerCase()
    return pages
      .filter((page) => page.archivedAt === null && page.id !== pageId)
      .filter((page) => !query || pageTitle(page).toLowerCase().includes(query))
      .slice(0, 12)
  }, [pages, pageId, linkMenu?.query])

  const live = useRef({ slashMenu, linkMenu, commands, linkTargets, selected, levelOf })
  live.current = { slashMenu, linkMenu, commands, linkTargets, selected, levelOf }

  function sync(editor: Editor): void {
    const nextLink = syncPageLinkMenu(editor, rootRef.current)
    setLinkMenu(nextLink)
    if (nextLink) {
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

  function insertPageLink(editor: Editor, menu: PageLinkMenuState, page: ProjectPageMeta): void {
    editor
      .chain()
      .focus()
      .deleteRange({ from: menu.from, to: menu.to })
      .insertContent([
        {
          type: 'text',
          text: pageTitle(page),
          marks: [{ type: 'link', attrs: { href: pageLinkHref(page.id) } }]
        },
        { type: 'text', text: ' ' }
      ])
      .run()
    setLinkMenu(null)
  }

  /** True when a menu consumed the key. */
  function handleKeyDown(editor: Editor | null, event: KeyboardEvent): boolean {
    const state = live.current
    if (!editor || (!state.linkMenu && !state.slashMenu)) {
      return false
    }
    const count = state.linkMenu ? state.linkTargets.length : state.commands.length
    if (event.key === 'Escape') {
      setLinkMenu(null)
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
    if (state.linkMenu) {
      insertPageLink(editor, state.linkMenu, state.linkTargets[index])
    } else if (state.slashMenu) {
      runItem(editor, state.slashMenu, state.commands[index], state.levelOf(index))
    }
    return true
  }

  return {
    rootRef,
    slashMenu,
    linkMenu,
    commands,
    linkTargets,
    selected,
    levelOf,
    setLevel: (key: string, level: number) => setLevels((c) => ({ ...c, [key]: level })),
    runItem,
    sync,
    handleKeyDown,
    insertPageLink
  }
}

export type ProjectPagesEditorMenus = ReturnType<typeof useProjectPagesEditorMenus>
