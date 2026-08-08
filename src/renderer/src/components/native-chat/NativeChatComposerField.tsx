import type {
  ClipboardEventHandler,
  CompositionEventHandler,
  KeyboardEventHandler,
  RefObject
} from 'react'
import { FileText, ImageOff, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import { basename } from '@/lib/path'
import { isNativeChatPastedImagePath } from './native-chat-image-paste'
import type { ComposerAutocomplete, NativeChatPickerItem } from './native-chat-composer-state'
import { NativeChatMentionHint, NativeChatPickerMenu } from './NativeChatAutocompleteMenus'
import { NativeChatComposerActions } from './NativeChatComposerActions'
import {
  NativeChatApprovalActions,
  NativeChatApprovalPanel,
  type NativeChatComposerApproval
} from './NativeChatApprovalPanel'
import type { NativeChatPromptStash } from './use-native-chat-prompt-stash'
import type { NativeChatTaskAttachment } from './use-native-chat-task-attachments'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { NativeChatImageThumb } from './NativeChatImageThumb'
import { nativeChatComposerPlaceholder } from './native-chat-composer-target'
import type {
  SessionOptionDescriptor,
  SessionOptionsSurface
} from '../../../../shared/native-chat-session-options'

export type NativeChatComposerFieldProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  disabled: boolean
  hasPty: boolean
  canSend: boolean
  autocomplete: ComposerAutocomplete
  activeSuggestion: number
  notice: string | null
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  fileAttachments: readonly NativeChatComposerImageAttachment[]
  sendButtonDisabled: boolean
  isWorking: boolean
  attachDisabled: boolean
  dictationDisabled: boolean
  /** False = voice not set up; the mic routes to settings and says so. */
  dictationConfigured?: boolean
  isDictating: boolean
  isDictationHoldMode: boolean
  onDraftChange: (value: string, element: HTMLTextAreaElement) => void
  onTextareaSelect: (element: HTMLTextAreaElement) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onCompositionStart: CompositionEventHandler<HTMLTextAreaElement>
  onCompositionEnd: CompositionEventHandler<HTMLTextAreaElement>
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>
  pickerListboxId: string
  onChoosePickerItem: (item: NativeChatPickerItem) => void
  onRetrySkills: () => void
  onAcceptMention: () => void
  onRemoveImageAttachment: (id: string) => void
  onRemoveFileAttachment: (id: string) => void
  taskAttachments?: readonly NativeChatTaskAttachment[]
  onRemoveTaskAttachment?: (taskId: number) => void
  onAttach: () => void
  onDictationToggle: () => void
  onDictationHoldStart: () => void
  onDictationHoldEnd: () => void
  onSend: () => void
  onStop?: () => void
  sessionOptionsSurface: SessionOptionsSurface | null
  sessionOptionsSnapshot: SessionOptionDescriptor[]
  /** While set, the editor is disabled and the approval actions own the footer. */
  approval: NativeChatComposerApproval | null
  stash: NativeChatPromptStash
  /** Context-window donut input; null hides the meter. */
  contextUsedTokens: number | null
  contextMaxTokens?: number
  fullAccess?: boolean
  onSetFullAccess?: (enabled: boolean) => void
  onAttachTask?: (task: NativeChatTaskAttachment) => void
  activeCollabProjectId?: number | null
}

export type NativeChatComposerImageAttachment = {
  id: string
  path: string
}

const NO_TASK_ATTACHMENTS: readonly NativeChatTaskAttachment[] = []

