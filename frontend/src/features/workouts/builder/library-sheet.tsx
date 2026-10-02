import { CheckIcon, MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

function LibraryBrowser({ group, inDay, onAdd }: LibrarySheetProps) {
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
                onAdd={() => onAdd({ name: entry.name, muscle_group: entry.muscle_group })}
              />
            ))}
            {custom && (
              <li className="flex min-h-14 items-center gap-2 rounded-xl bg-card py-1 pr-1 pl-3 ring-1 ring-dashed ring-border">
                <span className="min-w-0 flex-1 text-sm">
                  {t('builder.library.custom', { name: custom.name })}
                  <span className="block text-xs text-muted-foreground">{labels.group(custom.muscle_group)}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-touch"
                  aria-label={t('builder.library.addCustom', { name: custom.name })}
                  onClick={() => onAdd(custom)}
                >
                  <PlusIcon className="size-5" />
                </Button>
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

function LibraryRow({
  entry,
  unit,
  locale,
  added,
  onAdd,
}: {
  entry: LibraryEntry
  unit: Unit
  locale: string
  added: boolean
  onAdd: () => void
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
    <li className="flex min-h-14 items-center gap-2 rounded-xl bg-card py-1 pr-1 pl-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{entry.name}</span>
        <span className="block text-xs text-muted-foreground">
          {labels.group(entry.muscle_group)} · {detail}
        </span>
      </span>
      {entry.plan_name && (
        <Badge variant="secondary" className="max-w-28 justify-start">
          <span className="truncate">{entry.plan_name}</span>
        </Badge>
      )}
      {added ? (
        <span className="flex size-11 items-center justify-center text-primary">
          <CheckIcon weight="bold" className="size-5" aria-label={t('builder.library.added', { name: entry.name })} />
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon-touch"
          className="text-primary"
          aria-label={t('builder.library.add', { name: entry.name })}
          onClick={onAdd}
        >
          <PlusIcon className="size-5" />
        </Button>
      )}
    </li>
  )
}
