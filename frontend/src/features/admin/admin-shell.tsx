import { ArrowLeftIcon } from '@phosphor-icons/react'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LogoMark } from '@/components/logo-mark'

type Section = { to: LinkProps['to']; label: 'admin.nav.overview' | 'admin.nav.users'; exact?: boolean }

const SECTIONS: Section[] = [
  { to: '/admin', label: 'admin.nav.overview', exact: true },
  { to: '/admin/users', label: 'admin.nav.users' },
]

/**
 * The backoffice's frame. Unlike the app's screens (one phone-wide column over bottom tabs) it
 * is read at a desk as often as on a phone: a wide column under its own header.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-10">
      <header className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1">
        <Link to="/admin" className="flex min-h-11 items-center gap-2.5">
          <LogoMark className="size-7 text-primary" />
          <span className="text-lg font-medium">{t('admin.title')}</span>
        </Link>
        <nav aria-label={t('admin.nav.label')} className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <ul className="flex gap-1">
            {SECTIONS.map(({ to, label, exact }) => (
              <li key={label}>
                <Link
                  to={to}
                  activeOptions={{ exact }}
                  className="flex min-h-11 items-center rounded-xl px-3 text-sm text-muted-foreground data-[status=active]:bg-card data-[status=active]:text-foreground"
                >
                  {t(label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link to="/settings" className="ml-auto flex min-h-11 items-center gap-1.5 text-sm text-primary">
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t('admin.nav.backToApp')}
        </Link>
      </header>
      <main className="pt-4">{children}</main>
    </div>
  )
}