export function NativeChatComposerField({
  textareaRef,
  draft,
  disabled,
  hasPty,
  canSend,
  autocomplete,
  activeSuggestion,
  notice,
  imageAttachments,
  fileAttachments,
  sendButtonDisabled,
  isWorking,
  attachDisabled,
  dictationDisabled,
  dictationConfigured,
  isDictating,
  isDictationHoldMode,
  onDraftChange,
  onTextareaSelect,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onPaste,
  pickerListboxId,
  onChoosePickerItem,
  onRetrySkills,
  onAcceptMention,
  onRemoveImageAttachment,
  onRemoveFileAttachment,
  taskAttachments = NO_TASK_ATTACHMENTS,
  onRemoveTaskAttachment,
  onAttach,
  onDictationToggle,
  onDictationHoldStart,
  onDictationHoldEnd,
  onSend,
  onStop,
  sessionOptionsSurface,
  sessionOptionsSnapshot,
  approval,
  stash,
  contextUsedTokens,
  contextMaxTokens,
  fullAccess,
  onSetFullAccess,
  onAttachTask,
  activeCollabProjectId
}: NativeChatComposerFieldProps): React.JSX.Element {
  return (
    <div className="shrink-0 bg-background">
      {/* Extra bottom padding keeps the input box off the window rim. */}
      <div className="px-3 pt-2 pb-4 sm:px-4">
        <div className="relative mx-auto w-full max-w-4xl">
          {autocomplete.mode === 'slash' || autocomplete.mode === 'skill' ? (
            <NativeChatPickerMenu
              autocomplete={autocomplete}
              activeIndex={activeSuggestion}
              listboxId={pickerListboxId}
              onChoose={onChoosePickerItem}
              onRetry={onRetrySkills}
            />
          ) : null}
          {autocomplete.mode === 'mention' ? (
            <NativeChatMentionHint query={autocomplete.query} onAccept={onAcceptMention} />
          ) : null}
          {notice ? (
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageOff className="size-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}
          <div
            data-native-file-drop-target={NATIVE_FILE_DROP_TARGET.composer}
            className={cn(
              // Why: always-on hairline (token-level border, not focus ring) —
              // no focus/click border flash. The box is a container, not a
              // focus target.
              'rounded-lg border border-border p-1.5 shadow-xs',
              'bg-muted/50 dark:bg-input/40'
            )}
          >
            {approval ? <NativeChatApprovalPanel approval={approval} /> : null}
            {imageAttachments.length > 0 ||
            fileAttachments.length > 0 ||
            taskAttachments.length > 0 ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                {taskAttachments.map((task) => (
                  <div
                    key={task.taskId}
                    className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground"
                    title={task.name}
                  >
                    <ActiveCollabIcon className="size-3.5 shrink-0" />
                    <span className="max-w-56 truncate font-medium text-foreground/90">
                      {task.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px]">#{task.taskId}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveTaskAttachment?.(task.taskId)}
                      aria-label={translate(
                        'components.native-chat.composer.removeAttachment',
                        'Remove attachment'
                      )}
                      className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {fileAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground"
                    title={attachment.path}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="max-w-56 truncate">{basename(attachment.path)}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveFileAttachment(attachment.id)}
                      aria-label={translate(
                        'components.native-chat.composer.removeAttachment',
                        'Remove attachment'
                      )}
                      className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {imageAttachments.map((attachment) => (
                  <div key={attachment.id} className="group/thumb relative">
                    <NativeChatImageThumb
                      path={attachment.path}
                      alt={
                        isNativeChatPastedImagePath(attachment.path)
                          ? translate(
                              'components.native-chat.composer.pastedImageLabel',
                              'Pasted image'
                            )
                          : basename(attachment.path)
                      }
                      className="size-16 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveImageAttachment(attachment.id)}
                      aria-label={translate(
                        'components.native-chat.composer.removeAttachment',
                        'Remove attachment'
                      )}
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/thumb:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={disabled || approval !== null}
              rows={2}
              onChange={(e) => onDraftChange(e.target.value, e.currentTarget)}
              onKeyDown={onKeyDown}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              onPaste={onPaste}
              onSelect={(e) => onTextareaSelect(e.currentTarget)}
              aria-expanded={autocomplete.mode === 'slash' || autocomplete.mode === 'skill'}
              aria-controls={
                autocomplete.mode === 'slash' || autocomplete.mode === 'skill'
                  ? pickerListboxId
                  : undefined
              }
              aria-activedescendant={
                (autocomplete.mode === 'slash' || autocomplete.mode === 'skill') &&
                autocomplete.items.length > 0
                  ? `${pickerListboxId}-option-${Math.min(activeSuggestion, autocomplete.items.length - 1)}`
                  : undefined
              }
              placeholder={nativeChatComposerPlaceholder(hasPty, canSend)}
              // Why: coarse-pointer min-height follows the app's touch target convention.
              // scrollbar-sleek keeps the overflow gutter from showing the heavy
              // native scrollbar once the draft exceeds max-height.
              className={cn(
                'scrollbar-sleek min-h-12 max-h-28 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none pointer-coarse:min-h-14',
                'placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50'
              )}
            />
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {approval ? (
                <NativeChatApprovalActions approval={approval} />
              ) : (
                <NativeChatComposerActions
                  attachDisabled={attachDisabled}
                  dictationDisabled={dictationDisabled}
                  dictationConfigured={dictationConfigured}
                  sendDisabled={sendButtonDisabled}
                  isWorking={isWorking}
                  isDictating={isDictating}
                  isDictationHoldMode={isDictationHoldMode}
                  onAttach={onAttach}
                  onDictationToggle={onDictationToggle}
                  onDictationHoldStart={onDictationHoldStart}
                  onDictationHoldEnd={onDictationHoldEnd}
                  onSend={onSend}
                  onStop={onStop}
                  sessionOptionsSurface={sessionOptionsSurface}
                  sessionOptionsSnapshot={sessionOptionsSnapshot}
                  stash={stash}
                  contextUsedTokens={contextUsedTokens}
                  contextMaxTokens={contextMaxTokens}
                  fullAccess={fullAccess}
                  onSetFullAccess={onSetFullAccess}
                  onAttachTask={onAttachTask}
                  activeCollabProjectId={activeCollabProjectId}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
