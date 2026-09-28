import { CaretLeftIcon } from '@phosphor-icons/react'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type PageProps = {
  title: string
  /** Where the ‹ back affordance goes (sub-screens only). */
  back?: LinkProps['to']
  /** Header action on the right, e.g. "+ PDF". */
  action?: ReactNode
  children: ReactNode
}

/** A screen inside the signed-in app: flush-left title, content below. */
export function Page({ title, back, action, children }: PageProps) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-6">
      <header className="flex min-h-14 items-center gap-1">
        {back && (
          <Link
            to={back}
            aria-label={t('nav.back')}
            className="-ml-3 flex size-11 items-center justify-center rounded-xl text-primary"
          >
            <CaretLeftIcon className="size-6" />
          </Link>
        )}
        <h1 className={back ? 'min-w-0 flex-1 truncate text-lg' : 'flex-1 text-2xl'}>{title}</h1>
        {action}
      </header>
      <div className="pt-3">{children}</div>
    </div>
  )
}
