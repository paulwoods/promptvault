import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com'

function configuredWithGoogle() {
  server.use(
    http.get('/api/auth/config', () =>
      HttpResponse.json({ googleClientId: CLIENT_ID }),
    ),
  )
}

/**
 * Stands in for the GIS script, which never loads under jsdom. `renderButton`
 * paints a plain button that fires the credential callback when clicked — the
 * same shape of event Google's real button produces.
 */
function stubGoogleIdentity() {
  let onCredential: (response: { credential: string }) => void = () => {}
  const initialize = vi.fn(
    (config: {
      client_id: string
      callback: (response: { credential: string }) => void
    }) => {
      onCredential = config.callback
    },
  )
  const renderButton = vi.fn((parent: HTMLElement) => {
    const button = document.createElement('button')
    button.textContent = 'Continue with Google'
    button.addEventListener('click', () =>
      onCredential({ credential: 'a-google-id-token' }),
    )
    parent.appendChild(button)
  })
  window.google = { accounts: { id: { initialize, renderButton } } }
  return { initialize, renderButton }
}

afterEach(() => {
  delete window.google
  document.querySelectorAll('script[src*="gsi/client"]').forEach((script) => {
    script.remove()
  })
})

describe('Google sign-in', () => {
  it('offers no Google button when the deployment has no client id', async () => {
    const { initialize } = stubGoogleIdentity()

    renderApp('/login')

    await screen.findByRole('button', { name: 'Log in' })
    expect(
      screen.queryByRole('button', { name: 'Continue with Google' }),
    ).not.toBeInTheDocument()
    expect(initialize).not.toHaveBeenCalled()
  })

  it('initializes Google with the client id the backend reports', async () => {
    configuredWithGoogle()
    const { initialize } = stubGoogleIdentity()

    renderApp('/login')

    await waitFor(() =>
      expect(initialize).toHaveBeenCalledWith(
        expect.objectContaining({ client_id: CLIENT_ID }),
      ),
    )
  })

  it('exchanges the Google credential for an access token and lands in the app', async () => {
    const user = userEvent.setup()
    configuredWithGoogle()
    stubGoogleIdentity()
    let received: unknown
    server.use(
      http.post('/api/auth/google', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ token: 'google-issued-token' })
      }),
    )

    renderApp('/login')
    await user.click(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    )

    await screen.findByRole('link', { name: 'Prompt Vault - Your Prompts' })
    expect(received).toEqual({ idToken: 'a-google-id-token' })
    expect(getToken()).toBe('google-issued-token')
  })

  it('shows the error and stays put when the backend rejects the token', async () => {
    const user = userEvent.setup()
    configuredWithGoogle()
    stubGoogleIdentity()
    server.use(
      http.post('/api/auth/google', () =>
        HttpResponse.json(
          { error: 'unauthorized', message: 'Google sign-in failed' },
          { status: 401 },
        ),
      ),
    )

    renderApp('/login')
    await user.click(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google sign-in failed',
    )
    expect(getToken()).toBeNull()
  })

  it('reports the outage when the Google script fails to load', async () => {
    configuredWithGoogle()

    renderApp('/login')

    // jsdom never fetches the injected script, so the failure is driven here.
    const script = await waitFor(() => {
      const injected = document.querySelector<HTMLScriptElement>(
        'script[src*="gsi/client"]',
      )
      expect(injected).not.toBeNull()
      return injected!
    })
    script.dispatchEvent(new Event('error'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google sign-in is unavailable',
    )
  })

  it('is offered on the register screen too', async () => {
    configuredWithGoogle()
    stubGoogleIdentity()

    renderApp('/register')

    expect(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument()
  })
})
