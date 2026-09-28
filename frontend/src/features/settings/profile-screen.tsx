import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { calendarQuery } from '@/features/progress/api'
import { formatMonth } from '@/features/progress/format'
import { useUpdateMe } from '@/features/settings/api'
import { LinkRow, SettingsGroup } from '@/features/settings/rows'
import { useRequiredSession } from '@/lib/auth'

const MAX_NAME = 100

export function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const { user } = useRequiredSession()
  const update = useUpdateMe()
  const calendar = useQuery(calendarQuery(''))
  const ids = { name: useId(), email: useId() }
  const [name, setName] = useState(user.name)
  const trimmed = name.trim()
  const valid = trimmed.length > 0 && trimmed.length <= MAX_NAME

  const since = formatMonth(user.created_at.slice(0, 10), i18n.language)
  const workouts = calendar.data?.sessions_total

  return (
    <Page title={t('settings.profile.title')} back="/settings">
      <div className="grid gap-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-accent text-2xl text-accent-foreground">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[17px] font-medium">{user.name}</p>
            <p className="text-[13px] text-muted-foreground first-letter:uppercase">
              {[
                t('settings.profile.memberSince', { date: since }),
                workouts === undefined ? null : t('settings.profile.workouts', { count: workouts }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!valid) return
            update.mutate(
              { name: trimmed },
              {
                onSuccess: () => toast.success(t('settings.profile.saved')),
                onError: () => toast.error(t('settings.saveError')),
              },
            )
          }}
        >
          <Field data-invalid={!valid}>
            <FieldLabel htmlFor={ids.name}>{t('settings.profile.name')}</FieldLabel>
            <Input
              id={ids.name}
              value={name}
              maxLength={MAX_NAME}
              autoComplete="name"
              aria-invalid={!valid}
              onChange={(event) => setName(event.target.value)}
            />
            {!valid && <FieldError>{t('validation.required')}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.email}>{t('settings.profile.email')}</FieldLabel>
            <Input id={ids.email} value={user.email} readOnly className="text-muted-foreground" />
          </Field>
          <Button
            type="submit"
            variant="outline-primary"
            size="hero"
            disabled={!valid || trimmed === user.name || update.isPending}
          >
            {update.isPending ? t('settings.profile.saving') : t('settings.profile.save')}
          </Button>
        </form>

        <SettingsGroup title={t('settings.profile.password')}>
          <LinkRow to="/settings/password" label={t('settings.changePassword')} />
        </SettingsGroup>
      </div>
    </Page>
  )
}
