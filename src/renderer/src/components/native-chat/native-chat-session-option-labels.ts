import type {
  SessionOptionDescriptor,
  SessionOptionDisabledReason,
  SessionOptionSelectChoice
} from '../../../../shared/native-chat-session-options'
import { translate } from '@/i18n/i18n'
import { claudeModelDisplayName } from '../../../../shared/claude-model-name'
import { resolveChatEffortLabel } from '../../../../shared/chat-effort-label'

export function nativeChatSessionOptionLabel(descriptor: SessionOptionDescriptor): string {
  switch (descriptor.id) {
    case 'model':
      return translate('components.native-chat.composer.model', 'Model')
    case 'effort':
      return translate('components.native-chat.composer.effort', descriptor.label)
    case 'fastMode':
      return translate('components.native-chat.composer.fastMode', 'Fast mode')
    case 'thinking':
      return translate('components.native-chat.composer.thinking', 'Thinking')
    default:
      return descriptor.label
  }
}

export function nativeChatSessionChoiceLabel(choice: SessionOptionSelectChoice): string {
  switch (choice.value) {
    case 'minimal':
      return translate('components.native-chat.composer.optionValue.minimal', 'Minimal')
    case 'low':
      return translate('components.native-chat.composer.optionValue.low', 'Low')
    case 'medium':
      return translate('components.native-chat.composer.optionValue.medium', 'Medium')
    case 'high':
      return translate('components.native-chat.composer.optionValue.high', 'High')
    case 'xhigh':
      return translate('components.native-chat.composer.optionValue.xhigh', 'Extra high')
    case 'max':
      return translate('components.native-chat.composer.optionValue.max', 'Max')
    default:
      return choice.label
  }
}

export function nativeChatSessionOptionDisabledReason(
  reason: SessionOptionDisabledReason | undefined
): string | null {
  // Exhaustive over SessionOptionDisabledReason: a new key is a compile error
  // here, so the localized label can never silently drift from the producer.
  switch (reason) {
    case 'set-when-session-starts':
      return translate(
        'components.native-chat.composer.setWhenSessionStarts',
        'Set when the session starts.'
      )
    case 'available-after-session-start':
      return translate(
        'components.native-chat.composer.availableAfterSessionStarts',
        'Available after the session starts.'
      )
    case undefined:
      return null
  }
}

export function nativeChatModelPillLabel(descriptor: SessionOptionDescriptor): string {
  // Why: show the value only (Codex/Conductor style). "Model:" is redundant —
  // the control's aria-label/tooltip already names the category.
  if (
    descriptor.valueSource === 'unknown' ||
    descriptor.kind.type !== 'select' ||
    !descriptor.kind.currentValue
  ) {
    return translate('components.native-chat.composer.model', 'Model')
  }
  return nativeChatSessionChoiceLabel(
    descriptor.kind.choices.find((choice) => choice.value === descriptor.kind.currentValue) ?? {
      value: descriptor.kind.currentValue,
      label: descriptor.kind.currentValue
    }
  )
}

export function nativeChatOptionsPillTitle(
  descriptors: readonly SessionOptionDescriptor[]
): string {
  const effort = descriptors.find((descriptor) => descriptor.id === 'effort')
  // Why: an effort-backed group is primarily the effort picker, even when it also reports modes.
  return effort
    ? nativeChatSessionOptionLabel(effort)
    : translate('components.native-chat.composer.sessionOptions', 'Session options')
}

/** Value labels of the options whose value is known ("High", "Fast"). */
function optionValueLabels(descriptors: readonly SessionOptionDescriptor[]): string[] {
  const labels: string[] = []
  for (const descriptor of descriptors) {
    if (descriptor.valueSource === 'unknown') {
      continue
    }
    if (descriptor.kind.type === 'select' && descriptor.kind.currentValue) {
      const choice = descriptor.kind.choices.find(
        (candidate) => candidate.value === descriptor.kind.currentValue
      )
      labels.push(
        nativeChatSessionChoiceLabel(
          choice ?? {
            value: descriptor.kind.currentValue,
            label: descriptor.kind.currentValue
          }
        )
      )
    } else if (descriptor.kind.type === 'boolean' && descriptor.kind.currentValue === true) {
      labels.push(
        descriptor.id === 'fastMode'
          ? translate('components.native-chat.composer.optionValue.fast', 'Fast')
          : nativeChatSessionOptionLabel(descriptor)
      )
    }
  }
  return labels
}

