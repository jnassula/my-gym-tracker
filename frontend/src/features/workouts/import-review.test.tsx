import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithRouter } from '@/test/render'

import { draftFromPreview, draftReducer } from './import-draft'
import { ImportReview } from './import-review'
import type { ImportPreview } from './types'

const preview: ImportPreview = {
  file_id: 'file-1',
  filename: 'Treino 07.pdf',
  name: 'Treino 07',
  valid_until: null,
  rest_days: [],
  days: [
    {
      weekday: 0,
      label: 'Quadríceps e Glúteos',
      exercises: [
        {
          name: 'Esteira',
          muscle_group: 'warmup',
          sets: null,
          reps: '30 min',
          rest_seconds: null,
          rest_max_seconds: null,
          notes: null,
          warnings: [],
        },
        {
          name: 'Cadeira Extensora',
          muscle_group: 'quads',
          sets: 2,
          reps: 'Rest Pause',
          rest_seconds: 60,
          rest_max_seconds: 120,
          notes: '2x (Rest Pause) = 3x até a falha',
          warnings: ['technique_sets'],
        },
      ],
    },
    {
      weekday: 1,
      label: 'Peitoral',
      exercises: [
        {
          name: 'Supino Reto',
          muscle_group: 'chest',
          sets: 3,
          reps: '12',
          rest_seconds: 90,
          rest_max_seconds: null,
          notes: '3x12 Rm',
          warnings: [],
        },
      ],
    },
  ],
}

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [draft, dispatch] = useReducer(draftReducer, preview, draftFromPreview)
  return (
    <ImportReview
      draft={draft}
      dispatch={dispatch}
      saving={false}
      errorKey={undefined}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />
  )
}

describe('ImportReview', () => {
  it('shows the day grouped by muscle, with schemes and review flags', async () => {
    renderWithRouter(<Harness onConfirm={vi.fn()} />)

    expect(await screen.findByText('Rever importação · 1 de 2 dias')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Segunda — Quadríceps e Glúteos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aquecimento' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quadríceps' })).toBeInTheDocument()
    expect(screen.getByText('2×Rest Pause · 1–2 min')).toBeInTheDocument()
    expect(screen.getByText('Técnica especial — confirma as séries')).toBeInTheDocument()
  })

  it('confirms day by day, then saves on the last one', async () => {
    const onConfirm = vi.fn()
    renderWithRouter(<Harness onConfirm={onConfirm} />)

    await userEvent.click(await screen.findByRole('button', { name: /Confirmar dia/ }))

    expect(screen.getByText('Rever importação · 2 de 2 dias')).toBeInTheDocument()
    const days = screen.getByRole('navigation', { name: 'Dias do plano' })
    expect(within(days).getByRole('button', { name: /Seg/ })).toContainElement(
      within(days).getByLabelText('revisto'),
    )
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e ativar' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('can confirm everything without reviewing', async () => {
    const onConfirm = vi.fn()
    renderWithRouter(<Harness onConfirm={onConfirm} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar tudo sem rever' }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('requires a plan name before saving', async () => {
    const onConfirm = vi.fn()
    renderWithRouter(<Harness onConfirm={onConfirm} />)

    await userEvent.clear(await screen.findByLabelText('Nome do plano'))

    expect(screen.getByRole('button', { name: 'Confirmar tudo sem rever' })).toBeDisabled()
  })
})
