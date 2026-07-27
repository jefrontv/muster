import { cn } from '@/lib/utils'
import type { ActiveCollabMcpNotice } from './use-activecollab-mcp-status'

/** `info` covers "nothing to do", which is a normal outcome and must not read as a failure. */
export function ActiveCollabMcpNoticeText({
  notice
}: {
  notice: ActiveCollabMcpNotice
}): React.JSX.Element {
  return (
    <p
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'text-xs break-words',
        notice.tone === 'error'
          ? 'text-destructive'
          : notice.tone === 'success'
            ? 'text-status-success'
            : 'text-muted-foreground'
      )}
    >
      {notice.message}
    </p>
  )
}
