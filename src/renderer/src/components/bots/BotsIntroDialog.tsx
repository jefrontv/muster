// The Bots tab's first-visit intro: what bots are, with a way out for people who don't want them.
import { Bot, CalendarClock, NotebookPen, Plug } from 'lucide-react'
import type React from 'react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

function features(): { icon: React.ElementType; title: string; detail: string }[] {
  return [
    {
      icon: Bot,
      title: translate('auto.components.bots.BotsIntro.jobTitle', 'Give each bot a job'),
      detail: translate(
        'auto.components.bots.BotsIntro.jobDetail',
        "Name it, tell it what it's for, and chat with it any time."
      )
    },
    {
      icon: CalendarClock,
      title: translate('auto.components.bots.BotsIntro.scheduleTitle', 'Run on a schedule'),
      detail: translate(
        'auto.components.bots.BotsIntro.scheduleDetail',
        'Routines like a morning summary run by themselves.'
      )
    },
    {
      icon: Plug,
      title: translate('auto.components.bots.BotsIntro.appsTitle', 'Connect your apps'),
      detail: translate(
        'auto.components.bots.BotsIntro.appsDetail',
        'Add a Composio key to let bots use Gmail, Calendar, Slack and more.'
      )
    },
    {
      icon: NotebookPen,
      title: translate('auto.components.bots.BotsIntro.memoryTitle', 'Remembers what matters'),
      detail: translate(
        'auto.components.bots.BotsIntro.memoryDetail',
        'Each bot keeps notes you can open and edit.'
      )
    }
  ]
}

export function BotsIntroDialog({ active }: { active: boolean }): React.JSX.Element | null {
  const seen = useAppStore((s) => s.settings?.botsIntroSeen === true)
  const enabled = useAppStore((s) => s.settings?.experimentalBots === true)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const leaveBotsPage = useAppStore((s) => s.leaveBotsPage)
  const exploreRef = useRef<HTMLButtonElement | null>(null)

  if (seen || !enabled) {
    return null
  }

  const explore = (): void => {
    void updateSettings({ botsIntroSeen: true })
  }
  const disable = (): void => {
    leaveBotsPage()
    void updateSettings({ botsIntroSeen: true, experimentalBots: false })
    toast.info(translate('auto.components.bots.BotsIntro.disabledToast', 'Bots is off'), {
      description: translate(
        'auto.components.bots.BotsIntro.disabledToastDetail',
        'Turn it back on in Settings → Experimental → Muster Bots.'
      )
    })
  }

  return (
    <Dialog open={active} onOpenChange={(open) => (open ? undefined : explore())}>
      <DialogContent
        className="gap-5 sm:max-w-[480px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          exploreRef.current?.focus()
        }}
      >
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground">
              <Bot className="size-7" strokeWidth={1.75} aria-hidden />
            </span>
            <Badge variant="secondary" className="font-normal text-muted-foreground">
              {translate('auto.components.bots.BotsIntro.badge', 'Experimental')}
            </Badge>
          </div>
          <DialogTitle className="text-lg font-semibold">
            {translate('auto.components.bots.BotsIntro.title', 'Meet Muster Bots')}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            {translate(
              'auto.components.bots.BotsIntro.lede',
              'AI helpers that live in Muster. Each bot has its own job, memory and schedule, and keeps working while you do something else.'
            )}
          </DialogDescription>
        </DialogHeader>

        <ul className="grid gap-3">
          {features().map(({ icon: Icon, title, detail }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-muted-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 space-y-0.5 pt-px">
                <span className="block text-[13px] leading-5 font-medium">{title}</span>
                <span className="block text-xs leading-4 text-muted-foreground">{detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          {translate(
            'auto.components.bots.BotsIntro.note',
            'Bots use your Claude or Codex account and ask before risky actions.'
          )}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={disable}>
            {translate('auto.components.bots.BotsIntro.disable', 'Disable Bots')}
          </Button>
          <Button ref={exploreRef} onClick={explore}>
            {translate('auto.components.bots.BotsIntro.explore', 'Explore')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
