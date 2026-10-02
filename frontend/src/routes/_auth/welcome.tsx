import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { LogoMark } from '@/components/logo-mark'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_auth/welcome')({
  component: Welcome,
})

function Welcome() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-radial-[at_50%_20%] from-accent to-background to-60% px-7 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(env(safe-area-inset-bottom),2rem)] text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-4.5">
        <LogoMark />
        <h1 className="text-3xl">{t('app.name')}</h1>
        <p className="max-w-70 text-base text-muted-foreground">{t('app.tagline')}</p>
      </div>
      <div className="grid gap-2.5">
        <Link to="/register" className={cn(buttonVariants({ size: 'hero' }))}>
          {t('welcome.createAccount')}
        </Link>
        <Link to="/login" className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}>
          {t('welcome.haveAccount')}
        </Link>
      </div>
    </main>
  )
}
