import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { calendarQuery } from '@/features/progress/api'
import { formatMonth } from '@/features/progress/format'
import { useRemoveAvatar, useSetAvatar, useUpdateMe } from '@/features/settings/api'
import { UnreadableImageError } from '@/features/settings/avatar'
import { LinkRow, SettingsGroup } from '@/features/settings/rows'
import { UserAvatar } from '@/features/settings/user-avatar'
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
          <UserAvatar user={user} className="size-16" fallbackClassName="text-2xl" />
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

        <PhotoActions />

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

/** Add, change or remove the profile photo. The picture is cropped and scaled down before it goes. */
function PhotoActions() {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const input = useRef<HTMLInputElement>(null)
  const upload = useSetAvatar()
  const remove = useRemoveAvatar()
  const hasPhoto = user.avatar_file_id !== null
  const busy = upload.isPending || remove.isPending
  const error = upload.error ?? remove.error

  const choose = (file: File | undefined) => {
    if (!file) return
    remove.reset()
    upload.mutate(file, { onSuccess: () => toast.success(t('settings.profile.photoSaved')) })
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            choose(event.target.files?.[0])
            event.target.value = '' // the same file can be chosen again
          }}
        />
        <Button variant="outline" size="touch" disabled={busy} onClick={() => input.current?.click()}>
          {upload.isPending && <Spinner />}
          {hasPhoto ? t('settings.profile.photoChange') : t('settings.profile.photoAdd')}
        </Button>
        {hasPhoto && (
          <Button
            variant="ghost"
            size="touch"
            className="text-destructive"
            disabled={busy}
            onClick={() => {
              upload.reset()
              remove.mutate(undefined, { onSuccess: () => toast.success(t('settings.profile.photoRemoved')) })
            }}
          >
            {remove.isPending && <Spinner />}
            {t('settings.profile.photoRemove')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.profile.photoHint')}</p>
      {error && (
        <FormAlert
          messageKey={error instanceof UnreadableImageError ? 'settings.profile.photoUnreadable' : errorKey(error)}
        />
      )}
    </div>
  )
}
