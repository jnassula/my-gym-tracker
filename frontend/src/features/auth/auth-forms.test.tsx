import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { authResponse, json, renderWithRouter } from '@/test/render'

import { ChangePasswordForm } from './change-password-form'
import { LoginForm } from './login-form'
import { RegisterForm } from './register-form'

const fetchMock = vi.fn<typeof fetch>()

function lastBody() {
  return JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body)) as Record<string, unknown>
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  sessionStore.set(null)
})

describe('LoginForm', () => {
  it('validates before calling the API', async () => {
    renderWithRouter(<LoginForm onSuccess={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }))

    expect(await screen.findAllByText('Campo obrigatório.')).toHaveLength(2)

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Introduz um email válido.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows wrong credentials under the password', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ detail: 'Invalid email or password', code: 'invalid_credentials' }, 401),
    )
    renderWithRouter(<LoginForm onSuccess={vi.fn()} />)

    await userEvent.type(await screen.findByLabelText('Email'), 'jonata@example.pt')
    await userEvent.type(screen.getByLabelText('Palavra-passe'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Email ou palavra-passe incorretos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Palavra-passe')).toHaveAttribute('aria-invalid', 'true')
  })

  it('signs in, remembering the device by default', async () => {
    fetchMock.mockResolvedValueOnce(json(authResponse()))
    const onSuccess = vi.fn()
    renderWithRouter(<LoginForm onSuccess={onSuccess} />)

    await userEvent.type(await screen.findByLabelText('Email'), 'jonata@example.pt')
    await userEvent.type(screen.getByLabelText('Palavra-passe'), 'Treino2026!')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(lastBody()).toEqual({
      email: 'jonata@example.pt',
      password: 'Treino2026!',
      remember: true,
    })
    expect(sessionStore.get()?.user.email).toBe('jonata@example.pt')
  })

  it('toggles password visibility', async () => {
    renderWithRouter(<LoginForm onSuccess={vi.fn()} />)
    const input = await screen.findByLabelText('Palavra-passe')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar palavra-passe' }))

    expect(input).toHaveAttribute('type', 'text')
  })
})

describe('RegisterForm', () => {
  it('shows the strength meter as the password is typed', async () => {
    renderWithRouter(<RegisterForm onSuccess={vi.fn()} />)

    await userEvent.type(await screen.findByLabelText('Palavra-passe'), 'Treino2026!')

    expect(screen.getByRole('meter', { name: 'Força da palavra-passe' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    )
    expect(screen.getByText('Forte — 8+ caracteres, número e símbolo')).toBeInTheDocument()
  })

  it('shows a taken email inline and sends language and time zone', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ detail: 'exists', code: 'email_taken' }, 409),
    )
    renderWithRouter(<RegisterForm onSuccess={vi.fn()} />)

    await userEvent.type(await screen.findByLabelText('Nome'), 'Jonata')
    await userEvent.type(screen.getByLabelText('Email'), 'jonata@example.pt')
    await userEvent.type(screen.getByLabelText('Palavra-passe'), 'Treino2026!')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByText('Já existe uma conta com este email.')).toBeInTheDocument()
    expect(lastBody()).toMatchObject({ language: 'pt', timezone: expect.any(String) })
  })
})

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    sessionStore.set({ accessToken: 'old-token', user: authResponse().user })
  })

  it('requires the confirmation to match', async () => {
    renderWithRouter(<ChangePasswordForm onSuccess={vi.fn()} />)

    await userEvent.type(await screen.findByLabelText('Palavra-passe atual'), 'Treino2026!')
    await userEvent.type(screen.getByLabelText('Nova palavra-passe'), 'NovaPasse#2026')
    await userEvent.type(screen.getByLabelText('Confirmar nova palavra-passe'), 'NovaPasse#2025')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }))

    expect(await screen.findByText('As palavras-passe não coincidem.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores the new access token on success', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ access_token: 'new-token', token_type: 'bearer', expires_in: 900 }),
    )
    const onSuccess = vi.fn()
    renderWithRouter(<ChangePasswordForm onSuccess={onSuccess} />)

    await userEvent.type(await screen.findByLabelText('Palavra-passe atual'), 'Treino2026!')
    await userEvent.type(screen.getByLabelText('Nova palavra-passe'), 'NovaPasse#2026')
    await userEvent.type(screen.getByLabelText('Confirmar nova palavra-passe'), 'NovaPasse#2026')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(lastBody()).toEqual({ current_password: 'Treino2026!', new_password: 'NovaPasse#2026' })
    expect(sessionStore.get()?.accessToken).toBe('new-token')
  })

  it('flags a wrong current password on that field', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'wrong', code: 'invalid_current_password' }, 400))
    renderWithRouter(<ChangePasswordForm onSuccess={vi.fn()} />)

    await userEvent.type(await screen.findByLabelText('Palavra-passe atual'), 'nope-nope')
    await userEvent.type(screen.getByLabelText('Nova palavra-passe'), 'NovaPasse#2026')
    await userEvent.type(screen.getByLabelText('Confirmar nova palavra-passe'), 'NovaPasse#2026')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }))

    expect(await screen.findByText('A palavra-passe atual está incorreta.')).toBeInTheDocument()
    expect(screen.getByLabelText('Palavra-passe atual')).toHaveAttribute('aria-invalid', 'true')
  })
})
