// Width of the Tasks page's task-detail pane. Bounds keep the task list usable
// at one end and stop a single task from owning the whole page at the other.

export const ACTIVECOLLAB_TASK_PANE_MIN_WIDTH = 320
export const ACTIVECOLLAB_TASK_PANE_DEFAULT_WIDTH = 520
export const ACTIVECOLLAB_TASK_PANE_MAX_WIDTH = 900
/** The list keeps at least this much room, so dragging can never collapse it. */
export const ACTIVECOLLAB_TASK_LIST_MIN_WIDTH = 360

export function computeMaxActiveCollabTaskPaneWidth(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return ACTIVECOLLAB_TASK_PANE_MAX_WIDTH
  }
  return Math.min(
    ACTIVECOLLAB_TASK_PANE_MAX_WIDTH,
    Math.max(ACTIVECOLLAB_TASK_PANE_MIN_WIDTH, containerWidth - ACTIVECOLLAB_TASK_LIST_MIN_WIDTH)
  )
}

export function clampActiveCollabTaskPaneWidth(
  width: unknown,
  containerWidth?: number,
  fallback = ACTIVECOLLAB_TASK_PANE_DEFAULT_WIDTH
): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) {
    return fallback
  }
  const maxWidth =
    containerWidth !== undefined
      ? computeMaxActiveCollabTaskPaneWidth(containerWidth)
      : ACTIVECOLLAB_TASK_PANE_MAX_WIDTH
  return Math.min(maxWidth, Math.max(ACTIVECOLLAB_TASK_PANE_MIN_WIDTH, width))
}
