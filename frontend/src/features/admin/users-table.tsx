import { DotsThreeVerticalIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRequiredSession } from '@/lib/auth'
import { formatDayMonth } from '@/lib/format'

import { formatInstantDay } from './format'
import type { AdminUser } from './types'

export type AccountAction = { kind: 'deactivate' | 'reactivate' | 'delete'; user: AdminUser }

const HEAD = 'px-3 pb-2 font-medium'
const NUMBER = 'px-3 py-3 text-right tabular-nums'
/** A phone keeps who, when and how many workouts; the rest appears from a tablet up. */
const WIDE = 'hidden sm:table-cell'

type UsersTableProps = {
  users: AdminUser[]
  caption: string
  /** With it, each account that isn't an administrator's gets its menu (Contas only). */
  onAction?: (action: AccountAction) => void
}

/** Accounts as rows: who they are, when they joined and how much they train (counts only). */
export function UsersTable({ users, caption, onAction }: UsersTableProps) {
  const { t, i18n } = useTranslation()
  const { user: admin } = useRequiredSession()
  const language = i18n.language
  return (
    <table className="w-full text-[13px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
          <th scope="col" className={HEAD}>{t('admin.users.columns.account')}</th>
          <th scope="col" className={HEAD}>{t('admin.users.columns.joined')}</th>
          <th scope="col" className={`${HEAD} ${WIDE}`}>{t('admin.users.columns.language')}</th>
          <th scope="col" className={`${HEAD} ${WIDE} text-right`}>{t('admin.users.columns.plans')}</th>
          <th scope="col" className={`${HEAD} text-right`}>{t('admin.users.columns.workouts')}</th>
          <th scope="col" className={`${HEAD} ${WIDE} text-right`}>{t('admin.users.columns.lastWorkout')}</th>
          {onAction && (
            <th scope="col" className="pb-2">
              <span className="sr-only">{t('admin.users.columns.actions')}</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-t">
            <th scope="row" className="w-full max-w-0 px-3 py-3 text-left font-normal">
              <span className="flex items-center gap-2">
                <span className={cn('truncate text-sm font-medium', user.deactivated_at && 'text-muted-foreground')}>
                  {user.name}
                </span>
                {user.deactivated_at && (
                  <Badge variant="outline" className="shrink-0">
                    {t('admin.users.inactive')}
                  </Badge>
                )}
                {user.is_admin && (
                  <Badge variant="secondary" className="shrink-0">
                    {t('admin.users.administrator')}
                  </Badge>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </th>
            <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
              {formatInstantDay(user.created_at, language, admin.timezone)}
            </td>
            <td className={`px-3 py-3 text-muted-foreground uppercase ${WIDE}`}>{user.language}</td>
            <td className={`${NUMBER} ${WIDE}`}>{user.plans}</td>
            <td className={NUMBER}>{user.workouts}</td>
            <td className={`${NUMBER} whitespace-nowrap text-muted-foreground ${WIDE}`}>
              {user.last_workout_date ? formatDayMonth(user.last_workout_date, language, true) : '—'}
            </td>
            {onAction && (
              <td className="pr-1">{!user.is_admin && <AccountMenu user={user} onAction={onAction} />}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AccountMenu({ user, onAction }: { user: AdminUser; onAction: (action: AccountAction) => void }) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-touch" aria-label={t('admin.users.actions', { name: user.name })} />}
      >
        <DotsThreeVerticalIcon weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="min-h-11"
          onClick={() => onAction({ kind: user.deactivated_at ? 'reactivate' : 'deactivate', user })}
        >
          {user.deactivated_at ? t('admin.users.reactivate') : t('admin.users.deactivate')}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 text-destructive" onClick={() => onAction({ kind: 'delete', user })}>
          {t('admin.users.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
