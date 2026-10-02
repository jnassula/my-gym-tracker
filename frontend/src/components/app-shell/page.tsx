import { CaretLeftIcon } from '@phosphor-icons/react'
import { createLink, Link, type LinkProps } from '@tanstack/react-router'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const BACK_CLASS = '-ml-3 flex size-11 shrink-0 items-center justify-center rounded-xl text-primary'

function BackAnchor(props: ComponentProps<'a'>) {
  const { t } = useTranslation()
  return (
    <a aria-label={t('nav.back')} className={BACK_CLASS} {...props}>
      <CaretLeftIcon className="size-6" />
    </a>
  )
}

/** The ‹ back affordance for routes with params: `<BackLink to="/workouts/$planId" params={…} />`. */
// oxlint-disable-next-line react/only-export-components -- createLink returns a (typed) component
export const BackLink = createLink(BackAnchor)

type PageProps = {
  title: string
  /** Small uppercase line above the title, e.g. "Quarta · Hoje". */
  kicker?: string
  /** Where the ‹ back affordance goes (sub-screens only). */
  back?: LinkProps['to']
  /** A ready-made `BackLink`, for back targets with params. */
  backLink?: ReactNode
  /** Header action on the right, e.g. "+ PDF". */
  action?: ReactNode
  children: ReactNode
}

/** A screen inside the signed-in app: flush-left title, content below. */
export function Page({ title, kicker, back, backLink, action, children }: PageProps) {
  const { t } = useTranslation()
  const hasBack = Boolean(back || backLink)
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-6">
      <header className="flex min-h-14 items-center gap-1">
        {backLink ??
          (back && (
            <Link to={back} aria-label={t('nav.back')} className={BACK_CLASS}>
              <CaretLeftIcon className="size-6" />
            </Link>
          ))}
        <div className="min-w-0 flex-1">
          {kicker && (
            <p className="truncate text-[0.6875rem] font-medium tracking-widest text-muted-foreground uppercase">
              {kicker}
            </p>
          )}
          <h1 className={hasBack || kicker ? 'truncate text-lg' : 'text-2xl'}>{title}</h1>
        </div>
        {action}
      </header>
      <div className="pt-3">{children}</div>
    </div>
  )
}
