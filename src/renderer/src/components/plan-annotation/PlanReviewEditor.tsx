// The plan, reviewed the way a markdown file is in the editor's rich mode: editable in place,
// select to annotate, notes in the margin beside their passage, Cmd+F search and a contents panel.
//
// Built from the markdown viewer's own pieces rather than mounting RichMarkdownEditor: that
// component is bound to a worktree file (autosave, diff comments in the store, doc links), and a
// plan handed over by an agent may live anywhere, or nowhere.

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { EditorContent } from '@tiptap/react'
import { MessageSquare, Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import type { DiffComment } from '../../../../shared/types'
import { MarkdownTableOfContentsPanel } from '../editor/MarkdownTableOfContentsPanel'
import { RichMarkdownSearchBar } from '../editor/RichMarkdownSearchBar'
import { RichMarkdownToolbar } from '../editor/RichMarkdownToolbar'
import { useRichMarkdownSearch } from '../editor/useRichMarkdownSearch'
import { useRichMarkdownTableOfContents } from '../editor/use-rich-markdown-table-of-contents'
import type { DraftNote } from './plan-annotation-notes'
import { PlanReviewNoteLayer } from './PlanReviewNoteLayer'
import { PlanReviewNotePopover } from './PlanReviewNotePopover'
import { usePlanReviewAnnotations } from './use-plan-review-annotations'
import { usePlanReviewEditor } from './use-plan-review-editor'
import { usePlanReviewHeadingJump } from './use-plan-review-heading-jump'
import { usePlanReviewHoverBlock, type PlanReviewHoverBlock } from './use-plan-review-hover-block'

export function PlanReviewEditor({
  initialContent,
  notes,
  readable,
  showTableOfContents,
  wholePlanRequest,
  onReady,
  onChange,
  onAddNote,
  onUpdateNote,
  onRemoveNote,
  onCloseTableOfContents
}: {
  initialContent: string
  notes: readonly DraftNote[]
  /** Caps the line length; off gives the full width the markdown viewer uses. */
  readable: boolean
  showTableOfContents: boolean
  /** Incremented by the header to open a whole-plan note. */
  wholePlanRequest: number
  onReady: (baseline: string) => void
  onChange: (markdown: string) => void
  onAddNote: (note: DraftNote) => void
  onUpdateNote: (id: string, body: string) => void
  onRemoveNote: (id: string) => void
  onCloseTableOfContents: () => void
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const [markdown, setMarkdown] = useState(initialContent)
  // The editor and the annotation hook each need the other; refs break the cycle.
  const annotationsRef = useRef<ReturnType<typeof usePlanReviewAnnotations> | null>(null)
  const commentsRef = useRef<readonly DiffComment[]>([])

  const { editor, editorRef } = usePlanReviewEditor({
    content: initialContent,
    commentsRef,
    callbacks: {
      onReady: (baseline) => {
        setMarkdown(baseline)
        onReady(baseline)
      },
      onChange: (next) => {
        setMarkdown(next)
        onChange(next)
      },
      onSelectionChange: (live) => annotationsRef.current?.syncTarget(live),
      onBlur: () => annotationsRef.current?.clearTarget(),
      openPassageDraft: (live) => annotationsRef.current?.openPassageDraft(live) ?? false,
      scrollCardIntoView: (id) =>
        annotationsRef.current?.scrollRichMarkdownReviewNoteCardIntoView(id)
    }
  })

  const annotations = usePlanReviewAnnotations({
    editor,
    editorRef,
    markdown,
    notes,
    rootRef,
    scrollContainerRef,
    onAddNote
  })
  annotationsRef.current = annotations
  commentsRef.current = annotations.comments

  const { searchState, searchActions } = useRichMarkdownSearch({
    editor,
    rootRef,
    scrollContainerRef
  })
  const { tableOfContentsItems } = useRichMarkdownTableOfContents(
    showTableOfContents,
    markdown,
    scrollContainerRef
  )
  const { jumpToHeading, glow } = usePlanReviewHeadingJump({
    items: tableOfContentsItems,
    scrollContainerRef
  })

  const hover = usePlanReviewHoverBlock({
    editor,
    scrollContainerRef,
    disabled: annotations.draft !== null
  })
  const openBlockDraft = (block: PlanReviewHoverBlock): void => {
    if (!editor) {
      return
    }
    // view.focus() rather than the focus command: that defers a frame, and ProseMirror only writes
    // the selection to the DOM, where the draft reads it, once the view has focus.
    editor.view.focus()
    editor.commands.setTextSelection({ from: block.from, to: block.to })
    annotations.openPassageDraft(true)
  }

  // A mouse selection opens the note box straight away; keyboard selections (often edits) use
  // Mod+Shift+A instead, so selecting text to retype it does not keep popping a box.
  const mouseSelectingRef = useRef(false)
  useEffect(() => {
    const onMouseUp = (): void => {
      if (!mouseSelectingRef.current) {
        return
      }
      mouseSelectingRef.current = false
      window.requestAnimationFrame(() => {
        if (editorRef.current && !editorRef.current.state.selection.empty) {
          annotationsRef.current?.openPassageDraft(true)
        }
      })
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [editorRef])

  const { openWholePlanDraft } = annotations
  // Seeded with the mount-time value so remounting (back from Changes) does not reopen a draft.
  const handledWholePlanRequest = useRef(wholePlanRequest)
  useEffect(() => {
    if (wholePlanRequest !== handledWholePlanRequest.current) {
      handledWholePlanRequest.current = wholePlanRequest
      openWholePlanDraft()
    }
  }, [openWholePlanDraft, wholePlanRequest])

  return (
    <div className="rich-markdown-editor-layout plan-review-layout">
      {showTableOfContents ? (
        <MarkdownTableOfContentsPanel
          items={tableOfContentsItems}
          onClose={onCloseTableOfContents}
          onNavigate={jumpToHeading}
        />
      ) : null}
      <div
        ref={rootRef}
        className={[
          'rich-markdown-editor-shell plan-review-shell',
          readable ? 'is-readable' : '',
          annotations.railExpanded ? 'has-rich-markdown-review-notes' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ '--editor-font-zoom-level': editorFontZoomLevel } as React.CSSProperties}
      >
        <RichMarkdownToolbar editor={editor} />
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollContainerRef}
            className="relative h-full overflow-auto scrollbar-editor"
            onMouseMove={hover.onMouseMove}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={(event) => {
              const target = event.target instanceof Element ? event.target : null
              mouseSelectingRef.current =
                event.button === 0 &&
                target?.closest('.ProseMirror') !== null &&
                target?.closest('a') === null
            }}
          >
            <EditorContent editor={editor} />
            {glow ? (
              <div
                key={glow.key}
                aria-hidden
                className="plan-review-heading-glow"
                style={{ top: glow.top, left: glow.left, width: glow.width, height: glow.height }}
              />
            ) : null}
            {hover.block && !annotations.draft ? (
              <button
                type="button"
                className="orca-diff-comment-add-btn rich-markdown-comment-add-btn plan-review-gutter-add"
                style={{ top: hover.block.top, left: hover.block.left }}
                title="Add a note on this line"
                aria-label="Add a note on this line"
                // Keeps the editor focused, so the block selection it makes is live.
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (hover.block) {
                    openBlockDraft(hover.block)
                  }
                }}
              >
                <Plus className="size-3.5" strokeWidth={2.5} />
              </button>
            ) : null}
            {annotations.reviewRailVisible && annotations.notePositions.length > 0 ? (
              <PlanReviewNoteLayer
                positions={annotations.notePositions}
                activeCommentId={annotations.activeReviewCommentId}
                attentionCommentId={annotations.attentionReviewCommentId}
                markdown={markdown}
                onScrollSourceIntoView={annotations.scrollRichMarkdownReviewNoteSourceIntoView}
                onDelete={onRemoveNote}
                onSubmitEdit={async (id, body) => {
                  onUpdateNote(id, body)
                  return true
                }}
                onContentResize={annotations.syncNotePositions}
              />
            ) : null}
          </div>
          <RichMarkdownSearchBar
            activeMatchIndex={searchState.activeMatchIndex}
            isOpen={searchState.isSearchOpen}
            isReplaceMode={searchState.isReplaceMode}
            matchCase={searchState.matchCase}
            matchCount={searchState.matchCount}
            query={searchState.searchQuery}
            replaceQuery={searchState.replaceQuery}
            replaceDisabled={searchState.replaceDisabled}
            searchInputRef={searchState.searchInputRef}
            wholeWord={searchState.wholeWord}
            onClose={searchActions.closeSearch}
            onMoveToMatch={searchActions.moveToMatch}
            onQueryChange={searchActions.setSearchQuery}
            onReplaceAll={searchActions.replaceAllMatches}
            onReplaceCurrent={searchActions.replaceCurrentMatch}
            onReplaceQueryChange={searchActions.setReplaceQuery}
            onToggleMatchCase={searchActions.toggleMatchCase}
            onToggleReplaceMode={searchActions.toggleReplaceMode}
            onToggleWholeWord={searchActions.toggleWholeWord}
          />
        </div>
        {annotations.draft ? (
          <PlanReviewNotePopover
            draft={annotations.draft}
            onCancel={annotations.cancelDraft}
            onSubmit={annotations.submitDraft}
          />
        ) : null}
        {annotations.comments.length > 0 ? (
          <div className="rich-markdown-review-rail-actions">
            <button
              type="button"
              className="rich-markdown-review-rail-toggle"
              aria-expanded={annotations.reviewRailOpen}
              aria-label={annotations.reviewRailOpen ? 'Hide review notes' : 'Show review notes'}
              title={annotations.reviewRailOpen ? 'Hide review notes' : 'Show review notes'}
              onClick={() => annotations.setReviewRailOpen((open) => !open)}
            >
              <MessageSquare className="size-3.5" />
              <span>{annotations.comments.length}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
