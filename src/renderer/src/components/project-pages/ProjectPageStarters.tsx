// Shown under an empty page: template buttons.
import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { PROJECT_PAGE_TEMPLATES } from './project-pages-templates'

export function ProjectPageStarters({
  onPick,
  onMakeDatabase
}: {
  onPick: (markdown: string) => void
  onMakeDatabase?: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 px-8 pb-4 text-xs text-muted-foreground">
      <span>{translate('auto.components.projectPages.startWith', 'Start with')}</span>
      {PROJECT_PAGE_TEMPLATES.map((template) => (
        <Button
          key={template.id}
          size="xs"
          variant="outline"
          onClick={() => onPick(template.markdown())}
        >
          {template.label}
        </Button>
      ))}
      {onMakeDatabase ? (
        <Button size="xs" variant="outline" onClick={onMakeDatabase}>
          {translate('auto.components.projectPages.templateDatabase', 'Database')}
        </Button>
      ) : null}
    </div>
  )
}
