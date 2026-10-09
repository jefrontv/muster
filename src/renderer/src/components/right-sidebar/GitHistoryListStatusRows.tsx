import React from 'react'
import { ChevronsDown, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

export function GitHistoryLoadMoreRow({
  loading,
  onLoadMore
}: {
  loading: boolean
  onLoadMore: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-1 py-1 pl-6 pr-3 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
      disabled={loading}
      onClick={onLoadMore}
    >
      {loading ? (
        <RefreshCw className="size-3 shrink-0 animate-spin" />
      ) : (
        <ChevronsDown className="size-3 shrink-0" />
      )}
      <span>
        {translate('auto.components.right.sidebar.GitHistoryPanel.loadMoreCommits', 'Load more')}
      </span>
    </button>
  )
}

export function GitHistoryErrorRow({
  error,
  loading,
  className,
  style,
  onRetry
}: {
  error: string
  loading: boolean
  className?: string
  style?: React.CSSProperties
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className={cn('flex items-start gap-2 px-6 py-2 text-[11px]', className)}
      style={style}
    >
      <span className="min-w-0 flex-1 break-words text-destructive">{error}</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="-my-0.5 shrink-0 text-[11px]"
        disabled={loading}
        onClick={onRetry}
      >
        <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        {translate('auto.components.right.sidebar.GitHistoryPanel.retryCommits', 'Retry')}
      </Button>
    </div>
  )
}
