import type { GlobalSettings } from '../../../../shared/types'

export const SETTING_LABELS: Partial<Record<keyof GlobalSettings, string>> = {
  terminalFontSize: 'Font size',
  terminalFontFamily: 'Font family',
  editorFontFamily: 'Editor font family',
  terminalFontWeight: 'Font weight',
  terminalLineHeight: 'Line height',
  terminalScrollSensitivity: 'Normal scroll speed',
  terminalFastScrollSensitivity: 'Fast scroll speed',
  terminalTuiScrollSensitivity: 'TUI scroll speed',
  terminalBackgroundOpacity: 'Background opacity',
  terminalCursorStyle: 'Cursor style',
  terminalCursorBlink: 'Cursor blink',
  terminalCursorOpacity: 'Cursor opacity',
  terminalCursorUseThemeColor: 'Cursor color from theme',
  terminalMouseHideWhileTyping: 'Hide mouse while typing',
  terminalWordSeparator: 'Word separator',
  primarySelectionMiddleClickPaste: 'Middle-click paste from selection',
  terminalFocusFollowsMouse: 'Focus follows mouse',
  terminalColorOverrides: 'Color overrides',
  terminalMacOptionAsAlt: 'Option as Alt',
  terminalPaddingX: 'Padding X',
  terminalPaddingY: 'Padding Y',
  terminalDividerColorDark: 'Divider color (dark)',
  terminalDividerColorLight: 'Divider color (light)',
  terminalInactivePaneOpacity: 'Inactive pane opacity',
  windowBackgroundBlur: 'Window background blur'
}
