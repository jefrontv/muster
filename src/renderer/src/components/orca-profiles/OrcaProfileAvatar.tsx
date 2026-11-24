import type { OrcaProfileSummary } from '../../../../shared/orca-profiles'
import { DotIdenticon } from '../brand/dot-identicon'

export function OrcaProfileAvatar({
  profile,
  isSelf,
  className
}: {
  profile: OrcaProfileSummary
  /** The active profile; only it gets the coral centre. */
  isSelf?: boolean
  className?: string
}): React.JSX.Element {
  return <DotIdenticon id={profile.id} size={20} isSelf={isSelf} className={className} />
}
