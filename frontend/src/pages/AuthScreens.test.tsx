import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { getToken, setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('auth screens', () => {
  it('logs in and lands in the app', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ token: 'fresh-token' }),
      ),
    )

    renderApp('/login')
    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await screen.findByRole('link', { name: 'Prompt Vault - Your Prompts' })
    expect(getToken()).toBe('fresh-token')
  })

  it('shows an error on bad credentials and stays on login', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json(
          { error: 'unauthorized', message: 'Invalid email or password' },
          { status: 401 },
        ),
      ),
    )

    renderApp('/login')
    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    )
    expect(
      screen.getByRole('link', { name: 'Prompt Vault - Log in' }),
    ).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('logs out and returns to login', async () => {
    const user = userEvent.setup()
    setToken('a-token')

    renderApp('/profile')
    await user.click(await screen.findByRole('button', { name: 'Log Out' }))

    await screen.findByRole('link', { name: 'Prompt Vault - Log in' })
    expect(getToken()).toBeNull()
  })

  it('registers then goes to login', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json(
          { id: 'x', email: 'new@example.com' },
          { status: 201 },
        ),
      ),
    )

    renderApp('/register')
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await screen.findByRole('link', { name: 'Prompt Vault - Log in' })
  })
})
