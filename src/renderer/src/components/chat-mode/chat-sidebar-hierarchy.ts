import { SECTION_LABEL } from '../ui/section-label-classes'

// The chat sidebar's three visual levels, kept in one place because the bug they
// fix is drift: region labels and workspace names were styled identically, so a
// workspace read as a caption rather than as the owner of the rows beneath it.
//
//   region  — WORKSPACES / CHATS / ARCHIVED. A divider, the quietest thing here.
//   group   — a workspace's name. Authored case, because it is a name, not a category.
//   rows    — 13px medium in secondary ink, indented so titles sit under the group name.

/** Uppercase eyebrow for a whole region of the sidebar: the app-wide section label. */
export const CHAT_SIDEBAR_REGION_LABEL = SECTION_LABEL

/** A workspace heading: same size as its rows, one weight heavier and in full ink. */
export const CHAT_SIDEBAR_GROUP_LABEL =
  'min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground'
