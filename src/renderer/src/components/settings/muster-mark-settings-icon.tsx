import type { LucideProps } from 'lucide-react'
import { MusterMark } from '../brand/muster-mark'

// Settings nav takes lucide-shaped icons; the glyph sizes from className like the lucide icons beside it.
export function MusterMarkSettingsIcon({ className }: LucideProps): React.JSX.Element {
  return <MusterMark variant="glyph" size={16} className={className} />
}
