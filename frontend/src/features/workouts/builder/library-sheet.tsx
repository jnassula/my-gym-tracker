import { CheckIcon, MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { formatWeight, type Unit } from '@/features/training/weight'
import { useRequiredSession } from '@/lib/auth'
import { cn } from '@/lib/utils'

import { libraryQuery } from '../api'
import { useWorkoutLabels } from '../labels'
import { MUSCLE_GROUPS, type MuscleGroup } from '../types'
import {
  filterOrder,
  isNewName,
  pickKey,
  search,
  type LibraryEntry,
  type LibraryFilter,
  type Pick,
} from './library'


type LibrarySheetProps = {
  open: boolean
  /** The group card that opened it, if any: its exercises come first. */
  group: MuscleGroup | null
  /** What the day already has (`pickKey`), shown ticked instead of addable. */
  inDay: ReadonlySet<string>
  onOpenChange: (open: boolean) => void
  onAdd: (pick: Pick) => void
  /** Tapping an exercise that is already on the day takes it off again. */
  onRemove: (pick: Pick) => void
}

/** "Biblioteca de exercícios": search without accents, filter by group, add with one tap. */
export function LibrarySheet(props: LibrarySheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // The base gives a bottom sheet h-auto, which would let a long list grow past the screen
        // (and the search with it): a fixed height, and the list scrolls inside it.
        className="mx-auto max-w-md gap-3 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] data-[side=bottom]:h-[92dvh]"
      >
        {props.open && <LibraryBrowser {...props} />}
      </SheetContent>
    </Sheet>
  )
}

function LibraryBrowser({ group, inDay, onAdd, onRemove }: LibrarySheetProps) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  const id = useId()
  const library = useQuery(libraryQuery())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>(group ?? 'all')

  const entries = library.data?.entries ?? []
  const hits = search(entries, query, filter)
  const custom: Pick | null = isNewName(entries, query)
    ? { name: query.trim(), muscle_group: filter === 'all' || filter === 'mine' ? (group ?? 'other') : filter }
    : null

  const filterLabel = (item: LibraryFilter) =>
    item === 'all' ? t('builder.library.all') : item === 'mine' ? t('builder.library.mine') : labels.group(item)

  return (
    <>
      <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
      <div>
        {group && (
          <p className="text-[0.6875rem] font-medium tracking-widest text-muted-foreground uppercase">
            → {labels.group(group)}
          </p>
        )}
        <SheetTitle className="text-lg">{t('builder.library.title')}</SheetTitle>
      </div>

      <InputGroup className="h-12 bg-card">
        <InputGroupAddon>
          <MagnifyingGlassIcon />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          value={query}
          autoFocus
          autoComplete="off"
          placeholder={t('builder.library.search')}
          aria-label={t('builder.library.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>

      <div role="radiogroup" aria-label={t('builder.library.filter')} className="-mx-5 overflow-x-auto px-5">
        <div className="flex w-max gap-1.5">
          {filterOrder(MUSCLE_GROUPS, group).map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={item === filter}
              onClick={() => setFilter(item)}
              className={cn(
                'h-9 rounded-full bg-card px-3 text-[13px] whitespace-nowrap text-muted-foreground',
                item === filter && 'bg-accent text-accent-foreground ring-1 ring-primary',
              )}
            >
              {filterLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5">
        {library.isPending ? (
          <Spinner className="mx-auto mt-6 size-6 text-muted-foreground" />
        ) : library.isError ? (
          <FormAlert messageKey={errorKey(library.error)} />
        ) : (
          <ul className="grid gap-1.5 pb-2" aria-label={t('builder.library.results')}>
            {hits.map((entry) => (
              <LibraryRow
                key={pickKey(entry)}
                entry={entry}
                unit={user.unit as Unit}
                locale={i18n.language}
                added={inDay.has(pickKey(entry))}
                onToggle={(added) =>
                  (added ? onRemove : onAdd)({ name: entry.name, muscle_group: entry.muscle_group })
                }
              />
            ))}
            {custom && (
              <li>
                <ToggleRow
                  added={inDay.has(pickKey(custom))}
                  label={t(inDay.has(pickKey(custom)) ? 'builder.library.remove' : 'builder.library.addCustom', {
                    name: custom.name,
                  })}
                  className="ring-1 ring-dashed ring-border"
                  onToggle={(added) => (added ? onRemove : onAdd)(custom)}
                >
                  <span className="block text-sm">{t('builder.library.custom', { name: custom.name })}</span>
                  <span className="block text-xs text-muted-foreground">{labels.group(custom.muscle_group)}</span>
                </ToggleRow>
              </li>
            )}
            {hits.length === 0 && !custom && (
              <li className="py-6 text-center text-sm text-muted-foreground">{t('builder.library.empty')}</li>
            )}
          </ul>
        )}
      </div>
    </>
  )
}

/** One row, one button: a tap adds the exercise to the day, another takes it off. */
function ToggleRow({
  added,
  label,
  className,
  badge,
  onToggle,
  children,
}: {
  added: boolean
  label: string
  className?: string
  badge?: ReactNode
  onToggle: (added: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={added}
      aria-label={label}
      onClick={() => onToggle(added)}
      className={cn(
        'flex min-h-14 w-full items-center gap-2 rounded-xl bg-card py-1 pr-3 pl-3 text-left',
        added && 'bg-accent ring-1 ring-primary',
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {badge}
      <span className="flex size-9 shrink-0 items-center justify-center text-primary">
        {added ? <CheckIcon weight="bold" className="size-5" /> : <PlusIcon className="size-5" />}
      </span>
    </button>
  )
}

function LibraryRow({
  entry,
  unit,
  locale,
  added,
  onToggle,
}: {
  entry: LibraryEntry
  unit: Unit
  locale: string
  added: boolean
  onToggle: (added: boolean) => void
}) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const detail =
    entry.last_weight !== null
      ? t('builder.library.lastWeight', { weight: formatWeight(Number(entry.last_weight), unit, locale) })
      : entry.source === 'plan'
        ? t('builder.library.noWeightYet')
        : t('builder.library.fromBase')
  return (
    <li>
      <ToggleRow
        added={added}
        label={t(added ? 'builder.library.remove' : 'builder.library.add', { name: entry.name })}
        onToggle={onToggle}
        badge={
          entry.plan_name && (
            <Badge variant="secondary" className="max-w-28 justify-start">
              <span className="truncate">{entry.plan_name}</span>
            </Badge>
          )
        }
      >
        <span className="block truncate text-sm font-medium">{entry.name}</span>
        <span className="block text-xs text-muted-foreground">
          {labels.group(entry.muscle_group)} · {detail}
        </span>
      </ToggleRow>
    </li>
  )
}
