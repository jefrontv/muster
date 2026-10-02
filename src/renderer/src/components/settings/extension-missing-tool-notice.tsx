// A run that stopped because a program it needs is missing: what to install, a Copy button for the
// install command, and Check again to retry once the user has run it.

import { Copy, ExternalLink, RotateCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ExtensionMissingTool } from '../../../../shared/extension-required-tools'

export function ExtensionMissingToolNotice({
  missing,
  onCheckAgain
}: {
  missing: ExtensionMissingTool
  onCheckAgain: () => void
}): React.JSX.Element {
  const copy = async (command: string): Promise<void> => {
    await navigator.clipboard.writeText(command)
    toast.success(translate('auto.components.extensions.copied', 'Command copied'))
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5" role="alert">
      <p className="flex items-start gap-1.5 text-xs">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        <span className="break-words text-foreground">{missing.message}</span>
      </p>
      {missing.installCommand ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1 font-mono text-[11px]">
            {missing.installCommand}
          </code>
          <Button
            variant="outline"
            size="xs"
            onClick={() => void copy(missing.installCommand as string)}
          >
            <Copy className="size-3" />
            {translate('auto.components.extensions.missing_tool.copy', 'Copy')}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!missing.installCommand && missing.installUrl ? (
          <Button variant="outline" size="xs" asChild>
            <a href={missing.installUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3" />
              {translate('auto.components.extensions.missing_tool.get', 'Get {{tool}}').replace(
                '{{tool}}',
                missing.tool
              )}
            </a>
          </Button>
        ) : null}
        <Button variant="outline" size="xs" onClick={onCheckAgain}>
          <RotateCw className="size-3" />
          {translate('auto.components.extensions.missing_tool.check_again', 'Check again')}
        </Button>
      </div>
    </div>
  )
}
