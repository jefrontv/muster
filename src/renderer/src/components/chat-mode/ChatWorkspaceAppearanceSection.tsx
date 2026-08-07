// Appearance block of the workspace dialog: live preview, color swatches, and the shared
// icon tabs (icon/emoji/favicon — no GitHub avatar, chat workspaces have no repo identity).

import type React from 'react'
import { useState } from 'react'
import type { RepoIcon } from '../../../../shared/repo-icon'
import { DEFAULT_REPO_BADGE_COLOR } from '../../../../shared/constants'
import { normalizeRepoBadgeColor } from '../../../../shared/repo-badge-color'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { RepositoryIconColorSection } from '@/components/settings/RepositoryIconColorSection'
import { RepositoryIconTabs } from '@/components/settings/RepositoryIconTabs'

export function ChatWorkspaceAppearanceSection({
  name,
  icon,
  color,
  onIconChange,
  onColorChange
}: {
  name: string
  icon: RepoIcon | null
  color: string | null
  onIconChange: (icon: RepoIcon | null) => void
  onColorChange: (color: string) => void
}): React.JSX.Element {
  const badgeColor = normalizeRepoBadgeColor(color) ?? DEFAULT_REPO_BADGE_COLOR
  const initialTab =
    icon?.type === 'emoji'
      ? 'emoji'
      : icon?.type === 'image' && icon.source === 'favicon'
        ? 'favicon'
        : 'icon'
  // Color tints lucide icons only — emoji and favicons carry their own colors,
  // so the swatches hide on those tabs.
  const [activeTab, setActiveTab] = useState<string>(initialTab)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
        <RepoIconGlyph repoIcon={icon} className="size-8" color={badgeColor} />
        <span className="min-w-0 truncate text-sm font-medium">{name || '—'}</span>
      </div>
      <RepositoryIconTabs
        initialTab={initialTab}
        hideAvatarTab
        selectedLucideName={icon?.type === 'lucide' ? icon.name : null}
        selectedEmoji={icon?.type === 'emoji' ? icon.emoji : ''}
        loadingGitHub={false}
        defaultFaviconDomain=""
        onSetIcon={onIconChange}
        onUseGitHubAvatar={() => undefined}
        onTabChange={setActiveTab}
      />
      {activeTab === 'icon' ? (
        <RepositoryIconColorSection badgeColor={badgeColor} onBadgeColorChange={onColorChange} />
      ) : null}
    </div>
  )
}
