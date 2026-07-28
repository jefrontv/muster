import { useState } from 'react'
import { OnboardingInlineCommandTerminal } from '@/components/onboarding/OnboardingInlineCommandTerminal'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'

// Distinct from the other inline setup panels so their ephemeral tabs never collide.
const ACTIVECOLLAB_MCP_SETUP_WORKTREE_ID = 'settings-activecollab-mcp-setup-terminal'

/**
 * `activecollab-mcp setup` in a real, interactive terminal, inline in the settings card.
 *
 * Delegates to OnboardingInlineCommandTerminal — the app's existing embedded setup terminal (see
 * CliSkillSetupTerminal) — which mounts a genuine TerminalPane against an ephemeral
 * floating-scoped worktree id. That indirection is the whole point: a hand-mounted `new Terminal()`
 * outside the pane manager never paints in this app (see the comment in assets/terminal.css about
 * terminals mounted outside the pane manager, and the sizing rules scoped to `.pane-manager-root`),
 * and it also misses the attach/fit/refresh/renderer-recovery lifecycle that TerminalPane owns.
 *
 * The command is pasted as a draft rather than auto-submitted, matching CliSkillSetupTerminal: the
 * user sees exactly which binary is about to run and presses Enter to start it.
 */
export function ActiveCollabMcpSetupTerminal({
  command,
  onProcessExit,
  onDismiss
}: {
  command: string
  onProcessExit: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const rowClass = useIntegrationSubordinateRowClass('space-y-2')
  const [exited, setExited] = useState(false)

  return (
    <div className={rowClass} data-testid="activecollab-mcp-setup-terminal">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {translate('auto.components.settings.activecollab.mcp.setup_title', 'Guided setup')}
        </p>
        <Button variant="outline" size="xs" onClick={onDismiss}>
          {exited
            ? translate('auto.components.settings.activecollab.mcp.setup_close', 'Close')
            : translate('auto.components.settings.activecollab.mcp.setup_cancel', 'Cancel')}
        </Button>
      </div>
      <OnboardingInlineCommandTerminal
        command={command}
        worktreeId={ACTIVECOLLAB_MCP_SETUP_WORKTREE_ID}
        title={translate(
          'auto.components.settings.activecollab.mcp.setup_tab_title',
          'ActiveCollab MCP setup'
        )}
        ariaLabel={translate(
          'auto.components.settings.activecollab.mcp.setup_terminal_label',
          'ActiveCollab MCP setup terminal'
        )}
        description={translate(
          'auto.components.settings.activecollab.mcp.setup_running',
          'Press Enter to run setup, then answer its prompts here. This card refreshes when setup exits.'
        )}
        terminalHeightPx={320}
        terminalTopMarginPx={8}
        descriptionPaddingClassName="px-4 py-2"
        // Unlike the modal precedents, this card sits at the bottom of a long scrolling settings
        // page: the terminal opens below the credentials row and lands off-screen, so the button
        // reads as doing nothing. Two engineers debugged it as a blank render before noticing it
        // was simply out of frame — a user will not be that persistent.
        autoScrollIntoView
        onTerminalExit={() => {
          setExited(true)
          onProcessExit()
        }}
      />
    </div>
  )
}
