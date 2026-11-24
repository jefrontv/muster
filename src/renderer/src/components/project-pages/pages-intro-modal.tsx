import { Bot, FileText, Network, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
import { usePagesIntro } from './use-pages-intro'

type IntroPoint = { icon: LucideIcon; title: string; body: string }

function introPoints(): IntroPoint[] {
  return [
    {
      icon: FileText,
      title: translate('auto.components.projectPages.intro.notesTitle', 'Pages for every project'),
      body: translate(
        'auto.components.projectPages.intro.notesBody',
        'Keep notes, checklists and runbooks next to the code and sites they describe.'
      )
    },
    {
      icon: Workflow,
      title: translate('auto.components.projectPages.intro.diagramsTitle', 'Diagrams'),
      body: translate(
        'auto.components.projectPages.intro.diagramsBody',
        'Draw flowcharts and architecture maps, and link any shape to a page.'
      )
    },
    {
      icon: Network,
      title: translate('auto.components.projectPages.intro.mapTitle', 'Page map'),
      body: translate(
        'auto.components.projectPages.intro.mapBody',
        'See how your pages link together and jump straight to one.'
      )
    },
    {
      icon: Bot,
      title: translate('auto.components.projectPages.intro.agentsTitle', 'Agents can use them'),
      body: translate(
        'auto.components.projectPages.intro.agentsBody',
        'Agents read and update pages while they work, so what they learn stays with the project.'
      )
    }
  ]
}

export function PagesIntroModal({
  whatsNewSettled
}: {
  whatsNewSettled: boolean
}): React.JSX.Element | null {
  const { open, dismiss } = usePagesIntro(whatsNewSettled)
  const pagesEnabled = useAppStore((s) => s.settings?.experimentalProjectPages === true)

  async function openPages(): Promise<void> {
    dismiss()
    const store = useAppStore.getState()
    if (!pagesEnabled) {
      await store.updateSettings({ experimentalProjectPages: true })
    }
    useAppStore.getState().openPagesPage()
  }

  if (!open) {
    return null
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : dismiss())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.projectPages.intro.title', 'Introducing Muster Pages')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.projectPages.intro.description',
              'Docs and diagrams that live with your projects.'
            )}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 py-1">
          {introPoints().map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-[13px] font-medium text-foreground">{title}</span>
                <span className="block text-xs text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        {pagesEnabled ? null : (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.projectPages.intro.experimentalNote',
              'Pages is experimental. You can turn it off again in Settings > Experimental.'
            )}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            {translate('auto.components.projectPages.intro.later', 'Not now')}
          </Button>
          <Button onClick={() => void openPages()}>
            {pagesEnabled
              ? translate('auto.components.projectPages.intro.open', 'Open Pages')
              : translate('auto.components.projectPages.intro.enable', 'Turn on Pages')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
