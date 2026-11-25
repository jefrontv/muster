// Shared resize-handle classes for left-anchored sidebars (code + chat), so
// both seams get the same hover/active divider treatment.

// Why: straddle the sidebar/content seam so the divider sits on the border
// instead of leaving a blank strip between the hover target and the edge.
export const WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME =
  'group absolute -right-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize items-stretch justify-center'
// Mirror of the above for panels docked on the right, whose handle sits on their left edge.
export const LEFT_EDGE_RESIZE_HANDLE_CLASS_NAME =
  'group absolute -left-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize items-stretch justify-center outline-none'
export const WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME =
  'h-full w-px bg-transparent transition-colors group-hover:bg-ring/50 group-active:bg-ring'
