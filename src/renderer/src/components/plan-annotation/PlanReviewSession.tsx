// One review in progress: the draft, the notes, the edits and the answer sent back to the agent.
// Rendered as a popup or inside a plan review tab.

import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import type React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type {
  PlanAnnotationDecision,
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../../../shared/plan-annotation-types'
import {
  PlanAnnotationFooter,
  PlanAnnotationHeader,
  type PlanReviewView
} from './PlanAnnotationChrome'
import { PlanReviewEditor } from './PlanReviewEditor'
import { restoreFocusAfterReview } from './plan-review-focus-return'
import { unifiedPlanDiff } from './plan-annotation-diff'
import {
  clearDraft,
  draftKey,
  loadDraft,
  saveDraft,
  type PlanReviewDraft
} from './plan-annotation-drafts'
import { toAnnotations, type DraftNote } from './plan-annotation-notes'
import {
  shouldShowPlanReviewTableOfContents,
  usePlanReviewModalWidth
} from './plan-review-toc-visibility'

const PlanReviewChangesView = lazy(() => import('./PlanReviewChangesView'))

/** Whether a keydown would be consumed by a layer above the review (search, popover, menu). */
function isInsideNestedLayer(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('.rich-markdown-search, .orca-diff-comment-popover, [role="menu"]') !== null
  )
}

