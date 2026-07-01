import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { PageHeader } from '../components/PageHeader'
import { apiClient } from '../lib/apiClient'
import { setToken } from '../lib/auth'
import { errorMessage } from '../lib/errorMessage'

interface LoginResponse {
  token: string
}

export function LoginPage() {
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
    <>
      <PageHeader title="Log in" />
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
    </>
  )
}
