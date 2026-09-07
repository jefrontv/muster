// A site config field that is read-only until the user asks to edit it.
//
// Two problems this solves. Live-bound inputs wrote on every keystroke, and each write is an IPC
// round-trip that re-reads the git branch and replaces the summary in the store — so a fast typist
// saw characters reorder and the caret jump as stale responses landed on the controlled input.
// And with every field live, a stray keypress silently repointed a deployment target. Editing is
// now an explicit mode with an explicit commit: one write per completed edit, none while typing.
//
// Leaving the field commits it, the same as Enter or the check. Only Escape and the X discard.
// Focus moving to this field's own controls — the check, the X, a suggestion row — is not
// "leaving", so those keep their own meaning instead of being pre-empted by the blur.

import { Check, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { SiteFieldActionButton } from './SiteFieldActionButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const MAX_VISIBLE_SUGGESTIONS = 6
// Fewer characters than this matches almost every stored value, so the list is noise that
// covers the fields below it rather than a shortlist.
const MIN_SUGGESTION_QUERY = 3

type SiteEditableFieldProps = {
  label: string
  /** Displayed while locked. For a secret this is the mask, not the stored value. */
  value: string
  onCommit: (next: string) => void
  placeholder?: string
  /** Values used by other site configurations; offered while editing, never enforced. */
  suggestions?: readonly string[]
  inputMode?: React.ComponentProps<'input'>['inputMode']
  /** Masks the input and always commits on save, so an emptied box can clear a stored secret. */
  secret?: boolean
  /** Rendered before the label text — the key glyph on credential fields. */
  labelIcon?: React.ReactNode
  className?: string
}

function matchingSuggestions(suggestions: readonly string[], draft: string): string[] {
  const needle = draft.trim().toLowerCase()
  if (needle.length < MIN_SUGGESTION_QUERY) {
    return []
  }
  return suggestions
    .filter((entry) => entry.toLowerCase() !== needle && entry.toLowerCase().includes(needle))
    .slice(0, MAX_VISIBLE_SUGGESTIONS)
}

export function SiteEditableField({
  label,
  value,
  onCommit,
  placeholder,
  suggestions,
  inputMode,
  secret = false,
  labelIcon,
  className
}: SiteEditableFieldProps): React.JSX.Element {
  const fieldId = useId()
  const listId = `${fieldId}-suggestions`
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  // Null is the locked state, so there is one source of truth for "am I editing" and the draft.
  const [draft, setDraft] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(-1)
  const [listDismissed, setListDismissed] = useState(false)
  const [touched, setTouched] = useState(false)

  const editing = draft !== null
  // A secret's real value never reaches this process, so an edit always starts from empty.
  const seed = secret ? '' : value
  const visibleSuggestions =
    editing && !listDismissed ? matchingSuggestions(suggestions ?? [], draft) : []

  // Why an effect rather than autoFocus: the input is not remounted when the mode flips, and
  // React only honours autoFocus on mount. Caret goes to the end — these fields are usually
  // corrected, not retyped, so select-all would be the wrong default.
  useEffect(() => {
    if (!editing) {
      return
    }
    const element = inputRef.current
    element?.focus()
    const end = element?.value.length ?? 0
    element?.setSelectionRange(end, end)
  }, [editing])

  const beginEdit = (): void => {
    setDraft(seed)
    setHighlight(-1)
    setListDismissed(false)
    setTouched(false)
  }

  const cancel = (): void => {
    setDraft(null)
    setHighlight(-1)
    setTouched(false)
  }

  const save = (): void => {
    const next = draft ?? ''
    setDraft(null)
    setHighlight(-1)
    setTouched(false)
    // Why touched rather than a value compare: a secret's displayed value is a mask, so an
    // untouched secret field looks identical to one the user emptied — and committing that on
    // the way past would wipe a stored password. Clearing one still writes, because emptying
    // the box is itself an edit.
    if (!touched) {
      return
    }
    // Re-saving the same string would cost a disk write and a git branch read for nothing.
    if (!secret && next === value) {
      return
    }
    onCommit(next)
  }

  const acceptSuggestion = (suggestion: string): void => {
    setDraft(suggestion)
    setHighlight(-1)
    setListDismissed(true)
    setTouched(true)
    inputRef.current?.focus()
  }

  // Focus landing on this field's own check / X / suggestion row is not leaving the field, so
  // those controls keep their own meaning instead of racing the blur.
  const handleBlur = (event: React.FocusEvent<HTMLInputElement>): void => {
    if (!editing) {
      return
    }
    const next = event.relatedTarget
    if (next instanceof Node && fieldRef.current?.contains(next)) {
      return
    }
    save()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!editing) {
      // Keyboard parity with the pencil: the locked field is focusable, so Enter opens it.
      if (event.key === 'Enter') {
        event.preventDefault()
        beginEdit()
      }
      return
    }
    if (visibleSuggestions.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const count = visibleSuggestions.length
      // -1 means "my own typing"; the ring runs -1, 0 … count-1 and back to -1.
      setHighlight((current) => ((current + 1 + step + count + 1) % (count + 1)) - 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const picked = visibleSuggestions[highlight]
      if (picked) {
        acceptSuggestion(picked)
        return
      }
      save()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      // Escape backs out one layer at a time: the suggestion list first, then the edit.
      if (visibleSuggestions.length > 0) {
        setListDismissed(true)
        setHighlight(-1)
        return
      }
      cancel()
    }
  }

  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={fieldId} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
        {labelIcon}
        {label}
      </Label>
      <div className="relative" ref={fieldRef}>
        <Input
          id={fieldId}
          ref={inputRef}
          type={secret ? 'password' : 'text'}
          autoComplete="off"
          role={visibleSuggestions.length > 0 ? 'combobox' : undefined}
          aria-expanded={visibleSuggestions.length > 0 ? true : undefined}
          aria-controls={visibleSuggestions.length > 0 ? listId : undefined}
          aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
          className={cn(editing ? 'pr-16' : 'pr-9 cursor-pointer text-muted-foreground')}
          value={editing ? draft : value}
          readOnly={!editing}
          placeholder={placeholder}
          inputMode={inputMode}
          // Locked values truncate in a two-column grid, so the full string stays hoverable.
          title={!editing && !secret && value.length > 0 ? value : undefined}
          onClick={() => {
            if (!editing) {
              beginEdit()
            }
          }}
          onChange={(event) => {
            setDraft(event.target.value)
            setHighlight(-1)
            setListDismissed(false)
            setTouched(true)
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {editing ? (
            <>
              <SiteFieldActionButton
                icon={<Check className="size-3.5" />}
                ariaLabel={translate(
                  'auto.components.sites.SiteEditableField.save',
                  'Save {{field}}',
                  { field: label }
                )}
                tooltip={translate('auto.components.sites.SiteEditableField.saveTip', 'Save')}
                shortcutKey={translate('auto.components.sites.SiteEditableField.enterKey', 'Enter')}
                onClick={save}
              />
              {/* Backing out is not destructive, so it stays as quiet as the save next to it and
                  carries no key cap. */}
              <SiteFieldActionButton
                icon={<X className="size-3.5" />}
                ariaLabel={translate(
                  'auto.components.sites.SiteEditableField.cancel',
                  'Cancel editing {{field}}',
                  { field: label }
                )}
                tooltip={translate(
                  'auto.components.sites.SiteEditableField.cancelTip',
                  'Discard changes'
                )}
                onClick={cancel}
              />
            </>
          ) : (
            <SiteFieldActionButton
              icon={<Pencil className="size-3.5" />}
              ariaLabel={translate(
                'auto.components.sites.SiteEditableField.edit',
                'Edit {{field}}',
                { field: label }
              )}
              tooltip={translate('auto.components.sites.SiteEditableField.editTip', 'Edit')}
              onClick={beginEdit}
            />
          )}
        </div>
        {visibleSuggestions.length > 0 ? (
          // Why the solid underlay: Match Terminal remaps --popover onto a translucent
          // --background (left-sidebar-appearance.ts), so bg-popover alone lets the form
          // labels behind this list show through.
          <div className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-md border border-border bg-[var(--background-solid)] shadow-md">
            <ul
              id={listId}
              role="listbox"
              aria-label={translate(
                'auto.components.sites.SiteEditableField.suggestions',
                '{{field}} used by other sites',
                { field: label }
              )}
              className="bg-popover py-1"
            >
              {visibleSuggestions.map((suggestion, index) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === highlight}
                    className={cn(
                      'block w-full truncate px-3 py-1.5 text-left text-sm',
                      index === highlight ? 'bg-accent text-accent-foreground' : 'text-foreground'
                    )}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => acceptSuggestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
