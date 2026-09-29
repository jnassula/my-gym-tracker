import { useInfiniteQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'

import { usersQuery } from './api'
import { UsersTable } from './users-table'

const SEARCH_DELAY_MS = 300

/** What was typed, once the typing pauses: one request per search, not per key. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

/** Contas: every account, newest first, searched by name or email. */
export function UsersScreen() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const users = useInfiniteQuery(usersQuery(useSettled(search.trim())))
  const accounts = users.data?.pages.flatMap((page) => page.items) ?? []
  const total = users.data?.pages[0]?.total ?? 0

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_20rem] sm:items-center">
        <div className="grid gap-0.5">
          <h1 className="text-2xl">{t('admin.users.title')}</h1>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {users.data ? t('admin.users.count', { count: total }) : '\u00a0'}
          </p>
        </div>
        <Input
          type="search"
          value={search}
          placeholder={t('admin.users.search')}
          aria-label={t('admin.users.search')}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {users.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : users.isError ? (
        <FormAlert messageKey={errorKey(users.error)} />
      ) : accounts.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">{t('admin.users.none')}</p>
      ) : (
        <>
          <Card className={cn('px-1 py-4 transition-opacity', users.isPlaceholderData && 'opacity-60')}>
            <UsersTable users={accounts} caption={t('admin.users.title')} />
          </Card>
          {users.hasNextPage && (
            <Button
              variant="outline-primary"
              size="touch"
              className="justify-self-center"
              disabled={users.isFetchingNextPage}
              onClick={() => void users.fetchNextPage()}
            >
              {users.isFetchingNextPage && <Spinner />}
              {t('admin.users.more')}
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">{t('admin.privacy')}</p>
    </div>
  )
}
