import { ArrowClockwiseIcon } from '@phosphor-icons/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { useHealth } from './health'

// Temporary copy: moves to i18next when the translation layer lands.
const LABELS = {
  title: 'Estado do sistema',
  description: 'Ligação entre a app e a API.',
  api: 'API',
  database: 'Base de dados',
  version: 'Versão',
  checking: 'A verificar…',
  ok: 'Operacional',
  degraded: 'Degradado',
  unavailable: 'Indisponível',
  retry: 'Verificar novamente',
}

export function SystemStatus() {
  const { data, isPending, isError, isFetching, refetch } = useHealth()

  const apiBadge = isPending ? (
    <Badge variant="outline">{LABELS.checking}</Badge>
  ) : isError ? (
    <Badge variant="destructive">{LABELS.unavailable}</Badge>
  ) : data.status === 'ok' ? (
    <Badge>{LABELS.ok}</Badge>
  ) : (
    <Badge variant="destructive">{LABELS.degraded}</Badge>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{LABELS.title}</CardTitle>
        <CardDescription>{LABELS.description}</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={LABELS.retry}
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <ArrowClockwiseIcon className={isFetching ? 'animate-spin' : undefined} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[1fr_auto] items-center gap-y-3">
          <dt className="text-muted-foreground">{LABELS.api}</dt>
          <dd>{apiBadge}</dd>
          {data && (
            <>
              <dt className="text-muted-foreground">{LABELS.database}</dt>
              <dd>
                <Badge variant={data.database === 'ok' ? 'secondary' : 'destructive'}>
                  {data.database === 'ok' ? LABELS.ok : LABELS.unavailable}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">{LABELS.version}</dt>
              <dd className="font-mono text-xs">{data.version}</dd>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
