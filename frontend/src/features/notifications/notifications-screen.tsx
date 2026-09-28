import { BellRingingIcon, CaretRightIcon, WarningIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { SettingsGroup, SwitchRow } from '@/features/settings/rows'
import { plansQuery } from '@/features/workouts/api'
import { formatDate } from '@/features/workouts/format'

import {
  deviceQuery,
  notificationsQuery,
  sendTestNotification,
  useDisableDevice,
  useEnableDevice,
  useUpdateNotificationSettings,
  type NotificationSettings,
  type Notifications,
} from './api'
import { pushSupport } from './push'

const EXPIRY_NOTICE_DAYS = 14

/** Notificações: this device's push, the reminders, and a nudge when the plan is expiring. */
export function NotificationsScreen() {
  const { t } = useTranslation()
  const notifications = useQuery(notificationsQuery())
  return (
    <Page title={t('notifications.title')} back="/settings">
      {notifications.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : notifications.isError ? (
        <FormAlert messageKey={errorKey(notifications.error)} />
      ) : (
        <div className="grid gap-6">
          <ExpiringPlan />
          <Device data={notifications.data} />
          <Reminders settings={notifications.data.settings} />
          <p className="px-1 text-xs text-muted-foreground">{t('notifications.footer')}</p>
        </div>
      )}
    </Page>
  )
}

function daysUntil(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  const today = new Date()
  return Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000,
  )
}

function ExpiringPlan() {
  const { t, i18n } = useTranslation()
  const plans = useQuery(plansQuery())
  const active = plans.data?.find((plan) => plan.is_active)
  if (!active?.valid_until) return null
  const days = daysUntil(active.valid_until)
  if (days < 0 || days > EXPIRY_NOTICE_DAYS) return null
  return (
    <Card className="flex-row items-start gap-3 p-4 ring-1 ring-warning/50">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
        <WarningIcon weight="bold" className="size-5" />
      </span>
      <div className="grid gap-1 text-[13px]">
        <p className="font-medium">
          {days === 0 ? t('notifications.expiringToday') : t('notifications.expiring', { count: days })}
        </p>
        <p className="text-muted-foreground">
          {t('notifications.expiringBody', {
            name: active.name,
            date: formatDate(active.valid_until, i18n.language),
          })}
        </p>
        <Link to="/workouts/import" className="flex min-h-11 items-center gap-1 font-medium text-primary">
          {t('notifications.expiringAction')}
          <CaretRightIcon aria-hidden className="size-3.5" />
        </Link>
      </div>
    </Card>
  )
}

function Device({ data }: { data: Notifications }) {
  const { t } = useTranslation()
  const device = useQuery(deviceQuery())
  const enable = useEnableDevice()
  const disable = useDisableDevice()
  const support = pushSupport()

  const message =
    data.public_key === null
      ? t('notifications.device.serverOff')
      : support === 'unsupported'
        ? t('notifications.device.unsupported')
        : support === 'ios-install'
          ? t('notifications.device.iosInstall')
          : support === 'denied'
            ? t('notifications.device.denied')
            : null

  const turnOn = (publicKey: string) =>
    enable.mutate(publicKey, {
      onSuccess: (granted) => !granted && toast.error(t('notifications.device.denied')),
      onError: () => toast.error(t('notifications.device.failed')),
    })

  return (
    <SettingsGroup title={t('notifications.device.title')}>
      <div className="grid gap-3 p-4">
        {message !== null ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : device.isPending ? (
          <Spinner className="size-5 text-muted-foreground" />
        ) : device.data ? (
          <>
            <p className="flex items-center gap-2 text-sm">
              <BellRingingIcon aria-hidden className="size-5 text-primary" />
              {t('notifications.device.enabled')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="touch"
                className="h-11 px-2 text-[13px]"
                onClick={() =>
                  sendTestNotification()
                    .then(() => toast.success(t('notifications.device.testSent')))
                    .catch((error: unknown) => toast.error(t(errorKey(error))))
                }
              >
                {t('notifications.device.test')}
              </Button>
              <Button
                variant="outline"
                size="touch"
                className="h-11 px-2 text-[13px] text-destructive"
                disabled={disable.isPending}
                onClick={() => disable.mutate()}
              >
                {t('notifications.device.disable')}
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="outline-primary"
            size="touch"
            disabled={enable.isPending}
            onClick={() => data.public_key && turnOn(data.public_key)}
          >
            {enable.isPending ? t('notifications.device.enabling') : t('notifications.device.enable')}
          </Button>
        )}
      </div>
    </SettingsGroup>
  )
}

function Reminders({ settings }: { settings: NotificationSettings }) {
  const { t } = useTranslation()
  const update = useUpdateNotificationSettings()
  const timeId = useId()
  const time = settings.reminder_time.slice(0, 5)
  const save = (changes: Partial<NotificationSettings>) =>
    update.mutate(changes, { onError: () => toast.error(t('settings.saveError')) })

  return (
    <SettingsGroup title={t('notifications.reminders')}>
      <SwitchRow
        label={t('notifications.trainingReminder')}
        hint={t('notifications.trainingReminderHint', { time })}
        checked={settings.training_reminder}
        onCheckedChange={(on) => save({ training_reminder: on })}
      />
      {settings.training_reminder && (
        <label htmlFor={timeId} className="flex min-h-13 items-center gap-3 px-4 py-1.5 text-[15px]">
          <span className="flex-1">{t('notifications.reminderTime')}</span>
          <input
            id={timeId}
            type="time"
            step={300}
            value={time}
            onChange={(event) => event.target.value && save({ reminder_time: event.target.value })}
            className="h-11 rounded-lg border bg-background px-3 text-[15px] tabular-nums"
          />
        </label>
      )}
      <SwitchRow
        label={t('notifications.restEnd')}
        hint={t('notifications.restEndHint')}
        checked={settings.rest_end}
        onCheckedChange={(on) => save({ rest_end: on })}
      />
      <SwitchRow
        label={t('notifications.weeklySummary')}
        hint={t('notifications.weeklySummaryHint')}
        checked={settings.weekly_summary}
        onCheckedChange={(on) => save({ weekly_summary: on })}
      />
      <SwitchRow
        label={t('notifications.newRecord')}
        hint={t('notifications.newRecordHint')}
        checked={settings.new_record}
        onCheckedChange={(on) => save({ new_record: on })}
      />
      <SwitchRow
        label={t('notifications.planExpiring')}
        hint={t('notifications.planExpiringHint')}
        checked={settings.plan_expiring}
        onCheckedChange={(on) => save({ plan_expiring: on })}
      />
    </SettingsGroup>
  )
}
