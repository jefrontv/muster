import { Check, Code2, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export type OnboardingDefaultView = 'chat' | 'code'

export function applyOnboardingDefaultView(view: OnboardingDefaultView): void {
  const store = useAppStore.getState()
  if (view === 'chat') {
    store.openChatPage()
    return
  }
  if (store.activeView === 'chat') {
    store.closeChatPage()
    return
  }
  store.setActiveView('terminal')
}

export function resolveOnboardingDefaultView(
  activeView: string | undefined
): OnboardingDefaultView {
  return activeView === 'chat' ? 'chat' : 'code'
}

type OnboardingDefaultViewStepProps = {
  value: OnboardingDefaultView
  onChange: (view: OnboardingDefaultView) => void
}

export function OnboardingDefaultViewStep({
  value,
  onChange
}: OnboardingDefaultViewStepProps): React.JSX.Element {
  const options: {
    id: OnboardingDefaultView
    label: string
    hint: string
    description: string
    icon: typeof MessageCircle
  }[] = [
    {
      id: 'chat',
      label: translate('auto.components.onboarding.defaultView.chat', 'Chat Mode'),
      hint: translate('auto.components.onboarding.defaultView.chatHint', 'Talk first'),
      description: translate(
        'auto.components.onboarding.defaultView.chatDescription',
        'A conversation desk. Threads, projects, and agents in one place.'
      ),
      icon: MessageCircle
    },
    {
      id: 'code',
      label: translate('auto.components.onboarding.defaultView.code', 'Code Mode'),
      hint: translate('auto.components.onboarding.defaultView.codeHint', 'Build first'),
      description: translate(
        'auto.components.onboarding.defaultView.codeDescription',
        'Worktrees, terminals, and the classic IDE layout.'
      ),
      icon: Code2
    }
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map(({ id, label, hint, description, icon: Icon }) => {
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            className={cn(
              'group overflow-hidden rounded-xl border p-3 text-left transition-all',
              selected
                ? 'border-ring bg-accent/50 ring-2 ring-ring/40'
                : 'border-border bg-muted/30 hover:bg-muted/60'
            )}
            onClick={() => onChange(id)}
          >
            <div className="relative mb-3 h-36 overflow-hidden rounded-lg border border-border">
              <DefaultViewPreview mode={id} />
              {selected ? (
                <div className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs">
                  <Check className="size-3" strokeWidth={3} />
                </div>
              ) : null}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Icon className="size-3.5 text-muted-foreground" />
                {label}
              </div>
              <div className="text-[11px] text-muted-foreground">{hint}</div>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function DefaultViewPreview({ mode }: { mode: OnboardingDefaultView }): React.JSX.Element {
  const chat = mode === 'chat'
  return (
    <div className="flex size-full bg-background">
      <div className="flex w-[38%] flex-col gap-1 border-r border-border bg-muted/40 p-1.5">
        <div className="mb-1 flex rounded-md border border-border bg-background/70 p-0.5">
          <span
            className={cn('h-1.5 flex-1 rounded-sm', chat ? 'bg-foreground/25' : 'bg-transparent')}
          />
          <span
            className={cn('h-1.5 flex-1 rounded-sm', chat ? 'bg-transparent' : 'bg-foreground/25')}
          />
        </div>
        {chat ? (
          <>
            <div className="h-1.5 w-10 rounded-sm bg-foreground/15" />
            <div className="mt-1 h-6 rounded-md bg-foreground/10" />
            <div className="h-6 rounded-md bg-foreground/6" />
          </>
        ) : (
          <>
            <div className="h-1 w-8 rounded-sm bg-foreground/12" />
            <div className="mt-1 flex items-center gap-1">
              <span className="size-1 rounded-full bg-foreground/35" />
              <span className="h-1 flex-1 rounded-sm bg-foreground/20" />
            </div>
            <div className="flex items-center gap-1">
              <span className="size-1 rounded-full bg-foreground/15" />
              <span className="h-1 w-3/4 rounded-sm bg-foreground/10" />
            </div>
            <div className="flex items-center gap-1">
              <span className="size-1 rounded-full bg-foreground/15" />
              <span className="h-1 w-2/3 rounded-sm bg-foreground/10" />
            </div>
          </>
        )}
      </div>
      <div className="flex flex-1 flex-col p-1.5">
        {chat ? (
          <>
            <div className="ml-auto h-4 w-3/5 rounded-md bg-foreground/10" />
            <div className="mt-1.5 h-6 w-4/5 rounded-md bg-muted" />
            <div className="mt-auto h-3 rounded-md border border-border bg-background" />
          </>
        ) : (
          <>
            <div className="flex gap-1">
              <div className="h-2 w-8 rounded-sm border border-border bg-muted" />
              <div className="h-2 w-5 rounded-sm bg-foreground/8" />
            </div>
            <div className="mt-1.5 flex-1 space-y-1 rounded-sm bg-foreground/4 p-1">
              <div className="h-1 w-full rounded-sm bg-foreground/10" />
              <div className="h-1 w-5/6 rounded-sm bg-foreground/10" />
              <div className="h-1 w-2/3 rounded-sm bg-foreground/8" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