export function PlanReviewSession({
  current,
  waiting,
  variant,
  onSettled
}: {
  current: PlanAnnotationRequest
  waiting: number
  /** A popup over the app, or the body of a plan review tab. */
  variant: 'dialog' | 'tab'
  onSettled: () => void
}): React.JSX.Element {
  const key = draftKey(current)
  const source = current.content
  const [draft, setDraft] = useState<PlanReviewDraft>(() => loadDraft(key, source))
  // The editor's serialization of the plan as sent, restored with edits or taken on first render.
  const [baseline, setBaseline] = useState<string | null>(() => draft.edits?.baseline ?? null)
  const [view, setView] = useState<PlanReviewView>('rich')
  // A plan with no headings would get an empty panel; a narrow window starts it closed.
  const hasOutline = useMemo(() => /^#{1,6}\s/m.test(current.content), [current.content])
  const [modalWidth, modalRef] = usePlanReviewModalWidth()
  const [tableOfContentsChoice, setTableOfContentsChoice] = useState<boolean | null>(null)
  const showTableOfContents = shouldShowPlanReviewTableOfContents({
    hasOutline,
    modalWidth,
    userChoice: tableOfContentsChoice
  })
  const [readable, setReadable] = useState(true)
  const [wholePlanRequest, setWholePlanRequest] = useState(0)

  /**
   * Writes the draft at the point of change rather than from an effect on `draft`.
   *
   * Why: an effect keyed on [key, draft] fires once with the NEW key and the OLD draft still in
   * scope, so opening a review saved an empty list over its own draft and erased it.
   */
  const applyDraft = useCallback(
    (update: (previous: PlanReviewDraft) => PlanReviewDraft) => {
      setDraft((previous) => {
        const next = update(previous)
        saveDraft(key, next)
        return next
      })
    },
    [key]
  )

  const setNotes = useCallback(
    (update: (notes: DraftNote[]) => DraftNote[]) =>
      applyDraft((previous) => ({ ...previous, notes: update(previous.notes) })),
    [applyDraft]
  )

  const handleEdit = useCallback(
    (markdown: string) => {
      if (baseline === null) {
        return
      }
      applyDraft((previous) => ({
        ...previous,
        edits: markdown === baseline ? null : { source, baseline, content: markdown }
      }))
    },
    [applyDraft, baseline, source]
  )

  const editedContent = draft.edits?.content ?? null
  // Against the editor's baseline, not the file: a markdown round trip normalises things nobody
  // edited (bullets, table padding), and the agent must only be told what a person changed.
  const diff = useMemo(
    () =>
      baseline !== null && editedContent !== null ? unifiedPlanDiff(baseline, editedContent) : '',
    [baseline, editedContent]
  )
  const edited = diff.length > 0
  const hasFeedback = draft.notes.length > 0 || edited

  const settle = useCallback(
    (decision: PlanAnnotationDecision) => {
      const result: PlanAnnotationResult = {
        decision,
        annotations: decision === 'dismissed' ? [] : toAnnotations(draft.notes),
        ...(decision !== 'dismissed' && edited
          ? { edits: { unifiedDiff: diff, appliedToDisk: false } }
          : {})
      }
      void window.api.planAnnotation
        .respond({ requestId: current.requestId, result })
        .catch(() => undefined)
      clearDraft(key)
      onSettled()
    },
    [current.requestId, diff, draft.notes, edited, key, onSettled]
  )

  const body = (
    <>
      <PlanAnnotationHeader
        inDialog={variant === 'dialog'}
        title={current.title}
        agent={current.agent}
        project={current.project}
        round={current.round}
        waiting={waiting}
        view={view}
        canShowChanges={current.previousContent !== null}
        showTableOfContents={showTableOfContents}
        readable={readable}
        onViewChange={setView}
        onToggleTableOfContents={() => setTableOfContentsChoice(!showTableOfContents)}
        onToggleReadable={() => setReadable((value) => !value)}
        onWholePlanNote={() => setWholePlanRequest((count) => count + 1)}
        onCopyPlan={() => void navigator.clipboard.writeText(editedContent ?? current.content)}
      />

      <div className="min-h-0 flex-1">
        {view === 'changes' && current.previousContent !== null ? (
          <Suspense fallback={null}>
            <PlanReviewChangesView
              requestId={current.requestId}
              previous={current.previousContent}
              current={editedContent ?? current.content}
            />
          </Suspense>
        ) : (
          <PlanReviewEditor
            initialContent={editedContent ?? current.content}
            notes={draft.notes}
            readable={readable}
            showTableOfContents={showTableOfContents}
            wholePlanRequest={wholePlanRequest}
            onReady={(serialized) => setBaseline((known) => known ?? serialized)}
            onChange={handleEdit}
            onAddNote={(note) => setNotes((notes) => [...notes, note])}
            onUpdateNote={(id, body) =>
              setNotes((notes) => notes.map((note) => (note.id === id ? { ...note, body } : note)))
            }
            onRemoveNote={(id) => setNotes((notes) => notes.filter((note) => note.id !== id))}
            onCloseTableOfContents={() => setTableOfContentsChoice(false)}
          />
        )}
      </div>

      <PlanAnnotationFooter
        noteCount={draft.notes.length}
        edited={edited}
        onDismiss={() => settle('dismissed')}
        onApprove={() => settle(hasFeedback ? 'approved_with_notes' : 'approved')}
        onSend={() => settle('annotated')}
      />
    </>
  )

  if (variant === 'tab') {
    return (
      <div
        ref={modalRef}
        data-plan-review-tab=""
        className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--editor-surface)]"
      >
        {body}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !next && settle('dismissed')}>
      <DialogContent
        ref={modalRef}
        showCloseButton={false}
        // Escape closes whatever is on top (search, note draft, menu); it never ends the review,
        // which would discard every note AND answer the waiting agent with "no feedback".
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          if (!isInsideNestedLayer(event.target) && showTableOfContents) {
            setTableOfContentsChoice(false)
          }
        }}
        data-plan-review-dialog=""
        // Focusing the first header button on open would pop its tooltip over the toolbar.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocusAfterReview()
        }}
        // A click outside must not end the review either.
        onInteractOutside={(event) => event.preventDefault()}
        // Readable width is a centred window sized to the plan; full width takes the whole app for
        // wide tables. A plan rarely needs the whole screen, and a window reads as a dialog.
        className={`flex max-w-none flex-col gap-0 overflow-hidden bg-[var(--editor-surface)] p-0 sm:max-w-none dark:bg-[var(--editor-surface)] ${
          readable
            ? 'h-[min(90vh,1040px)] w-[min(1600px,calc(100vw-4rem))]'
            : 'top-6 right-6 bottom-6 left-6 w-auto translate-x-0 translate-y-0'
        }`}
      >
        {body}
      </DialogContent>
    </Dialog>
  )
}
