// Pages: Notion-like nested pages for each project.
import { ArrowLeft, FileText, History, MessageSquareText, Search, Waypoints } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { tagNodeId } from '../../../../shared/project-pages-graph-types'
import { ancestorsOf } from '../../../../shared/project-pages-tree'
import type { ProjectPageDocument } from '../../../../shared/project-pages-types'
import type { AutosaveState } from './project-pages-autosave'
import { buildPageTree, pageTitle } from './project-pages-tree-model'
import { ProjectPageBacklinks } from './ProjectPageBacklinks'
import { ProjectPageDatabaseView } from './ProjectPageDatabaseView'
import { ProjectPageDiagramViewLazy } from './ProjectPageDiagramViewLazy'
import { ProjectPageEditor } from './ProjectPageEditor'
import { ProjectPageRowProperties } from './ProjectPageRowProperties'
import { ProjectPagesAgentPanel } from './ProjectPagesAgentPanel'
import { ProjectPageHistoryDialog } from './ProjectPageHistoryDialog'
import { ProjectPagesQuickSwitcher } from './ProjectPagesQuickSwitcher'
import { ProjectPagesMap } from './ProjectPagesMap'
import { ProjectPagesFolderView } from './ProjectPagesFolderView'
import { ProjectPagesSidebar } from './ProjectPagesSidebar'
import { ProjectPagesScopePicker } from './ProjectPagesScopePicker'
import { PagesPanelSlot, PagesPanelToggle, usePagesPanelCollapsed } from './ProjectPagesPanelToggle'
import { ProjectPagesTransferMenu } from './ProjectPagesTransferMenu'
import { useProjectPagesScopes } from './use-project-pages-scopes'
import { useProjectPagesTree } from './use-project-pages-tree'
import { lastPageIn, lastPagesScope, rememberPagesLocation } from './project-pages-location'
import { useAgentChangedPages } from './project-pages-seen'
import { useProjectPagesEmbed, type ProjectPagesEmbed } from './use-project-pages-embed'

const SAVE_LABELS: Record<AutosaveState, string> = {
  saved: 'Saved',
  pending: 'Unsaved',
  saving: 'Saving…',
  conflict: 'Not saved',
  error: 'Not saved'
}

