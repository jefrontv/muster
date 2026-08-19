// The chat sidebar's three visual levels, kept in one place because the bug they
// fix is drift: region labels and workspace names were styled identically, so a
// workspace read as a caption rather than as the owner of the rows beneath it,
// and the rows themselves (14px) outshouted their own heading.
//
//   region  — WORKSPACES / CHATS / SETTLED. A divider, the quietest thing here.
//   group   — a workspace's name. Authored case, because it is a name, not a category.
//   rows    — bound to their group by an indent and a hairline spine.

/** Uppercase eyebrow for a whole region of the sidebar. */
export const CHAT_SIDEBAR_REGION_LABEL =
  'text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60'

/** A workspace heading: the strongest structural text in the list. */
export const CHAT_SIDEBAR_GROUP_LABEL =
  'min-w-0 flex-1 truncate text-xs font-semibold text-foreground/90'

/** Wraps a group's rows so containment is visible rather than implied. The
 *  indent lands under the workspace name, past its icon. */
export const CHAT_SIDEBAR_GROUP_ROWS = 'ml-[7px] border-l border-border/60 pl-2'
