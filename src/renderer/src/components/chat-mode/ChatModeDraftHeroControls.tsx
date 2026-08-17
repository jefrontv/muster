// The hero composer's footer controls: model + effort pickers that edit the
// persisted chat defaults (which the thread launcher reads), and the send
// button. No session exists yet, so picks persist instead of dispatching.

import { ArrowUp, ChevronDown } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  catalogDefaultModel,
  findCatalogModel,
  findCatalogOption,
  getAgentSessionOptionCatalog
} from '../../../../shared/agent-session-option-catalog'
import {
  resolveNativeChatSessionOptionDefaults,
  updateNativeChatSessionOptionDefaults
} from '../../../../shared/native-chat-session-option-defaults'
import { useAppStore } from '@/store'
import { useClaudeCatalogModelsWithLearned } from '../native-chat/claude-learned-models'

function PickerTrigger({ label }: { label: string }): React.JSX.Element {
  return (
    <DropdownMenuTrigger className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {label}
      <ChevronDown className="size-3" />
    </DropdownMenuTrigger>
  )
}

export function ChatModeDraftHeroControls({
  sendDisabled,
  onSend
}: {
  sendDisabled: boolean
  onSend: () => void
}): React.JSX.Element {
  const persisted = useAppStore((s) => s.settings?.nativeChatSessionOptions)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const catalog = getAgentSessionOptionCatalog('claude')
  // Static families plus any learned from observed model ids (new releases).
  const models = useClaudeCatalogModelsWithLearned()
  const defaults = resolveNativeChatSessionOptionDefaults(persisted, 'claude')
  const selectedModelId =
    (typeof defaults?.model === 'string' ? defaults.model : undefined) ??
    (catalog ? catalogDefaultModel(catalog)?.id : undefined)
  const model =
    catalog && selectedModelId
      ? findCatalogModel({ ...catalog, models }, selectedModelId)
      : undefined
  const effortOption = findCatalogOption(model, 'effort')
  const effortChoices = effortOption?.kind.type === 'select' ? effortOption.kind.choices : []
  const effortValue =
    (typeof defaults?.effort === 'string' ? defaults.effort : undefined) ??
    (effortOption?.kind.type === 'select' ? effortOption.kind.defaultValue : undefined)

  const persistPick = (modelId: string, optionId: string, value: string): void => {
    void updateSettings({
      nativeChatSessionOptions: updateNativeChatSessionOptionDefaults({
        persisted,
        agent: 'claude',
        modelId,
        optionId,
        value
      })
    })
  }

  return (
    <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
      <div className="flex min-w-0 items-center gap-0.5">
        {catalog ? (
          <DropdownMenu>
            <PickerTrigger
              label={model?.label ?? translate('auto.components.chat.hero.modelPicker', 'Model')}
            />
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={selectedModelId ?? ''}
                onValueChange={(value) => persistPick(value, 'model', value)}
              >
                {models.map((candidate) => (
                  <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {effortChoices.length > 0 && selectedModelId ? (
          <DropdownMenu>
            <PickerTrigger
              label={
                effortChoices.find((choice) => choice.value === effortValue)?.label ??
                translate('auto.components.chat.hero.effortPicker', 'Effort')
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={typeof effortValue === 'string' ? effortValue : ''}
                onValueChange={(value) => persistPick(selectedModelId, 'effort', value)}
              >
                {effortChoices.map((choice) => (
                  <DropdownMenuRadioItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <Button
        type="button"
        aria-label={translate('auto.components.chat.hero.send', 'Start the chat')}
        disabled={sendDisabled}
        onClick={onSend}
        size="icon"
        className="size-8 rounded-full"
      >
        <ArrowUp className="size-4" />
      </Button>
    </div>
  )
}
