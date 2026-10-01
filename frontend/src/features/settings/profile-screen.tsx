import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { calendarQuery } from '@/features/progress/api'
import { formatMonth } from '@/features/progress/format'
import { useRemoveAvatar, useSetAvatar, useUpdateMe } from '@/features/settings/api'
import { loadPicture, type Picture } from '@/features/settings/avatar'
import { PhotoEditor } from '@/features/settings/photo-editor'
import { LinkRow, Segmented, SettingsGroup } from '@/features/settings/rows'
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

        <BodyDetails />

        <SettingsGroup title={t('settings.profile.password')}>
          <LinkRow to="/settings/password" label={t('settings.changePassword')} />
        </SettingsGroup>
      </div>
    </Page>
  )
}

const HEIGHT_CM = [50, 260] as const
const EARLIEST_BIRTH = '1900-01-01'

/** Height, date of birth and sex: optional, and only used to turn a scale's reading into body
 * composition (features/body). Emptying a field clears it. */
function BodyDetails() {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const update = useUpdateMe()
  const ids = { height: useId(), birth: useId(), sexHint: useId() }
  const [height, setHeight] = useState(user.height_cm === null ? '' : String(user.height_cm))
  const [birth, setBirth] = useState(user.birth_date ?? '')
  const [sex, setSex] = useState(user.sex)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  const heightCm = height.trim() === '' ? null : Number(height)
  const heightValid =
    heightCm === null || (/^\d{2,3}$/.test(height.trim()) && heightCm >= HEIGHT_CM[0] && heightCm <= HEIGHT_CM[1])
  const birthDate = birth === '' ? null : birth
  const birthValid = birthDate === null || (birthDate >= EARLIEST_BIRTH && birthDate <= today)
  const changed = heightCm !== user.height_cm || birthDate !== user.birth_date || sex !== user.sex

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!heightValid || !birthValid) return
        update.mutate(
          { height_cm: heightCm, birth_date: birthDate, sex },
          {
            onSuccess: () => toast.success(t('settings.profile.body.saved')),
            onError: () => toast.error(t('settings.saveError')),
          },
        )
      }}
    >
      <div className="grid gap-1">
        <h2 className="px-1 text-[0.6875rem] font-medium tracking-widest text-primary uppercase">
          {t('settings.profile.body.title')}
        </h2>
        <p className="px-1 text-xs text-muted-foreground">{t('settings.profile.body.hint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={!heightValid}>
          <FieldLabel htmlFor={ids.height}>{t('settings.profile.body.height')}</FieldLabel>
          <Input
            id={ids.height}
            inputMode="numeric"
            value={height}
            aria-invalid={!heightValid}
            onChange={(event) => setHeight(event.target.value)}
          />
          {!heightValid && <FieldError>{t('settings.profile.body.invalidHeight')}</FieldError>}
        </Field>
        <Field data-invalid={!birthValid}>
          <FieldLabel htmlFor={ids.birth}>{t('settings.profile.body.birthDate')}</FieldLabel>
          <Input
            id={ids.birth}
            type="date"
            min={EARLIEST_BIRTH}
            max={today}
            value={birth}
            autoComplete="bday"
            aria-invalid={!birthValid}
            onChange={(event) => setBirth(event.target.value)}
          />
          {!birthValid && <FieldError>{t('settings.profile.body.invalidBirthDate')}</FieldError>}
        </Field>
      </div>
      <Field>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('settings.profile.body.sex')}</span>
          <Segmented
            label={t('settings.profile.body.sex')}
            value={sex ?? ''}
            options={[
              { value: 'male', label: t('settings.profile.body.male') },
              { value: 'female', label: t('settings.profile.body.female') },
            ]}
            onChange={(value) => setSex(value as 'male' | 'female')}
          />
        </div>
        <FieldDescription id={ids.sexHint}>{t('settings.profile.body.sexHint')}</FieldDescription>
      </Field>
      <Button
        type="submit"
        variant="outline-primary"
        size="touch"
        disabled={!heightValid || !birthValid || !changed || update.isPending}
      >
        {t('settings.profile.body.save')}
      </Button>
    </form>
  )
}

/** Add, change or remove the profile photo. A chosen picture goes through the editor first. */
function PhotoActions() {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const input = useRef<HTMLInputElement>(null)
  const upload = useSetAvatar()
  const remove = useRemoveAvatar()
  const [picture, setPicture] = useState<Picture | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [reading, setReading] = useState(false)
  const hasPhoto = user.avatar_file_id !== null
  const busy = reading || upload.isPending || remove.isPending

  const choose = async (file: File | undefined) => {
    if (!file) return
    upload.reset()
    remove.reset()
    setUnreadable(false)
    setReading(true)
    try {
      setPicture(await loadPicture(file))
    } catch {
      setUnreadable(true)
    } finally {
      setReading(false)
    }
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
            void choose(event.target.files?.[0])
            event.target.value = '' // the same file can be chosen again
          }}
        />
        <Button variant="outline" size="touch" disabled={busy} onClick={() => input.current?.click()}>
          {reading && <Spinner />}
          {hasPhoto ? t('settings.profile.photoChange') : t('settings.profile.photoAdd')}
        </Button>
        {hasPhoto && (
          <Button
            variant="ghost"
            size="touch"
            className="text-destructive"
            disabled={busy}
            onClick={() => {
              setUnreadable(false)
              remove.mutate(undefined, { onSuccess: () => toast.success(t('settings.profile.photoRemoved')) })
            }}
          >
            {remove.isPending && <Spinner />}
            {t('settings.profile.photoRemove')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.profile.photoHint')}</p>
      {unreadable ? (
        <FormAlert messageKey="settings.profile.photoUnreadable" />
      ) : (
        remove.error && <FormAlert messageKey={errorKey(remove.error)} />
      )}
      <PhotoEditor
        picture={picture}
        saving={upload.isPending}
        errorKey={upload.error ? errorKey(upload.error) : undefined}
        onCancel={() => {
          upload.reset()
          setPicture(null)
        }}
        onSave={(photo) =>
          upload.mutate(photo, {
            onSuccess: () => {
              toast.success(t('settings.profile.photoSaved'))
              setPicture(null)
            },
          })
        }
      />
    </div>
  )
}
