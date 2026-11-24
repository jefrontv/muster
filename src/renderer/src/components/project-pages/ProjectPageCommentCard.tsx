import { Check, RotateCcw, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { PageCommentThread } from '../../../../shared/project-pages-comment-types'

function when(at: number): string {
  return new Date(at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function PageCommentComposer({
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel
}: {
  placeholder: string
  submitLabel: string
  autoFocus?: boolean
  onSubmit: (body: string) => Promise<boolean>
  onCancel?: () => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const isMac = navigator.userAgent.includes('Mac')
  const submit = async (): Promise<void> => {
    if (!body.trim() || busy) {
      return
    }
    setBusy(true)
    const sent = await onSubmit(body)
    setBusy(false)
    if (sent) {
      setBody('')
    }
  }
  return (
    <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
      <Textarea
        value={body}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="min-h-16 text-[13px]"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (isMac ? event.metaKey : event.ctrlKey)) {
            event.preventDefault()
            void submit()
          } else if (event.key === 'Escape' && onCancel) {
            event.preventDefault()
            onCancel()
          }
        }}
      />
      <div className="flex justify-end gap-1.5">
        {onCancel ? (
          <Button size="xs" variant="ghost" onClick={onCancel}>
            {translate('auto.components.projectPages.comments.cancel', 'Cancel')}
          </Button>
        ) : null}
        <Button size="xs" disabled={!body.trim() || busy} onClick={() => void submit()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

export function ProjectPageCommentCard({
  thread,
  active,
  onActivate,
  onReply,
  onSetStatus,
  onDelete
}: {
  thread: PageCommentThread
  active: boolean
  onActivate: () => void
  onReply: (body: string) => Promise<boolean>
  onSetStatus: (status: 'open' | 'resolved') => void
  onDelete: () => void
}): React.JSX.Element {
  const [replying, setReplying] = useState(false)
  const resolved = thread.status === 'resolved'
  return (
    <div
      data-active={active}
      className={cn(
        'group rounded-xl border border-border bg-card p-3 text-[13px] text-card-foreground transition-colors data-[active=true]:border-ring',
        resolved && 'opacity-70'
      )}
      onClick={onActivate}
    >
      {thread.anchor ? (
        <p className="mb-2 line-clamp-2 border-l-2 border-annotation-highlight pl-2 text-xs text-muted-foreground">
          {thread.anchor.quote}
        </p>
      ) : (
        <p className="mb-2 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          {translate('auto.components.projectPages.comments.wholePage', 'Whole page')}
        </p>
      )}
      <div className="space-y-2">
        {thread.messages.map((message) => (
          <div key={message.id}>
            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-medium text-foreground">
                {message.author.kind === 'agent'
                  ? message.author.agent
                  : translate('auto.components.projectPages.comments.you', 'You')}
              </span>
              <span className="text-muted-foreground">{when(message.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          </div>
        ))}
      </div>
      {replying ? (
        <div className="mt-2">
          <PageCommentComposer
            autoFocus
            placeholder={translate(
              'auto.components.projectPages.comments.replyPlaceholder',
              'Reply'
            )}
            submitLabel={translate('auto.components.projectPages.comments.reply', 'Reply')}
            onSubmit={async (body) => {
              const sent = await onReply(body)
              if (sent) {
                setReplying(false)
              }
              return sent
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="xs" variant="ghost" onClick={() => setReplying(true)}>
            {translate('auto.components.projectPages.comments.reply', 'Reply')}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onSetStatus(resolved ? 'open' : 'resolved')}
          >
            {resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
            {resolved
              ? translate('auto.components.projectPages.comments.reopen', 'Reopen')
              : translate('auto.components.projectPages.comments.resolve', 'Resolve')}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className="ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={translate('auto.components.projectPages.comments.delete', 'Delete thread')}
            title={translate('auto.components.projectPages.comments.delete', 'Delete thread')}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
