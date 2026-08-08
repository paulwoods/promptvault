import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AuthHero } from '../components/AuthHero'
import { ErrorAlert } from '../components/ErrorAlert'
import { apiClient } from '../lib/apiClient'
import { setToken } from '../lib/auth'
import { errorMessage } from '../lib/errorMessage'
import { usePageTitle } from '../lib/pageTitle'

interface LoginResponse {
  token: string
}

export function LoginPage() {
  usePageTitle('Log in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<LoginResponse>('/api/auth/login', { email, password }),
    onSuccess: (data) => {
      setToken(data.token)
      navigate('/', { replace: true })
    },
  })

  return (
    <div className="auth-page">
      <AuthHero
        title="Welcome back"
        subtitle="Log in to your prompts, versions, and runs."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          Email
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={mutation.isPending}>
          Log in
        </button>
      </form>
      {mutation.isError && (
        <ErrorAlert>{errorMessage(mutation.error)}</ErrorAlert>
      )}
      <p className="muted">
        Need an account? <Link to="/register">Register</Link>
      </p>
    </div>
  )
}
