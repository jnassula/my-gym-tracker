import {
  BarbellIcon,
  ChartLineUpIcon,
  GearSixIcon,
  HouseIcon,
  PlusIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, type LinkProps } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { plansQuery } from '@/features/workouts/api'
import { NewPlanSheet } from '@/features/workouts/builder/new-plan-sheet'
import { loadDraft } from '@/features/workouts/builder/storage'

type Tab = { to: LinkProps['to']; label: 'nav.home' | 'nav.workouts' | 'nav.progress' | 'nav.settings'; icon: Icon; exact?: boolean }

const TABS: Tab[] = [
  { to: '/', label: 'nav.home', icon: HouseIcon, exact: true },
  { to: '/workouts', label: 'nav.workouts', icon: BarbellIcon },
  { to: '/progress', label: 'nav.progress', icon: ChartLineUpIcon },
  { to: '/settings', label: 'nav.settings', icon: GearSixIcon },
]

/** Mobile bottom tab bar from the design (custom: shadcn has no tab bar), with "+ Novo treino" raised in the middle. */
export function BottomTabs() {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  // Only fetched once the sheet needs the plans (for "Duplicar"); Treinos shares the cache.
  const plans = useQuery({ ...plansQuery(), enabled: adding })
  // Read when the sheet opens: the builder writes the draft as the user edits.
  const draft = adding ? loadDraft() : null

  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid h-17 max-w-md grid-cols-5 px-2">
        {TABS.map(({ to, label, icon: TabIcon, exact }, index) => (
          <li key={label} className={index === 2 ? 'col-start-4' : undefined}>
            <Link
              to={to}
              activeOptions={{ exact }}
              className="flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[0.6875rem] font-medium text-muted-foreground data-[status=active]:text-primary"
            >
              {({ isActive }) => (
                <>
                  <TabIcon className="size-6" weight={isActive ? 'fill' : 'regular'} />
                  {t(label)}
                </>
              )}
            </Link>
          </li>
        ))}
        <li className="col-start-3 row-start-1 flex justify-center">
          {/* Raised above the bar, ringed in the background so it reads as its own button. */}
          <button
            type="button"
            aria-label={t('builder.new.buttonLabel')}
            onClick={() => setAdding(true)}
            className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background active:translate-y-px"
          >
            <PlusIcon className="size-7" weight="bold" />
          </button>
        </li>
      </ul>
      <NewPlanSheet open={adding} onOpenChange={setAdding} plans={plans.data ?? []} draft={draft} />
    </nav>
  )
}
