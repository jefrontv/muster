// The face of a chat: its workspace's colour and icon, in a round tile.

import type React from 'react'
import { MessageCircle } from 'lucide-react'
import type { ChatWorkspace } from '../../../../shared/chat-mode-types'
import { normalizeRepoBadgeColor } from '../../../../shared/repo-badge-color'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { cn } from '@/lib/utils'
import { DotIdenticon } from '../brand/dot-identicon'

export function ChatWorkspaceAvatar(props: {
  workspace: ChatWorkspace | null
  /** Pixel size of the tile. */
  size: number
  working?: boolean
  className?: string
}): React.JSX.Element {
  const color = normalizeRepoBadgeColor(props.workspace?.color) ?? null
  const glyph = Math.round(props.size * 0.55)
  if (props.workspace && !props.workspace.icon && !color) {
    // No chosen icon or colour: a stable identicon keeps workspaces apart without inventing a glyph.
    return (
      <DotIdenticon
        id={props.workspace.id}
        size={props.size}
        className={cn(props.working && 'motion-safe:animate-pulse', props.className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-chat-ink-secondary',
        props.working && 'motion-safe:animate-pulse',
        props.className
      )}
      style={{
        width: props.size,
        height: props.size,
        fontSize: glyph,
        ...(color ? { background: `color-mix(in srgb, ${color} 16%, var(--background))` } : {})
      }}
    >
      {props.workspace ? (
        <RepoIconGlyph
          repoIcon={props.workspace.icon}
          color={color ?? undefined}
          className="size-full"
          // Emoji sizes from the tile's font size; this only shapes lucide and image glyphs.
          iconClassName="size-[55%]"
        />
      ) : (
        <MessageCircle style={{ width: glyph, height: glyph }} />
      )}
    </span>
  )
}