export default function ProjectPagesPage({
  embedded
}: { embedded?: ProjectPagesEmbed } = {}): React.JSX.Element {
  const closePagesPage = useAppStore((s) => s.closePagesPage)
  const { options, activeKey } = useProjectPagesScopes()
  const [chosenKey, setChosenKey] = useState<string | null>(lastPagesScope)
  const scopeKey =
    embedded?.scopeKey ??
    (chosenKey && options.some((o) => o.key === chosenKey)
      ? chosenKey
      : (activeKey ?? options[0]?.key ?? null))
  const mainRef = useRef<HTMLElement | null>(null)
  const { pages, loaded, error } = useProjectPagesTree(scopeKey)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [doc, setDoc] = useState<ProjectPageDocument | null>(null)
  const [saveState, setSaveState] = useState<AutosaveState>('saved')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [sidebarCollapsed, toggleSidebar] = usePagesPanelCollapsed('pagesSidebar')
  const [mapOpen, setMapOpen] = useState(false)
  const [mapFocus, setMapFocus] = useState<string | null>(null)
  const isMac = navigator.userAgent.includes('Mac')
  const isEmbedded = embedded !== undefined
  const spaceVersion = useMemo(() => pages.map((p) => `${p.id}:${p.revision}`).join(','), [pages])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = isMac ? event.metaKey : event.ctrlKey
      // In a tab, ⌘P stays the file finder unless focus is inside Pages.
      if (isEmbedded && !mainRef.current?.contains(document.activeElement)) {
        return
      }
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        event.stopPropagation()
        setSwitcherOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isMac, isEmbedded])

  const live = useMemo(() => pages.filter((p) => p.archivedAt === null), [pages])
  const remembered = lastPageIn(scopeKey)
  const firstPageId = useMemo(() => buildPageTree(pages)[0]?.page.id ?? null, [pages])
  const pageId =
    [selectedId, remembered, firstPageId].find((id) => id && live.some((p) => p.id === id)) ?? null
  const meta = pageId ? live.find((p) => p.id === pageId) : undefined
  const parentDatabaseId =
    meta?.parentId && live.some((p) => p.id === meta.parentId && p.database) ? meta.parentId : null

  useEffect(() => {
    rememberPagesLocation(scopeKey, pageId)
  }, [scopeKey, pageId])

  const changedIds = useAgentChangedPages(scopeKey, pages, loaded, meta)
  useProjectPagesEmbed(embedded, pageId, meta ? pageTitle(meta) : null, setSelectedId)

  useEffect(() => {
    setDoc(null)
    if (!scopeKey || !pageId) {
      return undefined
    }
    let disposed = false
    void window.api.projectPages.read(scopeKey, pageId).then((result) => {
      if (!disposed && result.ok) {
        setDoc(result.value)
      }
    })
    return () => {
      disposed = true
    }
  }, [scopeKey, pageId])

  const report = (result: { ok: boolean; message?: string }): void => {
    if (!result.ok) {
      toast.error(result.message)
    }
  }

  const create = async (
    parentId: string | null,
    folder = false,
    diagram = false
  ): Promise<void> => {
    if (!scopeKey) {
      return
    }
    const result = await window.api.projectPages.create(scopeKey, { parentId, folder })
    if (result.ok && diagram) {
      report(await window.api.projectPages.enableDiagram(scopeKey, result.value.meta.id))
    }
    if (result.ok) {
      setSelectedId(result.value.meta.id)
      setFresh(result.value.meta.id)
    } else {
      report(result)
    }
  }

  const trail = meta ? ancestorsOf(pages, meta.id) : []
  const backLabel = translate('auto.components.projectPages.back', 'Back')

  return (
    <main
      ref={mainRef}
      className={`flex min-h-0 flex-1 flex-col bg-background ${isEmbedded ? '' : 'border-l border-border'}`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border py-3 pr-5 pl-3">
        {/* In a tab the right sidebar holds the page tree, so the in-page tree is left out. */}
        {isEmbedded ? null : (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label={backLabel}
              onClick={closePagesPage}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <PagesPanelToggle
              collapsed={sidebarCollapsed}
              onToggle={toggleSidebar}
              showLabel={translate('auto.components.projectPages.showSidebar', 'Show pages')}
              hideLabel={translate('auto.components.projectPages.hideSidebar', 'Hide pages')}
            />
          </>
        )}
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">
          {translate('auto.components.projectPages.title', 'Pages')}
        </span>
        {isEmbedded ? null : (
          <ProjectPagesScopePicker
            options={options}
            value={scopeKey}
            onChange={(key) => {
              setChosenKey(key)
              setSelectedId(null)
            }}
          />
        )}
        <nav
          aria-label={translate('auto.components.projectPages.breadcrumb', 'Page path')}
          className="ml-2 flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-muted-foreground"
        >
          {trail.map((page, i) => (
            <span key={page.id} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <span aria-hidden>/</span> : null}
              <button
                type="button"
                className="truncate hover:text-foreground"
                onClick={() => setSelectedId(page.id)}
              >
                {pageTitle(page)}
              </button>
            </span>
          ))}
        </nav>
        {doc ? (
          <span className="shrink-0 text-xs text-muted-foreground" role="status">
            {translate(`auto.components.projectPages.save.${saveState}`, SAVE_LABELS[saveState])}
          </span>
        ) : null}
        {scopeKey ? (
          <>
            <Button
              variant={mapOpen ? 'secondary' : 'ghost'}
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label={translate('auto.components.projectPages.map.open', 'Map')}
              aria-pressed={mapOpen}
              title={translate('auto.components.projectPages.map.open', 'Map')}
              onClick={() => setMapOpen((open) => !open)}
            >
              <Waypoints className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label={translate('auto.components.projectPages.switcher', 'Go to page')}
              title={`${translate('auto.components.projectPages.switcher', 'Go to page')} (${isMac ? '⌘P' : 'Ctrl+P'})`}
              onClick={() => setSwitcherOpen(true)}
            >
              <Search className="size-4" />
            </Button>
            <Button
              variant={agentOpen ? 'secondary' : 'ghost'}
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label={translate('auto.components.projectPages.askAgent', 'Ask agent')}
              aria-pressed={agentOpen}
              title={translate('auto.components.projectPages.askAgent', 'Ask agent')}
              onClick={() => setAgentOpen((open) => !open)}
            >
              <MessageSquareText className="size-4" />
            </Button>
            <ProjectPagesTransferMenu
              scopeKey={scopeKey}
              projectName={options.find((o) => o.key === scopeKey)?.label ?? 'Pages'}
            />
            <ProjectPagesQuickSwitcher
              scopeKey={scopeKey}
              pages={pages}
              open={switcherOpen}
              onOpenChange={setSwitcherOpen}
              onPick={setSelectedId}
            />
          </>
        ) : null}
        {meta && scopeKey ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label={translate('auto.components.projectPages.history', 'Page history')}
              title={translate('auto.components.projectPages.history', 'Page history')}
              onClick={() => setHistoryOpen(true)}
            >
              <History className="size-4" />
            </Button>
            <ProjectPageHistoryDialog
              scopeKey={scopeKey}
              page={meta}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
            />
          </>
        ) : null}
      </header>

      {error ? (
        <p className="shrink-0 border-b border-border bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {!scopeKey ? (
        <p className="p-6 text-sm text-muted-foreground">
          {translate(
            'auto.components.projectPages.noProjects',
            'Add a project to the sidebar to give it pages.'
          )}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <PagesPanelSlot
            collapsed={isEmbedded || sidebarCollapsed}
            width="w-[clamp(14rem,26%,18rem)]"
          >
            <ProjectPagesSidebar
              className="w-full min-w-56 shrink-0 border-r border-border"
              pages={pages}
              loaded={loaded}
              changedIds={changedIds}
              selectedId={pageId}
              onSelect={setSelectedId}
              onCreate={(parentId, folder, diagram) => void create(parentId, folder, diagram)}
              onTrash={(id) => void window.api.projectPages.archive(scopeKey, id).then(report)}
              onRestore={(id) => void window.api.projectPages.restore(scopeKey, id).then(report)}
              onMove={(id, move) =>
                void window.api.projectPages.move(scopeKey, id, move).then(report)
              }
            />
          </PagesPanelSlot>
          <section className="flex min-w-0 flex-1 flex-col">
            {mapOpen ? (
              <ProjectPagesMap
                scopeKey={scopeKey}
                version={spaceVersion}
                currentPageId={pageId}
                focus={mapFocus}
                onFocusChange={setMapFocus}
                onOpenPage={(id) => {
                  setSelectedId(id)
                  setMapOpen(false)
                }}
                onClose={() => setMapOpen(false)}
              />
            ) : meta?.diagram ? (
              <ProjectPageDiagramViewLazy
                key={`${scopeKey}/${meta.id}`}
                scopeKey={scopeKey}
                meta={meta}
                autoFocusTitle={fresh === meta.id}
                pages={pages}
                onOpenPage={setSelectedId}
                onSaveState={setSaveState}
              />
            ) : doc && meta && doc.meta.id === meta.id ? (
              <ProjectPageEditor
                key={`${scopeKey}/${doc.meta.id}`}
                scopeKey={scopeKey}
                doc={doc}
                latestRevision={meta.revision}
                latestAuthor={meta.editedBy}
                autoFocusTitle={fresh === doc.meta.id}
                pages={pages}
                onOpenPage={setSelectedId}
                onOpenTag={(tag) => {
                  setMapFocus(tagNodeId(tag.toLowerCase()))
                  setMapOpen(true)
                }}
                onSaveState={setSaveState}
                onMakeDatabase={
                  meta.database
                    ? undefined
                    : () =>
                        void window.api.projectPages.enableDatabase(scopeKey, meta.id).then(report)
                }
                afterTitle={
                  parentDatabaseId ? (
                    <ProjectPageRowProperties
                      scopeKey={scopeKey}
                      row={meta}
                      databaseId={parentDatabaseId}
                      pages={pages}
                    />
                  ) : meta.folder ? (
                    <ProjectPagesFolderView
                      folderId={meta.id}
                      pages={pages}
                      onOpenPage={setSelectedId}
                      onCreate={(kind) =>
                        void create(meta.id, kind === 'folder', kind === 'diagram')
                      }
                    />
                  ) : null
                }
                footer={
                  <>
                    {meta.database ? (
                      <ProjectPageDatabaseView
                        scopeKey={scopeKey}
                        pageId={meta.id}
                        pages={pages}
                        onOpenPage={setSelectedId}
                      />
                    ) : null}
                    <ProjectPageBacklinks
                      scopeKey={scopeKey}
                      pageId={doc.meta.id}
                      spaceVersion={spaceVersion}
                      onOpenPage={setSelectedId}
                    />
                  </>
                }
              />
            ) : loaded && live.length === 0 ? (
              <div className="grid flex-1 place-items-center">
                <Button variant="outline" onClick={() => void create(null)}>
                  {translate('auto.components.projectPages.firstPage', 'Create the first page')}
                </Button>
              </div>
            ) : null}
          </section>
          {agentOpen ? (
            <ProjectPagesAgentPanel
              scopeKey={scopeKey}
              pages={pages}
              openPage={meta ?? null}
              onClose={() => setAgentOpen(false)}
            />
          ) : null}
        </div>
      )}
    </main>
  )
}
