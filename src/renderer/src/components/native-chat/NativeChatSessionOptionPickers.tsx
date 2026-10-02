import { memo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type {
  SessionOptionDescriptor,
  SessionOptionsSurface,
  SessionOptionValue
} from '../../../../shared/native-chat-session-options'
import {
  nativeChatEffortPillText,
  nativeChatModelChoiceLabel,
  nativeChatModelDisplayLabel,
  nativeChatSessionChoiceLabel,
  nativeChatSessionOptionDisabledReason,
  nativeChatSessionOptionLabel
} from './native-chat-session-option-labels'
import { useClaudeModelSightings } from './claude-model-sightings'
import { useClaudeSettingsEffortLevel } from './claude-settings-effort-level'

export type NativeChatSessionOptionPickersProps = {
  surface: SessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
  isWorking: boolean
  /**
   * The one composer picker allowed to be open, shared with the Full access menu next door.
   *
   * These were independent uncontrolled menus, so a second could open over the first and leave two
   * panels stacked on screen. Routing them through a single slot makes "only one" structural rather
   * than something each menu has to remember to do.
   */
  openPicker?: string | null
  onOpenPickerChange?: (picker: string | null) => void
  /** A chat-mode thread or the chat hero: unknown values read as Claude's defaults. */
  chatThread?: boolean
  /** Model id the session reported at init. */
  reportedModel?: string | null
}

const CATEGORY_ORDER: Record<string, number> = {
  thought_level: 0,
  model_config: 1,
  mode: 2
}

function sortedOptions(snapshot: readonly SessionOptionDescriptor[]): SessionOptionDescriptor[] {
  return snapshot
    .filter((descriptor) => descriptor.category !== 'model')
    .sort((left, right) => {
      const leftOrder = CATEGORY_ORDER[left.category ?? ''] ?? 3
      const rightOrder = CATEGORY_ORDER[right.category ?? ''] ?? 3
      return leftOrder - rightOrder
    })
}

function PickerTooltipContent(props: {
  label: string
  disabledReason?: string | null
  dispatched: boolean
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      <div>{props.disabledReason ?? props.label}</div>
      {props.dispatched ? (
        <div>
          {translate(
            'components.native-chat.composer.sentNotConfirmed',
            'Sent to the agent — not confirmed'
          )}
        </div>
      ) : null}
    </div>
  )
}

function PickerTrigger(props: {
  modelLabel: string
  effortLabel: string | null
  tooltipLabel: string
  hint: string | null
  disabled: boolean
  disabledReason?: string | null
  dispatched: boolean
}): React.JSX.Element {
  const visible = [props.modelLabel, props.effortLabel].filter(Boolean).join(' ')
  // Why: the accessible name must contain the visible text (WCAG 2.5.3 Label in Name).
  const accessibleName = translate(
    'components.native-chat.composer.pillAccessibleName',
    '{{value0}} {{value1}}',
    { value0: props.tooltipLabel, value1: visible }
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild disabled={props.disabled}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={accessibleName}
            className="max-w-56 gap-1 text-foreground/90"
          >
            <span className="truncate">{props.modelLabel}</span>
            {props.effortLabel ? (
              <span className="truncate text-muted-foreground">{props.effortLabel}</span>
            ) : null}
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <PickerTooltipContent
          label={props.hint ? `${props.tooltipLabel} · ${props.hint}` : props.tooltipLabel}
          disabledReason={props.disabledReason}
          dispatched={props.dispatched}
        />
      </TooltipContent>
    </Tooltip>
  )
}

function ChoiceBody(props: { label: string; description?: string }): React.JSX.Element {
  return (
    <div className="min-w-0 py-0.5">
      <div>{props.label}</div>
      {props.description ? (
        <div className="text-xs font-normal text-muted-foreground">{props.description}</div>
      ) : null}
    </div>
  )
}

function DescriptorMenuRows(props: {
  descriptor: SessionOptionDescriptor
  pending: boolean
  setValue: (value: SessionOptionValue) => void
  invokeAction: () => void
  choiceLabel?: (choice: { value: string; label: string; description?: string }) => string
}): React.JSX.Element {
  const { descriptor, pending, setValue, invokeAction } = props
  const choiceLabel = props.choiceLabel ?? nativeChatSessionChoiceLabel
  // Why: flip-only without a baseline is an action — never claim On/Off.
  if (descriptor.action?.type === 'toggle-command') {
    return (
      <DropdownMenuItem disabled={!descriptor.settable || pending} onSelect={() => invokeAction()}>
        {translate('components.native-chat.composer.toggleOption', 'Toggle {{value0}}', {
          value0: nativeChatSessionOptionLabel(descriptor).toLowerCase()
        })}
      </DropdownMenuItem>
    )
  }
  // Why: agent-picker opens the TUI; it is not a set of radio choices.
  if (descriptor.action?.type === 'agent-picker') {
    return (
      <DropdownMenuItem disabled={!descriptor.settable || pending} onSelect={() => invokeAction()}>
        {translate(
          'components.native-chat.composer.chooseInAgentPicker',
          'Choose in agent picker…'
        )}
      </DropdownMenuItem>
    )
  }
  // Why: absolute On/Off only when we have tracked truth. Unknown composed
  // booleans leave the group unselected so empty radios are not a selection.
  if (descriptor.kind.type === 'boolean') {
    const selected =
      descriptor.kind.currentValue === true
        ? 'on'
        : descriptor.kind.currentValue === false
          ? 'off'
          : undefined
    return (
      <>
        {selected === undefined ? (
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            {translate(
              'components.native-chat.composer.valueUnknown',
              'Current value unknown — pick On or Off'
            )}
          </DropdownMenuLabel>
        ) : null}
        <DropdownMenuRadioGroup value={selected} onValueChange={(next) => setValue(next === 'on')}>
          <DropdownMenuRadioItem value="on" disabled={!descriptor.settable || pending}>
            {translate('components.native-chat.composer.optionValue.on', 'On')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="off" disabled={!descriptor.settable || pending}>
            {translate('components.native-chat.composer.optionValue.off', 'Off')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </>
    )
  }
  return (
    <DropdownMenuRadioGroup
      value={descriptor.kind.currentValue}
      onValueChange={(value) => setValue(value)}
    >
      {descriptor.kind.choices.map((choice) => (
        <DropdownMenuRadioItem
          key={choice.value}
          value={choice.value}
          disabled={!descriptor.settable || pending}
        >
          <ChoiceBody label={choiceLabel(choice)} description={choice.description} />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function runSurfaceCall(
  pendingKey: string,
  setPendingId: (id: string | null) => void,
  call: () => Promise<unknown>
): void {
  setPendingId(pendingKey)
  void call()
    .catch((error) => {
      toast.error(
        translate('components.native-chat.composer.optionUpdateFailed', 'Could not update option'),
        { description: error instanceof Error ? error.message : String(error) }
      )
    })
    .finally(() => setPendingId(null))
}

function NativeChatSessionOptionPickersInner({
  surface,
  snapshot,
  isWorking,
  openPicker,
  onOpenPickerChange,
  chatThread = false,
  reportedModel = null
}: NativeChatSessionOptionPickersProps): React.JSX.Element | null {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const latestSighting = useClaudeModelSightings()
  const settingsEffort = useClaudeSettingsEffortLevel(chatThread)
  // Uncontrolled when no slot is supplied, so a caller that does not care keeps the old behaviour.
  const menuProps: { open?: boolean; onOpenChange?: (open: boolean) => void } = onOpenPickerChange
    ? {
        open: openPicker === 'model',
        onOpenChange: (open) => onOpenPickerChange(open ? 'model' : null)
      }
    : {}
  const model = snapshot.find((descriptor) => descriptor.category === 'model')
  const options = sortedOptions(snapshot)
  if (!surface || !model) {
    return null
  }

  const setOption = (descriptor: SessionOptionDescriptor, value: SessionOptionValue): void => {
    runSurfaceCall(descriptor.id, setPendingId, () => surface.setOption(descriptor.id, value))
  }
  const invokeAction = (descriptor: SessionOptionDescriptor): void => {
    runSurfaceCall(descriptor.id, setPendingId, () => surface.invokeAction(descriptor.id))
  }

  const naming = { reportedModel, latestSighting, chatThread }
  const effortPill = nativeChatEffortPillText(options, { chatThread, settingsEffort })
  const modelReason = nativeChatSessionOptionDisabledReason(model.disabledReason)
  const tooltip =
    options.length > 0
      ? translate('components.native-chat.composer.modelAndOptions', 'Model and effort')
      : translate('components.native-chat.composer.model', 'Model')

  return (
    <DropdownMenu {...menuProps}>
      <PickerTrigger
        modelLabel={nativeChatModelDisplayLabel(model, naming)}
        effortLabel={effortPill?.text ?? null}
        tooltipLabel={tooltip}
        hint={effortPill?.hint ?? null}
        disabled={isWorking || pendingId !== null}
        disabledReason={modelReason && !model.settable ? modelReason : null}
        dispatched={snapshot.some((descriptor) => descriptor.valueSource === 'dispatched')}
      />
      <DropdownMenuContent align="end" side="top" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {translate('components.native-chat.composer.model', 'Model')}
        </DropdownMenuLabel>
        {modelReason && !model.settable ? (
          <DropdownMenuLabel className="font-normal">{modelReason}</DropdownMenuLabel>
        ) : null}
        <DescriptorMenuRows
          descriptor={model}
          pending={pendingId !== null}
          setValue={(value) => setOption(model, value)}
          invokeAction={() => invokeAction(model)}
          choiceLabel={(choice) => nativeChatModelChoiceLabel(choice, naming)}
        />
        {options.map((descriptor) => {
          const reason = nativeChatSessionOptionDisabledReason(descriptor.disabledReason)
          return (
            <div key={descriptor.id}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {nativeChatSessionOptionLabel(descriptor)}
              </DropdownMenuLabel>
              {reason && !descriptor.settable ? (
                <DropdownMenuLabel className="font-normal">{reason}</DropdownMenuLabel>
              ) : null}
              <DescriptorMenuRows
                descriptor={descriptor}
                pending={pendingId !== null}
                setValue={(value) => setOption(descriptor, value)}
                invokeAction={() => invokeAction(descriptor)}
              />
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const NativeChatSessionOptionPickers = memo(NativeChatSessionOptionPickersInner)
