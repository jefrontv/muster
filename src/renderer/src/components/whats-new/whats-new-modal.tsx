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
import type { ReleaseNotes, WhatsNewPayload } from '../../../../shared/whats-new'

type WhatsNewModalProps = {
  payload: WhatsNewPayload | null
  /** While notes are still loading, keep the mount invisible rather than flashing an empty dialog. */
  ready: boolean
  onDismiss: () => void
}

/**
 * Shared across every release section.
 *
 * Module scope, not inline: an object literal in the render body is a new identity each pass, and
 * with several sections mounted it would rebuild all of their markdown on every render.
 */
const NOTE_COMPONENTS = {
  h2: (props: object) => (
    <h3 className="mb-1 mt-4 text-[13px] font-semibold first:mt-0" {...props} />
  ),
  h3: (props: object) => (
    <h4 className="mb-1 mt-3 text-[13px] font-semibold first:mt-0" {...props} />
  ),
  ul: (props: object) => <ul className="mb-2 list-disc space-y-1 pl-5" {...props} />,
  a: (props: object) => (
    <a
      className="text-foreground underline underline-offset-2"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  p: (props: object) => <p className="mb-2 last:mb-0" {...props} />,
  code: (props: object) => <code className="rounded bg-muted px-1 py-0.5 text-[12px]" {...props} />
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

  // Newest first: the release they just landed on leads, then everything they skipped over.
  const sections: ReleaseNotes[] = [
    { version: payload.version, notes: payload.notes, notesUrl: payload.notesUrl },
    ...payload.missed
  ]

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

        {sections.some((section) => section.notes) ? (
          // Why the fixed-height scroll: release notes run long; an unbounded
          // dialog would grow past the window on small displays.
          <div className="max-h-[50vh] overflow-y-auto text-[13px] leading-relaxed text-foreground">
            {sections.map((section, index) => (
              <section key={section.version}>
                {/* Why label every section once there is more than one: without a version heading a
                    reader cannot tell where this release's changes end and the previous one's
                    begin. A single release needs no label — the dialog title already says it. */}
                {index > 0 ? (
                  <h3 className="mb-2 mt-5 border-t border-border/60 pt-4 text-[13px] font-semibold text-muted-foreground">
                    {translate('auto.components.whats-new.earlier_version', 'Muster {{version}}', {
                      version: section.version
                    })}
                  </h3>
                ) : null}
                {section.notes ? (
                  <ReactMarkdown components={NOTE_COMPONENTS}>{section.notes}</ReactMarkdown>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    {translate(
                      'auto.components.whats-new.section_unavailable',
                      'Notes for this release couldn’t be loaded.'
                    )}
                  </p>
                )}
              </section>
            ))}
            {payload.missedOverflow > 0 ? (
              <p className="mt-5 border-t border-border/60 pt-4 text-[12px] text-muted-foreground">
                {translate(
                  'auto.components.whats-new.more_releases',
                  '…and {{count}} earlier releases. See GitHub for the full history.',
                  { count: payload.missedOverflow }
                )}
              </p>
            ) : null}
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
