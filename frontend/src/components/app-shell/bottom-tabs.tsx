import {
  BarbellIcon,
  ChartLineUpIcon,
  GearSixIcon,
  HouseIcon,
  type Icon,
} from '@phosphor-icons/react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

type Tab = { to: LinkProps['to']; label: 'nav.home' | 'nav.workouts' | 'nav.progress' | 'nav.settings'; icon: Icon; exact?: boolean }

const TABS: Tab[] = [
  { to: '/', label: 'nav.home', icon: HouseIcon, exact: true },
  { to: '/workouts', label: 'nav.workouts', icon: BarbellIcon },
  { to: '/progress', label: 'nav.progress', icon: ChartLineUpIcon },
  { to: '/settings', label: 'nav.settings', icon: GearSixIcon },
]

/** Mobile bottom tab bar from the design (custom: shadcn has no tab bar). */
export function BottomTabs() {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid h-17 max-w-md grid-cols-4 px-2">
        {TABS.map(({ to, label, icon: TabIcon, exact }) => (
          <li key={label}>
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
      </ul>
    </nav>
  )
}
