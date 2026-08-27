// What's New modal: the first-launch-after-an-update changelog. Main resolves
// the version transition and fetches the release notes (see ipc/whats-new.ts);
// this component only renders what it is given and marks the version seen on
// close. Notes render through react-markdown, which escapes raw HTML by
// default — release bodies are our own, but the renderer stays constraint-only.

import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { WhatsNewPayload } from '../../../../shared/whats-new'

type WhatsNewModalProps = {
  payload: WhatsNewPayload | null
  /** While notes are still loading, keep the mount invisible rather than flashing an empty dialog. */
  ready: boolean
  onDismiss: () => void
}

export function WhatsNewModal({
  payload,
  ready,
  onDismiss
}: WhatsNewModalProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (ready && payload) {
      setOpen(true)
    }
  }, [ready, payload])

  const dismiss = useCallback((): void => {
    setOpen(false)
    onDismiss()
  }, [onDismiss])

  if (!ready || !payload) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : dismiss())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.whats-new.title', 'What’s new in Muster {{version}}', {
              version: payload.version
            })}
          </DialogTitle>
          <DialogDescription>
            {translate('auto.components.whats-new.subtitle', 'Here’s what changed in this update.')}
          </DialogDescription>
        </DialogHeader>

        {payload.notes ? (
          // Why the fixed-height scroll: release notes run long; an unbounded
          // dialog would grow past the window on small displays.
          <div className="max-h-[50vh] overflow-y-auto text-[13px] leading-relaxed text-foreground">
            <ReactMarkdown
              components={{
                h2: (props) => (
                  <h3 className="mb-1 mt-4 text-[13px] font-semibold first:mt-0" {...props} />
                ),
                h3: (props) => (
                  <h4 className="mb-1 mt-3 text-[13px] font-semibold first:mt-0" {...props} />
                ),
                ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5" {...props} />,
                a: (props) => (
                  <a
                    className="text-foreground underline underline-offset-2"
                    target="_blank"
                    rel="noreferrer"
                    {...props}
                  />
                ),
                p: (props) => <p className="mb-2 last:mb-0" {...props} />,
                code: (props) => (
                  <code className="rounded bg-muted px-1 py-0.5 text-[12px]" {...props} />
                )
              }}
            >
              {payload.notes}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {translate(
              'auto.components.whats-new.notes_unavailable',
              'Release notes couldn’t be loaded right now. You can read them on GitHub instead.'
            )}
          </p>
        )}

        <DialogFooter>
          {payload.notesUrl ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void window.api.shell.openUrl(payload.notesUrl!)}
            >
              <ExternalLink className="size-3.5" />
              {translate('auto.components.whats-new.view_notes', 'View full release notes')}
            </Button>
          ) : null}
          <Button size="sm" onClick={dismiss}>
            {translate('auto.components.whats-new.continue', 'Continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
