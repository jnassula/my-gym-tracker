import { CaretLeftIcon } from '@phosphor-icons/react'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

type AuthScreenProps = {
  title: string
  subtitle?: ReactNode
  back?: { to: LinkProps['to']; label: string }
  footer?: ReactNode
  children: ReactNode
}

/** Shared frame of the unauthenticated screens: flush-left title, form, footer pinned low. */
export function AuthScreen({ title, subtitle, back, footer, children }: AuthScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.75rem)]">
      {back && (
        <Link
          to={back.to}
          className="-ml-3 flex h-11 w-fit items-center gap-1 rounded-lg pr-3 text-sm text-primary"
        >
          <CaretLeftIcon className="size-6" />
          {back.label}
        </Link>
      )}
      <header className={back ? 'pt-6 pb-6' : 'pt-9 pb-6'}>
        <h1 className="text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </header>
      {children}
      {footer && <div className="mt-auto pt-8 text-center text-sm text-muted-foreground">{footer}</div>}
    </main>
  )
}
