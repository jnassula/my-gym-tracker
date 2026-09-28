import { StarIcon, WatchIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { healthQuery, shortcutUrl } from '@/features/health/api'
import { sessionDetailQuery } from '@/features/progress/api'
import { clock } from '@/features/workouts/format'

import type { SessionSummary } from './types'
import { formatVolume, formatWeight, type Unit } from './weight'

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-background px-3 py-3">
      <span className="text-2xl tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

/** "FC média" once the shortcut synced the watch's data; until then, a way to sync. Coming back
 * from the Shortcuts app refetches (window focus), so the tile fills in by itself. */
function HeartRateTile({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const health = useQuery(healthQuery())
  const connected = health.data?.connected === true
  const detail = useQuery({ ...sessionDetailQuery(sessionId), enabled: connected })
  if (!connected) return null
  const average = detail.data?.health?.avg_heart_rate
  if (average) return <Tile value={t('health.session.bpm', { value: average })} label={t('training.summary.avgHr')} />
  return (
    <a
      href={shortcutUrl()}
      className="grid gap-0.5 rounded-xl bg-background px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-1.5 text-[15px] leading-8 text-primary">
        <WatchIcon aria-hidden weight="bold" className="size-4" />
        {t('health.syncNow')}
      </span>
      <span className="text-xs text-muted-foreground">{t('training.summary.avgHr')}</span>
    </a>
  )
}

type SummaryDialogProps = {
  summary: SessionSummary | null
  /** The day's focus, e.g. "Costas (ênfase em remadas)". */
  title: string
  unit: Unit
  onClose: () => void
}

/** "Treino concluído": sets, volume, duration and any personal records of the session. */
export function SummaryDialog({ summary, title, unit, onClose }: SummaryDialogProps) {
  const { t, i18n } = useTranslation()
  return (
    <Dialog open={summary !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        {summary && (
          <>
            <DialogHeader>
              <DialogDescription className="text-xs tracking-widest text-primary uppercase">
                {t('training.summary.kicker')}
              </DialogDescription>
              <DialogTitle className="text-xl">{title}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              <Tile value={String(summary.sets)} label={t('training.summary.sets')} />
              <Tile
                value={formatVolume(summary.volume, unit, i18n.language)}
                label={t('training.summary.volume')}
              />
              <Tile value={clock(summary.duration_seconds)} label={t('training.summary.duration')} />
              <HeartRateTile sessionId={summary.session_id} />
            </div>
            {summary.records.length > 0 && (
              <ul className="grid gap-1">
                {summary.records.map((record) => (
                  <li key={record.exercise_id} className="flex items-center gap-2 text-sm text-primary">
                    <StarIcon weight="fill" className="size-4 shrink-0" />
                    {t('training.summary.record', {
                      name: record.name,
                      weight: formatWeight(record.weight, unit, i18n.language),
                    })}
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button variant="outline" size="touch" className="w-full" onClick={onClose}>
                {t('training.summary.close')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
