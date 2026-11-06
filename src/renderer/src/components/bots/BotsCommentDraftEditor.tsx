// Editing a draft in place with the ActiveCollab rich editor. A bot amend while editing never
// replaces the person's text: it raises a banner offering the bot's version or keeping theirs.
import { LoaderCircle } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import type {
  BotsCommentDraft,
  BotsCommentDraftFailure
} from '../../../../shared/bots-comment-draft-types'
import { activeCollabCommentBodyHtml } from '../activecollab-comment-body-html'
import { activeCollabCommentHtmlForEditor } from '../activecollab-comment-mention-document'
import {
  ActiveCollabRichBodyFrame,
  useActiveCollabRichBody
} from '../activecollab-rich-body-editor'
import { describeBotsCommentDraftFailure } from './bots-comment-draft-failure-message'

type Busy = 'save' | 'post' | null

export function BotsCommentDraftEditor({
  draft,
  onClose
}: {
  /** The latest draft from the server; a newer version than the one being edited is a conflict. */
  draft: BotsCommentDraft
  onClose: () => void
}): React.JSX.Element {
  const [baseVersion, setBaseVersion] = useState(draft.version)
  const [conflict, setConflict] = useState<BotsCommentDraft | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const body = useActiveCollabRichBody({
    projectId: draft.projectId,
    disabled: busy !== null,
    placeholder: translate(
      'auto.components.bots.commentDrafts.editorPlaceholder',
      'Write a comment'
    ),
    ariaLabel: translate('auto.components.bots.commentDrafts.editorLabel', 'Draft comment'),
    initialHtml: draft.bodyHtml
  })
  const { editor } = body
  // The serialised seed, so an untouched editor posts without writing a new version.
  const seededHtml = useRef<string | null>(null)
  useEffect(() => {
    if (editor && seededHtml.current === null) {
      seededHtml.current = activeCollabCommentBodyHtml(editor.state.doc)
      editor.commands.focus('end')
    }
  }, [editor])

  const hasText =
    useEditorState({
      editor,
      selector: ({ editor: current }) =>
        current === null ? false : hasBoundedCommentBodyText(current.getText())
    }) ?? false

  const newer = conflict ?? (draft.version > baseVersion ? draft : null)

  const currentEdit = (version: number) => {
    if (!editor) {
      return null
    }
    const bodyHtml = activeCollabCommentBodyHtml(editor.state.doc)
    return {
      bodyHtml,
      bodyText: editor.getText(),
      baseVersion: version,
      dirty: bodyHtml !== seededHtml.current
    }
  }

  const fail = (failure: BotsCommentDraftFailure): void => {
    if (failure.reason === 'conflict') {
      setConflict(failure.draft)
      return
    }
    setError(describeBotsCommentDraftFailure(failure))
  }

  const save = async (version: number): Promise<void> => {
    const edit = currentEdit(version)
    if (!edit || !edit.bodyHtml) {
      return
    }
    if (!edit.dirty && version === baseVersion) {
      onClose()
      return
    }
    setBusy('save')
    setError(null)
    const result = await window.api.bots.updateCommentDraft({
      id: draft.id,
      bodyHtml: edit.bodyHtml,
      bodyText: edit.bodyText,
      baseVersion: edit.baseVersion
    })
    setBusy(null)
    if (result.ok) {
      onClose()
      return
    }
    fail(result)
  }

  const post = async (): Promise<void> => {
    const edit = currentEdit(baseVersion)
    if (!edit || !edit.bodyHtml) {
      return
    }
    setBusy('post')
    setError(null)
    const result = await window.api.bots.postCommentDraft({
      id: draft.id,
      edit: edit.dirty
        ? { bodyHtml: edit.bodyHtml, bodyText: edit.bodyText, baseVersion: edit.baseVersion }
        : undefined
    })
    setBusy(null)
    if (result.ok) {
      onClose()
      return
    }
    fail(result)
  }

  const useTheirs = (): void => {
    if (!editor || !newer) {
      return
    }
    editor.commands.setContent(activeCollabCommentHtmlForEditor(newer.bodyHtml), {
      contentType: 'html'
    })
    seededHtml.current = activeCollabCommentBodyHtml(editor.state.doc)
    setBaseVersion(newer.version)
    setConflict(null)
  }

  const keepMine = (): void => {
    if (!newer) {
      return
    }
    const version = newer.version
    setBaseVersion(version)
    setConflict(null)
    void save(version)
  }

  return (
    <div className="flex flex-col gap-2">
      {newer ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-chat-warn bg-chat-warn-tint px-3 py-2 text-xs text-chat-warn-ink"
        >
          <span>
            {translate(
              'auto.components.bots.commentDrafts.botUpdated',
              '{{value0}} updated this draft',
              { value0: newer.botName }
            )}
          </span>
          <div className="flex gap-2">
            <Button size="xs" variant="secondary" onClick={useTheirs}>
              {translate('auto.components.bots.commentDrafts.useTheirs', "Use {{value0}}'s", {
                value0: newer.botName
              })}
            </Button>
            <Button size="xs" variant="outline" onClick={keepMine}>
              {translate('auto.components.bots.commentDrafts.keepMine', 'Keep mine')}
            </Button>
          </div>
        </div>
      ) : null}
      <ActiveCollabRichBodyFrame
        body={body}
        attachments={null}
        disabled={busy !== null}
        dragging={false}
        footer={
          <div className="flex items-center justify-end gap-1.5 border-t border-border px-1.5 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              {translate('auto.components.bots.commentDrafts.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={busy !== null || !hasText || newer !== null}
              onClick={() => void save(baseVersion)}
            >
              {busy === 'save' ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {translate('auto.components.bots.commentDrafts.save', 'Save')}
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={busy !== null || !hasText || newer !== null}
              onClick={() => void post()}
            >
              {busy === 'post' ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {translate('auto.components.bots.commentDrafts.post', 'Post')}
            </Button>
          </div>
        }
      />
      {error ? (
        <p role="status" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
