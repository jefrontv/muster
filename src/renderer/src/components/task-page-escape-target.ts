// What Escape should dismiss on the Tasks surface.
//
// The page listens for Escape in the CAPTURE phase, so it runs before Radix's
// own dialog handling — without this, Escape closed the whole Tasks view out
// from under an open attachment or an open task. Escape peels one layer at a
// time: the innermost thing the user opened goes first, and only a bare list
// leaves the page.

export type TaskPageEscapeTarget = 'dialog' | 'open-task' | 'page'

export function resolveTaskPageEscapeTarget(args: {
  /** Any Radix dialog is on screen (attachment lightbox, confirm, editor). */
  hasOpenDialog: boolean
  /** A task is open in the side panel. */
  hasOpenTask: boolean
}): TaskPageEscapeTarget {
  if (args.hasOpenDialog) {
    return 'dialog'
  }
  return args.hasOpenTask ? 'open-task' : 'page'
}

/**
 * Whether Escape should merely blur a focused text field instead of dismissing something.
 *
 * The order matters and is the whole point of naming it: an open dialog owns Escape OUTRIGHT, even
 * when focus sits in one of its own inputs. A command palette autofocuses its input, so blurring
 * first spent the user's keypress and left the palette on screen — which is exactly how an
 * undismissable search overlay shipped.
 */
export function shouldTaskPageEscapeBlurTextEntry(args: {
  hasOpenDialog: boolean
  isTextEntry: boolean
}): boolean {
  return !args.hasOpenDialog && args.isTextEntry
}

/** True while a Radix dialog is mounted and open. Queried from the DOM rather
 *  than tracked per-modal: the page cannot enumerate every dialog its subtree
 *  might render, and a hand-maintained list is what let the lightbox slip. */
export function documentHasOpenDialog(doc: Document): boolean {
  return doc.querySelector('[role="dialog"][data-state="open"]') !== null
}