export function nativeChatOptionsPillLabel(
  descriptors: readonly SessionOptionDescriptor[]
): string {
  const effort = descriptors.find((descriptor) => descriptor.id === 'effort')
  const labels = optionValueLabels(descriptors)
  // Why: value-only pill (no "Effort:" prefix) — category lives on the tooltip.
  if (labels.length > 0) {
    return labels.join(' · ')
  }
  if (effort) {
    return nativeChatSessionOptionLabel(effort)
  }
  return translate('components.native-chat.composer.options', 'Options')
}

export type NativeChatModelNaming = {
  /** Model id the session reported at init. */
  reportedModel?: string | null
  latestSighting?: (family: string) => string | null
  /** Chat threads name an unknown model "Default" (the CLI's own pick). */
  chatThread?: boolean
}

const HAS_VERSION = /\d/

/** A model menu row: "Opus 5.5" from the newest sighting, else the catalog label. */
export function nativeChatModelChoiceLabel(
  choice: SessionOptionSelectChoice,
  naming: NativeChatModelNaming = {}
): string {
  const catalog = nativeChatSessionChoiceLabel(choice)
  const display = claudeModelDisplayName({
    picked: choice.value,
    latestSighting: naming.latestSighting
  })
  if (!display || (!HAS_VERSION.test(display) && HAS_VERSION.test(catalog))) {
    return catalog
  }
  return display
}

/** The pill's model name: the reported model, then the pick, never a raw unknown id. */
export function nativeChatModelDisplayLabel(
  descriptor: SessionOptionDescriptor,
  naming: NativeChatModelNaming = {}
): string {
  const picked =
    descriptor.valueSource !== 'unknown' && descriptor.kind.type === 'select'
      ? (descriptor.kind.currentValue ?? null)
      : null
  if (naming.reportedModel) {
    const reported = claudeModelDisplayName({ picked, reported: naming.reportedModel })
    if (reported) {
      return reported
    }
  }
  if (picked && descriptor.kind.type === 'select') {
    return nativeChatModelChoiceLabel(
      descriptor.kind.choices.find((choice) => choice.value === picked) ?? {
        value: picked,
        label: picked
      },
      naming
    )
  }
  return naming.chatThread
    ? translate('components.native-chat.composer.defaultModel', 'Default')
    : nativeChatModelPillLabel(descriptor)
}

export type NativeChatEffortPillText = {
  text: string
  /** Tooltip naming where a value Muster did not set came from. */
  hint: string | null
}

/**
 * The muted text after the model name ("Medium · Fast"). Chat threads fall back to
 * the Claude settings effort, then "Default"; other panes show only known values.
 */
export function nativeChatEffortPillText(
  descriptors: readonly SessionOptionDescriptor[],
  options: { chatThread?: boolean; settingsEffort?: string | null } = {}
): NativeChatEffortPillText | null {
  const effort = descriptors.find((descriptor) => descriptor.id === 'effort')
  const parts = optionValueLabels(descriptors)
  if (!options.chatThread || !effort || effort.valueSource !== 'unknown') {
    return parts.length > 0 ? { text: parts.join(' · '), hint: null } : null
  }
  const label = resolveChatEffortLabel({ applied: null, settings: options.settingsEffort })
  const choices = effort.kind.type === 'select' ? effort.kind.choices : []
  const effortText =
    label.value === null
      ? translate('components.native-chat.composer.defaultEffort', 'Default')
      : nativeChatSessionChoiceLabel(
          choices.find((choice) => choice.value === label.value) ?? {
            value: label.value,
            label: label.value
          }
        )
  return {
    text: [effortText, ...parts].join(' · '),
    hint:
      label.source === 'settings'
        ? translate(
            'components.native-chat.composer.effortFromSettings',
            'From your Claude settings'
          )
        : translate(
            'components.native-chat.composer.effortCliDefault',
            "Claude's default effort for this model"
          )
  }
}
