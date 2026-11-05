import { cn } from '@/lib/utils'
import { Badge } from './ui/badge'

export type IntegrationStatusTone = 'connected' | 'attention' | 'neutral'

// Rides the 20px Badge so "Update available" looks the same here and in the Settings nav.
const TONE: Record<
  IntegrationStatusTone,
  { variant: 'success' | 'attention' | 'muted'; dot: string }
> = {
  connected: { variant: 'success', dot: 'bg-status-success' },
  attention: { variant: 'attention', dot: 'bg-status-attention' },
  neutral: { variant: 'muted', dot: 'bg-muted-foreground' }
}

export function IntegrationStatusPill({
  tone,
  children
}: {
  tone: IntegrationStatusTone
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Badge variant={TONE[tone].variant} className="gap-1.5">
      <span className={cn('size-1.5 rounded-full', TONE[tone].dot)} />
      {children}
    </Badge>
  )
}
