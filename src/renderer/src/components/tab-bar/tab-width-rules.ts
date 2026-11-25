// Why: width depends only on the tab bar's own width (container query), so labels, badges
// and tab count never reflow the strip; overflow scrolls instead of shrinking tabs.
export const TAB_CONTAINER_WIDTH_CLASSES = 'flex-none w-44 @max-[480px]/tab-bar:w-34'

export const TAB_LABEL_WIDTH_CLASSES = 'min-w-0 flex-1 truncate'

/** Marks the tab bar root as the container the tab width step reads. */
export const TAB_BAR_CONTAINER_CLASSES = '@container/tab-bar'
