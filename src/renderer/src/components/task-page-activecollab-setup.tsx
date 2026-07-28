// The guided setup surface the Tasks page shows when ActiveCollab cannot be used.
//
// Why a whole screen rather than the one-line card this replaced: connecting asks for a password,
// which is a trust moment. A user who is right to hesitate needs to read what the credential buys,
// what happens to it, and where the same settings live before they type it — not a bare "Connect"
// button. Everything below is answering one of those three questions.
//
// `mode` is the honest distinction the panel hands down: a rejected token is not an absent one, and
// "reconnect" is a different instruction from "connect". See activecollab-failure-message.ts, which
// draws the same line for inline errors.

import React from 'react'
import { Bell, ExternalLink, MessageSquare, Paperclip, ListChecks } from 'lucide-react'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export type ActiveCollabSetupMode = 'connect' | 'reconnect'

type TaskPageActiveCollabSetupProps = {
  mode: ActiveCollabSetupMode
  /** Actionable sentence from the connection status; rendered verbatim when the runtime supplies one. */
  reason?: string
  onConnect: () => void
}

function getBenefits(): { key: string; Icon: typeof Bell; text: string }[] {
  return [
    {
      key: 'tasks',
      Icon: ListChecks,
      text: translate(
        'auto.components.activecollab.setup.benefit_tasks',
        'Every task assigned to you, grouped by project.'
      )
    },
    {
      key: 'comments',
      Icon: MessageSquare,
      text: translate(
        'auto.components.activecollab.setup.benefit_comments',
        'Comment threads, with replies posted from here.'
      )
    },
    {
      key: 'attachments',
      Icon: Paperclip,
      text: translate(
        'auto.components.activecollab.setup.benefit_attachments',
        'Attachments and inline images, downloadable without leaving the app.'
      )
    },
    {
      key: 'notifications',
      Icon: Bell,
      text: translate(
        'auto.components.activecollab.setup.benefit_notifications',
        'Notifications when a task you follow changes.'
      )
    }
  ]
}

export function TaskPageActiveCollabSetup({
  mode,
  reason,
  onConnect
}: TaskPageActiveCollabSetupProps): React.JSX.Element {
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)

  const openIntegrations = (): void => {
    openSettingsTarget({ pane: 'integrations', repoId: null })
    openSettingsPage()
  }

  const reconnecting = mode === 'reconnect'
  const heading = reconnecting
    ? translate(
        'auto.components.activecollab.setup.heading_reconnect',
        'Reconnect ActiveCollab to see your work here'
      )
    : translate(
        'auto.components.activecollab.setup.heading_connect',
        'Connect ActiveCollab to see your work here'
      )
  const intro = reconnecting
    ? translate(
        'auto.components.activecollab.setup.intro_reconnect',
        'Your ActiveCollab token is still stored on this machine, but the instance refused it. A changed password, a revoked token, or a moved instance all look like this. Sign in once more to replace it — nothing else about your setup changes.'
      )
    : translate(
        'auto.components.activecollab.setup.intro_connect',
        'Muster talks to your ActiveCollab workspace directly, so your assigned work lands in this panel instead of a browser tab.'
      )

  return (
    <section
      aria-label={heading}
      className="mt-4 flex min-h-0 flex-col gap-5 overflow-y-auto rounded-md border border-border/50 bg-muted/50 px-6 py-8 shadow-sm scrollbar-sleek"
    >
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-11 items-center justify-center rounded-lg border border-border/60 bg-background/70">
          <ActiveCollabIcon className="size-6 text-muted-foreground" />
        </span>
        <h2 className="text-base font-medium text-foreground">{heading}</h2>
        <p className="max-w-xl text-sm text-muted-foreground">{intro}</p>
        {reason ? <p className="max-w-xl text-xs text-muted-foreground/80">{reason}</p> : null}
      </header>

      <div className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border/50 bg-background/60 p-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {translate(
              'auto.components.activecollab.setup.benefits_title',
              'What connecting gives you'
            )}
          </h3>
          <ul className="mt-3 space-y-2">
            {getBenefits().map((benefit) => (
              <li key={benefit.key} className="flex gap-2 text-sm text-muted-foreground">
                <benefit.Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>{benefit.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-border/50 bg-background/60 p-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {translate(
              'auto.components.activecollab.setup.requirements_title',
              'What it asks you for'
            )}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              {translate(
                'auto.components.activecollab.setup.requirement_url',
                'Your ActiveCollab instance URL — the address you sign in at.'
              )}
            </li>
            <li>
              {translate(
                'auto.components.activecollab.setup.requirement_credentials',
                'The email and password of that ActiveCollab account.'
              )}
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground/80">
            {translate(
              'auto.components.activecollab.setup.credential_handling',
              'They are sent once, straight to your own instance, and exchanged for a long-lived API token. The password is never stored — only the token is kept, encrypted where the runtime supports it.'
            )}
          </p>
        </div>
      </div>

      <footer className="flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onConnect}>
            {reconnecting
              ? translate(
                  'auto.components.activecollab.setup.action_reconnect',
                  'Reconnect ActiveCollab'
                )
              : translate(
                  'auto.components.activecollab.setup.action_connect',
                  'Connect ActiveCollab'
                )}
          </Button>
          <Button variant="outline" onClick={openIntegrations}>
            <ExternalLink aria-hidden className="size-3.5" />
            {translate(
              'auto.components.activecollab.setup.action_settings',
              'Open Integrations settings'
            )}
          </Button>
        </div>
        <p className="max-w-xl text-center text-xs text-muted-foreground/80">
          {translate(
            'auto.components.activecollab.setup.settings_hint',
            'Settings → Integrations holds the same connection, the account it resolved to, and the ActiveCollab MCP install your agents use.'
          )}
        </p>
      </footer>
    </section>
  )
}
