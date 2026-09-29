import { useTranslation } from 'react-i18next'

import { formatDayMonth } from '@/lib/format'
import { useRequiredSession } from '@/lib/auth'

import { formatInstantDay } from './format'
import type { AdminUser } from './types'

const HEAD = 'px-3 pb-2 font-medium'
const NUMBER = 'px-3 py-3 text-right tabular-nums'
/** A phone keeps who, when and how many workouts; the rest appears from a tablet up. */
const WIDE = 'hidden sm:table-cell'

/** Accounts as rows: who they are, when they joined and how much they train (counts only). */
export function UsersTable({ users, caption }: { users: AdminUser[]; caption: string }) {
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
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-t">
            <th scope="row" className="max-w-0 w-full px-3 py-3 text-left font-normal">
              <span className="block truncate text-sm font-medium">{user.name}</span>
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
          </tr>
        ))}
      </tbody>
    </table>
  )
}
